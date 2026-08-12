use axum::extract::{Path, State};
use axum::Json;
use serde::Deserialize;
use serde_json::Value;

use crate::error::AppError;
use crate::middleware::auth::JwtAuth;
use crate::state::AppState;

#[derive(Deserialize)]
pub struct CreateVerificationRequest {
    pub filename: String,
    pub content: String,
}

pub async fn list(
    State(state): State<AppState>,
    axum::Extension(auth): axum::Extension<JwtAuth>,
) -> Result<Json<Vec<Value>>, AppError> {
    if auth.user_role < 10 {
        return Err(AppError::Forbidden("admin access required".into()));
    }

    let files = state.verification_files.read().await;
    let result: Vec<Value> = files
        .iter()
        .map(|(filename, content)| {
            serde_json::json!({
                "filename": filename,
                "content": content,
            })
        })
        .collect();
    Ok(Json(result))
}

pub async fn create(
    State(state): State<AppState>,
    axum::Extension(auth): axum::Extension<JwtAuth>,
    Json(req): Json<CreateVerificationRequest>,
) -> Result<Json<Value>, AppError> {
    if auth.user_role < 10 {
        return Err(AppError::Forbidden("admin access required".into()));
    }

    let filename = req.filename.trim().trim_start_matches('/').to_string();
    if filename.is_empty() {
        return Err(AppError::BadRequest("filename is required".into()));
    }

    let mut files = state.verification_files.write().await;
    files.insert(filename.clone(), req.content.clone());

    Ok(Json(serde_json::json!({
        "filename": filename,
        "content": req.content,
    })))
}

pub async fn delete(
    State(state): State<AppState>,
    axum::Extension(auth): axum::Extension<JwtAuth>,
    Path(id): Path<String>,
) -> Result<Json<Value>, AppError> {
    if auth.user_role < 10 {
        return Err(AppError::Forbidden("admin access required".into()));
    }

    let mut files = state.verification_files.write().await;
    files.remove(&id);

    Ok(Json(serde_json::json!({ "ok": true })))
}
