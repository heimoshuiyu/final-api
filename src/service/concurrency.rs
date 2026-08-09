use std::collections::HashMap;
use std::sync::atomic::{AtomicUsize, Ordering};
use std::sync::{Arc, Mutex};
use std::time::Instant;

pub struct ConcurrencyPermit {
    counter: Arc<AtomicUsize>,
}

impl Drop for ConcurrencyPermit {
    fn drop(&mut self) {
        self.counter.fetch_sub(1, Ordering::AcqRel);
    }
}

#[derive(Clone, Default)]
pub struct ChannelLoadTracker {
    counters: Arc<Mutex<HashMap<i64, Arc<AtomicUsize>>>>,
    last_used: Arc<Mutex<HashMap<i64, Instant>>>,
}

impl ChannelLoadTracker {
    pub fn active(&self, channel_id: i64) -> usize {
        let guard = self.counters.lock().unwrap();
        guard
            .get(&channel_id)
            .map(|c| c.load(Ordering::Acquire))
            .unwrap_or(0)
    }

    pub fn load_rate(&self, channel_id: i64, max_concurrency: i32) -> f64 {
        if max_concurrency <= 0 {
            return 0.0;
        }
        self.active(channel_id) as f64 / max_concurrency as f64
    }

    pub fn last_used(&self, channel_id: i64) -> Option<Instant> {
        let guard = self.last_used.lock().unwrap();
        guard.get(&channel_id).copied()
    }

    pub fn mark_used(&self, channel_id: i64) {
        let mut guard = self.last_used.lock().unwrap();
        guard.insert(channel_id, Instant::now());
    }

    pub fn try_acquire(
        &self,
        channel_id: i64,
        max_concurrency: i32,
    ) -> Option<ConcurrencyPermit> {
        let counter = {
            let mut guard = self.counters.lock().unwrap();
            guard
                .entry(channel_id)
                .or_insert_with(|| Arc::new(AtomicUsize::new(0)))
                .clone()
        };

        if max_concurrency <= 0 {
            counter.fetch_add(1, Ordering::AcqRel);
            return Some(ConcurrencyPermit { counter });
        }

        loop {
            let current = counter.load(Ordering::Acquire);
            if current >= max_concurrency as usize {
                return None;
            }
            if counter
                .compare_exchange_weak(current, current + 1, Ordering::AcqRel, Ordering::Acquire)
                .is_ok()
            {
                return Some(ConcurrencyPermit { counter });
            }
        }
    }
}
