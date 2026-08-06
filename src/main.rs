mod config;
mod db;
mod error;
mod handler;
mod middleware;
mod router;
mod service;
mod state;

use state::AppState;
#[tokio::main]
async fn main() -> Result<(), Box<dyn std::error::Error>> {
    let _ = dotenvy::dotenv();

    tracing_subscriber::fmt()
        .with_env_filter(
            tracing_subscriber::EnvFilter::try_from_default_env()
                .unwrap_or_else(|_| "info,final_api=debug".into()),
        )
        .init();

    let config = config::Config::from_env();

    let pool = sqlx::PgPool::connect(&config.database_url).await?;

    sqlx::migrate!("./migrations").run(&pool).await?;

    init_default_admin(&pool).await?;

    let http_client = reqwest::Client::builder()
        .build()?;

    let state = AppState {
        pool,
        http_client,
        config: std::sync::Arc::new(config.clone()),
    };

    let app = router::build_router(state.clone());

    let listener = tokio::net::TcpListener::bind(&config.bind_addr).await?;
    tracing::info!("listening on {}", config.bind_addr);
    axum::serve(
        listener,
        app.into_make_service_with_connect_info::<std::net::SocketAddr>(),
    )
    .await?;

    Ok(())
}

async fn init_default_admin(pool: &sqlx::PgPool) -> Result<(), sqlx::Error> {
    let count: i64 = sqlx::query_scalar("SELECT COUNT(*) FROM users")
        .fetch_one(pool)
        .await?;

    if count == 0 {
        let password_hash =
            middleware::auth::hash_password("123456").expect("failed to hash default password");
        sqlx::query(
            "INSERT INTO users (username, password_hash, role) VALUES ('root', $1, 10)",
        )
        .bind(password_hash)
        .execute(pool)
        .await?;
        tracing::info!("Created default admin: root / 123456");
    }

    Ok(())
}
