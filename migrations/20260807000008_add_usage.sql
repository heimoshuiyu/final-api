ALTER TABLE request_logs
    ADD COLUMN prompt_tokens INT,
    ADD COLUMN completion_tokens INT,
    ADD COLUMN total_tokens INT;
