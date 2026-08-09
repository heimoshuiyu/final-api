use chrono::{DateTime, Utc};
use serde::Serialize;
use sqlx::FromRow;

#[derive(Debug, FromRow, Serialize)]
pub struct StatsSummary {
    pub request_count: i64,
    pub prompt_tokens: i64,
    pub completion_tokens: i64,
    pub total_tokens: i64,
    pub cached_tokens: i64,
    pub cache_creation_tokens: i64,
    pub total_cost: f64,
    pub avg_duration_ms: f64,
}

#[derive(Debug, FromRow, Serialize)]
pub struct TimeSeriesPoint {
    pub bucket: String,
    pub request_count: i64,
    pub prompt_tokens: i64,
    pub completion_tokens: i64,
    pub total_tokens: i64,
    pub cached_tokens: i64,
    pub cache_creation_tokens: i64,
    pub cost: f64,
}

#[derive(Debug, FromRow, Serialize)]
pub struct ModelBreakdown {
    pub model: String,
    pub request_count: i64,
    pub prompt_tokens: i64,
    pub completion_tokens: i64,
    pub total_tokens: i64,
    pub cached_tokens: i64,
    pub cache_creation_tokens: i64,
    pub cost: f64,
}

#[derive(Debug, FromRow, Serialize)]
pub struct ChannelBreakdown {
    pub channel_id: Option<i64>,
    pub channel_name: Option<String>,
    pub request_count: i64,
    pub total_tokens: i64,
    pub cost: f64,
}

#[derive(Debug, FromRow, Serialize)]
pub struct UserBreakdown {
    pub user_id: Option<i64>,
    pub username: Option<String>,
    pub request_count: i64,
    pub total_tokens: i64,
    pub cost: f64,
}

pub fn since_ts(range: Option<i64>) -> Option<DateTime<Utc>> {
    match range {
        Some(7) => Some(Utc::now() - chrono::Duration::hours(168)),
        Some(30) => Some(Utc::now() - chrono::Duration::days(30)),
        Some(90) => Some(Utc::now() - chrono::Duration::days(90)),
        Some(180) => Some(Utc::now() - chrono::Duration::days(180)),
        Some(365) => Some(Utc::now() - chrono::Duration::days(365)),
        _ => None,
    }
}

/// Heatmap uses 2-hour blocks for ranges <= 90 days, daily for longer ranges.
pub fn heatmap_is_block(range: Option<i64>) -> bool {
    matches!(range, Some(7) | Some(30) | Some(90))
}

pub async fn summary(
    pool: &sqlx::PgPool,
    workspace_id: i64,
    user_id: Option<i64>,
    since: Option<DateTime<Utc>>,
) -> Result<StatsSummary, sqlx::Error> {
    sqlx::query_as::<_, StatsSummary>(
        r#"SELECT
            COUNT(*)::bigint as request_count,
            COALESCE(SUM(COALESCE(prompt_tokens, 0)), 0)::bigint as prompt_tokens,
            COALESCE(SUM(COALESCE(completion_tokens, 0)), 0)::bigint as completion_tokens,
            COALESCE(SUM(COALESCE(total_tokens, 0)), 0)::bigint as total_tokens,
            COALESCE(SUM(COALESCE(cached_tokens, 0)), 0)::bigint as cached_tokens,
            COALESCE(SUM(COALESCE(cache_creation_tokens, 0)), 0)::bigint as cache_creation_tokens,
            COALESCE(SUM(COALESCE(cost, 0)), 0)::float8 as total_cost,
            COALESCE(AVG(duration_ms), 0)::float8 as avg_duration_ms
           FROM request_logs
           WHERE workspace_id = $1
           AND status_code = 200
           AND ($2::bigint IS NULL OR user_id = $2)
           AND ($3::timestamptz IS NULL OR created_at >= $3)"#,
    )
    .bind(workspace_id)
    .bind(user_id)
    .bind(since)
    .fetch_one(pool)
    .await
}

/// Daily time series (always daily granularity for trend chart).
pub async fn timeseries_daily(
    pool: &sqlx::PgPool,
    workspace_id: i64,
    user_id: Option<i64>,
    since: Option<DateTime<Utc>>,
) -> Result<Vec<TimeSeriesPoint>, sqlx::Error> {
    sqlx::query_as::<_, TimeSeriesPoint>(
        r#"SELECT
            to_char(date_trunc('day', created_at), 'YYYY-MM-DD') as bucket,
            COUNT(*)::bigint as request_count,
            COALESCE(SUM(COALESCE(prompt_tokens, 0)), 0)::bigint as prompt_tokens,
            COALESCE(SUM(COALESCE(completion_tokens, 0)), 0)::bigint as completion_tokens,
            COALESCE(SUM(COALESCE(total_tokens, 0)), 0)::bigint as total_tokens,
            COALESCE(SUM(COALESCE(cached_tokens, 0)), 0)::bigint as cached_tokens,
            COALESCE(SUM(COALESCE(cache_creation_tokens, 0)), 0)::bigint as cache_creation_tokens,
            COALESCE(SUM(COALESCE(cost, 0)), 0)::float8 as cost
           FROM request_logs
           WHERE workspace_id = $1
           AND status_code = 200
           AND ($2::bigint IS NULL OR user_id = $2)
           AND ($3::timestamptz IS NULL OR created_at >= $3)
           GROUP BY 1 ORDER BY 1"#,
    )
    .bind(workspace_id)
    .bind(user_id)
    .bind(since)
    .fetch_all(pool)
    .await
}

