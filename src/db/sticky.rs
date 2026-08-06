pub async fn get(pool: &sqlx::PgPool, id: &str) -> Result<Option<i64>, sqlx::Error> {
    let row: Option<(i64,)> = sqlx::query_as("SELECT channel_id FROM sticky_provider WHERE id = $1")
        .bind(id)
        .fetch_optional(pool)
        .await?;
    Ok(row.map(|r| r.0))
}

pub async fn set(pool: &sqlx::PgPool, id: &str, channel_id: i64) -> Result<(), sqlx::Error> {
    sqlx::query(
        r#"INSERT INTO sticky_provider (id, channel_id) VALUES ($1, $2)
           ON CONFLICT (id) DO UPDATE SET channel_id = $2, updated_at = NOW()"#,
    )
    .bind(id)
    .bind(channel_id)
    .execute(pool)
    .await?;
    Ok(())
}
