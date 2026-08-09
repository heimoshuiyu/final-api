use axum::extract::{Path, State};
use axum::Json;
use serde::Deserialize;
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
    assert_admin(&auth)?;

    let name = req.name.trim();
    if name.is_empty() || name.len() > 64 {
        return Err(AppError::BadRequest("workspace name must be 1-64 characters".into()));
    }

    let ws = db::workspace::create(&state.pool, name, None, auth.user_id).await?;
    db::workspace::add_member(&state.pool, ws.id, auth.user_id, 1).await?;

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
        "role": auth.user_role,
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
        "role": auth.user_role,
    })))
}

pub async fn rename(
    State(state): State<AppState>,
    axum::Extension(auth): axum::Extension<JwtAuth>,
    Json(req): Json<RenameRequest>,
) -> Result<Json<Value>, AppError> {
    assert_admin(&auth)?;
    let name = req.name.trim();
    if name.is_empty() || name.len() > 64 {
        return Err(AppError::BadRequest("workspace name must be 1-64 characters".into()));
    }
    let ws = db::workspace::rename(&state.pool, auth.workspace_id, name)
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
    let users = db::user::find_by_ids(&state.pool, members.iter().map(|m| m.user_id).collect::<Vec<_>>())
        .await?;

    Ok(Json(serde_json::json!(
        members
            .iter()
            .map(|m| {
                let global_role = users.iter()
                    .find(|u| u.id == m.user_id)
                    .map(|u| u.role)
                    .unwrap_or(1);
                serde_json::json!({
                    "id": m.id,
                    "user_id": m.user_id,
                    "username": m.username,
                    "role": global_role,
                    "joined_at": m.joined_at,
                })
            })
            .collect::<Vec<_>>()
    )))
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

// ---- Promote to admin ----

pub async fn promote_member(
    State(state): State<AppState>,
    axum::Extension(auth): axum::Extension<JwtAuth>,
    Path(user_id): Path<i64>,
) -> Result<Json<Value>, AppError> {
    assert_admin(&auth)?;

    if user_id == auth.user_id {
        return Err(AppError::BadRequest("cannot promote yourself".into()));
    }

    db::user::set_role(&state.pool, user_id, 10).await?;

    Ok(Json(serde_json::json!({ "success": true })))
}

// ---- Token-based invites ----

pub async fn create_invite(
    State(state): State<AppState>,
    axum::Extension(auth): axum::Extension<JwtAuth>,
) -> Result<Json<Value>, AppError> {
    assert_admin(&auth)?;

    let token = crate::middleware::auth::generate_invite_token();
    let invite = db::workspace::create_invite(
        &state.pool,
        auth.workspace_id,
        &token,
        auth.user_id,
    )
    .await?;

    Ok(Json(serde_json::json!({
        "id": invite.id,
        "token": invite.token,
        "workspace_id": invite.workspace_id,
        "created_at": invite.created_at,
    })))
}

pub async fn list_invites(
    State(state): State<AppState>,
    axum::Extension(auth): axum::Extension<JwtAuth>,
) -> Result<Json<Value>, AppError> {
    assert_admin(&auth)?;
    let invites = db::workspace::list_invites(&state.pool, auth.workspace_id).await?;
    Ok(Json(serde_json::json!(
        invites
            .iter()
            .map(|i| {
                serde_json::json!({
                    "id": i.id,
                    "token": i.token,
                    "created_at": i.created_at,
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

// ---- Public invite info + accept ----

pub async fn invite_info(
    State(state): State<AppState>,
    Path(token): Path<String>,
) -> Result<Json<Value>, AppError> {
    let invite = db::workspace::find_invite_by_token(&state.pool, &token)
        .await?
        .ok_or_else(|| AppError::NotFound("invite not found".into()))?;

    let ws = db::workspace::find_by_id(&state.pool, invite.workspace_id)
        .await?
        .ok_or_else(|| AppError::NotFound("workspace not found".into()))?;

    Ok(Json(serde_json::json!({
        "workspace_name": ws.name,
        "created_at": invite.created_at,
    })))
}

pub async fn accept_invite(
    State(state): State<AppState>,
    Path(token): Path<String>,
    axum::Extension(auth): axum::Extension<JwtAuth>,
) -> Result<Json<Value>, AppError> {
    let invite = db::workspace::find_invite_by_token(&state.pool, &token)
        .await?
        .ok_or_else(|| AppError::NotFound("invite not found".into()))?;

    // Already a member?
    if db::workspace::find_membership(&state.pool, invite.workspace_id, auth.user_id)
        .await?
        .is_some()
    {
        return Ok(Json(serde_json::json!({
            "workspace_id": invite.workspace_id,
            "already_member": true,
        })));
    }

    db::workspace::add_member(&state.pool, invite.workspace_id, auth.user_id, 1).await?;

    Ok(Json(serde_json::json!({
        "workspace_id": invite.workspace_id,
        "already_member": false,
    })))
}
