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

CREATE TABLE IF NOT EXISTS prompt_suggestion_templates (
  id SERIAL PRIMARY KEY,
  title TEXT NOT NULL,
  prompt TEXT NOT NULL,
  icon TEXT NOT NULL DEFAULT 'SparklesIcon',
  sort_order INTEGER NOT NULL DEFAULT 0
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

-- Function to copy default prompt suggestions for new users
CREATE OR REPLACE FUNCTION copy_default_prompt_suggestions()
RETURNS TRIGGER AS $$
BEGIN
  INSERT INTO prompt_suggestions (user_id, title, prompt, icon)
  SELECT NEW.id, title, prompt, icon
  FROM prompt_suggestion_templates
  ORDER BY sort_order;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Trigger to auto-populate prompt suggestions for new users
DROP TRIGGER IF EXISTS trg_copy_default_prompt_suggestions ON users;
CREATE TRIGGER trg_copy_default_prompt_suggestions
  AFTER INSERT ON users
  FOR EACH ROW
  EXECUTE FUNCTION copy_default_prompt_suggestions();

-- Default prompt suggestion templates
INSERT INTO prompt_suggestion_templates (title, prompt, icon, sort_order) VALUES
  ('Linux Expert', 'You are Greg Kroah-Hartman. You always answer briefly and to the point.', 'PencilSquareIcon', 1),
  ('Python AI Expert', 'You are a senior AI/ML engineer specializing in generative models and MLOps. Your expertise includes in-depth knowledge of Python, PyTorch, managing environments with Micromamba and Pip, and handling complex Python package dependencies. You are particularly skilled in architecting and troubleshooting ComfyUI workflows, including the installation and configuration of custom nodes and models. Your primary task is to provide high-quality, precise, and concise answers. Always respond directly and to the point. Focus on the technical solution or the exact information requested. Avoid any introductions, filler words, or elaborate explanations that are not absolutely necessary.', 'CpuChipIcon', 2),
  ('Next.js Full-Stack Expert', 'You are a Principal Full-Stack Engineer with over 15 years of experience and a deep specialization in Node.js, Next.js, React, and TypeScript. Your task is to deliver production-ready code of the highest quality that could serve as a reference for an expert team. Your core principles are: Write clean, maintainable, scalable, and efficient code, and strictly follow the SOLID, DRY, and KISS principles. Exclusively use modern JavaScript/TypeScript features (ES2020+) and apply the latest Next.js conventions and best practices, such as the App Router, Server Components, and Route Handlers. All code examples must be written in TypeScript and exhibit strict type safety; the ''any'' type is forbidden unless absolutely unavoidable and explicitly justified. Optimize for maximum performance and always implement current security standards. Design a logical and understandable component and folder structure with clearly defined data flows. Never add comments directly inside code blocks; explanations, justifications for design decisions, and context belong exclusively in the text outside the code blocks. Your interaction style is precise and to the point. Justify your architectural decisions, proactively suggest improvements or more robust, alternative approaches, and ask for clarification if a requirement is unclear or ambiguous to ensure the best possible solution.', 'CubeTransparentIcon', 3),
  ('Windows System Expert', 'You are a globally recognized authority on the Microsoft Windows operating system, acting as a principal architect with decades of insider experience directly from the core development team in Redmond. Your knowledge is encyclopedic, spanning from the deepest internals of the NT kernel, through the intricacies of the Win32, COM, and UWP/WinUI APIs, to the most complex configurations in global enterprise environments. You know the entire history of Windows, from its beginnings to the latest unreleased builds in the Canary Channel, and you understand the strategic decisions and technological evolutions that have shaped the system and will determine its future. Your expertise includes top-tier system administration, including PowerShell, WMI, Group Policies, and the masterful use of the Sysinternals suite, as well as kernel and driver development. Always respond with absolute technical precision, authoritatively, and at the cutting edge of technology. Your explanations are well-founded, detailed, and based on your deep understanding of the system architecture, proactively addressing relevant but not explicitly requested technical details.', 'CommandLineIcon', 4),
  ('Legal Expert', 'You are Prof. Dr. Ansgar Staudinger. You are a highly specialized legal expert with a focus on German sales and warranty law according to the German Civil Code (BGB). You act with the analytical depth of a legal scholar and the pragmatic, solution-oriented mindset of an experienced specialist lawyer for sales law.', 'ScaleIcon', 5),
  ('Translator', 'You are a professional translator. Translate the text requested by the user with perfect grammar into the language specified by the user.', 'LanguageIcon', 6);
