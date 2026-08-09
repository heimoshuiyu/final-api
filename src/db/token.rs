use chrono::{DateTime, Utc};
use serde::{Deserialize, Serialize};
use sqlx::FromRow;

#[derive(Debug, Clone, FromRow, Serialize, Deserialize)]
pub struct TokenRow {
    pub id: i64,
    pub workspace_id: i64,
    pub user_id: i64,
    pub key: String,
    pub name: String,
    pub status: i16,
    pub model_limits_enabled: bool,
    pub model_limits: String,
    pub expired_at: Option<DateTime<Utc>>,
    pub created_at: DateTime<Utc>,
    pub updated_at: DateTime<Utc>,
}

pub async fn find_by_key(pool: &sqlx::PgPool, key: &str) -> Result<Option<TokenRow>, sqlx::Error> {
    sqlx::query_as::<_, TokenRow>("SELECT * FROM tokens WHERE key = $1")
        .bind(key)
        .fetch_optional(pool)
        .await
}

pub async fn list_by_workspace(
    pool: &sqlx::PgPool,
    workspace_id: i64,
) -> Result<Vec<TokenRow>, sqlx::Error> {
    sqlx::query_as::<_, TokenRow>(
        "SELECT * FROM tokens WHERE workspace_id = $1 ORDER BY id DESC",
    )
    .bind(workspace_id)
    .fetch_all(pool)
    .await
}

pub async fn list_by_user(
    pool: &sqlx::PgPool,
    workspace_id: i64,
    user_id: i64,
) -> Result<Vec<TokenRow>, sqlx::Error> {
    sqlx::query_as::<_, TokenRow>(
        "SELECT * FROM tokens WHERE workspace_id = $1 AND user_id = $2 ORDER BY id DESC",
    )
    .bind(workspace_id)
    .bind(user_id)
    .fetch_all(pool)
    .await
}

pub async fn list_all(pool: &sqlx::PgPool) -> Result<Vec<TokenRow>, sqlx::Error> {
    sqlx::query_as::<_, TokenRow>("SELECT * FROM tokens ORDER BY id DESC")
        .fetch_all(pool)
        .await
}

pub async fn create(
    pool: &sqlx::PgPool,
    workspace_id: i64,
    user_id: i64,
    key: &str,
    name: &str,
    model_limits_enabled: bool,
    model_limits: &str,
    expired_at: Option<DateTime<Utc>>,
) -> Result<TokenRow, sqlx::Error> {
    sqlx::query_as::<_, TokenRow>(
        r#"INSERT INTO tokens (workspace_id, user_id, key, name, model_limits_enabled, model_limits, expired_at)
           VALUES ($1, $2, $3, $4, $5, $6, $7) RETURNING *"#,
    )
    .bind(workspace_id)
    .bind(user_id)
    .bind(key)
    .bind(name)
    .bind(model_limits_enabled)
    .bind(model_limits)
    .bind(expired_at)
    .fetch_one(pool)
    .await
}

pub async fn delete(pool: &sqlx::PgPool, id: i64, workspace_id: i64) -> Result<bool, sqlx::Error> {
    let result = sqlx::query("DELETE FROM tokens WHERE id = $1 AND workspace_id = $2")
        .bind(id)
        .bind(workspace_id)
        .execute(pool)
        .await?;
    Ok(result.rows_affected() > 0)
}

pub async fn find_by_id(
    pool: &sqlx::PgPool,
    id: i64,
    workspace_id: i64,
) -> Result<Option<TokenRow>, sqlx::Error> {
    sqlx::query_as::<_, TokenRow>(
        "SELECT * FROM tokens WHERE id = $1 AND workspace_id = $2",
    )
    .bind(id)
    .bind(workspace_id)
    .fetch_optional(pool)
    .await
}

pub async fn update(
    pool: &sqlx::PgPool,
    id: i64,
    workspace_id: i64,
    name: &str,
    status: i16,
    model_limits_enabled: bool,
    model_limits: &str,
    expired_at: Option<DateTime<Utc>>,
) -> Result<Option<TokenRow>, sqlx::Error> {
    sqlx::query_as::<_, TokenRow>(
        r#"UPDATE tokens SET name = $3, status = $4, model_limits_enabled = $5,
           model_limits = $6, expired_at = $7
           WHERE id = $1 AND workspace_id = $2 RETURNING *"#,
    )
    .bind(id)
    .bind(workspace_id)
    .bind(name)
    .bind(status)
    .bind(model_limits_enabled)
    .bind(model_limits)
    .bind(expired_at)
    .fetch_optional(pool)
    .await
}
