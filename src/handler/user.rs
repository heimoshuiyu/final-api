use axum::extract::State;
use axum::Json;
use serde::Deserialize;
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

    let workspaces = db::workspace::list_by_user(&state.pool, user.id).await?;

    let token = create_jwt(&state.config.jwt_secret, user.id, &user.username, user.role)?;
    Ok(Json(serde_json::json!({
        "token": token,
        "user": {
            "id": user.id,
            "username": user.username,
            "role": user.role,
            "status": user.status,
        },
        "workspaces": workspaces.iter().map(|w| {
                serde_json::json!({
                    "id": w.id,
                    "name": w.name,
                    "slug": w.slug,
                    "role": w.role,
                })
            }).collect::<Vec<_>>(),
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
    let settings = db::settings::get(&state.pool).await?;
    if !settings.registration_enabled {
        return Err(AppError::Forbidden("registration is disabled".into()));
    }

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

    let workspaces = db::workspace::list_by_user(&state.pool, user.id).await?;

    let token = create_jwt(&state.config.jwt_secret, user.id, &user.username, user.role)?;
    Ok(Json(serde_json::json!({
        "token": token,
        "user": {
            "id": user.id,
            "username": user.username,
            "role": user.role,
            "status": user.status,
        },
        "workspaces": workspaces.iter().map(|w| {
                serde_json::json!({
                    "id": w.id,
                    "name": w.name,
                    "slug": w.slug,
                    "role": w.role,
                })
            }).collect::<Vec<_>>(),
        })))
}

#[derive(Deserialize)]
pub struct ChangePasswordRequest {
    pub old_password: String,
    pub new_password: String,
}

pub async fn change_password(
    State(state): State<AppState>,
    axum::Extension(auth): axum::Extension<JwtAuth>,
    Json(req): Json<ChangePasswordRequest>,
) -> Result<Json<Value>, AppError> {
    let user = db::user::find_by_id(&state.pool, auth.user_id)
        .await?
        .ok_or_else(|| AppError::NotFound("user not found".into()))?;

    if !verify_password(&req.old_password, &user.password_hash)? {
        return Err(AppError::BadRequest("current password incorrect".into()));
    }
    if req.new_password.len() < 6 {
        return Err(AppError::BadRequest("new password too short".into()));
    }
    if req.new_password == req.old_password {
        return Err(AppError::BadRequest("new password must differ".into()));
    }

    let hash = hash_password(&req.new_password)?;
    db::user::update_password(&state.pool, user.id, &hash).await?;

    Ok(Json(serde_json::json!({ "success": true })))
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

pub async fn list_workspaces(
    State(state): State<AppState>,
    axum::Extension(auth): axum::Extension<JwtAuth>,
) -> Result<Json<Value>, AppError> {
    let workspaces = db::workspace::list_by_user(&state.pool, auth.user_id).await?;
    Ok(Json(serde_json::json!(
        workspaces
            .iter()
            .map(|w| {
                serde_json::json!({
                    "id": w.id,
                    "name": w.name,
                    "slug": w.slug,
                    "role": w.role,
                })
            })
            .collect::<Vec<_>>()
    )))
}
