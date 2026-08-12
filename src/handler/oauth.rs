use axum::extract::{Path, Query, State};
use axum::http::HeaderValue;
use axum::response::{IntoResponse, Redirect};
use rand::Rng;
use serde::Deserialize;

use crate::db;
use crate::error::AppError;
use crate::middleware::auth::{create_jwt, hash_password};
use crate::state::AppState;

#[derive(Deserialize)]
pub struct AuthQuery {
    pub code: Option<String>,
    pub state: Option<String>,
}

fn build_auth_url(provider: &str, cfg: &serde_json::Value, redirect_uri: &str, state: &str) -> Option<String> {
    match provider {
        "github" => {
            let client_id = cfg.get("client_id")?.as_str()?;
            Some(format!(
                "https://github.com/login/oauth/authorize?client_id={}&redirect_uri={}&state={}&scope=read:user",
                client_id, redirect_uri, state
            ))
        }
        "google" => {
            let client_id = cfg.get("client_id")?.as_str()?;
            Some(format!(
                "https://accounts.google.com/o/oauth2/v2/auth?client_id={}&redirect_uri={}&state={}&scope=openid+email&response_type=code",
                client_id, redirect_uri, state
            ))
        }
        "wework" => {
            let corpid = cfg.get("corpid")?.as_str()?;
            let agentid = cfg.get("agentid")?.as_str()?;
            Some(format!(
                "https://login.work.weixin.qq.com/wwlogin/sso/login?login_type=CorpApp&appid={}&agentid={}&redirect_uri={}&state={}",
                corpid,
                agentid,
                urlencoding::encode(redirect_uri),
                state
            ))
        }
        _ => None,
    }
}

pub async fn oauth_auth(
    State(state): State<AppState>,
    Path(provider): Path<String>,
) -> Result<axum::response::Response, AppError> {
    let settings = db::settings::get(&state.pool).await?;
    let provider_cfg = settings.oauth_config.get(&provider)
        .ok_or_else(|| AppError::BadRequest(format!("unknown provider: {provider}")))?;

    let enabled = provider_cfg.get("enabled")
        .and_then(|v| v.as_bool())
        .unwrap_or(false);
    if !enabled {
        return Err(AppError::BadRequest("provider not enabled".into()));
    }

    let redirect_uri = format!(
        "{}/api/oauth/{}/callback",
        state.config.oauth_redirect_base.trim_end_matches('/'),
        provider
    );

    let state_token: String = (0..32)
        .map(|_| {
            let idx = rand::rng().random_range(0u8..36);
            if idx < 10 { (b'0' + idx) as char } else { (b'a' + idx - 10) as char }
        })
        .collect();

    let auth_url = build_auth_url(&provider, provider_cfg, &redirect_uri, &state_token)
        .ok_or_else(|| AppError::BadRequest("unsupported or misconfigured provider".into()))?;

    let mut response = Redirect::temporary(&auth_url).into_response();
    let cookie_val = format!(
        "oauth_state={state_token}; HttpOnly; Max-Age=600; Path=/; SameSite=Lax"
    );
    response.headers_mut().insert(
        axum::http::header::SET_COOKIE,
        HeaderValue::from_str(&cookie_val)
            .map_err(|e| AppError::Internal(e.to_string()))?,
    );
    Ok(response)
}

async fn get_wecom_access_token(
    state: &AppState,
    corpid: &str,
    secret: &str,
) -> Result<String, AppError> {
    {
        let cache = state.wecom_token_cache.read().await;
        if let Some((token, fetched_at)) = cache.as_ref() {
            if fetched_at.elapsed().as_secs() < 7000 {
                return Ok(token.clone());
            }
        }
    }

    let resp = state.http_client
        .get(format!(
            "https://qyapi.weixin.qq.com/cgi-bin/gettoken?corpid={}&corpsecret={}",
            corpid, secret
        ))
        .send()
        .await?;
    let json: serde_json::Value = resp.json().await?;

    let errcode = json.get("errcode").and_then(|v| v.as_i64()).unwrap_or(0);
    if errcode != 0 {
        let errmsg = json.get("errmsg").and_then(|v| v.as_str()).unwrap_or("unknown");
        return Err(AppError::BadGateway(format!("wecom gettoken failed: {errmsg}")));
    }

    let token = json.get("access_token")
        .and_then(|v| v.as_str())
        .ok_or_else(|| AppError::BadGateway("no access_token from wecom".into()))?
        .to_string();

    let mut cache = state.wecom_token_cache.write().await;
    *cache = Some((token.clone(), std::time::Instant::now()));

    Ok(token)
}

