-- Add columns to node_executions
ALTER TABLE node_executions ADD COLUMN commit_sha TEXT;
ALTER TABLE node_executions ADD COLUMN step_id TEXT;

-- Add columns to sessions
ALTER TABLE sessions ADD COLUMN git_branch TEXT DEFAULT 'main';
ALTER TABLE sessions ADD COLUMN base_commit_sha TEXT;

-- Create indexes
CREATE INDEX IF NOT EXISTS idx_commit_sha ON node_executions(commit_sha);
CREATE UNIQUE INDEX IF NOT EXISTS idx_step_id ON node_executions(step_id);

-- Create timelines table
CREATE TABLE IF NOT EXISTS timelines (
    id TEXT PRIMARY KEY,
    name TEXT NOT NULL,
    branch_name TEXT UNIQUE NOT NULL,
    base_commit_sha TEXT NOT NULL,
    parent_session_id TEXT,
    created_at TEXT NOT NULL
);

-- Create processed_messages table
CREATE TABLE IF NOT EXISTS processed_messages (
    message_id TEXT PRIMARY KEY,
    message_type TEXT NOT NULL,
    processed_at TEXT NOT NULL
);
