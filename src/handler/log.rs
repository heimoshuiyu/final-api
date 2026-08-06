use axum::extract::{Query, State};
use axum::Json;
use serde::Serialize;

use crate::db;
use crate::error::AppError;
use crate::state::AppState;

#[derive(Serialize)]
pub struct LogListResponse {
    pub total: i64,
    pub data: Vec<db::log::LogRow>,
}

pub async fn list(
    State(state): State<AppState>,
    Query(q): Query<db::log::LogQuery>,
) -> Result<Json<LogListResponse>, AppError> {
    let total = db::log::count(&state.pool, &q).await?;
    let logs = db::log::list(&state.pool, &q).await?;
    Ok(Json(LogListResponse { total, data: logs }))
}
