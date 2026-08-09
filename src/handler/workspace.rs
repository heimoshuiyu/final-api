use axum::extract::{Path, State};
use axum::Json;
use serde::Deserialize;
use serde_json::Value;

use crate::db;
use crate::error::AppError;
use crate::middleware::auth::JwtAuth;
use crate::state::AppState;

fn assert_admin(auth: &JwtAuth) -> Result<(), AppError> {
    if auth.workspace_role < 10 {
        return Err(AppError::Forbidden("workspace admin required".into()));
    }
    Ok(())
}

// ---- Create workspace ----

#[derive(Deserialize)]
pub struct CreateWorkspaceRequest {
    pub name: String,
}

pub async fn create(
    State(state): State<AppState>,
    axum::Extension(auth): axum::Extension<JwtAuth>,
    Json(req): Json<CreateWorkspaceRequest>,
) -> Result<Json<Value>, AppError> {
    let name = req.name.trim();
    if name.is_empty() || name.len() > 64 {
        return Err(AppError::BadRequest("workspace name must be 1-64 characters".into()));
    }

    let ws = db::workspace::create(&state.pool, name, None, auth.user_id).await?;
    db::workspace::add_member(&state.pool, ws.id, auth.user_id, 10).await?;

    tracing::info!(
        "Workspace '{}' (id={}) created by user {}",
        ws.name,
        ws.id,
        auth.user_id
    );

    Ok(Json(serde_json::json!({
        "id": ws.id,
        "name": ws.name,
        "slug": ws.slug,
        "role": 10,
    })))
}

// ---- Workspace info ----

pub async fn info(
    State(state): State<AppState>,
    axum::Extension(auth): axum::Extension<JwtAuth>,
) -> Result<Json<Value>, AppError> {
    let ws =
        db::workspace::find_by_id(&state.pool, auth.workspace_id)
            .await?
            .ok_or_else(|| AppError::NotFound("workspace not found".into()))?;

    let member_count = db::workspace::member_count(&state.pool, ws.id).await?;

    Ok(Json(serde_json::json!({
        "id": ws.id,
        "name": ws.name,
        "slug": ws.slug,
        "member_count": member_count,
        "created_at": ws.created_at,
        "role": auth.workspace_role,
    })))
}

pub async fn rename(
    State(state): State<AppState>,
    axum::Extension(auth): axum::Extension<JwtAuth>,
    Json(req): Json<RenameRequest>,
) -> Result<Json<Value>, AppError> {
    assert_admin(&auth)?;
    let ws = db::workspace::rename(&state.pool, auth.workspace_id, &req.name)
        .await?
        .ok_or_else(|| AppError::NotFound("workspace not found".into()))?;
    Ok(Json(serde_json::json!({
        "id": ws.id,
        "name": ws.name,
        "slug": ws.slug,
    })))
}

#[derive(Deserialize)]
pub struct RenameRequest {
    pub name: String,
}

// ---- Members ----

pub async fn list_members(
    State(state): State<AppState>,
    axum::Extension(auth): axum::Extension<JwtAuth>,
) -> Result<Json<Value>, AppError> {
    let members = db::workspace::list_members(&state.pool, auth.workspace_id).await?;
    Ok(Json(serde_json::json!(
        members
            .iter()
            .map(|m| {
                serde_json::json!({
                    "id": m.id,
                    "user_id": m.user_id,
                    "username": m.username,
                    "role": m.role,
                    "joined_at": m.joined_at,
                })
            })
            .collect::<Vec<_>>()
    )))
}

#[derive(Deserialize)]
pub struct UpdateMemberRole {
    pub role: i16,
}

pub async fn update_member_role(
    State(state): State<AppState>,
    axum::Extension(auth): axum::Extension<JwtAuth>,
    Path(user_id): Path<i64>,
    Json(req): Json<UpdateMemberRole>,
) -> Result<Json<Value>, AppError> {
    assert_admin(&auth)?;

    if user_id == auth.user_id {
        return Err(AppError::BadRequest("cannot change your own role".into()));
    }

    if req.role != 1 && req.role != 10 {
        return Err(AppError::BadRequest("role must be 1 (member) or 10 (admin)".into()));
    }

    let ok = db::workspace::update_member_role(
        &state.pool,
        auth.workspace_id,
        user_id,
        req.role,
    )
    .await?;

    if !ok {
        return Err(AppError::NotFound("member not found".into()));
    }

    Ok(Json(serde_json::json!({ "success": true })))
}

pub async fn remove_member(
    State(state): State<AppState>,
    axum::Extension(auth): axum::Extension<JwtAuth>,
    Path(user_id): Path<i64>,
) -> Result<Json<Value>, AppError> {
    assert_admin(&auth)?;

    if user_id == auth.user_id {
        return Err(AppError::BadRequest("cannot remove yourself".into()));
    }

    let ok = db::workspace::remove_member(&state.pool, auth.workspace_id, user_id).await?;
    if !ok {
        return Err(AppError::NotFound("member not found".into()));
    }

    Ok(Json(serde_json::json!({ "success": true })))
}

// ---- Invites ----

#[derive(Deserialize)]
pub struct InviteRequest {
    pub username: String,
    pub role: Option<i16>,
}

pub async fn create_invite(
    State(state): State<AppState>,
    axum::Extension(auth): axum::Extension<JwtAuth>,
    Json(req): Json<InviteRequest>,
) -> Result<Json<Value>, AppError> {
    assert_admin(&auth)?;

    let role = req.role.unwrap_or(1);
    if role != 1 && role != 10 {
        return Err(AppError::BadRequest("role must be 1 (member) or 10 (admin)".into()));
    }

    if req.username.len() < 3 {
        return Err(AppError::BadRequest("invalid username".into()));
    }

    // If user already exists and is already a member, reject
    if let Some(user) = db::user::find_by_username(&state.pool, &req.username).await? {
        if db::workspace::find_membership(&state.pool, auth.workspace_id, user.id)
            .await?
            .is_some()
        {
            return Err(AppError::BadRequest("user is already a member".into()));
        }
    }

    let invite = db::workspace::create_invite(
        &state.pool,
        auth.workspace_id,
        &req.username,
        auth.user_id,
        role,
        None,
    )
    .await?;

    Ok(Json(serde_json::json!({
        "id": invite.id,
        "workspace_id": invite.workspace_id,
        "username": invite.username,
        "role": invite.role,
        "status": invite.status,
        "created_at": invite.created_at,
    })))
}

pub async fn list_invites(
    State(state): State<AppState>,
    axum::Extension(auth): axum::Extension<JwtAuth>,
) -> Result<Json<Value>, AppError> {
    let invites = db::workspace::list_invites(&state.pool, auth.workspace_id).await?;
    Ok(Json(serde_json::json!(
        invites
            .iter()
            .map(|i| {
                serde_json::json!({
                    "id": i.id,
                    "username": i.username,
                    "role": i.role,
                    "status": i.status,
                    "created_at": i.created_at,
                    "expires_at": i.expires_at,
                })
            })
            .collect::<Vec<_>>()
    )))
}

pub async fn delete_invite(
    State(state): State<AppState>,
    axum::Extension(auth): axum::Extension<JwtAuth>,
    Path(invite_id): Path<i64>,
) -> Result<Json<Value>, AppError> {
    assert_admin(&auth)?;
    let ok = db::workspace::delete_invite(&state.pool, invite_id, auth.workspace_id).await?;
    if !ok {
        return Err(AppError::NotFound("invite not found".into()));
    }
    Ok(Json(serde_json::json!({ "success": true })))
}
