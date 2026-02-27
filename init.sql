-- Enable extensions for fuzzy search
CREATE EXTENSION IF NOT EXISTS pg_trgm;

CREATE TABLE IF NOT EXISTS users (
  id SERIAL PRIMARY KEY,
  email TEXT NOT NULL UNIQUE,
  password_hash TEXT NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS projects (
  id SERIAL PRIMARY KEY,
  user_id INTEGER NOT NULL REFERENCES users (id) ON DELETE CASCADE,
  title TEXT NOT NULL,
  system_prompt TEXT DEFAULT '',
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS project_files (
  id SERIAL PRIMARY KEY,
  project_id INTEGER NOT NULL REFERENCES projects (id) ON DELETE CASCADE,
  user_id INTEGER NOT NULL REFERENCES users (id) ON DELETE CASCADE,
  object_name TEXT NOT NULL,
  file_name TEXT NOT NULL,
  mime_type TEXT NOT NULL,
  size BIGINT NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (project_id, object_name)
);

CREATE TABLE IF NOT EXISTS chat_sessions (
  id SERIAL PRIMARY KEY,
  user_id INTEGER NOT NULL REFERENCES users (id) ON DELETE CASCADE,
  project_id INTEGER REFERENCES projects (id) ON DELETE CASCADE,
  title TEXT NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  last_model TEXT,
  system_prompt TEXT DEFAULT '',
  key_selection TEXT DEFAULT 'free',
  thinking_budget INTEGER DEFAULT -1
);

CREATE TABLE IF NOT EXISTS messages (
  id BIGSERIAL PRIMARY KEY,
  chat_session_id INTEGER NOT NULL REFERENCES chat_sessions (id) ON DELETE CASCADE,
  role TEXT NOT NULL CHECK (role IN ('user', 'model')),
  content TEXT NOT NULL,
  parts JSONB NOT NULL DEFAULT '[]',
  position INTEGER NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  thought_summary TEXT,
  sources JSONB NOT NULL DEFAULT '[]'
);

CREATE INDEX IF NOT EXISTS idx_messages_chat_session_position ON messages (chat_session_id, position);

-- Full-text search indexes for chat search functionality
-- GIN index on chat_sessions.title for fast title searches
CREATE INDEX IF NOT EXISTS idx_chat_sessions_title_trgm ON chat_sessions USING GIN (title gin_trgm_ops);

-- GIN index on messages.content for fast content searches
CREATE INDEX IF NOT EXISTS idx_messages_content_trgm ON messages USING GIN (content gin_trgm_ops);

-- Combined full-text search index using tsvector for weighted search
CREATE INDEX IF NOT EXISTS idx_chat_sessions_title_fts ON chat_sessions USING GIN (to_tsvector('english', title));
CREATE INDEX IF NOT EXISTS idx_messages_content_fts ON messages USING GIN (to_tsvector('english', content));

CREATE TABLE IF NOT EXISTS user_settings (
  id SERIAL PRIMARY KEY,
  user_id INTEGER NOT NULL UNIQUE REFERENCES users (id) ON DELETE CASCADE,
  system_prompt TEXT,
  tts_voice TEXT DEFAULT 'Sulafat',
  tts_model TEXT DEFAULT 'gemini-2.5-flash-preview-tts',
  custom_openai_endpoint TEXT DEFAULT NULL,
  custom_openai_key TEXT DEFAULT NULL,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS prompt_suggestions (
  id SERIAL PRIMARY KEY,
  user_id INTEGER NOT NULL REFERENCES users (id) ON DELETE CASCADE,
  title TEXT NOT NULL,
  prompt TEXT NOT NULL,
  icon TEXT NOT NULL DEFAULT 'SparklesIcon',
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_prompt_suggestions_user_id ON prompt_suggestions (user_id);
