use axum::extract::{Query, State};
use axum::Json;
use serde::Serialize;

use crate::db;
use crate::error::AppError;
use crate::middleware::auth::JwtAuth;
use crate::state::AppState;

#[derive(Serialize)]
pub struct LogListResponse {
    pub total: i64,
    pub data: Vec<db::log::LogRow>,
}

pub async fn list(
    State(state): State<AppState>,
    axum::Extension(auth): axum::Extension<JwtAuth>,
    Query(mut q): Query<db::log::LogQuery>,
) -> Result<Json<LogListResponse>, AppError> {
    // Always scope to current workspace
    q.workspace_id = Some(auth.workspace_id);

    // Members can only see their own logs (unless filtering by their own token)
    if auth.workspace_role < 10 && q.user_id.is_none() {
        q.user_id = Some(auth.user_id);
    }
    // Members cannot snoop other users' logs
    if auth.workspace_role < 10 && q.user_id != Some(auth.user_id) {
        q.user_id = Some(auth.user_id);
    }

    let total = db::log::count(&state.pool, &q).await?;
    let logs = db::log::list(&state.pool, &q).await?;
    Ok(Json(LogListResponse { total, data: logs }))
}
