use axum::http::{HeaderMap, HeaderName, HeaderValue};

/// Build upstream request headers:
/// - Copy client headers (except hop-by-hop and auth)
/// - Set auth header based on auth_type:
///   - "x-api-key": x-api-key + anthropic-version
///   - "bearer" (default): Authorization: Bearer
/// - Apply channel header_override with template variable resolution
pub fn build_upstream_headers(
    client_headers: &HeaderMap,
    api_key: &str,
    auth_type: &str,
    header_override: &serde_json::Value,
    sticky_id: &str,
    session_id: &str,
    model: &str,
) -> HeaderMap {
    let mut headers = HeaderMap::new();

    const SKIP: &[&str] = &[
        "host",
        "content-length",
        "transfer-encoding",
        "connection",
        "authorization",
        "x-api-key",
        "accept-encoding",
    ];

    for (key, value) in client_headers {
        if !SKIP.contains(&key.as_str()) {
            headers.insert(key.clone(), value.clone());
        }
    }

    if auth_type == "x-api-key" {
        headers.insert(
            HeaderName::from_static("x-api-key"),
            HeaderValue::from_str(api_key).unwrap_or(HeaderValue::from_static("")),
        );
        if headers.get("anthropic-version").is_none() {
            headers.insert(
                HeaderName::from_static("anthropic-version"),
                HeaderValue::from_static("2023-06-01"),
            );
        }
    } else {
        headers.insert(
            http::header::AUTHORIZATION,
            HeaderValue::from_str(&format!("Bearer {api_key}"))
                .unwrap_or(HeaderValue::from_static("")),
        );
    }

    if let Some(map) = header_override.as_object() {
        for (key, val) in map {
            if let Some(s) = val.as_str() {
                let resolved = resolve_template(s, api_key, sticky_id, session_id, model);
                if let Ok(v) = HeaderValue::from_str(&resolved) {
                    if let Ok(name) = HeaderName::from_bytes(key.as_bytes()) {
                        headers.insert(name, v);
                    }
                }
            }
        }
    }

    headers
}

fn resolve_template(value: &str, api_key: &str, sticky_id: &str, session_id: &str, model: &str) -> String {
    value
        .replace("{api_key}", api_key)
        .replace("{sticky_id}", sticky_id)
        .replace("{session}", session_id)
        .replace("{model}", model)
}