/// 2-hour block time series (for heatmap when range <= 90 days).
pub async fn timeseries_2h(
    pool: &sqlx::PgPool,
    workspace_id: i64,
    user_id: Option<i64>,
    since: Option<DateTime<Utc>>,
) -> Result<Vec<TimeSeriesPoint>, sqlx::Error> {
    sqlx::query_as::<_, TimeSeriesPoint>(
        r#"SELECT
            to_char(date_trunc('hour', created_at) - (EXTRACT(hour FROM created_at)::int % 2) * interval '1 hour', 'YYYY-MM-DD HH24:00') as bucket,
            COUNT(*)::bigint as request_count,
            COALESCE(SUM(COALESCE(prompt_tokens, 0)), 0)::bigint as prompt_tokens,
            COALESCE(SUM(COALESCE(completion_tokens, 0)), 0)::bigint as completion_tokens,
            COALESCE(SUM(COALESCE(total_tokens, 0)), 0)::bigint as total_tokens,
            COALESCE(SUM(COALESCE(cached_tokens, 0)), 0)::bigint as cached_tokens,
            COALESCE(SUM(COALESCE(cache_creation_tokens, 0)), 0)::bigint as cache_creation_tokens,
            COALESCE(SUM(COALESCE(cost, 0)), 0)::float8 as cost
           FROM request_logs
           WHERE workspace_id = $1
           AND status_code = 200
           AND ($2::bigint IS NULL OR user_id = $2)
           AND ($3::timestamptz IS NULL OR created_at >= $3)
           GROUP BY 1 ORDER BY 1"#,
    )
    .bind(workspace_id)
    .bind(user_id)
    .bind(since)
    .fetch_all(pool)
    .await
}

pub async fn by_model(
    pool: &sqlx::PgPool,
    workspace_id: i64,
    user_id: Option<i64>,
    since: Option<DateTime<Utc>>,
) -> Result<Vec<ModelBreakdown>, sqlx::Error> {
    sqlx::query_as::<_, ModelBreakdown>(
        r#"SELECT
            model,
            COUNT(*)::bigint as request_count,
            COALESCE(SUM(COALESCE(prompt_tokens, 0)), 0)::bigint as prompt_tokens,
            COALESCE(SUM(COALESCE(completion_tokens, 0)), 0)::bigint as completion_tokens,
            COALESCE(SUM(COALESCE(total_tokens, 0)), 0)::bigint as total_tokens,
            COALESCE(SUM(COALESCE(cached_tokens, 0)), 0)::bigint as cached_tokens,
            COALESCE(SUM(COALESCE(cache_creation_tokens, 0)), 0)::bigint as cache_creation_tokens,
            COALESCE(SUM(COALESCE(cost, 0)), 0)::float8 as cost
           FROM request_logs
           WHERE workspace_id = $1
           AND status_code = 200
           AND ($2::bigint IS NULL OR user_id = $2)
           AND ($3::timestamptz IS NULL OR created_at >= $3)
           AND model != ''
           GROUP BY model ORDER BY total_tokens DESC"#,
    )
    .bind(workspace_id)
    .bind(user_id)
    .bind(since)
    .fetch_all(pool)
    .await
}

pub async fn by_channel(
    pool: &sqlx::PgPool,
    workspace_id: i64,
    since: Option<DateTime<Utc>>,
) -> Result<Vec<ChannelBreakdown>, sqlx::Error> {
    sqlx::query_as::<_, ChannelBreakdown>(
        r#"SELECT
            c.id as channel_id,
            c.name as channel_name,
            COUNT(*)::bigint as request_count,
            COALESCE(SUM(COALESCE(r.total_tokens, 0)), 0)::bigint as total_tokens,
            COALESCE(SUM(COALESCE(r.cost, 0)), 0)::float8 as cost
           FROM request_logs r
           LEFT JOIN channels c ON r.channel_id = c.id
           WHERE r.workspace_id = $1
           AND r.status_code = 200
           AND ($2::timestamptz IS NULL OR r.created_at >= $2)
           GROUP BY c.id, c.name ORDER BY total_tokens DESC"#,
    )
    .bind(workspace_id)
    .bind(since)
    .fetch_all(pool)
    .await
}

pub async fn by_user(
    pool: &sqlx::PgPool,
    workspace_id: i64,
    since: Option<DateTime<Utc>>,
) -> Result<Vec<UserBreakdown>, sqlx::Error> {
    sqlx::query_as::<_, UserBreakdown>(
        r#"SELECT
            r.user_id,
            u.username,
            COUNT(*)::bigint as request_count,
            COALESCE(SUM(COALESCE(r.total_tokens, 0)), 0)::bigint as total_tokens,
            COALESCE(SUM(COALESCE(r.cost, 0)), 0)::float8 as cost
           FROM request_logs r
           LEFT JOIN users u ON r.user_id = u.id
           WHERE r.workspace_id = $1
           AND r.status_code = 200
           AND ($2::timestamptz IS NULL OR r.created_at >= $2)
           GROUP BY r.user_id, u.username ORDER BY total_tokens DESC"#,
    )
    .bind(workspace_id)
    .bind(since)
    .fetch_all(pool)
    .await
}

