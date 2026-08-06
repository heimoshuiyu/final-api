-- Users table
CREATE TABLE IF NOT EXISTS users (
    id BIGSERIAL PRIMARY KEY,
    username VARCHAR(64) NOT NULL UNIQUE,
    password_hash VARCHAR(255) NOT NULL,
    role SMALLINT NOT NULL DEFAULT 1, -- 1=common, 10=admin
    status SMALLINT NOT NULL DEFAULT 1, -- 1=enabled, 2=disabled
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Tokens (API keys)
CREATE TABLE IF NOT EXISTS tokens (
    id BIGSERIAL PRIMARY KEY,
    user_id BIGINT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    key VARCHAR(128) NOT NULL UNIQUE,
    name VARCHAR(128) NOT NULL DEFAULT '',
    status SMALLINT NOT NULL DEFAULT 1, -- 1=enabled, 2=disabled
    model_limits_enabled BOOLEAN NOT NULL DEFAULT FALSE,
    model_limits TEXT NOT NULL DEFAULT '', -- comma-separated model list
    expired_at TIMESTAMPTZ,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_tokens_user_id ON tokens(user_id);
CREATE INDEX IF NOT EXISTS idx_tokens_key ON tokens(key);

-- Channels (upstream providers)
CREATE TABLE IF NOT EXISTS channels (
    id BIGSERIAL PRIMARY KEY,
    name VARCHAR(128) NOT NULL,
    type SMALLINT NOT NULL DEFAULT 1, -- informational: 1=openai, 14=anthropic, 24=gemini, 8=custom
    base_url VARCHAR(512) NOT NULL,
    api_key TEXT NOT NULL,
    models TEXT[] NOT NULL DEFAULT '{}', -- array of supported model names
    status SMALLINT NOT NULL DEFAULT 1, -- 1=enabled, 2=disabled
    priority INT NOT NULL DEFAULT 0, -- lower = higher priority
    weight INT NOT NULL DEFAULT 1, -- weight for deterministic hash selection
    model_mapping JSONB NOT NULL DEFAULT '{}', -- {"client-model": "upstream-model"}
    header_override JSONB NOT NULL DEFAULT '{}', -- custom headers to add/override
    body_override JSONB NOT NULL DEFAULT '{}', -- fields to inject/override in request body
    sticky_mode VARCHAR(16) NOT NULL DEFAULT 'prefer', -- 'strict' | 'prefer' | 'none'
    max_retries INT NOT NULL DEFAULT 3,
    timeout_seconds INT NOT NULL DEFAULT 300,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Sticky provider mapping (session affinity)
CREATE TABLE IF NOT EXISTS sticky_provider (
    id VARCHAR(255) PRIMARY KEY, -- "{model}/{stickyId}"
    channel_id BIGINT NOT NULL REFERENCES channels(id) ON DELETE CASCADE,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Request logs
CREATE TABLE IF NOT EXISTS request_logs (
    id BIGSERIAL PRIMARY KEY,
    token_id BIGINT,
    user_id BIGINT,
    channel_id BIGINT,
    model VARCHAR(128) NOT NULL DEFAULT '',
    is_stream BOOLEAN NOT NULL DEFAULT FALSE,
    status_code INT NOT NULL DEFAULT 200,
    duration_ms INT NOT NULL DEFAULT 0,
    session_id VARCHAR(255) NOT NULL DEFAULT '',
    error_message TEXT,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_request_logs_user_id ON request_logs(user_id);
CREATE INDEX IF NOT EXISTS idx_request_logs_channel_id ON request_logs(channel_id);
CREATE INDEX IF NOT EXISTS idx_request_logs_model ON request_logs(model);
CREATE INDEX IF NOT EXISTS idx_request_logs_created_at ON request_logs(created_at);
