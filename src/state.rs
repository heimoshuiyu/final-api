use crate::config::Config;
use crate::service::concurrency::ChannelLoadTracker;
use crate::service::inspect::InspectTx;

#[derive(Clone)]
pub struct AppState {
    pub pool: sqlx::PgPool,
    pub http_client: reqwest::Client,
    pub config: std::sync::Arc<Config>,
    pub inspect_tx: InspectTx,
    pub channel_load: ChannelLoadTracker,
    pub wecom_token_cache: std::sync::Arc<tokio::sync::RwLock<Option<(String, std::time::Instant)>>>,
}
