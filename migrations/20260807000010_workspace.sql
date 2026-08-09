-- Workspaces
CREATE TABLE IF NOT EXISTS workspaces (
    id BIGSERIAL PRIMARY KEY,
    name VARCHAR(128) NOT NULL,
    slug VARCHAR(128) UNIQUE,
    created_by BIGINT REFERENCES users(id),
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Workspace membership
CREATE TABLE IF NOT EXISTS workspace_members (
    id BIGSERIAL PRIMARY KEY,
    workspace_id BIGINT NOT NULL REFERENCES workspaces(id) ON DELETE CASCADE,
    user_id BIGINT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    role SMALLINT NOT NULL DEFAULT 1, -- 1=member, 10=admin
    joined_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    UNIQUE(workspace_id, user_id)
);
CREATE INDEX IF NOT EXISTS idx_workspace_members_workspace ON workspace_members(workspace_id);
CREATE INDEX IF NOT EXISTS idx_workspace_members_user ON workspace_members(user_id);

-- Workspace invitations
CREATE TABLE IF NOT EXISTS workspace_invites (
    id BIGSERIAL PRIMARY KEY,
    workspace_id BIGINT NOT NULL REFERENCES workspaces(id) ON DELETE CASCADE,
    username VARCHAR(64) NOT NULL,
    invited_by BIGINT NOT NULL REFERENCES users(id),
    role SMALLINT NOT NULL DEFAULT 1,
    status SMALLINT NOT NULL DEFAULT 0, -- 0=pending, 1=accepted, 2=rejected
    expires_at TIMESTAMPTZ,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_workspace_invites_workspace ON workspace_invites(workspace_id);
CREATE INDEX IF NOT EXISTS idx_workspace_invites_username ON workspace_invites(username);

-- Remove role from users (workspace roles live in workspace_members)
ALTER TABLE users DROP COLUMN IF EXISTS role;

-- Add workspace_id to existing tables
ALTER TABLE tokens ADD COLUMN IF NOT EXISTS workspace_id BIGINT REFERENCES workspaces(id);
ALTER TABLE request_logs ADD COLUMN IF NOT EXISTS workspace_id BIGINT;
ALTER TABLE channels ADD COLUMN IF NOT EXISTS workspace_id BIGINT REFERENCES workspaces(id);

-- Create default workspace and migrate existing data
INSERT INTO workspaces (name, slug, created_by)
SELECT 'Default', 'default', MIN(id) FROM users;

-- Add all existing users as admins of the default workspace
INSERT INTO workspace_members (workspace_id, user_id, role)
SELECT w.id, u.id, 10 FROM workspaces w CROSS JOIN users u
WHERE NOT EXISTS (
    SELECT 1 FROM workspace_members wm WHERE wm.workspace_id = w.id AND wm.user_id = u.id
);

-- Migrate existing tokens, logs, channels to default workspace
UPDATE tokens SET workspace_id = (SELECT id FROM workspaces LIMIT 1) WHERE workspace_id IS NULL;
UPDATE request_logs SET workspace_id = (SELECT id FROM workspaces LIMIT 1) WHERE workspace_id IS NULL;
UPDATE channels SET workspace_id = (SELECT id FROM workspaces LIMIT 1) WHERE workspace_id IS NULL;

-- Make workspace_id NOT NULL
ALTER TABLE tokens ALTER COLUMN workspace_id SET NOT NULL;
ALTER TABLE channels ALTER COLUMN workspace_id SET NOT NULL;

CREATE INDEX IF NOT EXISTS idx_tokens_workspace ON tokens(workspace_id);
CREATE INDEX IF NOT EXISTS idx_request_logs_workspace ON request_logs(workspace_id);
CREATE INDEX IF NOT EXISTS idx_channels_workspace ON channels(workspace_id);
