use axum::extract::{Query, State};
use axum::Json;

use crate::db;
use crate::error::AppError;
use crate::state::AppState;

pub async fn list(
    State(state): State<AppState>,
    Query(q): Query<db::log::LogQuery>,
) -> Result<Json<Vec<db::log::LogRow>>, AppError> {
    let logs = db::log::list(&state.pool, &q).await?;
    Ok(Json(logs))
}
