-- Global user role: 1=user, 10=admin
ALTER TABLE users ADD COLUMN IF NOT EXISTS role SMALLINT NOT NULL DEFAULT 1;

-- Promote existing workspace admins to global admins
UPDATE users SET role = 10 WHERE id IN (
    SELECT DISTINCT user_id FROM workspace_members WHERE role = 10
);

-- Drop username-based invite system, rebuild as token-based
DROP TABLE IF EXISTS workspace_invites;

CREATE TABLE workspace_invites (
    id BIGSERIAL PRIMARY KEY,
    workspace_id BIGINT NOT NULL REFERENCES workspaces(id) ON DELETE CASCADE,
    token VARCHAR(64) NOT NULL UNIQUE,
    created_by BIGINT NOT NULL REFERENCES users(id),
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX idx_workspace_invites_token ON workspace_invites(token);
CREATE INDEX idx_workspace_invites_workspace ON workspace_invites(workspace_id);
