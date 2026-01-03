# QuantaGem

QuantaGem is a high-performance, production-grade WebUI for Google's Gemini AI, built with a modern Full-Stack architecture. Unlike simpler interfaces, QuantaGem leverages the power of Vertex AI, persistent vector-like project storage, and a distributed microservices architecture to provide a robust environment for AI-driven workflows.

## 🏗 Architecture & Tech Stack

- **Frontend/Backend:** [Next.js 15+](https://nextjs.org/) (App Router, Server Components, Route Handlers).
- **Language:** [TypeScript](https://www.typescriptlang.org/) with strict type safety.
- **Styling:** [Tailwind CSS 4.0](https://tailwindcss.com/) with Lightning CSS.
- **Database:** [PostgreSQL 18](https://www.postgresql.org/) for session, message, and project persistence.
- **Object Storage:** [MinIO](https://min.io/) (S3-compatible) for handling chat attachments and project files.
- **Cache/Rate Limiting:** [Redis 8](https://redis.io/) for secure authentication limiting.
- **AI Integration:** [Google Vertex AI SDK](https://cloud.google.com/vertex-ai) (Gemini 2.0/2.5/3 and more).
- **Speech-to-Text:** Local Python microservice using [Faster Whisper](https://github.com/SYSTRAN/faster-whisper).
- **Deployment:** [Docker Compose](https://www.docker.com/) with Distroless (non-root) production images for maximum security.

## 🚀 Core Features

- **Advanced Chat Interface:** Supports streaming responses, Markdown, LaTeX math, and syntax highlighting.
- **Project Management:** Organize chats into projects with dedicated system prompts and persistent file attachments.
- **Vertex AI Integration:** Optimized for enterprise-grade Gemini models, including support for "Thinking" models with adjustable budgets.
- **Multimodal Support:** Upload PDFs, images, and large source code folders (via Directory Picker API) for context-aware prompting.
- **Search & Grounding:** Toggle Google Search grounding for real-time information retrieval.
- **Voice Intelligence:** Built-in Speech-to-Text (local Whisper) and Text-to-Speech (Gemini TTS).
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

MINIO_ROOT_USER=minioadmin
MINIO_ROOT_PASSWORD=minioadminsecret
MINIO_DEFAULT_BUCKET=chat-files
```

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

## 🎤 Speech-to-Text (STT) Customization

The `stt-service` uses `faster-whisper-large-v3` by default on CPU. To adjust the model size for better performance on weaker hardware, modify `stt-service/main.py`:

```python
MODEL_SIZE = "Systran/faster-whisper-medium" # Options: tiny, base, small, medium, large-v3
COMPUTE_TYPE = "int8"
CPU_THREADS = 4 # Adjust based on your CPU
```

After modifying, rebuild the service:
```bash
docker compose up -d --build stt-service
```

## 🔒 Security Posture

- **Distroless Images:** The production container uses `gcr.io/distroless/nodejs24`, containing only the application and its runtime dependencies.
- **Non-Root Execution:** The application runs as user `65532:65532`.
- **Read-Only RootFS:** The container filesystem is read-only, using `tmpfs` only for required cache directories.
- **Capability Drop:** All Linux capabilities are dropped in the Compose file.
- **Security Headers:** Implements strict CORS and CSP headers.

## 📄 License

This project is licensed under the MIT License - see the [LICENSE](LICENSE) file for details.
