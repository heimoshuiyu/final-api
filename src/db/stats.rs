use chrono::{DateTime, Utc};
use serde::Serialize;
use sqlx::FromRow;
use std::collections::HashMap;

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
    pub total_runtime: i64,
    pub total_runtime_dedup: i64,
}

#[derive(Debug, FromRow, Serialize, Clone)]
pub struct TimeSeriesPoint {
    pub bucket: String,
    pub request_count: i64,
    pub prompt_tokens: i64,
    pub completion_tokens: i64,
    pub total_tokens: i64,
    pub cached_tokens: i64,
    pub cache_creation_tokens: i64,
    pub cost: f64,
    pub runtime: i64,
    pub runtime_dedup: i64,
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
    pub runtime: i64,
}

#[derive(Debug, FromRow, Serialize)]
pub struct ChannelBreakdown {
    pub channel_id: Option<i64>,
    pub channel_name: Option<String>,
    pub request_count: i64,
    pub prompt_tokens: i64,
    pub completion_tokens: i64,
    pub total_tokens: i64,
    pub cached_tokens: i64,
    pub cache_creation_tokens: i64,
    pub cost: f64,
}

#[derive(Debug, FromRow, Serialize)]
pub struct UserBreakdown {
    pub user_id: Option<i64>,
    pub username: Option<String>,
    pub request_count: i64,
    pub prompt_tokens: i64,
    pub completion_tokens: i64,
    pub total_tokens: i64,
    pub cached_tokens: i64,
    pub cache_creation_tokens: i64,
    pub cost: f64,
}

#[derive(Debug, FromRow)]
pub struct IntervalRow {
    pub bucket: String,
    pub start_epoch: f64,
    pub end_epoch: f64,
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

pub fn heatmap_is_block(range: Option<i64>) -> bool {
    matches!(range, Some(7) | Some(30) | Some(90))
}

/// Merge overlapping intervals per bucket, return total deduped ms per bucket.
pub fn merge_intervals(rows: &[IntervalRow]) -> HashMap<String, i64> {
    let mut by_bucket: HashMap<String, Vec<(f64, f64)>> = HashMap::new();
    for r in rows {
        by_bucket
            .entry(r.bucket.clone())
            .or_default()
            .push((r.start_epoch, r.end_epoch));
    }

    let mut result = HashMap::new();
    for (bucket, intervals) in &mut by_bucket {
        if intervals.is_empty() {
            result.insert(bucket.clone(), 0);
            continue;
        }
        intervals.sort_by(|a, b| a.0.partial_cmp(&b.0).unwrap_or(std::cmp::Ordering::Equal));
        let mut merged = vec![intervals[0]];
        for &(start, end) in &intervals[1..] {
            let last = merged.last_mut().unwrap();
            if start <= last.1 {
                last.1 = last.1.max(end);
            } else {
                merged.push((start, end));
            }
        }
        let total: f64 = merged.iter().map(|(s, e)| e - s).sum();
        result.insert(bucket.clone(), total as i64);
    }
    result
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
            COALESCE(AVG(duration_ms), 0)::float8 as avg_duration_ms,
            COALESCE(SUM(duration_ms), 0)::bigint as total_runtime,
            0::bigint as total_runtime_dedup
           FROM request_logs
           WHERE workspace_id = $1
           AND status_code = 200
           AND ($2::bigint IS NOT NULL OR user_id IS NULL OR EXISTS (
               SELECT 1 FROM workspace_members wm
               WHERE wm.workspace_id = request_logs.workspace_id
               AND wm.user_id = request_logs.user_id
               AND wm.include_in_stats))
           AND ($2::bigint IS NULL OR user_id = $2)
           AND ($3::timestamptz IS NULL OR created_at >= $3)"#,
    )
    .bind(workspace_id)
    .bind(user_id)
    .bind(since)
    .fetch_one(pool)
    .await
}

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
            COALESCE(SUM(COALESCE(cost, 0)), 0)::float8 as cost,
            COALESCE(SUM(duration_ms), 0)::bigint as runtime,
            0::bigint as runtime_dedup
           FROM request_logs
           WHERE workspace_id = $1
           AND status_code = 200
           AND ($2::bigint IS NOT NULL OR user_id IS NULL OR EXISTS (
               SELECT 1 FROM workspace_members wm
               WHERE wm.workspace_id = request_logs.workspace_id
               AND wm.user_id = request_logs.user_id
               AND wm.include_in_stats))
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
            COALESCE(SUM(COALESCE(cost, 0)), 0)::float8 as cost,
            COALESCE(SUM(duration_ms), 0)::bigint as runtime,
            0::bigint as runtime_dedup
           FROM request_logs
           WHERE workspace_id = $1
           AND status_code = 200
           AND ($2::bigint IS NOT NULL OR user_id IS NULL OR EXISTS (
               SELECT 1 FROM workspace_members wm
               WHERE wm.workspace_id = request_logs.workspace_id
               AND wm.user_id = request_logs.user_id
               AND wm.include_in_stats))
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

