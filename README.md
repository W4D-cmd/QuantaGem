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
- **Speech-to-Text:** Local Python microservice using [ONNX ASR](https://github.com/thewh1teagle/onnx-asr) with NVIDIA NeMo Parakeet TDT model.
- **Deployment:** [Docker Compose](https://www.docker.com/) with Distroless (non-root) production images for maximum security.

## 🚀 Core Features

- **Advanced Chat Interface:** Supports streaming responses, Markdown, LaTeX math, and syntax highlighting.
- **Project Management:** Organize chats into projects with dedicated system prompts and persistent file attachments.
- **Vertex AI Integration:** Optimized for enterprise-grade Gemini models, including support for "Thinking" models with adjustable budgets.
- **Multimodal Support:** Upload PDFs, images, and large source code folders (via Directory Picker API) for context-aware prompting.
- **Search & Grounding:** Toggle Google Search grounding for real-time information retrieval.
- **Voice Intelligence:** Built-in Speech-to-Text (local ONNX ASR) and Text-to-Speech (Gemini TTS).
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

OPENAI_API_KEY="your-openai-api-key"
ANTHROPIC_API_KEY="your-anthropic-api-key"

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

### 4. OpenAI/Anthropic Authentication (Optional)

To use OpenAI models, add your OpenAI API key to the `.env.local` file at `OPENAI_API_KEY`.
To use Anthropic models, add your Anthropic API key at `ANTHROPIC_API_KEY`.

### 5. Deploy with Docker

Start the entire stack in production mode:

```bash
docker compose up -d --build
```

The application will be available at `http://localhost:3000`.

### 6. Enable IPv6 (Optional)

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

## 🎤 Speech-to-Text (STT) Customization

The `stt-service` uses NVIDIA's `nemo-parakeet-tdt-0.6b-v3` ONNX model by default for fast, accurate transcription. The model runs on CPU using ONNX Runtime.

### Environment Variables

Configure the STT service via environment variables in `docker-compose.yml`:

```yaml
stt-service:
  environment:
    MODEL_NAME: "nemo-parakeet-tdt-0.6b-v3"  # Built-in model name or HF repo ID
    STT_THREADS: 4  # Number of CPU threads (default: auto-detect)
```

### Available Models

`nemo-parakeet-tdt-0.6b-v3` (default) - Best balance of speed and accuracy

Or use any HuggingFace model compatible with `onnx-asr` by specifying the repository ID.

### Rebuild After Changes

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
