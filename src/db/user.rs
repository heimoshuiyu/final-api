use chrono::{DateTime, Utc};
use serde::{Deserialize, Serialize};
use sqlx::FromRow;

#[derive(Debug, Clone, FromRow, Serialize, Deserialize)]
pub struct UserRow {
    pub id: i64,
    pub username: String,
    #[serde(skip_serializing)]
    pub password_hash: String,
    pub role: i16,
    pub status: i16,
    pub created_at: DateTime<Utc>,
    pub updated_at: DateTime<Utc>,
}

pub async fn find_by_id(pool: &sqlx::PgPool, id: i64) -> Result<Option<UserRow>, sqlx::Error> {
    sqlx::query_as::<_, UserRow>("SELECT * FROM users WHERE id = $1")
        .bind(id)
        .fetch_optional(pool)
        .await
}

pub async fn find_by_username(
    pool: &sqlx::PgPool,
    username: &str,
) -> Result<Option<UserRow>, sqlx::Error> {
    sqlx::query_as::<_, UserRow>("SELECT * FROM users WHERE username = $1")
        .bind(username)
        .fetch_optional(pool)
        .await
}

pub async fn create(
    pool: &sqlx::PgPool,
    username: &str,
    password_hash: &str,
) -> Result<UserRow, sqlx::Error> {
    sqlx::query_as::<_, UserRow>(
        "INSERT INTO users (username, password_hash) VALUES ($1, $2) RETURNING *",
    )
    .bind(username)
    .bind(password_hash)
    .fetch_one(pool)
    .await
}

pub async fn set_role(
    pool: &sqlx::PgPool,
    user_id: i64,
    role: i16,
) -> Result<(), sqlx::Error> {
    sqlx::query("UPDATE users SET role = $2 WHERE id = $1")
        .bind(user_id)
        .bind(role)
        .execute(pool)
        .await?;
    Ok(())
}

pub async fn update_password(
    pool: &sqlx::PgPool,
    user_id: i64,
    password_hash: &str,
) -> Result<(), sqlx::Error> {
    sqlx::query("UPDATE users SET password_hash = $2, updated_at = NOW() WHERE id = $1")
        .bind(user_id)
        .bind(password_hash)
        .execute(pool)
        .await?;
    Ok(())
}

pub async fn find_by_ids(
    pool: &sqlx::PgPool,
    ids: Vec<i64>,
) -> Result<Vec<UserRow>, sqlx::Error> {
    if ids.is_empty() {
        return Ok(Vec::new());
    }
    sqlx::query_as::<_, UserRow>("SELECT * FROM users WHERE id = ANY($1)")
        .bind(&ids)
        .fetch_all(pool)
        .await
}
