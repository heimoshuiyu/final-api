use axum::http::HeaderMap;
use serde_json::Value;

const SEED_PREFIX: &str = "compat_cs_";

pub fn derive_sticky_id(headers: &HeaderMap, body: &Value, token_id: i64) -> String {
    if let Some(id) = headers
        .get("x-session-id")
        .or_else(|| headers.get("x-opencode-session"))
        .and_then(|v| v.to_str().ok())
        .filter(|s| !s.is_empty())
    {
        return id.to_string();
    }

    if let Some(key) = body
        .get("prompt_cache_key")
        .and_then(|v| v.as_str())
        .filter(|s| !s.is_empty())
    {
        return key.trim().to_string();
    }

    if let Some(seed) = content_session_seed(body) {
        return format!("{}{:016x}", SEED_PREFIX, fnv1a_hash(&seed));
    }

    token_id.to_string()
}

fn content_session_seed(body: &Value) -> Option<String> {
    let mut seed = String::new();

    if let Some(model) = body
        .get("model")
        .and_then(|v| v.as_str())
        .filter(|s| !s.is_empty())
    {
        seed.push_str("model=");
        seed.push_str(model);
    }

    if let Some(tools) = body.get("tools").filter(|v| v.is_array()) {
        let normalized = serde_json::to_string(tools).unwrap_or_default();
        if normalized != "[]" {
            seed.push_str("|tools=");
            seed.push_str(&normalized);
        }
    }

    if let Some(system) = body.get("system") {
        let text = extract_text(system);
        if !text.is_empty() {
            seed.push_str("|system=");
            seed.push_str(&text);
        }
    }

    if let Some(instr) = body
        .get("instructions")
        .and_then(|v| v.as_str())
        .filter(|s| !s.is_empty())
    {
        seed.push_str("|instructions=");
        seed.push_str(instr);
    }

    if let Some(messages) = body.get("messages").and_then(|v| v.as_array()) {
        for msg in messages {
            let role = msg.get("role").and_then(|v| v.as_str()).unwrap_or("");
            if role == "system" || role == "developer" {
                if let Some(content) = msg.get("content") {
                    let text = extract_text(content);
                    if !text.is_empty() {
                        seed.push_str("|sys_msg=");
                        seed.push_str(&text);
                    }
                }
            }
        }
        for msg in messages {
            if msg.get("role").and_then(|v| v.as_str()) == Some("user") {
                if let Some(content) = msg.get("content") {
                    let text = extract_text(content);
                    if !text.is_empty() {
                        seed.push_str("|user=");
                        seed.push_str(&text);
                        break;
                    }
                }
            }
        }
    }

    if let Some(input) = body.get("input").and_then(|v| v.as_array()) {
        for item in input {
            if item.get("role").and_then(|v| v.as_str()) == Some("user") {
                if let Some(content) = item.get("content") {
                    let text = extract_text(content);
                    if !text.is_empty() {
                        seed.push_str("|user=");
                        seed.push_str(&text);
                        break;
                    }
                }
            }
        }
    }

    if seed.is_empty() {
        None
    } else {
        Some(seed)
    }
}

fn extract_text(value: &Value) -> String {
    match value {
        Value::String(s) => s.clone(),
        Value::Array(arr) => arr.iter().map(extract_text).collect::<Vec<_>>().join(""),
        Value::Object(obj) => {
            if let Some(t) = obj.get("text").and_then(|v| v.as_str()) {
                return t.to_string();
            }
            String::new()
        }
        _ => String::new(),
    }
}

fn fnv1a_hash(s: &str) -> u64 {
    let mut hash: u64 = 0xcbf29ce484222325;
    for b in s.as_bytes() {
        hash ^= *b as u64;
        hash = hash.wrapping_mul(0x100000001b3);
    }
    hash
}
