-- Add TTL to sticky_provider bindings
ALTER TABLE sticky_provider ADD COLUMN IF NOT EXISTS expires_at TIMESTAMPTZ;
UPDATE sticky_provider SET expires_at = NOW() + INTERVAL '1 hour' WHERE expires_at IS NULL;
ALTER TABLE sticky_provider ALTER COLUMN expires_at SET NOT NULL;
CREATE INDEX IF NOT EXISTS idx_sticky_provider_expires ON sticky_provider(expires_at);

-- Add max_concurrency to channels (0 = unlimited)
ALTER TABLE channels ADD COLUMN IF NOT EXISTS max_concurrency INT NOT NULL DEFAULT 0;
