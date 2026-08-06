use axum::extract::{Request, State};
use axum::http::HeaderMap;
use axum::middleware::Next;
use axum::response::Response;
use chrono::{Duration, Utc};
use jsonwebtoken::{decode, encode, DecodingKey, EncodingKey, Header, Validation};
use serde::{Deserialize, Serialize};

use crate::error::AppError;
use crate::state::AppState;

#[derive(Clone, Debug)]
pub struct TokenAuth {
    pub token_id: i64,
    pub user_id: i64,
    pub token_name: String,
    pub model_limits_enabled: bool,
    pub model_limits: Vec<String>,
}

#[derive(Clone, Debug, Serialize, Deserialize)]
pub struct JwtClaims {
    pub sub: i64,
    pub username: String,
    pub role: i16,
    pub exp: usize,
}

#[derive(Clone, Debug)]
pub struct JwtAuth {
    pub user_id: i64,
    pub username: String,
    pub role: i16,
}

fn extract_api_key(headers: &HeaderMap) -> Option<String> {
    if let Some(auth) = headers.get("authorization") {
        if let Ok(s) = auth.to_str() {
            if let Some(key) = s.strip_prefix("Bearer ") {
                return Some(key.to_string());
            }
            return Some(s.to_string());
        }
    }
    if let Some(key) = headers.get("x-api-key") {
        if let Ok(s) = key.to_str() {
            return Some(s.to_string());
        }
    }
    None
}

pub async fn token_auth(
    State(state): State<AppState>,
    mut request: Request,
    next: Next,
) -> Result<Response, AppError> {
    let key = extract_api_key(request.headers())
        .ok_or_else(|| AppError::Unauthorized("missing API key".into()))?;

    let token = crate::db::token::find_by_key(&state.pool, &key).await?
        .ok_or_else(|| AppError::Unauthorized("invalid API key".into()))?;

    if token.status != 1 {
        return Err(AppError::Forbidden("token disabled".into()));
    }

    if let Some(expired) = token.expired_at {
        if expired < Utc::now() {
            return Err(AppError::Forbidden("token expired".into()));
        }
    }

    let model_limits = if token.model_limits.is_empty() {
        Vec::new()
    } else {
        token
            .model_limits
            .split(',')
            .map(|s| s.trim().to_string())
            .collect()
    };

    let auth = TokenAuth {
        token_id: token.id,
        user_id: token.user_id,
        token_name: token.name,
        model_limits_enabled: token.model_limits_enabled,
        model_limits,
    };

    request.extensions_mut().insert(auth);
    Ok(next.run(request).await)
}

pub async fn jwt_auth(
    State(state): State<AppState>,
    mut request: Request,
    next: Next,
) -> Result<Response, AppError> {
    let token = extract_api_key(request.headers())
        .ok_or_else(|| AppError::Unauthorized("missing authorization".into()))?;

    let key = DecodingKey::from_secret(state.config.jwt_secret.as_bytes());
    let token_data = decode::<JwtClaims>(&token, &key, &Validation::default())?;

    let auth = JwtAuth {
        user_id: token_data.claims.sub,
        username: token_data.claims.username.clone(),
        role: token_data.claims.role,
    };

    request.extensions_mut().insert(auth);
    Ok(next.run(request).await)
}

pub fn create_jwt(secret: &str, user_id: i64, username: &str, role: i16) -> Result<String, AppError> {
    let exp = (Utc::now() + Duration::days(7)).timestamp() as usize;
    let claims = JwtClaims {
        sub: user_id,
        username: username.into(),
        role,
        exp,
    };
    let key = EncodingKey::from_secret(secret.as_bytes());
    Ok(encode(&Header::default(), &claims, &key)?)
}

pub fn generate_api_key() -> String {
    use rand::Rng;
    const CHARSET: &[u8] =
        b"ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789";
    let mut rng = rand::thread_rng();
    let key: String = (0..48)
        .map(|_| {
            let idx = rng.gen_range(0..CHARSET.len());
            CHARSET[idx] as char
        })
        .collect();
    format!("sk-{key}")
}

pub fn hash_password(password: &str) -> Result<String, AppError> {
    use argon2::password_hash::rand_core::OsRng;
    use argon2::password_hash::SaltString;
    use argon2::{Argon2, PasswordHasher};

    let salt = SaltString::generate(&mut OsRng);
    let hash = Argon2::default()
        .hash_password(password.as_bytes(), &salt)
        .map_err(|e| AppError::Internal(format!("hash error: {e}")))?;
    Ok(hash.to_string())
}

pub fn verify_password(password: &str, hash: &str) -> Result<bool, AppError> {
    use argon2::password_hash::PasswordHash;
    use argon2::{Argon2, PasswordVerifier};

    let parsed = PasswordHash::new(hash)
        .map_err(|e| AppError::Internal(format!("hash parse error: {e}")))?;
    Ok(Argon2::default()
        .verify_password(password.as_bytes(), &parsed)
        .is_ok())
}
