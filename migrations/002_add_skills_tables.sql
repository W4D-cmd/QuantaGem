-- Migration: Add skills and user_skill_activations tables, and skill_override_enabled on chat_sessions
-- Run this migration manually on existing databases.
-- For fresh installs, these statements are also included in init.sql.

CREATE TABLE IF NOT EXISTS skills (
  id SERIAL PRIMARY KEY,
  user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  content TEXT NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE(user_id, name)
);

CREATE TABLE IF NOT EXISTS user_skill_activations (
  id SERIAL PRIMARY KEY,
  user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  skill_id INTEGER NOT NULL REFERENCES skills(id) ON DELETE CASCADE,
  scope TEXT NOT NULL DEFAULT 'global' CHECK (scope IN ('global', 'chat')),
  chat_session_id INTEGER REFERENCES chat_sessions(id) ON DELETE CASCADE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE(user_id, skill_id, scope, COALESCE(chat_session_id, 0))
);

ALTER TABLE chat_sessions ADD COLUMN IF NOT EXISTS skill_override_enabled BOOLEAN DEFAULT FALSE;

CREATE INDEX IF NOT EXISTS idx_skills_user_id ON skills(user_id);
CREATE INDEX IF NOT EXISTS idx_user_skill_activations_user_scope ON user_skill_activations(user_id, scope);
CREATE INDEX IF NOT EXISTS idx_user_skill_activations_chat ON user_skill_activations(chat_session_id) WHERE chat_session_id IS NOT NULL;