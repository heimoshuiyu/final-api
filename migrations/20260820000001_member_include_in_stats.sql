ALTER TABLE workspace_members
  ADD COLUMN include_in_stats BOOLEAN NOT NULL DEFAULT FALSE;
