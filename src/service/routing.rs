use crate::db::channel::ChannelRow;

/// Deterministic hash from the last 4 bytes of sticky_id.
/// Mirrors console's selection algorithm exactly.
fn deterministic_hash(s: &str) -> u32 {
    let bytes = s.as_bytes();
    let len = bytes.len();
    let mut h: u32 = 0;
    for i in len.saturating_sub(4)..len {
        h = h.wrapping_mul(31).wrapping_add(bytes[i] as u32);
    }
    h
}

/// Select a channel deterministically:
/// 1. Filter eligible (enabled, not excluded, weight > 0)
/// 2. Expand by weight into a flat array
/// 3. Hash sticky_id → index
pub fn select_channel<'a>(
    channels: &'a [ChannelRow],
    sticky_id: &str,
    excluded: &[i64],
) -> Option<&'a ChannelRow> {
    let eligible: Vec<&ChannelRow> = channels
        .iter()
        .filter(|c| c.status == 1 && c.weight > 0 && !excluded.contains(&c.id))
        .collect();

    if eligible.is_empty() {
        return None;
    }

    let mut weighted: Vec<&ChannelRow> = Vec::new();
    for c in &eligible {
        for _ in 0..c.weight {
            weighted.push(*c);
        }
    }

    let hash = deterministic_hash(sticky_id);
    let index = (hash as usize) % weighted.len();
    Some(weighted[index])
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_deterministic_hash_consistency() {
        let id = "session_abc123";
        let h1 = deterministic_hash(id);
        let h2 = deterministic_hash(id);
        assert_eq!(h1, h2);
    }

    #[test]
    fn test_different_ids_different_hash() {
        let h1 = deterministic_hash("session_abc123");
        let h2 = deterministic_hash("session_xyz789");
        assert_ne!(h1, h2);
    }
}
