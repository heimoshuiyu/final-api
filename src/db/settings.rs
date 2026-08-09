use sqlx::FromRow;

#[derive(Debug, Clone, FromRow)]
pub struct SiteSettingsRow {
    pub registration_enabled: bool,
    pub oauth_config: serde_json::Value,
}

pub async fn get(pool: &sqlx::PgPool) -> Result<SiteSettingsRow, sqlx::Error> {
    sqlx::query_as::<_, SiteSettingsRow>(
        "SELECT registration_enabled, oauth_config FROM site_settings WHERE id = 1",
    )
    .fetch_one(pool)
    .await
}

pub async fn update(
    pool: &sqlx::PgPool,
    registration_enabled: bool,
    oauth_config: &serde_json::Value,
) -> Result<(), sqlx::Error> {
    sqlx::query(
        "UPDATE site_settings SET registration_enabled = $1, oauth_config = $2, updated_at = NOW() WHERE id = 1",
    )
    .bind(registration_enabled)
    .bind(oauth_config)
    .execute(pool)
    .await?;
    Ok(())
}

pub async fn find_oauth_user(
    pool: &sqlx::PgPool,
    provider: &str,
    provider_uid: &str,
) -> Result<Option<i64>, sqlx::Error> {
    let row: Option<(i64,)> =
        sqlx::query_as("SELECT user_id FROM oauth_accounts WHERE provider = $1 AND provider_uid = $2")
            .bind(provider)
            .bind(provider_uid)
            .fetch_optional(pool)
            .await?;
    Ok(row.map(|r| r.0))
}

pub async fn create_oauth_link(
    pool: &sqlx::PgPool,
    user_id: i64,
    provider: &str,
    provider_uid: &str,
) -> Result<(), sqlx::Error> {
    sqlx::query(
        "INSERT INTO oauth_accounts (user_id, provider, provider_uid) VALUES ($1, $2, $3) ON CONFLICT (provider, provider_uid) DO NOTHING",
    )
    .bind(user_id)
    .bind(provider)
    .bind(provider_uid)
    .execute(pool)
    .await?;
    Ok(())
}
