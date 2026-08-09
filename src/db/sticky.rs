use chrono::Utc;

pub async fn get(pool: &sqlx::PgPool, id: &str) -> Result<Option<i64>, sqlx::Error> {
    let row: Option<(i64,)> =
        sqlx::query_as("SELECT channel_id FROM sticky_provider WHERE id = $1 AND expires_at > NOW()")
            .bind(id)
            .fetch_optional(pool)
            .await?;
    Ok(row.map(|r| r.0))
}

pub async fn set(
    pool: &sqlx::PgPool,
    id: &str,
    channel_id: i64,
    ttl_seconds: u64,
) -> Result<(), sqlx::Error> {
    let expires_at = Utc::now() + chrono::Duration::seconds(ttl_seconds as i64);
    sqlx::query(
        r#"INSERT INTO sticky_provider (id, channel_id, expires_at) VALUES ($1, $2, $3)
           ON CONFLICT (id) DO UPDATE SET channel_id = $2, expires_at = $3, updated_at = NOW()"#,
    )
    .bind(id)
    .bind(channel_id)
    .bind(expires_at)
    .execute(pool)
    .await?;
    Ok(())
}

pub async fn refresh(
    pool: &sqlx::PgPool,
    id: &str,
    ttl_seconds: u64,
) -> Result<(), sqlx::Error> {
    let expires_at = Utc::now() + chrono::Duration::seconds(ttl_seconds as i64);
    sqlx::query("UPDATE sticky_provider SET expires_at = $2, updated_at = NOW() WHERE id = $1")
        .bind(id)
        .bind(expires_at)
        .execute(pool)
        .await?;
    Ok(())
}
