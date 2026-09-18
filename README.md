# QuantaGem

![License](https://img.shields.io/github/license/W4D-cmd/QuantaGem)
![Next.js](https://img.shields.io/badge/Next.js-16-black?logo=next.js)
![TypeScript](https://img.shields.io/badge/TypeScript-strict-blue?logo=typescript)
![Node](https://img.shields.io/badge/Node-24-green?logo=nodedotjs)
![Docker](https://img.shields.io/badge/Docker-Compose%20deployed-2496ED?logo=docker)
![Renovate](https://img.shields.io/badge/renovate-enabled-brightgreen)
![GitHub stars](https://img.shields.io/github/stars/W4D-cmd/QuantaGem?style=social)
![Last commit](https://img.shields.io/github/last-commit/W4D-cmd/QuantaGem)
![PRs Welcome](https://img.shields.io/badge/PRs-welcome-brightgreen.svg)

QuantaGem is a high-performance, production-grade WebUI for Google's Gemini AI, built with a modern full-stack architecture. Unlike simpler interfaces, QuantaGem leverages the power of Vertex AI, user-configured custom model endpoints (OpenAI-compatible and Anthropic-compatible), persistent project storage, and a distributed microservices architecture to provide a robust environment for AI-driven workflows.

## 🏗 Architecture & Tech Stack

- **Frontend/Backend:** [Next.js 16](https://nextjs.org/) (App Router, Server Components, Route Handlers).
- **Language:** [TypeScript](https://www.typescriptlang.org/) with strict type safety.
- **Styling:** [Tailwind CSS 4](https://tailwindcss.com/).
- **Database:** [PostgreSQL 18](https://www.postgresql.org/) for session, message, and project persistence.
- **Object Storage:** [SeaweedFS](https://github.com/seaweedfs/seaweedfs) (S3-compatible, `weed mini` single-process) for handling chat attachments and project files.
- **Cache/Rate Limiting:** [Redis 8](https://redis.io/) for secure authentication limiting.
- **AI Integration:** [Google Vertex AI](https://cloud.google.com/vertex-ai) via `@google/genai` (Gemini 2.5/3.x models), plus `openai` and `@anthropic-ai/sdk` for user-configured custom endpoints.
- **Speech-to-Text:** Local Python microservice using [ONNX ASR](https://github.com/thewh1teagle/onnx-asr) with NVIDIA NeMo Parakeet TDT model.
- **Deployment:** [Docker Compose](https://www.docker.com/) with Distroless (non-root) production images for maximum security.

## 🚀 Core Features

- **Advanced Chat Interface:** Streaming responses, Markdown, LaTeX math, syntax highlighting, chat pinning/duplication, and per-message cost estimation.
- **Project Management:** Organize chats into projects with dedicated system prompts and persistent file attachments.
- **Vertex AI Integration:** Optimized for enterprise-grade Gemini models, including support for "Thinking" models with adjustable budgets.
- **Custom Model Providers:** Connect any OpenAI-compatible (e.g., llama.cpp, Ollama, vLLM) or Anthropic-compatible endpoint with per-user configuration, automatic model discovery, and manual model definitions including token limits, reasoning, and verbosity capabilities.
- **In-Chat R Execution:** Run R code blocks directly in the conversation via WebR (WebAssembly R runtime).
- **Global Chat Search:** Fuzzy, typo-tolerant search across chat titles and message content (PostgreSQL `pg_trgm`) via a quick-access modal.
- **Skills:** Reusable instruction snippets scoped globally or per-chat, injected into the system prompt cascade.
- **Temporary Chats:** Ephemeral conversations whose uploaded files are auto-expired after 1 day (lifecycle rule + scheduled cleanup).
- **Web Page Context:** URLs pasted into the input are auto-detected and fetched server-side, injecting page content into the message.
- **AI Prompt Assist:** One-click prompt refinement and AI-generated system prompts, both streamed live.
- **Admin Panel:** Role-based administration area with user management and usage metrics.
- **Multimodal Support:** Upload PDFs, images, and large source code folders (via Directory Picker API) for context-aware prompting.
- **Search & Grounding:** Toggle Google Search grounding for real-time information retrieval.
- **Voice Intelligence:** Built-in Speech-to-Text (local ONNX ASR).
- **Prompt Suggestions:** Customizable prompt templates with iOS-like drag-and-drop reordering for quick access.
- **Secure Auth:** JWT-based authentication with bcrypt hashing and Redis-backed rate limiting.

## 🛠 Installation & Setup

### Prerequisites

- [Docker & Docker Compose](https://docs.docker.com/get-docker/)
- A Google Cloud Project with **Vertex AI API** enabled.
- A Google Cloud Service Account key (JSON format).

### 1. Clone the Repository

```bash
git clone https://github.com/W4D-cmd/QuantaGem.git
cd QuantaGem
```

### 2. Environment Configuration

Create a `.env.local` file in the root directory. You can use the provided `.env` as a template:

```env
GOOGLE_CLOUD_PROJECT="your-gcp-project-id"
GOOGLE_CLOUD_LOCATION="global"
GOOGLE_GENAI_USE_VERTEXAI="True"

JWT_SECRET="generate-a-32-char-random-string"

POSTGRES_USER=quantagemuser
POSTGRES_PASSWORD=quantagempass
POSTGRES_DB=quantagemdb
DATABASE_URL=postgres://${POSTGRES_USER}:${POSTGRES_PASSWORD}@db:5432/${POSTGRES_DB}

# STT service URL (defaults to the internal Docker service at stt-service:50800)
# STT_SERVICE_URL=http://stt-service:50800

# Object storage (SeaweedFS, S3-compatible)
S3_ACCESS_KEY=minioadmin
S3_SECRET_KEY=minioadminsecret
S3_ENDPOINT=seaweedfs
S3_PORT=8333
S3_USE_SSL=false
S3_BUCKET=chat-files

# Legacy MinIO credentials — only needed when migrating from an existing MinIO store
MINIO_ROOT_USER=minioadmin
MINIO_ROOT_PASSWORD=minioadminsecret
MINIO_DEFAULT_BUCKET=chat-files
```

**Object storage (SeaweedFS):** Chat attachments and project files are stored in SeaweedFS running single-process `weed mini` mode (pinned to `4.46`), exposed as an S3 endpoint at `seaweedfs:8333`. Uploads under the `temporary/` prefix are auto-expired (1 day) by a lifecycle rule. To migrate data from a legacy MinIO store, run `docker compose --profile migrate run --rm migrate-storage` (copy + verify with `rclone check`), then `docker compose --profile migrate run --rm configure-storage` (applies the lifecycle rule). See `docs/storage-migration.md`.

### 3. GCP Authentication

Create a directory named `secrets` in the root and place your Google Cloud Service Account JSON key inside it. Rename it to `gcp-key.json`:

```bash
mkdir secrets
# Copy your key file
cp /path/to/your/service-account-key.json secrets/gcp-key.json
```

### 4. Deploy with Docker

Start the entire stack in production mode:

```bash
docker compose up -d --build
```

The application will be available at `http://localhost:3000`.

### 5. Enable IPv6 (Optional)

To enable IPv6 support with Docker open the file `/etc/docker/daemon.json` and add the following content:

```json
{
  "ipv6": true,
  "fixed-cidr-v6": "fd00:db8:1::/64",
  "experimental": true,
  "ip6tables": true
}
```

Restart Docker `sudo systemctl restart docker`.

Enable IPv6 masquerading by running `sudo firewall-cmd --permanent --zone=public --add-masquerade && sudo firewall-cmd --reload`. This is required to allow containers with internal IPv6 addresses to access the external network through the host's public IP address.

In the root directory of this project create a `docker-compose.override.yml` file with the following content:

```yaml
networks:
  app-network:
    enable_ipv6: true
    ipam:
      config:
        - subnet: 172.31.250.0/24
        - subnet: fd00:cafe:face:b00c::/64
```

Restart the application using `docker compose up --build --force-recreate -d`.

## 💻 Local Development

Run the full stack with hot reload (Next.js dev server with Turbopack):

```bash
docker compose -f docker-compose.yml -f docker-compose-dev.yml up --build
```

The development app is exposed at `http://localhost:48222`. Source changes are picked up automatically via a bind mount (`WATCHPACK_POLLING`), and the dev container intentionally relaxes the production security constraints (writable filesystem, root user) for a smoother edit/reload loop.

## 🎤 Speech-to-Text (STT) Customization

The `stt-service` uses NVIDIA's `nemo-parakeet-tdt-0.6b-v3` ONNX model by default for fast, accurate transcription. The model runs on CPU using ONNX Runtime.

### Environment Variables

The service listens on port `50800` and is configured via environment variables in `docker-compose.yml`:

```yaml
stt-service:
  environment:
    HF_HOME: /app/models              # Model cache volume (persisted via stt_models)
    # MODEL_NAME: "nemo-parakeet-tdt-0.6b-v3"  # Built-in model name or HF repo ID
    # STT_THREADS: 4                  # Number of CPU threads (default: auto-detect)
```

### Available Models

`nemo-parakeet-tdt-0.6b-v3` (default) - Best balance of speed and accuracy

Or use any HuggingFace model compatible with `onnx-asr` by specifying the repository ID.

### Rebuild After Changes

```bash
docker compose up -d --build stt-service
```

## 📚 Additional Documentation

- [`API_DOCUMENTATION.md`](API_DOCUMENTATION.md) — full reference for all API endpoints.
- [`AGENTS.md`](AGENTS.md) — architecture overview, coding conventions, and project structure.
- [`docs/storage-migration.md`](docs/storage-migration.md) — MinIO → SeaweedFS migration guide.

## 🔒 Security Posture

- **Distroless Images:** The production container runs on `gcr.io/distroless/nodejs24-debian13:nonroot`, containing only the application and its runtime dependencies.
- **Pinned Images:** Third-party images (`postgres:18-alpine`, `seaweedfs:4.46`, `redis:8-alpine`) are pinned by digest in `docker-compose.yml`.
- **Non-Root Execution:** The application runs as user `65532:65532`.
- **Read-Only RootFS:** The container filesystem is read-only, using `tmpfs` only for required cache directories.
- **Capability Drop:** All Linux capabilities are dropped in the Compose file.
- **Security Headers:** Implements strict CORS and CSP headers.

## 🤝 Contributing

Contributions are welcome! Please keep the following in mind:

- Use the Conventional Commits format for commit messages (`feat`, `fix`, `docs`, `chore`, ...).
- Read `AGENTS.md` for coding conventions and project structure before larger changes.
- For substantial features, open an issue first to discuss the approach.

## 📄 License

This project is licensed under the MIT License - see the [LICENSE](LICENSE) file for details.
