use chrono::{DateTime, Utc};
use serde::{Deserialize, Serialize};
use sqlx::FromRow;

#[derive(Debug, Clone, FromRow, Serialize, Deserialize)]
pub struct LogRow {
    pub id: i64,
    pub workspace_id: Option<i64>,
    pub token_id: Option<i64>,
    pub user_id: Option<i64>,
    pub channel_id: Option<i64>,
    pub model: String,
    pub is_stream: bool,
    pub status_code: i32,
    pub duration_ms: i32,
    pub session_id: String,
    pub sticky_id: String,
    pub error_message: Option<String>,
    pub prompt_tokens: Option<i32>,
    pub completion_tokens: Option<i32>,
    pub total_tokens: Option<i32>,
    pub cached_tokens: Option<i32>,
    pub cache_creation_tokens: Option<i32>,
    pub cost: Option<f64>,
    pub upstream_headers_ms: Option<i32>,
    pub upstream_first_data_ms: Option<i32>,
    pub upstream_complete_ms: Option<i32>,
    pub user_agent: String,
    pub created_at: DateTime<Utc>,
}

#[derive(Debug)]
pub struct CreateLogParams<'a> {
    pub workspace_id: i64,
    pub token_id: Option<i64>,
    pub user_id: Option<i64>,
    pub channel_id: Option<i64>,
    pub model: &'a str,
    pub is_stream: bool,
    pub status_code: i32,
    pub duration_ms: i32,
    pub session_id: &'a str,
    pub sticky_id: &'a str,
    pub error_message: Option<&'a str>,
    pub upstream_headers_ms: Option<i32>,
    pub user_agent: &'a str,
}

pub async fn create(pool: &sqlx::PgPool, p: &CreateLogParams<'_>) -> Result<i64, sqlx::Error> {
    let row: (i64,) = sqlx::query_as(
        r#"INSERT INTO request_logs (workspace_id, token_id, user_id, channel_id, model, is_stream,
           status_code, duration_ms, session_id, sticky_id, error_message, upstream_headers_ms, user_agent)
           VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13)
           RETURNING id"#,
    )
    .bind(p.workspace_id)
    .bind(p.token_id)
    .bind(p.user_id)
    .bind(p.channel_id)
    .bind(p.model)
    .bind(p.is_stream)
    .bind(p.status_code)
    .bind(p.duration_ms)
    .bind(p.session_id)
    .bind(p.sticky_id)
    .bind(p.error_message)
    .bind(p.upstream_headers_ms)
    .bind(p.user_agent)
    .fetch_one(pool)
    .await?;
    Ok(row.0)
}

pub async fn update_usage(
    pool: &sqlx::PgPool,
    id: i64,
    prompt_tokens: Option<i64>,
    completion_tokens: Option<i64>,
    total_tokens: Option<i64>,
    cached_tokens: Option<i64>,
    cache_creation_tokens: Option<i64>,
    cost: Option<f64>,
) -> Result<(), sqlx::Error> {
    sqlx::query(
        r#"UPDATE request_logs
           SET prompt_tokens = $1, completion_tokens = $2, total_tokens = $3,
               cached_tokens = $4, cache_creation_tokens = $5, cost = $6
           WHERE id = $7"#,
    )
    .bind(prompt_tokens.map(|v| v as i32))
    .bind(completion_tokens.map(|v| v as i32))
    .bind(total_tokens.map(|v| v as i32))
    .bind(cached_tokens.map(|v| v as i32))
    .bind(cache_creation_tokens.map(|v| v as i32))
    .bind(cost.unwrap_or(0.0))
    .bind(id)
    .execute(pool)
    .await?;
    Ok(())
}

pub async fn update_timings(
    pool: &sqlx::PgPool,
    id: i64,
    upstream_first_data_ms: Option<i32>,
    upstream_complete_ms: Option<i32>,
) -> Result<(), sqlx::Error> {
    sqlx::query(
        r#"UPDATE request_logs
           SET upstream_first_data_ms = $1,
               upstream_complete_ms = $2,
               duration_ms = COALESCE($2, duration_ms)
           WHERE id = $3"#,
    )
    .bind(upstream_first_data_ms)
    .bind(upstream_complete_ms)
    .bind(id)
    .execute(pool)
    .await?;
    Ok(())
}

#[derive(Debug, Deserialize)]
pub struct LogQuery {
    pub workspace_id: Option<i64>,
    pub user_id: Option<i64>,
    pub token_id: Option<i64>,
    pub channel_id: Option<i64>,
    pub model: Option<String>,
    pub page: Option<i64>,
    pub page_size: Option<i64>,
}

pub async fn count(pool: &sqlx::PgPool, q: &LogQuery) -> Result<i64, sqlx::Error> {
    let row: (i64,) = sqlx::query_as(
        r#"SELECT COUNT(*) FROM request_logs
           WHERE ($1::bigint IS NULL OR workspace_id = $1)
           AND ($2::bigint IS NULL OR user_id = $2)
           AND ($3::bigint IS NULL OR token_id = $3)
           AND ($4::bigint IS NULL OR channel_id = $4)
           AND ($5::text IS NULL OR model = $5)"#,
    )
    .bind(q.workspace_id)
    .bind(q.user_id)
    .bind(q.token_id)
    .bind(q.channel_id)
    .bind(q.model.as_deref())
    .fetch_one(pool)
    .await?;
    Ok(row.0)
}

pub async fn list(pool: &sqlx::PgPool, q: &LogQuery) -> Result<Vec<LogRow>, sqlx::Error> {
    let page = q.page.unwrap_or(1).max(1);
    let page_size = q.page_size.unwrap_or(50).min(200);
    let offset = (page - 1) * page_size;

    sqlx::query_as::<_, LogRow>(
        r#"SELECT * FROM request_logs
           WHERE ($1::bigint IS NULL OR workspace_id = $1)
           AND ($2::bigint IS NULL OR user_id = $2)
           AND ($3::bigint IS NULL OR token_id = $3)
           AND ($4::bigint IS NULL OR channel_id = $4)
           AND ($5::text IS NULL OR model = $5)
           ORDER BY id DESC LIMIT $6 OFFSET $7"#,
    )
    .bind(q.workspace_id)
    .bind(q.user_id)
    .bind(q.token_id)
    .bind(q.channel_id)
    .bind(q.model.as_deref())
    .bind(page_size)
    .bind(offset)
    .fetch_all(pool)
    .await
}
