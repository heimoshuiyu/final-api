use axum::extract::{Path, State};
use axum::Json;
use chrono::{DateTime, Utc};
use serde::{Deserialize, Serialize};
use serde_json::Value;

use crate::db;
use crate::error::AppError;
use crate::middleware::auth::{generate_api_key, JwtAuth};
use crate::state::AppState;

#[derive(Deserialize)]
pub struct CreateToken {
    pub name: String,
    pub model_limits_enabled: Option<bool>,
    pub model_limits: Option<String>,
    pub expired_at: Option<DateTime<Utc>>,
}

#[derive(Serialize)]
pub struct CreateTokenResponse {
    pub token: db::token::TokenRow,
}

pub async fn list(
    State(state): State<AppState>,
    axum::Extension(auth): axum::Extension<JwtAuth>,
) -> Result<Json<Vec<db::token::TokenRow>>, AppError> {
    let tokens = db::token::list_by_user(&state.pool, auth.user_id).await?;
    Ok(Json(tokens))
}

pub async fn create(
    State(state): State<AppState>,
    axum::Extension(auth): axum::Extension<JwtAuth>,
    Json(req): Json<CreateToken>,
) -> Result<Json<Value>, AppError> {
    let key = generate_api_key();
    let token = db::token::create(
        &state.pool,
        auth.user_id,
        &key,
        &req.name,
        req.model_limits_enabled.unwrap_or(false),
        req.model_limits.as_deref().unwrap_or(""),
        req.expired_at,
    )
    .await?;

    Ok(Json(serde_json::json!({
        "id": token.id,
        "key": token.key,
        "name": token.name,
        "status": token.status,
        "model_limits_enabled": token.model_limits_enabled,
        "model_limits": token.model_limits,
        "expired_at": token.expired_at,
        "created_at": token.created_at,
    })))
}

pub async fn delete(
    State(state): State<AppState>,
    axum::Extension(auth): axum::Extension<JwtAuth>,
    Path(id): Path<i64>,
) -> Result<Json<Value>, AppError> {
    let deleted = db::token::delete(&state.pool, id, auth.user_id).await?;
    if !deleted {
        return Err(AppError::NotFound("token not found".into()));
    }
    Ok(Json(serde_json::json!({ "success": true })))
}

#[derive(Deserialize)]
pub struct UpdateToken {
    pub name: Option<String>,
    pub status: Option<i16>,
    pub model_limits_enabled: Option<bool>,
    pub model_limits: Option<String>,
    pub expired_at: Option<DateTime<Utc>>,
}

pub async fn update(
    State(state): State<AppState>,
    axum::Extension(auth): axum::Extension<JwtAuth>,
    Path(id): Path<i64>,
    Json(req): Json<UpdateToken>,
) -> Result<Json<db::token::TokenRow>, AppError> {
    let existing = db::token::find_by_id(&state.pool, id, auth.user_id)
        .await?
        .ok_or_else(|| AppError::NotFound("token not found".into()))?;

    let token = db::token::update(
        &state.pool,
        id,
        auth.user_id,
        req.name.as_deref().unwrap_or(&existing.name),
        req.status.unwrap_or(existing.status),
        req.model_limits_enabled.unwrap_or(existing.model_limits_enabled),
        req.model_limits.as_deref().unwrap_or(&existing.model_limits),
        req.expired_at.or(existing.expired_at),
    )
    .await?
    .ok_or_else(|| AppError::NotFound("token not found".into()))?;

    Ok(Json(token))
}
