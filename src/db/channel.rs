use chrono::{DateTime, Utc};
use serde::{Deserialize, Serialize};
use sqlx::FromRow;

#[derive(Debug, Clone, FromRow, Serialize, Deserialize)]
pub struct ChannelRow {
    pub id: i64,
    pub workspace_id: i64,
    pub name: String,
    pub endpoint_url: String,
    pub auth_type: String,
    #[serde(skip_serializing)]
    pub api_key: String,
    pub models: Vec<String>,
    pub status: i16,
    pub priority: i32,
    pub weight: i32,
    pub model_mapping: serde_json::Value,
    pub model_overrides: serde_json::Value,
    pub header_override: serde_json::Value,
    pub body_override: serde_json::Value,
    pub max_concurrency: i32,
    pub created_at: DateTime<Utc>,
    pub updated_at: DateTime<Utc>,
}

pub async fn find_by_model(
    pool: &sqlx::PgPool,
    workspace_id: i64,
    model: &str,
) -> Result<Vec<ChannelRow>, sqlx::Error> {
    sqlx::query_as::<_, ChannelRow>(
        "SELECT * FROM channels WHERE workspace_id = $1 AND status = 1 AND $2 = ANY(models)",
    )
    .bind(workspace_id)
    .bind(model)
    .fetch_all(pool)
    .await
}

pub async fn find_by_id(pool: &sqlx::PgPool, id: i64) -> Result<Option<ChannelRow>, sqlx::Error> {
    sqlx::query_as::<_, ChannelRow>("SELECT * FROM channels WHERE id = $1")
        .bind(id)
        .fetch_optional(pool)
        .await
}

pub async fn list_by_workspace(
    pool: &sqlx::PgPool,
    workspace_id: i64,
) -> Result<Vec<ChannelRow>, sqlx::Error> {
    sqlx::query_as::<_, ChannelRow>(
        "SELECT * FROM channels WHERE workspace_id = $1 ORDER BY id DESC",
    )
    .bind(workspace_id)
    .fetch_all(pool)
    .await
}

pub async fn all_models(
    pool: &sqlx::PgPool,
    workspace_id: i64,
) -> Result<Vec<String>, sqlx::Error> {
    let rows: Vec<(String,)> =
        sqlx::query_as("SELECT DISTINCT model FROM channels, unnest(models) AS model WHERE workspace_id = $1 AND status = 1 ORDER BY model")
            .bind(workspace_id)
            .fetch_all(pool)
            .await?;
    Ok(rows.into_iter().map(|r| r.0).collect())
}

#[derive(Debug, Deserialize)]
pub struct CreateChannel {
    pub name: String,
    pub endpoint_url: String,
    pub auth_type: Option<String>,
    pub api_key: String,
    pub models: Vec<String>,
    pub priority: Option<i32>,
    pub weight: Option<i32>,
    pub model_mapping: Option<serde_json::Value>,
    pub model_overrides: Option<serde_json::Value>,
    pub header_override: Option<serde_json::Value>,
    pub body_override: Option<serde_json::Value>,
    pub max_concurrency: Option<i32>,
}

pub async fn create(pool: &sqlx::PgPool, workspace_id: i64, c: &CreateChannel) -> Result<ChannelRow, sqlx::Error> {
    sqlx::query_as::<_, ChannelRow>(
        r#"INSERT INTO channels (workspace_id, name, endpoint_url, auth_type, api_key, models, priority, weight,
           model_mapping, model_overrides, header_override, body_override, max_concurrency)
           VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13) RETURNING *"#,
    )
    .bind(workspace_id)
    .bind(&c.name)
    .bind(&c.endpoint_url)
    .bind(c.auth_type.as_deref().unwrap_or("bearer"))
    .bind(&c.api_key)
    .bind(&c.models)
    .bind(c.priority.unwrap_or(0))
    .bind(c.weight.unwrap_or(1))
    .bind(c.model_mapping.clone().unwrap_or(serde_json::json!({})))
    .bind(c.model_overrides.clone().unwrap_or(serde_json::json!({})))
    .bind(c.header_override.clone().unwrap_or(serde_json::json!({})))
    .bind(c.body_override.clone().unwrap_or(serde_json::json!({})))
    .bind(c.max_concurrency.unwrap_or(0))
    .fetch_one(pool)
    .await
}

pub async fn update(
    pool: &sqlx::PgPool,
    id: i64,
    c: &CreateChannel,
) -> Result<Option<ChannelRow>, sqlx::Error> {
    sqlx::query_as::<_, ChannelRow>(
        r#"UPDATE channels SET name = $2, endpoint_url = $3, auth_type = $4, api_key = $5,
           models = $6, priority = $7, weight = $8, model_mapping = $9, model_overrides = $10,
           header_override = $11, body_override = $12, max_concurrency = $13
           WHERE id = $1 RETURNING *"#,
    )
    .bind(id)
    .bind(&c.name)
    .bind(&c.endpoint_url)
    .bind(c.auth_type.as_deref().unwrap_or("bearer"))
    .bind(&c.api_key)
    .bind(&c.models)
    .bind(c.priority.unwrap_or(0))
    .bind(c.weight.unwrap_or(1))
    .bind(c.model_mapping.clone().unwrap_or(serde_json::json!({})))
    .bind(c.model_overrides.clone().unwrap_or(serde_json::json!({})))
    .bind(c.header_override.clone().unwrap_or(serde_json::json!({})))
    .bind(c.body_override.clone().unwrap_or(serde_json::json!({})))
    .bind(c.max_concurrency.unwrap_or(0))
    .fetch_optional(pool)
    .await
}

pub async fn delete(pool: &sqlx::PgPool, id: i64) -> Result<bool, sqlx::Error> {
    let result = sqlx::query("DELETE FROM channels WHERE id = $1")
        .bind(id)
        .execute(pool)
        .await?;
    Ok(result.rows_affected() > 0)
}
