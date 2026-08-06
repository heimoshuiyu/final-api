use crate::config::Config;
use crate::service::inspect::InspectTx;

#[derive(Clone)]
pub struct AppState {
    pub pool: sqlx::PgPool,
    pub http_client: reqwest::Client,
    pub config: std::sync::Arc<Config>,
    pub inspect_tx: InspectTx,
}
