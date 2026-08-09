use axum::extract::{Query, State};
use axum::Json;
use serde::{Deserialize, Serialize};

use crate::db;
use crate::error::AppError;
use crate::middleware::auth::JwtAuth;
use crate::state::AppState;

#[derive(Deserialize)]
pub struct StatsApiQuery {
    pub scope: Option<String>,
    pub user_id: Option<i64>,
    pub range: Option<i64>,
}

#[derive(Serialize)]
pub struct StatsResponse {
    pub summary: db::stats::StatsSummary,
    pub days: Vec<db::stats::TimeSeriesPoint>,
    pub heatmap: Vec<db::stats::TimeSeriesPoint>,
    pub models: Vec<db::stats::ModelBreakdown>,
    pub channels: Vec<db::stats::ChannelBreakdown>,
    pub users: Vec<db::stats::UserBreakdown>,
}

pub async fn stats(
    State(state): State<AppState>,
    axum::Extension(auth): axum::Extension<JwtAuth>,
    Query(q): Query<StatsApiQuery>,
) -> Result<Json<StatsResponse>, AppError> {
    let workspace_id = auth.workspace_id;
    let scope_workspace = q.scope.as_deref() == Some("workspace");

    if scope_workspace && auth.user_role < 10 {
        return Err(AppError::Forbidden("admin access required".into()));
    }

    let user_id = if scope_workspace {
        q.user_id
    } else {
        Some(auth.user_id)
    };

    let range = q.range.filter(|&r| r > 0);
    let since = db::stats::since_ts(range);
    let heatmap_block = db::stats::heatmap_is_block(range);

    let heatmap_fut: std::pin::Pin<Box<dyn std::future::Future<Output = Result<Vec<db::stats::TimeSeriesPoint>, sqlx::Error>> + Send>> =
        if heatmap_block {
            Box::pin(db::stats::timeseries_2h(&state.pool, workspace_id, user_id, since))
        } else {
            Box::pin(db::stats::timeseries_daily(&state.pool, workspace_id, user_id, since))
        };

    let (mut summary, mut days, mut heatmap, models, daily_intervals) = tokio::try_join!(
        db::stats::summary(&state.pool, workspace_id, user_id, since),
        db::stats::timeseries_daily(&state.pool, workspace_id, user_id, since),
        heatmap_fut,
        db::stats::by_model(&state.pool, workspace_id, user_id, since),
        db::stats::fetch_intervals_daily(&state.pool, workspace_id, user_id, since),
    )?;

    // Compute runtime_dedup for daily time series + summary total
    let daily_dedup = db::stats::merge_intervals(&daily_intervals);
    let total_dedup: i64 = daily_dedup.values().sum();
    for p in &mut days {
        if let Some(v) = daily_dedup.get(&p.bucket) {
            p.runtime_dedup = *v * 1000; // epoch seconds → ms
        }
    }
    summary.total_runtime_dedup = total_dedup * 1000;

    // Compute runtime_dedup for heatmap
    if heatmap_block {
        let block_intervals = db::stats::fetch_intervals_2h(
            &state.pool, workspace_id, user_id, since,
        ).await?;
        let block_dedup = db::stats::merge_intervals(&block_intervals);
        for p in &mut heatmap {
            if let Some(v) = block_dedup.get(&p.bucket) {
                p.runtime_dedup = *v * 1000;
            }
        }
    } else {
        for p in &mut heatmap {
            if let Some(v) = daily_dedup.get(&p.bucket) {
                p.runtime_dedup = *v * 1000;
            }
        }
    }

    let (channels, users) = if scope_workspace {
        let (ch, us) = tokio::try_join!(
            db::stats::by_channel(&state.pool, workspace_id, since),
            db::stats::by_user(&state.pool, workspace_id, since),
        )?;
        (ch, us)
    } else {
        (Vec::new(), Vec::new())
    };

    Ok(Json(StatsResponse {
        summary,
        days,
        heatmap,
        models,
        channels,
        users,
    }))
}
