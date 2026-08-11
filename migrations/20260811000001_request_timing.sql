ALTER TABLE request_logs
    ADD COLUMN IF NOT EXISTS upstream_headers_ms INTEGER,
    ADD COLUMN IF NOT EXISTS upstream_first_data_ms INTEGER,
    ADD COLUMN IF NOT EXISTS upstream_complete_ms INTEGER;
