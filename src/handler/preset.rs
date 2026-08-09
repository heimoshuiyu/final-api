use axum::extract::State;
use axum::response::IntoResponse;
use axum::http::header;
use axum::http::HeaderValue;
use serde::Serialize;
use serde_json::Value;

use crate::error::AppError;
use crate::state::AppState;

const RAW_DATA: &str = include_str!("../../assets/models-dev.json");

const FALLBACK_API: &[(&str, &str)] = &[
    ("openai", "https://api.openai.com/v1"),
    ("anthropic", "https://api.anthropic.com/v1"),
    ("google", "https://generativelanguage.googleapis.com/v1beta/openai"),
    ("xai", "https://api.x.ai/v1"),
    ("mistral", "https://api.mistral.ai/v1"),
    ("cohere", "https://api.cohere.ai/compatibility/v1"),
    ("perplexity", "https://api.perplexity.ai"),
];

#[derive(Serialize)]
pub struct ModelOverrideOut {
    pub endpoint_url: String,
    pub auth_type: String,
}

#[derive(Serialize, Default)]
pub struct ModelCost {
    #[serde(skip_serializing_if = "Option::is_none")]
    pub input: Option<f64>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub output: Option<f64>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub cache_read: Option<f64>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub cache_write: Option<f64>,
}

#[derive(Serialize)]
pub struct PresetModel {
    pub id: String,
    #[serde(rename = "override", skip_serializing_if = "Option::is_none")]
    pub override_config: Option<ModelOverrideOut>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub cost: Option<ModelCost>,
}

#[derive(Serialize)]
pub struct PresetProvider {
    pub id: String,
    pub name: String,
    pub endpoint_url: String,
    pub auth_type: String,
    pub models: Vec<PresetModel>,
}

fn detect_format(npm: &str) -> &'static str {
    if npm.contains("anthropic") {
        "anthropic"
    } else if npm.contains("google") || npm.contains("gemini") {
        "gemini"
    } else {
        "openai"
    }
}

fn build_endpoint(api_base: &str, fmt: &str) -> String {
    let base = api_base.trim_end_matches('/');
    match fmt {
        "anthropic" => {
            if base.ends_with("/v1") {
                format!("{base}/messages")
            } else {
                format!("{base}/v1/messages")
            }
        }
        "gemini" => {
            let base = if base.contains("/openai") {
                base.to_string()
            } else {
                format!("{base}/openai")
            };
            format!("{base}/chat/completions")
        }
        _ => format!("{base}/chat/completions"),
    }
}

fn fallback_api(pid: &str) -> Option<&'static str> {
    FALLBACK_API.iter().find(|(k, _)| *k == pid).map(|(_, v)| *v)
}

pub async fn list(_state: State<AppState>) -> Result<impl IntoResponse, AppError> {
    let raw: Value = serde_json::from_str(RAW_DATA)
        .map_err(|e| AppError::Internal(format!("failed to parse embedded presets: {e}")))?;

    let Some(providers) = raw.as_object() else {
        return Ok((
            [(header::CONTENT_TYPE, HeaderValue::from_static("application/json"))],
            "[]".to_string(),
        ));
    };

    let mut result: Vec<PresetProvider> = providers
        .iter()
        .map(|(pid, pinfo)| {
            let npm = pinfo.get("npm").and_then(|v| v.as_str()).unwrap_or("");
            let fmt = detect_format(npm);

            let api_base = pinfo
                .get("api")
                .and_then(|v| v.as_str())
                .map(|s| s.to_string())
                .or_else(|| fallback_api(pid).map(|s| s.to_string()))
                .unwrap_or_default();

            let auth = if fmt == "anthropic" { "x-api-key" } else { "bearer" };
            let endpoint = if api_base.is_empty() {
                String::new()
            } else {
                build_endpoint(&api_base, fmt)
            };

            let models = pinfo
                .get("models")
                .and_then(|v| v.as_object())
                .map(|m| {
                    m.iter()
                        .map(|(mid, minfo)| {
                            let model_npm = minfo
                                .pointer("/provider/npm")
                                .and_then(|v| v.as_str())
                                .unwrap_or("");
                            let model_fmt = if model_npm.is_empty() {
                                fmt
                            } else {
                                detect_format(model_npm)
                            };

                            let cost = minfo.get("cost").map(|c| {
                                let g = |k: &str| c.get(k).and_then(|v| v.as_f64());
                                ModelCost {
                                    input: g("input"),
                                    output: g("output"),
                                    cache_read: g("cache_read"),
                                    cache_write: g("cache_write"),
                                }
                            });

                            if model_fmt != fmt {
                                let m_endpoint = if api_base.is_empty() {
                                    String::new()
                                } else {
                                    build_endpoint(&api_base, model_fmt)
                                };
                                let m_auth = if model_fmt == "anthropic" {
                                    "x-api-key"
                                } else {
                                    "bearer"
                                };
                                PresetModel {
                                    id: mid.clone(),
                                    override_config: Some(ModelOverrideOut {
                                        endpoint_url: m_endpoint,
                                        auth_type: m_auth.to_string(),
                                    }),
                                    cost,
                                }
                            } else {
                                PresetModel {
                                    id: mid.clone(),
                                    override_config: None,
                                    cost,
                                }
                            }
                        })
                        .collect::<Vec<_>>()
                })
                .unwrap_or_default();

            PresetProvider {
                id: pinfo
                    .get("id")
                    .and_then(|v| v.as_str())
                    .unwrap_or(pid)
                    .to_string(),
                name: pinfo
                    .get("name")
                    .and_then(|v| v.as_str())
                    .unwrap_or(pid)
                    .to_string(),
                endpoint_url: endpoint,
                auth_type: auth.to_string(),
                models,
            }
        })
        .collect();

    result.sort_by(|a, b| a.name.to_lowercase().cmp(&b.name.to_lowercase()));

    let body = serde_json::to_string(&result)?;
    Ok((
        [(header::CONTENT_TYPE, HeaderValue::from_static("application/json"))],
        body,
    ))
}
