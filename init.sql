CREATE TABLE IF NOT EXISTS chat_sessions (
  id SERIAL PRIMARY KEY,
  title TEXT NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  last_model TEXT,
  system_prompt TEXT DEFAULT ''
);

CREATE TABLE IF NOT EXISTS messages (
  id BIGSERIAL PRIMARY KEY,
  chat_session_id INTEGER NOT NULL REFERENCES chat_sessions (id) ON DELETE CASCADE,
  role TEXT NOT NULL CHECK (role IN ('user', 'model')),
  content TEXT NOT NULL,
  parts JSONB NOT NULL DEFAULT '[]',
  position INTEGER NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  sources JSONB NOT NULL DEFAULT '[]'
);

CREATE INDEX IF NOT EXISTS idx_messages_chat_session_position ON messages (chat_session_id, position);

CREATE TABLE IF NOT EXISTS user_settings (
  id INTEGER PRIMARY KEY DEFAULT 1,
  system_prompt TEXT,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT only_one_row CHECK (id = 1)
);

INSERT INTO
  user_settings (id, system_prompt)
VALUES
  (1, '')
ON CONFLICT (id) DO NOTHING;
