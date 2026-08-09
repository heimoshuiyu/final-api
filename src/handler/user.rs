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

    // Auto-accept any pending workspace invites
    let _ = accept_pending_invites(&state.pool, &user.username, user.id).await;

    let workspaces = db::workspace::list_by_user(&state.pool, user.id).await?;

    let token = create_jwt(&state.config.jwt_secret, user.id, &user.username)?;
    Ok(Json(serde_json::json!({
        "token": token,
        "user": {
            "id": user.id,
            "username": user.username,
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

    // Create default workspace
    let ws = db::workspace::create(
        &state.pool,
        &format!("{}'s Workspace", user.username),
        None,
        user.id,
    )
    .await?;
    db::workspace::add_member(&state.pool, ws.id, user.id, 10).await?;

    // Auto-accept any pending invites
    let _ = accept_pending_invites(&state.pool, &user.username, user.id).await;

    let workspaces = db::workspace::list_by_user(&state.pool, user.id).await?;

    let token = create_jwt(&state.config.jwt_secret, user.id, &user.username)?;
    Ok(Json(serde_json::json!({
        "token": token,
        "user": {
            "id": user.id,
            "username": user.username,
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

async fn accept_pending_invites(
    pool: &sqlx::PgPool,
    username: &str,
    user_id: i64,
) -> Result<(), sqlx::Error> {
    let invites = db::workspace::find_pending_invites_by_username(pool, username).await?;
    for invite in invites {
        let _ = db::workspace::accept_invite(pool, invite.id, user_id).await;
    }
    Ok(())
}
