use axum::extract::State;
use axum::Json;
use serde::Deserialize;
use serde_json::Value;

use crate::db;
use crate::error::AppError;
use crate::middleware::auth::JwtAuth;
use crate::state::AppState;

const SUPPORTED_PROVIDERS: &[(&str, &str)] = &[
    ("github", "GitHub"),
    ("google", "Google"),
    ("wework", "企业微信"),
];

pub async fn public_settings(
    State(state): State<AppState>,
) -> Result<Json<Value>, AppError> {
    let settings = db::settings::get(&state.pool).await?;

    let providers: Vec<Value> = SUPPORTED_PROVIDERS
        .iter()
        .map(|(id, name)| {
            let enabled = settings
                .oauth_config
                .get(*id)
                .and_then(|c| c.get("enabled"))
                .and_then(|v| v.as_bool())
                .unwrap_or(false);
            serde_json::json!({ "provider": id, "name": name, "enabled": enabled })
        })
        .filter(|p| p["enabled"].as_bool().unwrap_or(false))
        .collect();

    Ok(Json(serde_json::json!({
        "registration_enabled": settings.registration_enabled,
        "oauth_providers": providers,
    })))
}

pub async fn admin_settings(
    State(state): State<AppState>,
    axum::Extension(auth): axum::Extension<JwtAuth>,
) -> Result<Json<Value>, AppError> {
    let is_admin = db::workspace::is_any_workspace_admin(&state.pool, auth.user_id).await?;
    if !is_admin {
        return Err(AppError::Forbidden("admin access required".into()));
    }

    let settings = db::settings::get(&state.pool).await?;

    let providers: Vec<Value> = SUPPORTED_PROVIDERS
        .iter()
        .map(|(id, name)| {
            let config = settings.oauth_config.get(*id);
            let enabled = config
                .and_then(|c| c.get("enabled"))
                .and_then(|v| v.as_bool())
                .unwrap_or(false);
            let config_fields = config
                .and_then(|c| c.as_object())
                .map(|obj| {
                    let mut fields = serde_json::Map::new();
                    for (k, v) in obj {
                        if k != "enabled" {
                            fields.insert(k.clone(), v.clone());
                        }
                    }
                    Value::Object(fields)
                })
                .unwrap_or(Value::Object(serde_json::Map::new()));
            serde_json::json!({
                "provider": id,
                "name": name,
                "enabled": enabled,
                "config": config_fields,
            })
        })
        .collect();

    Ok(Json(serde_json::json!({
        "registration_enabled": settings.registration_enabled,
        "oauth_providers": providers,
    })))
}

#[derive(Deserialize)]
pub struct UpdateSettingsRequest {
    pub registration_enabled: bool,
    pub oauth_providers: Vec<ProviderUpdate>,
}

#[derive(Deserialize)]
pub struct ProviderUpdate {
    pub provider: String,
    pub enabled: bool,
    pub config: serde_json::Value,
}

pub async fn update_settings(
    State(state): State<AppState>,
    axum::Extension(auth): axum::Extension<JwtAuth>,
    Json(req): Json<UpdateSettingsRequest>,
) -> Result<Json<Value>, AppError> {
    let is_admin = db::workspace::is_any_workspace_admin(&state.pool, auth.user_id).await?;
    if !is_admin {
        return Err(AppError::Forbidden("admin access required".into()));
    }

    let mut oauth_config = serde_json::json!({});
    for p in &req.oauth_providers {
        let valid = SUPPORTED_PROVIDERS.iter().any(|(id, _)| *id == p.provider);
        if !valid {
            continue;
        }
        let mut entry = serde_json::json!({ "enabled": p.enabled });
        if let Some(obj) = p.config.as_object() {
            for (k, v) in obj {
                entry[k] = v.clone();
            }
        }
        oauth_config[&p.provider] = entry;
    }

    db::settings::update(&state.pool, req.registration_enabled, &oauth_config).await?;

    Ok(Json(serde_json::json!({ "ok": true })))
}
