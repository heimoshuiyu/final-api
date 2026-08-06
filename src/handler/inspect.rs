use std::collections::HashSet;
use std::sync::Arc;

use axum::extract::{Query, State};
use axum::response::sse::{Event, KeepAlive, Sse};
use futures::stream::{self, Stream, StreamExt};
use serde::Deserialize;
use tokio::sync::broadcast::error::RecvError;

use crate::error::AppError;
use crate::service::inspect::InspectEvent;
use crate::state::AppState;

#[derive(Deserialize)]
pub struct InspectQuery {
    token_ids: Option<String>,
    models: Option<String>,
    channel_ids: Option<String>,
}

struct InspectFilter {
    token_ids: HashSet<i64>,
    models: HashSet<String>,
    channel_ids: HashSet<i64>,
}

fn parse_ids(s: &Option<String>) -> HashSet<i64> {
    s.as_ref()
        .map(|s| s.split(',').filter_map(|id| id.trim().parse().ok()).collect())
        .unwrap_or_default()
}

fn parse_set(s: &Option<String>) -> HashSet<String> {
    s.as_ref()
        .map(|s| s.split(',').map(|m| m.trim().to_string()).collect())
        .unwrap_or_default()
}

pub async fn stream(
    State(state): State<AppState>,
    Query(query): Query<InspectQuery>,
) -> Result<Sse<impl Stream<Item = Result<Event, std::io::Error>>>, AppError> {
    let filter = Arc::new(InspectFilter {
        token_ids: parse_ids(&query.token_ids),
        models: parse_set(&query.models),
        channel_ids: parse_ids(&query.channel_ids),
    });

    let rx = state.inspect_tx.subscribe();

    let initial = stream::once(async {
        Ok::<_, std::io::Error>(Event::default().data("{\"type\":\"connected\"}"))
    });

    let events = stream::unfold(
        (rx, HashSet::<String>::new()),
        move |(mut rx, mut tracked)| {
            let filter = filter.clone();
            async move {
                loop {
                    match rx.recv().await {
                        Ok(event) => {
                            let pass = match &event {
                                InspectEvent::Start {
                                    req_id,
                                    token_id,
                                    model,
                                    channel_id,
                                    ..
                                } => {
                                    let ok = (filter.token_ids.is_empty()
                                        || filter.token_ids.contains(token_id))
                                        && (filter.models.is_empty()
                                            || filter.models.contains(model))
                                        && (filter.channel_ids.is_empty()
                                            || filter.channel_ids.contains(channel_id));
                                    if ok {
                                        tracked.insert(req_id.clone());
                                    }
                                    ok
                                }
                                InspectEvent::Chunk { req_id, .. } => tracked.contains(req_id),
                                InspectEvent::End { req_id, .. } => {
                                    let has = tracked.contains(req_id);
                                    tracked.remove(req_id);
                                    has
                                }
                            };
                            if pass {
                                if let Ok(json) = serde_json::to_string(&event) {
                                    return Some((Ok(Event::default().data(json)), (rx, tracked)));
                                }
                            }
                        }
                        Err(RecvError::Lagged(_)) => continue,
                        Err(RecvError::Closed) => return None,
                    }
                }
            }
        },
    );

    Ok(Sse::new(initial.chain(events)).keep_alive(
        KeepAlive::new()
            .interval(std::time::Duration::from_secs(10))
            .text("keep-alive"),
    ))
}
