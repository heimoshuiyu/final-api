use serde::Serialize;
use serde_json::Value;

#[derive(Debug, Default, Clone, Serialize)]
pub struct UsageData {
    pub prompt_tokens: Option<i64>,
    pub completion_tokens: Option<i64>,
    pub total_tokens: Option<i64>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub cached_tokens: Option<i64>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub cache_creation_tokens: Option<i64>,
}

impl UsageData {
    pub fn is_empty(&self) -> bool {
        self.prompt_tokens.is_none()
            && self.completion_tokens.is_none()
            && self.total_tokens.is_none()
            && self.cached_tokens.is_none()
            && self.cache_creation_tokens.is_none()
    }
}

#[derive(Debug, Clone, Copy, PartialEq)]
pub enum UsageFormat {
    ChatCompletions,
    Messages,
    Responses,
    Completions,
    Gemini,
    Generic,
}

impl UsageFormat {
    pub fn from_endpoint_suffix(path: &str) -> Self {
        if path.ends_with("/messages") {
            Self::Messages
        } else if path.ends_with("/chat/completions") {
            Self::ChatCompletions
        } else if path.ends_with("/responses") {
            Self::Responses
        } else if path.ends_with("/completions") {
            Self::Completions
        } else if path.ends_with(":generateContent")
            || path.ends_with(":streamGenerateContent")
            || path.ends_with(":generatecontent")
            || path.ends_with(":streamgeneratecontent")
        {
            Self::Gemini
        } else {
            Self::Generic
        }
    }
}

pub struct UsageExtractor {
    format: UsageFormat,
    is_stream: bool,
    line_buf: String,
    raw_buf: Vec<u8>,
    usage: UsageData,
}

impl UsageExtractor {
    pub fn new(format: UsageFormat, is_stream: bool) -> Self {
        Self {
            format,
            is_stream,
            line_buf: String::new(),
            raw_buf: Vec::new(),
            usage: UsageData::default(),
        }
    }

    pub fn feed(&mut self, data: &[u8]) {
        if self.is_stream {
            self.feed_sse(data);
        } else {
            self.raw_buf.extend_from_slice(data);
        }
    }

    fn feed_sse(&mut self, data: &[u8]) {
        self.line_buf.push_str(&String::from_utf8_lossy(data));

        loop {
            let Some(nl) = self.line_buf.find('\n') else {
                break;
            };
            let line = self.line_buf[..nl].trim_end_matches('\r').to_string();
            self.line_buf = self.line_buf[nl + 1..].to_string();

            if let Some(json_str) = line.strip_prefix("data: ").or_else(|| line.strip_prefix("data:")) {
                let json_str = json_str.trim();
                if json_str == "[DONE]" || json_str.is_empty() {
                    continue;
                }
                if let Ok(val) = serde_json::from_str::<Value>(json_str) {
                    self.extract_sse_usage(&val);
                }
            }
        }
    }

    fn extract_sse_usage(&mut self, val: &Value) {
        match self.format {
            UsageFormat::ChatCompletions | UsageFormat::Completions => {
                self.extract_openai_chat_sse(val);
            }
            UsageFormat::Messages => {
                self.extract_anthropic_sse(val);
            }
            UsageFormat::Responses => {
                self.extract_responses_sse(val);
            }
            UsageFormat::Gemini => {
                self.extract_gemini(val);
            }
            UsageFormat::Generic => {
                self.extract_generic(val);
            }
        }
    }

    /// OpenAI Chat Completions (also: OpenRouter, DeepSeek, Groq, TogetherAI, etc.)
    /// Usage arrives in the final chunk when stream_options.include_usage is set.
    /// Cached tokens can appear at:
    ///   - prompt_tokens_details.cached_tokens (OpenAI, xAI)
    ///   - prompt_tokens_details.cache_creation_input_tokens (Alibaba)
    ///   - top-level cached_tokens (Moonshot)
    fn extract_openai_chat_sse(&mut self, val: &Value) {
        if let Some(usage) = val.get("usage") {
            Self::set_if_some(&mut self.usage.prompt_tokens,
                usage.get("prompt_tokens").and_then(|v| v.as_i64()),
            );
            Self::set_if_some(&mut self.usage.completion_tokens,
                usage.get("completion_tokens").and_then(|v| v.as_i64()),
            );
            Self::set_if_some(&mut self.usage.total_tokens,
                usage.get("total_tokens").and_then(|v| v.as_i64()),
            );
            // prompt_tokens_details (OpenAI / xAI / Alibaba)
            if let Some(details) = usage.get("prompt_tokens_details") {
                Self::set_if_some(&mut self.usage.cached_tokens,
                    details.get("cached_tokens").and_then(|v| v.as_i64()),
                );
                Self::set_if_some(&mut self.usage.cache_creation_tokens,
                    details
                        .get("cache_creation_input_tokens")
                        .or_else(|| details.get("cache_write_tokens"))
                        .and_then(|v| v.as_i64()),
                );
            }
            // Moonshot-style: top-level cached_tokens
            Self::set_if_some(&mut self.usage.cached_tokens,
                usage.get("cached_tokens").and_then(|v| v.as_i64()),
            );
        }
    }

