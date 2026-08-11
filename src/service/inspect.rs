use std::pin::Pin;
use std::task::{Context, Poll};
use std::time::Instant;

use axum::http::HeaderMap;
use bytes::Bytes;
use chrono::Utc;
use futures::Stream;
use serde::Serialize;
use tokio::sync::broadcast;

use crate::service::concurrency::ConcurrencyPermit;
use crate::service::usage::{UsageData, UsageExtractor, UsageFormat};

const SENSITIVE_HEADERS: &[&str] = &[
    "authorization",
    "x-api-key",
    "api-key",
    "cookie",
    "set-cookie",
    "proxy-authorization",
];

fn is_sensitive(key: &str) -> bool {
    SENSITIVE_HEADERS.contains(&key.to_lowercase().as_str())
}

fn headers_to_json(headers: &HeaderMap) -> serde_json::Value {    let mut map = serde_json::Map::new();
    for (key, value) in headers.iter() {
        let k = key.as_str().to_string();
        let v = if is_sensitive(&k) {
            let raw = value.to_str().unwrap_or("<binary>");
            if raw.len() <= 8 {
                "***".to_string()
            } else {
                format!("{}***", &raw[..raw.len() / 2])
            }
        } else {
            value.to_str().unwrap_or("<binary>").to_string()
        };
        match map.get_mut(&k) {
            Some(serde_json::Value::String(existing)) => {
                existing.push_str(", ");
                existing.push_str(&v);
            }
            _ => {
                map.insert(k, serde_json::Value::String(v));
            }
        }
    }
    serde_json::Value::Object(map)
}

#[derive(Clone, Serialize)]
#[serde(tag = "type")]
pub enum InspectEvent {
    #[serde(rename = "start")]
    Start {
        req_id: String,
        ts: i64,
        workspace_id: i64,
        user_id: i64,
        token_id: i64,
        token_name: String,
        channel_id: i64,
        channel_name: String,
        model: String,
        endpoint: String,
        is_stream: bool,
        body: serde_json::Value,
        req_headers: serde_json::Value,
        upstream_headers: serde_json::Value,
    },
    #[serde(rename = "chunk")]
    Chunk {
        req_id: String,
        ts: i64,
        data: String,
    },
    #[serde(rename = "end")]
    End {
        req_id: String,
        status: u16,
        duration_ms: u64,
        resp_headers: serde_json::Value,
        #[serde(skip_serializing_if = "Option::is_none")]
        usage: Option<UsageData>,
        #[serde(skip_serializing_if = "Option::is_none")]
        cost: Option<f64>,
    },
}

pub type InspectTx = broadcast::Sender<InspectEvent>;

pub fn inspect_channel(capacity: usize) -> InspectTx {
    broadcast::channel::<InspectEvent>(capacity).0
}

pub fn header_map_to_json(headers: &HeaderMap) -> serde_json::Value {
    headers_to_json(headers)
}

fn calculate_cost(usage: &UsageData, model_prices: &serde_json::Value, model: &str) -> f64 {
    let Some(price) = model_prices.get(model) else {
        return 0.0;
    };
    let get = |key: &str, default: f64| -> f64 {
        price.get(key).and_then(|v| v.as_f64()).unwrap_or(default)
    };
    let input_price = get("input", 0.0);
    let output_price = get("output", 0.0);
    let cached_price = get("cached", input_price);
    let cache_creation_price = get("cache_creation", input_price);

    let prompt = usage.prompt_tokens.unwrap_or(0) as f64;
    let completion = usage.completion_tokens.unwrap_or(0) as f64;
    let cached = usage.cached_tokens.unwrap_or(0) as f64;
    let cache_create = usage.cache_creation_tokens.unwrap_or(0) as f64;
    let billable_input = (prompt - cached - cache_create).max(0.0);

    (billable_input * input_price
        + cached * cached_price
        + cache_create * cache_creation_price
        + completion * output_price)
        / 1_000_000.0
}

