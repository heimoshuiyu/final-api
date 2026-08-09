use crate::db::channel::ChannelRow;
use crate::service::concurrency::{ChannelLoadTracker, ConcurrencyPermit};

pub struct ChannelSelection<'a> {
    pub channel: &'a ChannelRow,
    pub permit: Option<ConcurrencyPermit>,
}

pub fn select_channel<'a>(
    channels: &'a [ChannelRow],
    excluded: &[i64],
    load: &ChannelLoadTracker,
) -> Option<ChannelSelection<'a>> {
    let mut eligible: Vec<&ChannelRow> = channels
        .iter()
        .filter(|c| c.status == 1 && !excluded.contains(&c.id))
        .collect();

    if eligible.is_empty() {
        return None;
    }

    eligible.sort_by(|a, b| {
        a.priority
            .cmp(&b.priority)
            .then_with(|| {
                load.load_rate(a.id, a.max_concurrency)
                    .partial_cmp(&load.load_rate(b.id, b.max_concurrency))
                    .unwrap_or(std::cmp::Ordering::Equal)
            })
            .then_with(|| load.last_used(a.id).cmp(&load.last_used(b.id)))
            .then_with(|| a.id.cmp(&b.id))
    });

    for c in &eligible {
        if let Some(permit) = load.try_acquire(c.id, c.max_concurrency) {
            load.mark_used(c.id);
            return Some(ChannelSelection {
                channel: *c,
                permit: Some(permit),
            });
        }
    }

    load.mark_used(eligible[0].id);
    Some(ChannelSelection {
        channel: eligible[0],
        permit: None,
    })
}