pub async fn fetch_intervals_daily(
    pool: &sqlx::PgPool,
    workspace_id: i64,
    user_id: Option<i64>,
    since: Option<DateTime<Utc>>,
) -> Result<Vec<IntervalRow>, sqlx::Error> {
    sqlx::query_as::<_, IntervalRow>(
        r#"SELECT
            to_char(date_trunc('day', created_at), 'YYYY-MM-DD') as bucket,
            (EXTRACT(EPOCH FROM (created_at - (duration_ms / 1000.0) * interval '1 second'))::float8) as start_epoch,
            (EXTRACT(EPOCH FROM created_at)::float8) as end_epoch
           FROM request_logs
           WHERE workspace_id = $1
           AND status_code = 200
           AND duration_ms > 0
           AND ($2::bigint IS NOT NULL OR user_id IS NULL OR EXISTS (
               SELECT 1 FROM workspace_members wm
               WHERE wm.workspace_id = request_logs.workspace_id
               AND wm.user_id = request_logs.user_id
               AND wm.include_in_stats))
           AND ($2::bigint IS NULL OR user_id = $2)
           AND ($3::timestamptz IS NULL OR created_at >= $3)"#,
    )
    .bind(workspace_id)
    .bind(user_id)
    .bind(since)
    .fetch_all(pool)
    .await
}

pub async fn fetch_intervals_2h(
    pool: &sqlx::PgPool,
    workspace_id: i64,
    user_id: Option<i64>,
    since: Option<DateTime<Utc>>,
) -> Result<Vec<IntervalRow>, sqlx::Error> {
    sqlx::query_as::<_, IntervalRow>(
        r#"SELECT
            to_char(date_trunc('hour', created_at) - (EXTRACT(hour FROM created_at)::int % 2) * interval '1 hour', 'YYYY-MM-DD HH24:00') as bucket,
            (EXTRACT(EPOCH FROM (created_at - (duration_ms / 1000.0) * interval '1 second'))::float8) as start_epoch,
            (EXTRACT(EPOCH FROM created_at)::float8) as end_epoch
           FROM request_logs
           WHERE workspace_id = $1
           AND status_code = 200
           AND duration_ms > 0
           AND ($2::bigint IS NOT NULL OR user_id IS NULL OR EXISTS (
               SELECT 1 FROM workspace_members wm
               WHERE wm.workspace_id = request_logs.workspace_id
               AND wm.user_id = request_logs.user_id
               AND wm.include_in_stats))
           AND ($2::bigint IS NULL OR user_id = $2)
           AND ($3::timestamptz IS NULL OR created_at >= $3)"#,
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
            COALESCE(SUM(COALESCE(cost, 0)), 0)::float8 as cost,
            COALESCE(SUM(duration_ms), 0)::bigint as runtime
           FROM request_logs
           WHERE workspace_id = $1
           AND status_code = 200
           AND ($2::bigint IS NOT NULL OR user_id IS NULL OR EXISTS (
               SELECT 1 FROM workspace_members wm
               WHERE wm.workspace_id = request_logs.workspace_id
               AND wm.user_id = request_logs.user_id
               AND wm.include_in_stats))
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
            COALESCE(SUM(COALESCE(r.prompt_tokens, 0)), 0)::bigint as prompt_tokens,
            COALESCE(SUM(COALESCE(r.completion_tokens, 0)), 0)::bigint as completion_tokens,
            COALESCE(SUM(COALESCE(r.total_tokens, 0)), 0)::bigint as total_tokens,
            COALESCE(SUM(COALESCE(r.cached_tokens, 0)), 0)::bigint as cached_tokens,
            COALESCE(SUM(COALESCE(r.cache_creation_tokens, 0)), 0)::bigint as cache_creation_tokens,
            COALESCE(SUM(COALESCE(r.cost, 0)), 0)::float8 as cost
           FROM request_logs r
           LEFT JOIN channels c ON r.channel_id = c.id
           WHERE r.workspace_id = $1
           AND r.status_code = 200
           AND (r.user_id IS NULL OR EXISTS (
               SELECT 1 FROM workspace_members wm
               WHERE wm.workspace_id = r.workspace_id
               AND wm.user_id = r.user_id
               AND wm.include_in_stats))
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
            COALESCE(SUM(COALESCE(r.prompt_tokens, 0)), 0)::bigint as prompt_tokens,
            COALESCE(SUM(COALESCE(r.completion_tokens, 0)), 0)::bigint as completion_tokens,
            COALESCE(SUM(COALESCE(r.total_tokens, 0)), 0)::bigint as total_tokens,
            COALESCE(SUM(COALESCE(r.cached_tokens, 0)), 0)::bigint as cached_tokens,
            COALESCE(SUM(COALESCE(r.cache_creation_tokens, 0)), 0)::bigint as cache_creation_tokens,
            COALESCE(SUM(COALESCE(r.cost, 0)), 0)::float8 as cost
           FROM request_logs r
           LEFT JOIN users u ON r.user_id = u.id
           WHERE r.workspace_id = $1
           AND r.status_code = 200
           AND (r.user_id IS NULL OR EXISTS (
               SELECT 1 FROM workspace_members wm
               WHERE wm.workspace_id = r.workspace_id
               AND wm.user_id = r.user_id
               AND wm.include_in_stats))
           AND ($2::timestamptz IS NULL OR r.created_at >= $2)
           GROUP BY r.user_id, u.username ORDER BY total_tokens DESC"#,
    )
    .bind(workspace_id)
    .bind(since)
    .fetch_all(pool)
    .await
}
