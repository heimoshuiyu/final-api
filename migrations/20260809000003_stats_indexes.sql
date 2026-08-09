CREATE INDEX IF NOT EXISTS idx_request_logs_ws_created
  ON request_logs(workspace_id, created_at);
