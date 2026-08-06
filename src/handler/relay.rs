use std::time::Instant;

use axum::body::Body;
use axum::extract::{OriginalUri, Request, State};
use axum::response::Response;
use axum::Extension;
use bytes::Bytes;
use serde_json::Value;

use crate::db;
use crate::error::AppError;
use crate::middleware::auth::TokenAuth;
use crate::service;
use crate::state::AppState;

const MAX_BODY_SIZE: usize = 100 * 1024 * 1024;
const KEEP_RESP_HEADERS: &[&str] = &[
    "content-type",
    "cache-control",
    "x-request-id",
    "anthropic-ratelimit-requests",
    "anthropic-ratelimit-tokens",
    "openai-organization",
    "openai-processing-ms",
];

pub async fn handler(
    State(state): State<AppState>,
    Extension(auth): Extension<TokenAuth>,
    OriginalUri(original_uri): OriginalUri,
    request: Request,
) -> Result<Response, AppError> {
    let start = Instant::now();
    let (parts, body) = request.into_parts();
    let method = parts.method.clone();
    let path = original_uri.path().to_string();

    let body_bytes = axum::body::to_bytes(body, MAX_BODY_SIZE)
        .await
        .map_err(|e| AppError::BadRequest(format!("failed to read body: {e}")))?;

    let (model, body_json) = if body_bytes.is_empty() {
        (String::new(), None)
    } else {
        match serde_json::from_slice::<Value>(&body_bytes) {
            Ok(json) => {
                let model = json
                    .get("model")
                    .and_then(|v| v.as_str())
                    .unwrap_or("")
                    .to_string();
                (model, Some(json))
            }
            Err(_) => (String::new(), None),
        }
    };

    let is_stream = body_json
        .as_ref()
        .and_then(|j| j.get("stream"))
        .and_then(|v| v.as_bool())
        .unwrap_or(false);

    let session_id = parts
        .headers
        .get("x-session-id")
        .or_else(|| parts.headers.get("x-opencode-session"))
        .and_then(|v| v.to_str().ok())
        .unwrap_or("")
        .to_string();

    let sticky_id = if !session_id.is_empty() {
        session_id.clone()
    } else {
        auth.token_id.to_string()
    };

    if auth.model_limits_enabled && !auth.model_limits.is_empty() && !auth.model_limits.contains(&model) {
        return Err(AppError::Forbidden(format!(
            "model '{model}' not allowed for this token"
        )));
    }

    let channels = db::channel::find_by_model(&state.pool, &model).await?;
    if channels.is_empty() {
        return Err(AppError::NotFound(format!(
            "no channel available for model: {model}"
        )));
    }

    // Select channel: sticky first, then deterministic hash
    let sticky_key = format!("{model}/{sticky_id}");
    let sticky_channel_id = db::sticky::get(&state.pool, &sticky_key).await?;

    let channel = sticky_channel_id
        .and_then(|sid| channels.iter().find(|c| c.id == sid && c.status == 1))
        .or_else(|| service::routing::select_channel(&channels, &sticky_id, &[]))
        .ok_or_else(|| AppError::BadGateway("no channel available".into()))?;

    // Apply model mapping and body overrides
    let final_body: Bytes = {
        let mut json_val = body_json.clone();
        let mut modified = false;

        if let Some(ref mut j) = json_val {
            if let Some(obj) = j.as_object_mut() {
                if let Some(mapping) = channel.model_mapping.as_object() {
                    if let Some(mapped) = mapping.get(&model) {
                        obj.insert("model".to_string(), mapped.clone());
                        modified = true;
                    }
                }

                if let Some(overrides) = channel.body_override.as_object() {
                    if !overrides.is_empty() {
                        for (k, v) in overrides {
                            obj.insert(k.clone(), v.clone());
                        }
                        modified = true;
                    }
                }
            }
        }

        if modified {
            Bytes::from(serde_json::to_vec(&json_val)?)
        } else {
            body_bytes
        }
    };

    // Resolve per-model overrides
    let model_override = channel.model_overrides.get(model.as_str());
    let upstream_url = model_override
        .and_then(|o| o.get("endpoint_url"))
        .and_then(|v| v.as_str())
        .map(|s| s.to_string())
        .unwrap_or_else(|| channel.endpoint_url.clone());

    let auth_type = model_override
        .and_then(|o| o.get("auth_type"))
        .and_then(|v| v.as_str())
        .map(|s| s.to_string())
        .unwrap_or_else(|| channel.auth_type.clone());

    // Check endpoint format mismatch
    let incoming_is_anthropic = path.ends_with("/messages");
    let upstream_is_anthropic = upstream_url.ends_with("/messages");
    if incoming_is_anthropic != upstream_is_anthropic {
        return Err(AppError::BadRequest(format!(
            "endpoint mismatch: model '{model}' requires {}, send request to {}",
            if upstream_is_anthropic { "Anthropic format" } else { "OpenAI format" },
            if upstream_is_anthropic { "/v1/messages" } else { "/v1/chat/completions" },
        )));
    }

    let upstream_headers = service::proxy::build_upstream_headers(
        &parts.headers,
        &channel.api_key,
        &auth_type,
        &channel.header_override,
        &sticky_id,
        &session_id,
        &model,
    );

    let result = state
        .http_client
        .request(method, &upstream_url)
        .headers(upstream_headers)
        .body(final_body)
        .send()
        .await;

    match result {
        Ok(resp) => {
            let status = resp.status();
            let status_code = status.as_u16();

            if status_code == 200 {
                let _ = db::sticky::set(&state.pool, &sticky_key, channel.id).await;
            }

            let duration_ms = start.elapsed().as_millis() as i32;
            let _ = log_request(&state.pool, &auth, channel.id, &model, is_stream, status_code as i32, duration_ms, &sticky_id, status_code).await;

            let mut response_builder = Response::builder().status(status);
            for key in resp.headers().keys() {
                if KEEP_RESP_HEADERS.contains(&key.as_str()) {
                    if let Some(value) = resp.headers().get(key) {
                        response_builder = response_builder.header(key, value);
                    }
                }
            }

            let stream = resp.bytes_stream();
            Ok(response_builder.body(Body::from_stream(stream))?)
        }
        Err(e) => {
            let duration_ms = start.elapsed().as_millis() as i32;
            let _ = log_request(&state.pool, &auth, channel.id, &model, is_stream, 502, duration_ms, &sticky_id, 0).await;
            Err(AppError::BadGateway(format!("upstream error: {e}")))
        }
    }
}

async fn log_request(
    pool: &sqlx::PgPool,
    auth: &TokenAuth,
    channel_id: i64,
    model: &str,
    is_stream: bool,
    status_code: i32,
    duration_ms: i32,
    session_id: &str,
    error_status: u16,
) -> Result<(), sqlx::Error> {
    let error_message = if error_status != 0 && error_status != 200 {
        Some(format!("HTTP {error_status}"))
    } else {
        None
    };

    db::log::create(
        pool,
        &db::log::CreateLogParams {
            token_id: Some(auth.token_id),
            user_id: Some(auth.user_id),
            channel_id: Some(channel_id),
            model,
            is_stream,
            status_code,
            duration_ms,
            session_id,
            error_message: error_message.as_deref(),
        },
    )
    .await
}

pub async fn models(
    State(state): State<AppState>,
) -> Result<axum::Json<Value>, AppError> {
    let model_list = db::channel::all_models(&state.pool).await?;

    let data: Vec<Value> = model_list
        .iter()
        .map(|m| {
            serde_json::json!({
                "id": m,
                "object": "model",
                "owned_by": "final-api",
            })
        })
        .collect();

    Ok(axum::Json(serde_json::json!({
        "object": "list",
        "data": data,
    })))
}
