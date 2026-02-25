# AGENTS.md

Guide for AI agents working in the QuantaGem codebase.

## Project Overview

QuantaGem is a production-grade WebUI for Google's Gemini AI, built with a full-stack architecture using Next.js 16, PostgreSQL, MinIO (S3-compatible storage), and Redis. It supports multiple AI providers (Google Vertex AI, OpenAI, Anthropic) and includes speech-to-text and text-to-speech capabilities.

## Essential Commands

### Development

```bash
npm run dev          # Start development server with Turbopack (port 3000)
npm run build        # Production build
npm run start        # Start production server
npm run lint         # Run ESLint
```

### Docker

```bash
# Production deployment
docker compose up -d --build

# Development with hot reload
docker compose -f docker-compose.yml -f docker-compose-dev.yml up --build

# Rebuild specific service
docker compose up -d --build stt-service
docker compose up -d --build docling-service
```

### Database

- PostgreSQL 18 with `pg_trgm` extension for fuzzy search
- Schema defined in `init.sql` (auto-loaded on first startup)
- Connection via `DATABASE_URL` environment variable

## Project Structure

```
QuantaGem/
├── src/
│   ├── app/                    # Next.js App Router
│   │   ├── api/                # API route handlers
│   │   │   ├── chat/           # Main chat streaming endpoint
│   │   │   ├── chats/          # Chat session CRUD
│   │   │   ├── projects/       # Project management
│   │   │   ├── files/          # File storage (MinIO)
│   │   │   ├── auth/           # Login, signup, logout
│   │   │   ├── models/         # Available AI models
│   │   │   ├── tts/            # Text-to-speech
│   │   │   ├── stt/            # Speech-to-text proxy
│   │   │   └── ...
│   │   ├── layout.tsx          # Root layout with providers
│   │   ├── page.tsx            # Main chat page
│   │   ├── login/              # Login page
│   │   └── signup/             # Signup page
│   ├── components/             # React components
│   │   ├── ChatArea.tsx        # Message display
│   │   ├── ChatInput.tsx       # Input with file upload, mic
│   │   ├── ModelSelector.tsx   # AI model dropdown
│   │   ├── Sidebar.tsx         # Chat list navigation
│   │   ├── SettingsModal.tsx   # User settings
│   │   ├── ThemeProvider.tsx   # Dark/light mode
│   │   ├── WebRProvider.tsx    # R code execution
│   │   └── ...
│   ├── lib/                    # Server-side utilities
│   │   ├── auth.ts             # JWT authentication
│   │   ├── db.ts               # PostgreSQL connection pool
│   │   ├── minio.ts            # S3-compatible storage
│   │   ├── custom-models.ts    # Multi-provider model routing
│   │   ├── thinking.ts         # Thinking budget/verbosity
│   │   └── webr/               # WebR R execution
│   ├── hooks/                  # React hooks
│   │   ├── useLiveSession.ts   # Real-time streaming
│   │   └── useWebR.ts          # R code execution
│   └── types/                  # TypeScript declarations
├── stt-service/                # Python STT microservice
│   ├── main.py                 # Faster Whisper transcription
│   ├── Dockerfile
│   └── requirements.txt
├── docling-service/            # Python PDF conversion
│   ├── main.py                 # Docling PDF to markdown
│   ├── Dockerfile
│   └── requirements.txt
├── public/                     # Static assets
│   └── fonts/                  # JetBrains Mono, Roboto
├── docker-compose.yml          # Production orchestration
├── docker-compose-dev.yml      # Development overrides
├── init.sql                    # Database schema
├── next.config.ts              # Next.js configuration
├── tailwind.config.ts          # Tailwind CSS config
├── tsconfig.json               # TypeScript config
└── package.json
```

## Tech Stack

- **Framework**: Next.js 16 (App Router, Server Components)
- **Language**: TypeScript (strict mode)
- **Styling**: Tailwind CSS 4.0
- **Database**: PostgreSQL 18
- **Object Storage**: MinIO (S3-compatible)
- **Cache/Rate Limiting**: Redis 8
- **AI SDKs**:
  - `@google/genai` - Google Vertex AI
  - `openai` - OpenAI API
  - `@anthropic-ai/sdk` - Anthropic API
- **Auth**: JWT with `jose`, bcryptjs for passwords
- **Markdown**: `react-markdown`, `rehype-katex`, `remark-math`

## Code Conventions

### TypeScript/React

- Path alias: `@/*` maps to `./src/*`
- Client components: Use `"use client"` directive
- Component naming: PascalCase (e.g., `ChatInput.tsx`)
- Props interfaces: Defined at top of component files
- Use `forwardRef` for components needing imperative handles

### API Routes

- Located in `src/app/api/`
- Export async `GET`, `POST`, `PATCH`, `DELETE` functions
- Authentication via `x-user-id` header or `__session` cookie
- Use `NextResponse.json()` for responses
- Streaming responses use `ReadableStream` with JSONL format

### Database Queries

- Use the `pool` from `@/lib/db`
- Parameterized queries with `$1, $2` syntax
- All tables have `user_id` for multi-tenancy

