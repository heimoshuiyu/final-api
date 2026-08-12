use std::collections::HashMap;
use std::sync::Arc;

use crate::config::Config;
use crate::service::concurrency::ChannelLoadTracker;
use crate::service::inspect::InspectTx;

#[derive(Clone)]
pub struct AppState {
    pub pool: sqlx::PgPool,
    pub http_client: reqwest::Client,
    pub config: Arc<Config>,
    pub inspect_tx: InspectTx,
    pub channel_load: ChannelLoadTracker,
    pub wecom_token_cache: Arc<tokio::sync::RwLock<Option<(String, std::time::Instant)>>>,
    pub verification_files: Arc<tokio::sync::RwLock<HashMap<String, String>>>,
}
