use axum::extract::{Path, State};
use axum::Json;
use serde_json::Value;

use crate::db;
use crate::error::AppError;
use crate::state::AppState;

pub async fn list(State(state): State<AppState>) -> Result<Json<Vec<db::channel::ChannelRow>>, AppError> {
    let channels = db::channel::list_all(&state.pool).await?;
    Ok(Json(channels))
}

pub async fn create(
    State(state): State<AppState>,
    Json(req): Json<db::channel::CreateChannel>,
) -> Result<Json<db::channel::ChannelRow>, AppError> {
    let channel = db::channel::create(&state.pool, &req).await?;
    Ok(Json(channel))
}

pub async fn update(
    State(state): State<AppState>,
    Path(id): Path<i64>,
    Json(req): Json<db::channel::CreateChannel>,
) -> Result<Json<db::channel::ChannelRow>, AppError> {
    let channel = db::channel::update(&state.pool, id, &req)
        .await?
        .ok_or_else(|| AppError::NotFound("channel not found".into()))?;
    Ok(Json(channel))
}

pub async fn delete(
    State(state): State<AppState>,
    Path(id): Path<i64>,
) -> Result<Json<Value>, AppError> {
    let deleted = db::channel::delete(&state.pool, id).await?;
    if !deleted {
        return Err(AppError::NotFound("channel not found".into()));
    }
    Ok(Json(serde_json::json!({ "success": true })))
}
