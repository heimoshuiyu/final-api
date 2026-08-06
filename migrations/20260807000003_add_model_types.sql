-- Add model_types column for per-model API type overrides
ALTER TABLE channels ADD COLUMN IF NOT EXISTS model_types JSONB NOT NULL DEFAULT '{}';
