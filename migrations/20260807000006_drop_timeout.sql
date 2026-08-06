-- Drop timeout_seconds column
ALTER TABLE channels DROP COLUMN IF EXISTS timeout_seconds;
