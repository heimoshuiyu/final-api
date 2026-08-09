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
use crate::service::inspect::{header_map_to_json, InspectEvent, InspectStream};
use crate::service::usage::UsageFormat;
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

    let sticky_id = service::session::derive_sticky_id(
        &parts.headers,
        body_json.as_ref().unwrap_or(&serde_json::Value::Null),
        auth.token_id,
    );

    if auth.model_limits_enabled && !auth.model_limits.is_empty() && !auth.model_limits.contains(&model) {
        return Err(AppError::Forbidden(format!(
            "model '{model}' not allowed for this token"
        )));
    }

    let channels = db::channel::find_by_model(&state.pool, auth.workspace_id, &model).await?;
    if channels.is_empty() {
        return Err(AppError::NotFound(format!(
            "no channel available for model: {model}"
        )));
    }

    // Select channel: sticky first (with concurrency check), then load-balanced
    let sticky_key = format!("{model}/{sticky_id}");
    let sticky_sid = db::sticky::get(&state.pool, &sticky_key).await?;

    let selection = if let Some(ch) = sticky_sid
        .and_then(|sid| channels.iter().find(|c| c.id == sid && c.status == 1))
    {
        if let Some(p) = state
            .channel_load
            .try_acquire(ch.id, ch.max_concurrency)
        {
            state.channel_load.mark_used(ch.id);
            let _ =
                db::sticky::refresh(&state.pool, &sticky_key, state.config.sticky_ttl_seconds)
                    .await;
            Some(service::routing::ChannelSelection {
                channel: ch,
                permit: Some(p),
            })
        } else {
            None
        }
    } else {
        None
    };

    let selection = match selection {
        Some(s) => s,
        None => service::routing::select_channel(
            &channels,
            &[],
            &state.channel_load,
        )
        .ok_or_else(|| AppError::BadGateway("no channel available".into()))?,
    };

    let channel = selection.channel;
    let permit = selection.permit;

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

    // Resolve per-model per-format override
    let incoming_fmt = endpoint_format(&path);
    let fmt_key = incoming_fmt.route();
    let fmt_override = channel
        .model_overrides
        .get(model.as_str())
        .and_then(|mo| mo.get(fmt_key));

    let (upstream_url, auth_type) = match fmt_override {
        Some(fo) => {
            let url = fo
                .get("endpoint_url")
                .and_then(|v| v.as_str())
                .map(|s| s.to_string())
                .unwrap_or_else(|| channel.endpoint_url.clone());
            let auth = fo
                .get("auth_type")
                .and_then(|v| v.as_str())
                .map(|s| s.to_string())
                .unwrap_or_else(|| channel.auth_type.clone());
            (url, auth)
        }
        None => (channel.endpoint_url.clone(), channel.auth_type.clone()),
    };

    // Check endpoint format mismatch (only when no format-specific override resolved it)
    if fmt_override.is_none() {
        let upstream_fmt = endpoint_format(&upstream_url);
        if incoming_fmt != upstream_fmt {
            return Err(AppError::BadRequest(format!(
                "endpoint mismatch: model '{model}' uses {} format, send request to /v1/{}",
                upstream_fmt,
                upstream_fmt.route(),
            )));
        }
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

    let req_id = uuid::Uuid::new_v4().to_string();
    let _ = state.inspect_tx.send(InspectEvent::Start {
        req_id: req_id.clone(),
        ts: chrono::Utc::now().timestamp_millis(),
        workspace_id: auth.workspace_id,
        user_id: auth.user_id,
        token_id: auth.token_id,
        token_name: auth.token_name.clone(),
        channel_id: channel.id,
        channel_name: channel.name.clone(),
        model: model.clone(),
        endpoint: upstream_url.clone(),
        is_stream,
        body: body_json.clone().unwrap_or(Value::Null),
        req_headers: header_map_to_json(&parts.headers),
        upstream_headers: header_map_to_json(&upstream_headers),
    });

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
                let _ = db::sticky::set(
                    &state.pool,
                    &sticky_key,
                    channel.id,
                    state.config.sticky_ttl_seconds,
                )
                .await;
            }

            let duration_ms = start.elapsed().as_millis() as i32;
            let log_id = log_request(&state.pool, &auth, channel.id, &model, is_stream, status_code as i32, duration_ms, &session_id, status_code).await?;

            let mut response_builder = Response::builder().status(status);
            for key in resp.headers().keys() {
                if KEEP_RESP_HEADERS.contains(&key.as_str()) {
                    if let Some(value) = resp.headers().get(key) {
                        response_builder = response_builder.header(key, value);
                    }
                }
            }

            let resp_headers_json = header_map_to_json(resp.headers());

            let usage_format = UsageFormat::from_endpoint_suffix(&upstream_url);

            let stream = resp.bytes_stream();
            let tapped = InspectStream::new(
                stream,
                state.inspect_tx.clone(),
                req_id,
                status_code,
                start,
                resp_headers_json,
                usage_format,
                is_stream,
                state.pool.clone(),
                log_id,
                permit,
            );

            Ok(response_builder.body(Body::from_stream(tapped))?)
        }
        Err(e) => {
            let duration_ms = start.elapsed().as_millis() as i32;
            let _ = log_request(&state.pool, &auth, channel.id, &model, is_stream, 502, duration_ms, &session_id, 0).await;
            let _ = state.inspect_tx.send(InspectEvent::End {
                req_id,
                status: 502,
                duration_ms: duration_ms as u64,
                resp_headers: serde_json::json!({}),
                usage: None,
            });
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
) -> Result<i64, sqlx::Error> {
    let error_message = if error_status != 0 && error_status != 200 {
        Some(format!("HTTP {error_status}"))
    } else {
        None
    };

    db::log::create(
        pool,
        &db::log::CreateLogParams {
            workspace_id: auth.workspace_id,
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
    axum::Extension(auth): axum::Extension<TokenAuth>,
) -> Result<axum::Json<Value>, AppError> {
    let model_list = db::channel::all_models(&state.pool, auth.workspace_id).await?;

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

enum EndpointFormat {
    Messages,
    ChatCompletions,
    Completions,
    Responses,
    Embeddings,
    Moderations,
    Unknown,
}

impl EndpointFormat {
    fn route(&self) -> &str {
        match self {
            Self::Messages => "messages",
            Self::ChatCompletions => "chat/completions",
            Self::Completions => "completions",
            Self::Responses => "responses",
            Self::Embeddings => "embeddings",
            Self::Moderations => "moderations",
            Self::Unknown => "",
        }
    }
}

impl std::fmt::Display for EndpointFormat {
    fn fmt(&self, f: &mut std::fmt::Formatter<'_>) -> std::fmt::Result {
        match self {
            Self::Messages => write!(f, "Anthropic"),
            Self::ChatCompletions => write!(f, "OpenAI Chat"),
            Self::Completions => write!(f, "OpenAI Completions"),
            Self::Responses => write!(f, "OpenAI Responses"),
            Self::Embeddings => write!(f, "Embeddings"),
            Self::Moderations => write!(f, "Moderations"),
            Self::Unknown => write!(f, "Unknown"),
        }
    }
}

impl PartialEq for EndpointFormat {
    fn eq(&self, other: &Self) -> bool {
        match (self, other) {
            // Unknown matches anything — don't block unrecognized endpoints
            (Self::Unknown, _) | (_, Self::Unknown) => true,
            (a, b) => core::mem::discriminant(a) == core::mem::discriminant(b),
        }
    }
}

fn endpoint_format(path: &str) -> EndpointFormat {
    if path.ends_with("/messages") {
        EndpointFormat::Messages
    } else if path.ends_with("/chat/completions") {
        EndpointFormat::ChatCompletions
    } else if path.ends_with("/responses") {
        EndpointFormat::Responses
    } else if path.ends_with("/completions") {
        EndpointFormat::Completions
    } else if path.ends_with("/embeddings") {
        EndpointFormat::Embeddings
    } else if path.ends_with("/moderations") {
        EndpointFormat::Moderations
    } else {
        EndpointFormat::Unknown
    }
}
