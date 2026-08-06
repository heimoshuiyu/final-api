ALTER TABLE request_logs
    ADD COLUMN cached_tokens INT,
    ADD COLUMN cache_creation_tokens INT;
