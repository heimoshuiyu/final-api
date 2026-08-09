use axum::extract::{Path, State};
use axum::Json;
use serde_json::Value;

use crate::db;
use crate::error::AppError;
use crate::middleware::auth::JwtAuth;
use crate::state::AppState;

fn assert_admin(auth: &JwtAuth) -> Result<(), AppError> {
    if auth.user_role < 10 {
        return Err(AppError::Forbidden("admin required".into()));
    }
    Ok(())
}

pub async fn list(
    State(state): State<AppState>,
    axum::Extension(auth): axum::Extension<JwtAuth>,
) -> Result<Json<Vec<db::channel::ChannelRow>>, AppError> {
    let channels = db::channel::list_by_workspace(&state.pool, auth.workspace_id).await?;
    Ok(Json(channels))
}

pub async fn create(
    State(state): State<AppState>,
    axum::Extension(auth): axum::Extension<JwtAuth>,
    Json(req): Json<db::channel::CreateChannel>,
) -> Result<Json<db::channel::ChannelRow>, AppError> {
    assert_admin(&auth)?;
    let channel = db::channel::create(&state.pool, auth.workspace_id, &req).await?;
    Ok(Json(channel))
}

pub async fn update(
    State(state): State<AppState>,
    axum::Extension(auth): axum::Extension<JwtAuth>,
    Path(id): Path<i64>,
    Json(req): Json<db::channel::CreateChannel>,
) -> Result<Json<db::channel::ChannelRow>, AppError> {
    assert_admin(&auth)?;
    let channel = db::channel::update(&state.pool, id, auth.workspace_id, &req)
        .await?
        .ok_or_else(|| AppError::NotFound("channel not found".into()))?;
    Ok(Json(channel))
}

pub async fn delete(
    State(state): State<AppState>,
    axum::Extension(auth): axum::Extension<JwtAuth>,
    Path(id): Path<i64>,
) -> Result<Json<Value>, AppError> {
    assert_admin(&auth)?;
    let deleted = db::channel::delete(&state.pool, id, auth.workspace_id).await?;
    if !deleted {
        return Err(AppError::NotFound("channel not found".into()));
    }
    Ok(Json(serde_json::json!({ "success": true })))
}