async fn resolve_oauth_user(
    state: &AppState,
    provider: &str,
    cfg: &serde_json::Value,
    code: &str,
) -> Result<(String, String), AppError> {
    match provider {
        "github" => {
            let client_id = cfg.get("client_id").and_then(|v| v.as_str()).unwrap_or("");
            let client_secret = cfg.get("client_secret").and_then(|v| v.as_str()).unwrap_or("");

            let token_resp = state.http_client
                .post("https://github.com/login/oauth/access_token")
                .header("Accept", "application/json")
                .json(&serde_json::json!({
                    "client_id": client_id,
                    "client_secret": client_secret,
                    "code": code,
                }))
                .send()
                .await?;
            let token_json: serde_json::Value = token_resp.json().await?;
            let access_token = token_json.get("access_token")
                .and_then(|v| v.as_str())
                .ok_or_else(|| AppError::BadGateway("no access_token from github".into()))?;

            let user_resp = state.http_client
                .get("https://api.github.com/user")
                .header("Authorization", format!("Bearer {access_token}"))
                .header("Accept", "application/json")
                .header("User-Agent", "final-api")
                .send()
                .await?;
            let user_json: serde_json::Value = user_resp.json().await?;

            let uid = user_json.get("id")
                .and_then(|v| v.as_i64())
                .ok_or_else(|| AppError::BadGateway("no user id from github".into()))?;
            let name = user_json.get("login")
                .and_then(|v| v.as_str())
                .unwrap_or("user");
            Ok((uid.to_string(), format!("gh_{name}")))
        }
        "google" => {
            let client_id = cfg.get("client_id").and_then(|v| v.as_str()).unwrap_or("");
            let client_secret = cfg.get("client_secret").and_then(|v| v.as_str()).unwrap_or("");
            let redirect_uri = format!(
                "{}/api/oauth/google/callback",
                state.config.oauth_redirect_base.trim_end_matches('/')
            );

            let token_resp = state.http_client
                .post("https://oauth2.googleapis.com/token")
                .header("Accept", "application/json")
                .json(&serde_json::json!({
                    "client_id": client_id,
                    "client_secret": client_secret,
                    "code": code,
                    "redirect_uri": redirect_uri,
                    "grant_type": "authorization_code",
                }))
                .send()
                .await?;
            let token_json: serde_json::Value = token_resp.json().await?;
            let access_token = token_json.get("access_token")
                .and_then(|v| v.as_str())
                .ok_or_else(|| AppError::BadGateway("no access_token from google".into()))?;

            let user_resp = state.http_client
                .get("https://www.googleapis.com/oauth2/v2/userinfo")
                .header("Authorization", format!("Bearer {access_token}"))
                .header("Accept", "application/json")
                .send()
                .await?;
            let user_json: serde_json::Value = user_resp.json().await?;

            let uid = user_json.get("id")
                .and_then(|v| v.as_str())
                .ok_or_else(|| AppError::BadGateway("no user id from google".into()))?;
            let email = user_json.get("email")
                .and_then(|v| v.as_str())
                .unwrap_or("user");
            let prefix = email.split('@').next().unwrap_or("user");
            Ok((uid.to_string(), format!("google_{prefix}")))
        }
        "wework" => {
            let corpid = cfg.get("corpid").and_then(|v| v.as_str()).unwrap_or("");
            let secret = cfg.get("secret").and_then(|v| v.as_str()).unwrap_or("");

            let access_token = get_wecom_access_token(state, corpid, secret).await?;

            let resp = state.http_client
                .get(format!(
                    "https://qyapi.weixin.qq.com/cgi-bin/auth/getuserinfo?access_token={}&code={}",
                    access_token, code
                ))
                .send()
                .await?;
            let json: serde_json::Value = resp.json().await?;

            let errcode = json.get("errcode").and_then(|v| v.as_i64()).unwrap_or(0);
            if errcode != 0 {
                let errmsg = json.get("errmsg").and_then(|v| v.as_str()).unwrap_or("unknown");
                return Err(AppError::BadGateway(format!("wecom getuserinfo failed: {errmsg}")));
            }

            let userid = json.get("userid")
                .and_then(|v| v.as_str())
                .ok_or_else(|| AppError::BadGateway("no userid from wecom (non-enterprise member?)".into()))?;

            Ok((userid.to_string(), format!("wecom_{userid}")))
        }
        _ => Err(AppError::BadRequest("unsupported provider".into())),
    }
}

