use chrono::{DateTime, Utc};
use serde::{Deserialize, Serialize};
use sqlx::FromRow;

#[derive(Debug, Clone, FromRow, Serialize, Deserialize)]
pub struct WorkspaceRow {
    pub id: i64,
    pub name: String,
    pub slug: Option<String>,
    pub created_by: Option<i64>,
    pub created_at: DateTime<Utc>,
    pub updated_at: DateTime<Utc>,
}

#[derive(Debug, Clone, FromRow, Serialize, Deserialize)]
pub struct MemberRow {
    pub id: i64,
    pub workspace_id: i64,
    pub user_id: i64,
    pub role: i16,
    pub include_in_stats: bool,
    pub joined_at: DateTime<Utc>,
    pub username: String,
}

#[derive(Debug, Clone, FromRow, Serialize, Deserialize)]
pub struct WorkspaceWithRole {
    pub id: i64,
    pub name: String,
    pub slug: Option<String>,
    pub created_by: Option<i64>,
    pub created_at: DateTime<Utc>,
    pub updated_at: DateTime<Utc>,
    pub role: i16,
}

pub async fn create(
    pool: &sqlx::PgPool,
    name: &str,
    slug: Option<&str>,
    created_by: i64,
) -> Result<WorkspaceRow, sqlx::Error> {
    sqlx::query_as::<_, WorkspaceRow>(
        r#"INSERT INTO workspaces (name, slug, created_by)
           VALUES ($1, $2, $3) RETURNING *"#,
    )
    .bind(name)
    .bind(slug)
    .bind(created_by)
    .fetch_one(pool)
    .await
}

pub async fn find_by_id(pool: &sqlx::PgPool, id: i64) -> Result<Option<WorkspaceRow>, sqlx::Error> {
    sqlx::query_as::<_, WorkspaceRow>("SELECT * FROM workspaces WHERE id = $1")
        .bind(id)
        .fetch_optional(pool)
        .await
}

pub async fn list_by_user(
    pool: &sqlx::PgPool,
    user_id: i64,
) -> Result<Vec<WorkspaceWithRole>, sqlx::Error> {
    sqlx::query_as::<_, WorkspaceWithRole>(
        r#"SELECT w.*, wm.role FROM workspaces w
           INNER JOIN workspace_members wm ON wm.workspace_id = w.id
           WHERE wm.user_id = $1 ORDER BY w.id"#,
    )
    .bind(user_id)
    .fetch_all(pool)
    .await
}

pub async fn find_membership(
    pool: &sqlx::PgPool,
    workspace_id: i64,
    user_id: i64,
) -> Result<Option<(i64, i16)>, sqlx::Error> {
    sqlx::query_as::<_, (i64, i16)>(
        r#"SELECT user_id, role FROM workspace_members
           WHERE workspace_id = $1 AND user_id = $2"#,
    )
    .bind(workspace_id)
    .bind(user_id)
    .fetch_optional(pool)
    .await
}

pub async fn add_member(
    pool: &sqlx::PgPool,
    workspace_id: i64,
    user_id: i64,
    role: i16,
) -> Result<(), sqlx::Error> {
    sqlx::query(
        r#"INSERT INTO workspace_members (workspace_id, user_id, role)
           VALUES ($1, $2, $3)
           ON CONFLICT (workspace_id, user_id) DO UPDATE SET role = $3"#,
    )
    .bind(workspace_id)
    .bind(user_id)
    .bind(role)
    .execute(pool)
    .await?;
    Ok(())
}

pub async fn remove_member(
    pool: &sqlx::PgPool,
    workspace_id: i64,
    user_id: i64,
) -> Result<bool, sqlx::Error> {
    let result = sqlx::query(
        "DELETE FROM workspace_members WHERE workspace_id = $1 AND user_id = $2",
    )
    .bind(workspace_id)
    .bind(user_id)
    .execute(pool)
    .await?;
    Ok(result.rows_affected() > 0)
}