### Styling

- Tailwind utility classes
- Dark mode: `dark:` prefix with class-based toggle
- Custom fonts via CSS variables: `--font-sans`, `--font-mono`
- Animations: Framer Motion for complex, Tailwind for simple

## AI Provider Integration

### Model Selection Logic

The `getProviderForModel()` function in `src/lib/custom-models.ts` routes requests:

- Models starting with `gemini-` -> Vertex AI
- Models starting with `gpt-`, `o1-`, `o3-`, `chatgpt-` -> OpenAI
- Models starting with `claude-` -> Anthropic
- Models prefixed with `custom:` -> Custom OpenAI-compatible endpoint

### Streaming Response Format

All chat endpoints return JSONL with these event types:

```json
{"type": "text", "value": "content"}
{"type": "thought", "value": "reasoning"}
{"type": "grounding", "sources": [{"title": "...", "uri": "..."}]}
{"type": "error", "value": "error message"}
{"type": "warning", "value": "warning message"}
```

### Supported File Types by Provider

- **Gemini**: PDF, PNG, JPEG, WEBP, HEIC, HEIF, text files, source code
- **OpenAI**: PNG, JPEG, WEBP, GIF, PDF (via Docling), text files
- **Anthropic**: JPEG, PNG, GIF, WEBP, PDF, text files

## Microservices

### STT Service (`stt-service/`)

- FastAPI with Faster Whisper (large-v3 by default)
- Endpoint: `POST /transcribe` (multipart audio)
- Health: `GET /ping`
- Model configurable via `MODEL_SIZE` constant

### Docling Service (`docling-service/`)

- FastAPI with Docling for PDF to markdown conversion
- Endpoint: `POST /convert` (base64 PDF)
- Used by OpenAI Responses API for PDF processing
- Health: `GET /ping`

## Authentication Flow

1. Login/Signup returns JWT token (7-day expiry)
2. Token stored in `__session` cookie (httpOnly)
3. API routes check `Authorization: Bearer <token>` or cookie
4. User ID extracted and passed via `x-user-id` header internally

## Environment Variables

Required for production:

```env
GOOGLE_CLOUD_PROJECT="your-project-id"
GOOGLE_CLOUD_LOCATION="global"
GOOGLE_GENAI_USE_VERTEXAI="True"
OPENAI_API_KEY="your-key"              # Optional
ANTHROPIC_API_KEY="your-key"           # Optional
JWT_SECRET="32-char-random-string"
DATABASE_URL="postgresql://..."        # Auto-set in Docker
POSTGRES_USER=quantagemuser
POSTGRES_PASSWORD=quantagempass
POSTGRES_DB=quantagemdb
MINIO_ROOT_USER=minioadmin
MINIO_ROOT_PASSWORD=minioadminsecret
MINIO_DEFAULT_BUCKET=chat-files
```

GCP credentials: Place service account JSON at `secrets/gcp-key.json`

## Database Schema

Key tables (see `init.sql` for full schema):

- `users` - User accounts with bcrypt password hashes
- `projects` - Project containers with system prompts
- `project_files` - Files attached to projects (MinIO references)
- `chat_sessions` - Chat conversations with optional project linkage
- `messages` - Individual messages with JSONB parts array
- `user_settings` - Per-user settings (system prompt, TTS config)

System prompt cascade: chat level > project level > user level

## Common Tasks

### Adding a New API Endpoint

1. Create directory in `src/app/api/`
2. Add `route.ts` with exported HTTP method functions
3. Use `getUserIdFromRequest()` from `@/lib/auth` for auth
4. Return `NextResponse.json()` or streaming Response

### Adding a New Component

1. Create in `src/components/`
2. Use `"use client"` if client-side state/hooks needed
3. Import types from `@/app/page` if using shared types
4. Follow existing component patterns (forwardRef, props interface)

### Modifying AI Provider Behavior

1. Provider routing: `src/lib/custom-models.ts`
2. Thinking/reasoning config: `src/lib/thinking.ts`
3. Main chat handler: `src/app/api/chat/route.ts`

### Changing Database Schema

1. Update `init.sql` (for fresh installs)
2. Run manual migrations on existing DB
3. Update TypeScript types as needed

## Gotchas

- **Turbopack alias**: `drizzle-orm` is aliased to empty module in `next.config.ts`
- **Long-running requests**: Chat endpoint has `maxDuration = 600` seconds
- **Docker security**: Production container runs as non-root (65532:65532) with read-only filesystem
- **PDF handling**: OpenAI requires Docling service for PDF conversion; Gemini handles natively
- **Redis rate limiting**: Login endpoints limited to 5 attempts per 20 minutes
- **Model names**: Custom models prefixed with `custom:` in the UI
- **IPv6**: Docker compose supports IPv6 via override file (see README.md)

## Testing

No automated test suite currently exists. CI pipeline (`/.github/workflows/ci.yml`) is a placeholder.

Manual testing:
1. Run `docker compose up -d --build`
2. Access at `http://localhost:3000`
3. Create account and test chat functionality