    /// Anthropic Messages: usage split across message_start (input+cache) and
    /// message_delta (output). Right-biased merge on finalize.
    /// Also handles proxies that drop fields — falls back to top-level usage.
    fn extract_anthropic_sse(&mut self, val: &Value) {
        let event_type = val.get("type").and_then(|v| v.as_str()).unwrap_or("");
        match event_type {
            "message_start" => {
                if let Some(usage) = val.pointer("/message/usage").or_else(|| val.get("usage")) {
                    self.usage.prompt_tokens = usage.get("input_tokens").and_then(|v| v.as_i64());
                    self.usage.cached_tokens = usage
                        .get("cache_read_input_tokens")
                        .and_then(|v| v.as_i64());
                    self.usage.cache_creation_tokens = usage
                        .get("cache_creation_input_tokens")
                        .and_then(|v| v.as_i64());
                    if self.usage.total_tokens.is_none() {
                        self.usage.total_tokens = usage.get("input_tokens").and_then(|v| v.as_i64());
                    }
                }
            }
            "message_delta" => {
                if let Some(usage) = val.get("usage") {
                    self.usage.completion_tokens = usage
                        .get("output_tokens")
                        .and_then(|v| v.as_i64())
                        .or(self.usage.completion_tokens);
                    let input = self.usage.prompt_tokens.unwrap_or(0);
                    let output = self.usage.completion_tokens.unwrap_or(0);
                    self.usage.total_tokens = Some(input + output);
                }
            }
            _ => {}
        }
    }

    /// OpenAI Responses: usage in response.completed / response.incomplete
    /// at response.usage with input_tokens_details / output_tokens_details.
    fn extract_responses_sse(&mut self, val: &Value) {
        let event_type = val.get("type").and_then(|v| v.as_str()).unwrap_or("");
        if event_type == "response.completed" || event_type == "response.incomplete" {
            if let Some(usage) = val.pointer("/response/usage").or_else(|| val.get("usage")) {
                self.extract_openai_responses_usage(usage);
            }
        }
    }

    fn extract_openai_responses_usage(&mut self, usage: &Value) {
        Self::set_if_some(&mut self.usage.prompt_tokens,
            usage.get("input_tokens").and_then(|v| v.as_i64()),
        );
        Self::set_if_some(&mut self.usage.completion_tokens,
            usage.get("output_tokens").and_then(|v| v.as_i64()),
        );
        Self::set_if_some(&mut self.usage.total_tokens,
            usage.get("total_tokens").and_then(|v| v.as_i64()),
        );
        if let Some(details) = usage.get("input_tokens_details") {
            Self::set_if_some(&mut self.usage.cached_tokens,
                details.get("cached_tokens").and_then(|v| v.as_i64()),
            );
            Self::set_if_some(&mut self.usage.cache_creation_tokens,
                details
                    .get("cache_write_tokens")
                    .and_then(|v| v.as_i64()),
            );
        }
    }

    /// Gemini: usageMetadata on every chunk (cumulative), last one is authoritative.
    /// candidatesTokenCount is exclusive of thoughtsTokenCount.
    fn extract_gemini(&mut self, val: &Value) {
        if let Some(usage) = val.get("usageMetadata") {
            self.usage.prompt_tokens = usage
                .get("promptTokenCount")
                .and_then(|v| v.as_i64())
                .or(self.usage.prompt_tokens);
            // candidatesTokenCount (visible) + thoughtsTokenCount (reasoning) = inclusive output
            let candidates = usage
                .get("candidatesTokenCount")
                .and_then(|v| v.as_i64());
            let thoughts = usage
                .get("thoughtsTokenCount")
                .and_then(|v| v.as_i64());
            self.usage.completion_tokens = match (candidates, thoughts) {
                (Some(c), Some(t)) => Some(c + t),
                (Some(c), None) => Some(c),
                (None, _) => self.usage.completion_tokens,
            };
            self.usage.total_tokens = usage
                .get("totalTokenCount")
                .and_then(|v| v.as_i64())
                .or(self.usage.total_tokens);
            self.usage.cached_tokens = usage
                .get("cachedContentTokenCount")
                .and_then(|v| v.as_i64())
                .or(self.usage.cached_tokens);
        }
    }

