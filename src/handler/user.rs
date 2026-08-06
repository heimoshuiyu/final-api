use axum::extract::State;
use axum::Json;
use serde::{Deserialize, Serialize};
use serde_json::Value;

use crate::db;
use crate::error::AppError;
use crate::middleware::auth::{create_jwt, hash_password, verify_password, JwtAuth};
use crate::state::AppState;

#[derive(Deserialize)]
pub struct LoginRequest {
    pub username: String,
    pub password: String,
}

#[derive(Serialize)]
pub struct LoginResponse {
    pub token: String,
    pub user: db::user::UserRow,
}

pub async fn login(
    State(state): State<AppState>,
    Json(req): Json<LoginRequest>,
) -> Result<Json<Value>, AppError> {
    let user = db::user::find_by_username(&state.pool, &req.username)
        .await?
        .ok_or_else(|| AppError::Unauthorized("invalid credentials".into()))?;

    if user.status != 1 {
        return Err(AppError::Forbidden("account disabled".into()));
    }

    if !verify_password(&req.password, &user.password_hash)? {
        return Err(AppError::Unauthorized("invalid credentials".into()));
    }

    let token = create_jwt(&state.config.jwt_secret, user.id, &user.username, user.role)?;
    Ok(Json(serde_json::json!({
        "token": token,
        "user": {
            "id": user.id,
            "username": user.username,
            "role": user.role,
            "status": user.status,
        }
    })))
}

#[derive(Deserialize)]
pub struct RegisterRequest {
    pub username: String,
    pub password: String,
}

pub async fn register(
    State(state): State<AppState>,
    Json(req): Json<RegisterRequest>,
) -> Result<Json<Value>, AppError> {
    if req.username.len() < 3 || req.username.len() > 64 {
        return Err(AppError::BadRequest("username must be 3-64 chars".into()));
    }
    if req.password.len() < 6 {
        return Err(AppError::BadRequest("password too short".into()));
    }

    if db::user::find_by_username(&state.pool, &req.username).await?.is_some() {
        return Err(AppError::BadRequest("username already exists".into()));
    }

    let hash = hash_password(&req.password)?;
    let user = db::user::create(&state.pool, &req.username, &hash).await?;

    let token = create_jwt(&state.config.jwt_secret, user.id, &user.username, user.role)?;
    Ok(Json(serde_json::json!({
        "token": token,
        "user": {
            "id": user.id,
            "username": user.username,
            "role": user.role,
            "status": user.status,
        }
    })))
}

pub async fn self_info(
    State(state): State<AppState>,
    axum::Extension(auth): axum::Extension<JwtAuth>,
) -> Result<Json<Value>, AppError> {
    let user = db::user::find_by_id(&state.pool, auth.user_id)
        .await?
        .ok_or_else(|| AppError::NotFound("user not found".into()))?;

    Ok(Json(serde_json::json!({
        "id": user.id,
        "username": user.username,
        "role": user.role,
        "status": user.status,
        "created_at": user.created_at,
    })))
}

pub async fn list(State(state): State<AppState>) -> Result<Json<Vec<db::user::UserRow>>, AppError> {
    let users = db::user::list_all(&state.pool).await?;
    Ok(Json(users))
}
