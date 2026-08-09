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

fn headers_to_json(headers: &HeaderMap) -> serde_json::Value {
    let mut map = serde_json::Map::new();
    for (key, value) in headers.iter() {
        let k = key.as_str().to_string();
        let v = value.to_str().unwrap_or("<binary>").to_string();
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
    },
}

pub type InspectTx = broadcast::Sender<InspectEvent>;

pub fn inspect_channel(capacity: usize) -> InspectTx {
    broadcast::channel::<InspectEvent>(capacity).0
}

pub fn header_map_to_json(headers: &HeaderMap) -> serde_json::Value {
    headers_to_json(headers)
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

                if let (Some(pool), Some(log_id)) = (&self.pool, self.log_id) {
                    if !usage.is_empty() {
                        let pool = pool.clone();
                        let u = usage.clone();
                        tokio::spawn(async move {
                            let _ = crate::db::log::update_usage(
                                &pool,
                                log_id,
                                u.prompt_tokens,
                                u.completion_tokens,
                                u.total_tokens,
                                u.cached_tokens,
                                u.cache_creation_tokens,
                            )
                            .await;
                        });
                    }
                }

                let _ = self.tx.send(InspectEvent::End {
                    req_id: self.req_id.clone(),
                    status: self.status,
                    duration_ms: self.start.elapsed().as_millis() as u64,
                    resp_headers: self.resp_headers.clone(),
                    usage: if usage.is_empty() { None } else { Some(usage) },
                });
                Poll::Ready(None)
            }
            Poll::Pending => Poll::Pending,
        }
    }
}