pub async fn oauth_callback(
    State(state): State<AppState>,
    Path(provider): Path<String>,
    Query(query): Query<AuthQuery>,
    headers: axum::http::HeaderMap,
) -> Result<axum::response::Response, AppError> {
    let code = query.code
        .ok_or_else(|| AppError::BadRequest("missing code".into()))?;

    let cookie_state = headers
        .get("cookie")
        .and_then(|v| v.to_str().ok())
        .and_then(|s| {
            s.split(';')
                .map(|c| c.trim())
                .find_map(|c| c.strip_prefix("oauth_state=").map(|v| v.to_string()))
        })
        .unwrap_or_default();

    if query.state.as_deref() != Some(&cookie_state) || cookie_state.is_empty() {
        return Err(AppError::BadRequest("invalid state".into()));
    }

    let settings = db::settings::get(&state.pool).await?;
    let provider_cfg = settings.oauth_config.get(&provider)
        .ok_or_else(|| AppError::BadRequest("unknown provider".into()))?;

    let (provider_uid, display_name) = resolve_oauth_user(&state, &provider, provider_cfg, &code).await?;

    let existing_user_id = db::settings::find_oauth_user(&state.pool, &provider, &provider_uid).await?;

    let user_id = if let Some(uid) = existing_user_id {
        uid
    } else {
        let mut username = display_name.clone();
        let mut suffix = 1;
        loop {
            if db::user::find_by_username(&state.pool, &username).await?.is_none() {
                break;
            }
            username = format!("{}{}", display_name, suffix);
            suffix += 1;
        }

        let random_password: String = (0..32)
            .map(|_| {
                let idx = rand::rng().random_range(0u8..62);
                if idx < 26 { (b'a' + idx) as char }
                else if idx < 52 { (b'A' + idx - 26) as char }
                else { (b'0' + idx - 52) as char }
            })
            .collect();
        let hash = hash_password(&random_password)?;
        let user = db::user::create(&state.pool, &username, &hash).await?;

        db::settings::create_oauth_link(&state.pool, user.id, &provider, &provider_uid).await?;

        user.id
    };

    let user = db::user::find_by_id(&state.pool, user_id)
        .await?
        .ok_or_else(|| AppError::Internal("user not found".into()))?;

    let token = create_jwt(&state.config.jwt_secret, user.id, &user.username, user.role)?;

    let redirect_url = format!(
        "{}/#/oauth-callback?token={}",
        state.config.oauth_redirect_base.trim_end_matches('/'),
        token
    );

    let mut response = Redirect::temporary(&redirect_url).into_response();
    response.headers_mut().insert(
        axum::http::header::SET_COOKIE,
        HeaderValue::from_str("oauth_state=; HttpOnly; Max-Age=0; Path=/")
            .map_err(|e| AppError::Internal(e.to_string()))?,
    );
    Ok(response)
}