pub async fn list_members(
    pool: &sqlx::PgPool,
    workspace_id: i64,
) -> Result<Vec<MemberRow>, sqlx::Error> {
    sqlx::query_as::<_, MemberRow>(
        r#"SELECT wm.*, u.username FROM workspace_members wm
           INNER JOIN users u ON u.id = wm.user_id
           WHERE wm.workspace_id = $1 ORDER BY wm.role DESC, wm.joined_at"#,
    )
    .bind(workspace_id)
    .fetch_all(pool)
    .await
}

pub async fn set_include_stats(
    pool: &sqlx::PgPool,
    workspace_id: i64,
    user_id: i64,
    include_in_stats: bool,
) -> Result<bool, sqlx::Error> {
    let result = sqlx::query(
        "UPDATE workspace_members SET include_in_stats = $3
         WHERE workspace_id = $1 AND user_id = $2",
    )
    .bind(workspace_id)
    .bind(user_id)
    .bind(include_in_stats)
    .execute(pool)
    .await?;
    Ok(result.rows_affected() > 0)
}

pub async fn member_count(
    pool: &sqlx::PgPool,
    workspace_id: i64,
) -> Result<i64, sqlx::Error> {
    let row: (i64,) =
        sqlx::query_as("SELECT COUNT(*) FROM workspace_members WHERE workspace_id = $1")
            .bind(workspace_id)
            .fetch_one(pool)
            .await?;
    Ok(row.0)
}

pub async fn rename(
    pool: &sqlx::PgPool,
    id: i64,
    name: &str,
) -> Result<Option<WorkspaceRow>, sqlx::Error> {
    sqlx::query_as::<_, WorkspaceRow>(
        r#"UPDATE workspaces SET name = $2, updated_at = NOW()
           WHERE id = $1 RETURNING *"#,
    )
    .bind(id)
    .bind(name)
    .fetch_optional(pool)
    .await
}

// ---- Token-based invites ----

#[derive(Debug, Clone, FromRow, Serialize, Deserialize)]
pub struct InviteRow {
    pub id: i64,
    pub workspace_id: i64,
    pub token: String,
    pub created_by: i64,
    pub created_at: DateTime<Utc>,
}

pub async fn create_invite(
    pool: &sqlx::PgPool,
    workspace_id: i64,
    token: &str,
    created_by: i64,
) -> Result<InviteRow, sqlx::Error> {
    sqlx::query_as::<_, InviteRow>(
        r#"INSERT INTO workspace_invites (workspace_id, token, created_by)
           VALUES ($1, $2, $3) RETURNING *"#,
    )
    .bind(workspace_id)
    .bind(token)
    .bind(created_by)
    .fetch_one(pool)
    .await
}

pub async fn list_invites(
    pool: &sqlx::PgPool,
    workspace_id: i64,
) -> Result<Vec<InviteRow>, sqlx::Error> {
    sqlx::query_as::<_, InviteRow>(
        r#"SELECT * FROM workspace_invites
           WHERE workspace_id = $1 ORDER BY created_at DESC"#,
    )
    .bind(workspace_id)
    .fetch_all(pool)
    .await
}

pub async fn find_invite_by_token(
    pool: &sqlx::PgPool,
    token: &str,
) -> Result<Option<InviteRow>, sqlx::Error> {
    sqlx::query_as::<_, InviteRow>(
        "SELECT * FROM workspace_invites WHERE token = $1",
    )
    .bind(token)
    .fetch_optional(pool)
    .await
}

pub async fn delete_invite(
    pool: &sqlx::PgPool,
    invite_id: i64,
    workspace_id: i64,
) -> Result<bool, sqlx::Error> {
    let result = sqlx::query(
        "DELETE FROM workspace_invites WHERE id = $1 AND workspace_id = $2",
    )
    .bind(invite_id)
    .bind(workspace_id)
    .execute(pool)
    .await?;
    Ok(result.rows_affected() > 0)
}
