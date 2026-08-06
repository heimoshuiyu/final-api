use std::pin::Pin;
use std::task::{Context, Poll};
use std::time::Instant;

use axum::http::HeaderMap;
use bytes::Bytes;
use chrono::Utc;
use futures::Stream;
use serde::Serialize;
use tokio::sync::broadcast;

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
}

impl<S> InspectStream<S> {
    pub fn new(
        inner: S,
        tx: InspectTx,
        req_id: String,
        status: u16,
        start: Instant,
        resp_headers: serde_json::Value,
    ) -> Self {
        Self {
            inner,
            tx,
            req_id,
            status,
            start,
            resp_headers,
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
                let _ = self.tx.send(InspectEvent::Chunk {
                    req_id: self.req_id.clone(),
                    ts: Utc::now().timestamp_millis(),
                    data: String::from_utf8_lossy(&bytes).to_string(),
                });
                Poll::Ready(Some(Ok(bytes)))
            }
            Poll::Ready(Some(Err(e))) => Poll::Ready(Some(Err(e))),
            Poll::Ready(None) => {
                let _ = self.tx.send(InspectEvent::End {
                    req_id: self.req_id.clone(),
                    status: self.status,
                    duration_ms: self.start.elapsed().as_millis() as u64,
                    resp_headers: self.resp_headers.clone(),
                });
                Poll::Ready(None)
            }
            Poll::Pending => Poll::Pending,
        }
    }
}
