-- Re-add priority column (lower = higher priority)
ALTER TABLE channels ADD COLUMN IF NOT EXISTS priority INT NOT NULL DEFAULT 0;