    /// Generic fallback: tries OpenAI Chat → Anthropic → Gemini field names.
    fn extract_generic(&mut self, val: &Value) {
        // Try usageMetadata (Gemini)
        if val.get("usageMetadata").is_some() {
            self.extract_gemini(val);
            return;
        }
        // Try top-level usage (OpenAI / Anthropic / compatible)
        if let Some(usage) = val.get("usage") {
            // Responses format: usage nested under response.usage
            if let Some(resp_usage) = val.pointer("/response/usage") {
                self.extract_openai_responses_usage(resp_usage);
                return;
            }
            Self::set_if_some(&mut self.usage.prompt_tokens,
                usage
                    .get("prompt_tokens")
                    .or_else(|| usage.get("input_tokens"))
                    .and_then(|v| v.as_i64()),
            );
            Self::set_if_some(&mut self.usage.completion_tokens,
                usage
                    .get("completion_tokens")
                    .or_else(|| usage.get("output_tokens"))
                    .and_then(|v| v.as_i64()),
            );
            Self::set_if_some(&mut self.usage.total_tokens,
                usage.get("total_tokens").and_then(|v| v.as_i64()),
            );
            // Anthropic-style cache fields
            Self::set_if_some(&mut self.usage.cached_tokens,
                usage
                    .get("cache_read_input_tokens")
                    .and_then(|v| v.as_i64()),
            );
            Self::set_if_some(&mut self.usage.cache_creation_tokens,
                usage
                    .get("cache_creation_input_tokens")
                    .and_then(|v| v.as_i64()),
            );
            // OpenAI-style cache fields
            if let Some(details) = usage.get("prompt_tokens_details") {
                Self::set_if_some(&mut self.usage.cached_tokens,
                    details.get("cached_tokens").and_then(|v| v.as_i64()),
                );
                Self::set_if_some(&mut self.usage.cache_creation_tokens,
                    details
                        .get("cache_creation_input_tokens")
                        .or_else(|| details.get("cache_write_tokens"))
                        .and_then(|v| v.as_i64()),
                );
            }
            // Moonshot-style top-level cached_tokens
            Self::set_if_some(&mut self.usage.cached_tokens,
                usage.get("cached_tokens").and_then(|v| v.as_i64()),
            );
        }
        // Also check response.usage for non-streaming Responses format
        if let Some(resp_usage) = val.pointer("/response/usage") {
            self.extract_openai_responses_usage(resp_usage);
        }
    }

    #[inline]
    fn set_if_some(slot: &mut Option<i64>, val: Option<i64>) {
        if val.is_some() {
            *slot = val;
        }
    }

    pub fn finalize(&mut self) -> UsageData {
        if !self.is_stream && !self.raw_buf.is_empty() {
            if let Ok(val) = serde_json::from_slice::<Value>(&self.raw_buf) {
                match self.format {
                    UsageFormat::Messages => {
                        if let Some(usage) = val.get("usage") {
                            self.usage.prompt_tokens = usage.get("input_tokens").and_then(|v| v.as_i64());
                            self.usage.completion_tokens = usage.get("output_tokens").and_then(|v| v.as_i64());
                            self.usage.cached_tokens = usage
                                .get("cache_read_input_tokens")
                                .and_then(|v| v.as_i64());
                            self.usage.cache_creation_tokens = usage
                                .get("cache_creation_input_tokens")
                                .and_then(|v| v.as_i64());
                            let input = self.usage.prompt_tokens.unwrap_or(0);
                            let output = self.usage.completion_tokens.unwrap_or(0);
                            self.usage.total_tokens = Some(input + output);
                        }
                    }
                    UsageFormat::Responses => {
                        if let Some(usage) = val.pointer("/response/usage").or_else(|| val.get("usage")) {
                            self.extract_openai_responses_usage(usage);
                        }
                    }
                    UsageFormat::Gemini => {
                        self.extract_gemini(&val);
                    }
                    UsageFormat::ChatCompletions | UsageFormat::Completions => {
                        self.extract_openai_chat_sse(&val);
                    }
                    UsageFormat::Generic => {
                        self.extract_generic(&val);
                    }
                }
            }
        }
        self.usage.clone()
    }
}