pub struct InspectStream<S> {
    inner: S,
    tx: InspectTx,
    req_id: String,
    status: u16,
    start: Instant,
    resp_headers: serde_json::Value,
    usage_extractor: UsageExtractor,
    pool: Option<sqlx::PgPool>,
    log_id: Option<i64>,
    model_prices: serde_json::Value,
    model: String,
    first_data_ms: Option<i32>,
    _permit: Option<ConcurrencyPermit>,
}

impl<S> InspectStream<S> {
    pub fn new(
        inner: S,
        tx: InspectTx,
        req_id: String,
        status: u16,
        start: Instant,
        resp_headers: serde_json::Value,
        usage_format: UsageFormat,
        is_stream: bool,
        pool: sqlx::PgPool,
        log_id: i64,
        model_prices: serde_json::Value,
        model: String,
        permit: Option<ConcurrencyPermit>,
    ) -> Self {
        Self {
            inner,
            tx,
            req_id,
            status,
            start,
            resp_headers,
            usage_extractor: UsageExtractor::new(usage_format, is_stream),
            pool: Some(pool),
            log_id: Some(log_id),
            model_prices,
            model,
            first_data_ms: None,
            _permit: permit,
        }
    }
}

impl<S, E> Stream for InspectStream<S>
where
    S: Stream<Item = Result<Bytes, E>> + Unpin,
{
    type Item = Result<Bytes, E>;

    fn poll_next(mut self: Pin<&mut Self>, cx: &mut Context<'_>) -> Poll<Option<Self::Item>> {
        match Pin::new(&mut self.inner).poll_next(cx) {
            Poll::Ready(Some(Ok(bytes))) => {
                if !bytes.is_empty() && self.first_data_ms.is_none() {
                    self.first_data_ms = Some(self.start.elapsed().as_millis() as i32);
                }
                self.usage_extractor.feed(&bytes);
                let _ = self.tx.send(InspectEvent::Chunk {
                    req_id: self.req_id.clone(),
                    ts: Utc::now().timestamp_millis(),
                    data: String::from_utf8_lossy(&bytes).to_string(),
                });
                Poll::Ready(Some(Ok(bytes)))
            }
            Poll::Ready(Some(Err(e))) => Poll::Ready(Some(Err(e))),
            Poll::Ready(None) => {
                let usage = self.usage_extractor.finalize();
                let cost = calculate_cost(&usage, &self.model_prices, &self.model);

                if let (Some(pool), Some(log_id)) = (&self.pool, self.log_id) {
                    let pool = pool.clone();
                    let u = usage.clone();
                    let prices = self.model_prices.clone();
                    let model = self.model.clone();
                    let first_data_ms = self.first_data_ms;
                    let complete_ms = self.start.elapsed().as_millis() as i32;
                    tokio::spawn(async move {
                        if !u.is_empty() {
                            let c = calculate_cost(&u, &prices, &model);
                            let _ = crate::db::log::update_usage(
                                &pool,
                                log_id,
                                u.prompt_tokens,
                                u.completion_tokens,
                                u.total_tokens,
                                u.cached_tokens,
                                u.cache_creation_tokens,
                                Some(c),
                            )
                            .await;
                        }
                        let _ = crate::db::log::update_timings(
                            &pool,
                            log_id,
                            first_data_ms,
                            Some(complete_ms),
                        )
                        .await;
                    });
                }

                let _ = self.tx.send(InspectEvent::End {
                    req_id: self.req_id.clone(),
                    status: self.status,
                    duration_ms: self.start.elapsed().as_millis() as u64,
                    resp_headers: self.resp_headers.clone(),
                    usage: if usage.is_empty() { None } else { Some(usage) },
                    cost: if cost > 0.0 { Some(cost) } else { None },
                });
                Poll::Ready(None)
            }
            Poll::Pending => Poll::Pending,
        }
    }
}
