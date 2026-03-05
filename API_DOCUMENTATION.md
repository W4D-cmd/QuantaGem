# QuantaGem API Documentation

This documentation describes all externally accessible API endpoints for the QuantaGem AI chat platform. Use these endpoints to build mobile apps or integrate with external services.

## Table of Contents

- [Base URL](#base-url)
- [Authentication](#authentication)
- [Data Models](#data-models)
- [Error Codes](#error-codes)
- [Authentication Endpoints](#authentication-endpoints)
- [Chat Management Endpoints](#chat-management-endpoints)
- [Project Management Endpoints](#project-management-endpoints)
- [File Management Endpoints](#file-management-endpoints)
- [AI & Utility Endpoints](#ai--utility-endpoints)

---

## Base URL

```
https://your-domain.com/api
```

Replace `your-domain.com` with your actual deployment domain.

---

## Authentication

Most endpoints require authentication. The authentication flow is:

1. **Sign Up or Login**: Call `/api/auth/signup` or `/api/auth/login` to get your user ID and token.
2. **Include Headers**: Add the following headers to most authenticated requests:

```
x-user-id: <your_user_id>
```

**Note**: For security, some endpoints (like multipart file uploads and STT) require direct token verification via the `Authorization: Bearer <token>` header or the `__session` cookie.

**Headers**:
- `x-user-id`: The unique numeric ID of the user (Required for most endpoints).
- `x-user-email`: The email of the user (Optional, used by some endpoints like `/api/user`).
- `Authorization`: `Bearer <token>` (Required for file uploads and STT).
- `Cookie`: `__session=<token>` (Alternative to Authorization header).

**Rate Limiting**:
- Login endpoints use Redis-based rate limiting (5 attempts per 20 minutes per IP/username)
- Other endpoints do not have rate limiting

---

## Data Models

### MessagePart

Represents a part of a message (text, file attachment, or scraped URL).

```typescript
type MessagePart =
  | { type: "text"; text: string }
  | { type: "file"; fileName: string; objectName: string; mimeType: string; size?: number; isProjectFile?: boolean; projectFileId?: number }
  | { type: "scraped_url"; text: string; url?: string }
```

### Chat Request

Request body for the main chat endpoint.

```typescript
{
  history: Array<{ role: string; parts: MessagePart[] }>;
  messageParts: MessagePart[];
  chatSessionId: string | number | null;
  model: string;
  isSearchActive?: boolean;
  thinkingBudget?: number;
  isRegeneration?: boolean;
  systemPrompt?: string;
  projectId?: number | null;
  verbosity?: "low" | "medium" | "high";
}
```

**Fields:**
- `history` - Array of previous messages with roles ("user" or "model")
- `messageParts` - Parts of the new message to send
- `chatSessionId` - ID of the chat session (optional for new chats)
- `model` - Model identifier from `/api/models/list` (e.g., "gemini-2.5-pro", "gpt-5.2-2025-12-11", "claude-opus-4-6")
- `isSearchActive` - Enable Google Search integration (default: false)
- `thinkingBudget` - Reasoning budget for supported models.
    - **Gemini 2.5 Pro**: 2048 to 32768 tokens (0 is not allowed).
    - **Gemini 2.5 Flash**: 0 (off) or 2048 to 24576 tokens.
    - **Gemini 3.1 Pro/Flash**: Currently uses defaults (budget control coming soon).
    - **OpenAI**: Mapped levels: `0` (none), `1` (low), `2` (medium), `3` (high), `4` (xhigh).
    - **Anthropic**: Mapped levels: `1` (low), `2` (medium), `3` (high).
- `isRegeneration` - Flag to indicate if the message is a regeneration (default: false)
- `systemPrompt` - Override system prompt for this request
- `projectId` - Associate with a specific project
- `verbosity` - Output verbosity level: `"low"`, `"medium"`, or `"high"` (default: `"medium"`)

### Streaming Response Format

The `/api/chat` endpoint returns a streaming response with newline-delimited JSON:

```json
{"type": "text", "value": "Hello, how can I help you?"}
{"type": "thought", "value": "I need to understand the user's question..."}
{"type": "grounding", "sources": [{"title": "Source", "uri": "https://example.com"}]}
{"type": "error", "value": "An error occurred"}
{"type": "warning", "value": "File could not be processed"}
```

**Event Types:**
- `text` - Regular text content
- `thought` - Reasoning thoughts (for models with thinking)
- `grounding` - Search sources (when `isSearchActive` is `true`). Includes `sources` array of `{ title: string; uri: string }`.
- `error` - Error messages
- `warning` - Warning messages

---

## Error Codes

| Code | Description |
|------|-------------|
| 200 | Success |
| 400 | Bad Request - Invalid parameters |
| 401 | Unauthorized - Missing or invalid authentication |
| 404 | Not Found - Resource does not exist |
| 409 | Conflict - Resource already exists (e.g., duplicate email) |
| 429 | Too Many Requests - Rate limit exceeded |
| 500 | Internal Server Error |

Standard error response format:

```json
{
  "error": "Error message",
  "details": "Additional error details"
}
```

---

## Authentication Endpoints

### Sign Up

Register a new user account.

**Endpoint:** `POST /api/auth/signup`

**Authentication Required:** No

**Request Body:**

```json
{
  "email": "user@example.com",
  "password": "password123"
}
```

**Response (200 OK):**

```json
{
  "message": "Account created and logged in successfully",
  "user": {
    "id": 1,
    "email": "user@example.com"
  },
  "token": "jwt_token_here"
}
```

**Errors:**
- `400` - Invalid email format or password too short (minimum 8 characters)
- `409` - User with this email already exists

---

### Login

Authenticate with email and password.

**Endpoint:** `POST /api/auth/login`

**Authentication Required:** No

**Rate Limiting:** 5 attempts per 20 minutes per IP/username

**Request Body:**

```json
{
  "email": "user@example.com",
  "password": "password123"
}
```

**Response (200 OK):**

```json
{
  "message": "Login successful",
  "user": {
    "id": 1,
    "email": "user@example.com"
  },
  "token": "jwt_token_here"
}
```

**Errors:**
- `400` - Email or password missing
- `401` - Invalid credentials
- `429` - Too many login attempts

---

### Logout

Log out the current user.

**Endpoint:** `POST /api/auth/logout`

**Authentication Required:** No (clears cookie)

**Response (200 OK):**

```json
{
  "message": "Logout successful"
}
```

---

## Chat Management Endpoints

### Send Chat Message (Streaming)

Send a message and receive a streaming response from the AI.

**Endpoint:** `POST /api/chat`

**Authentication Required:** Yes (`x-user-id` header)

**Max Duration:** 600 seconds

**Request Body:** See [Chat Request](#chat-request)

**Response:** Streaming JSONL (newline-delimited JSON)

**Example Request:**

```bash
curl -X POST https://your-domain.com/api/chat \
  -H "Content-Type: application/json" \
  -H "x-user-id: 1" \
  -d '{
    "messageParts": [{"type": "text", "text": "Hello!"}],
    "chatSessionId": "123",
    "model": "gemini-2.5-pro",
    "isSearchActive": false
  }'
```

**Supported File Types by Model:**

**Gemini:** PDF, PNG, JPEG, WEBP, HEIC, HEIF, text files, source code (mapped to `text/plain`), HTML, CSS, JS, Markdown, CSV, XML, RTF
**OpenAI:** PNG, JPEG, WEBP, GIF, PDF (sent via `input_file` for GPT-5 family), text files, source code, JSON
**Anthropic:** JPEG, PNG, GIF, WEBP, PDF, text files, source code, JSON

---

### List Chat Sessions

Get all chat sessions for the authenticated user, ordered by last update time (newest first).

**Endpoint:** `GET /api/chats`

**Authentication Required:** Yes (`x-user-id` header)

**Response (200 OK):**

```json
[
  {
    "id": 1,
    "title": "Chat about coding",
    "lastModel": "gemini-2.5-pro",
    "systemPrompt": "You are a helpful assistant.",
    "keySelection": "your-api-key-alias",
    "projectId": null,
    "updatedAt": "2024-01-15T10:30:00.000Z",
    "thinkingBudget": 1000
  }
]
```

---

### Delete All Global Chat Sessions

Delete all global chat sessions (not associated with projects) and their associated files.

**Endpoint:** `DELETE /api/chats`

**Authentication Required:** Yes (`x-user-id` header)

**Response (200 OK):**

```json
{
  "ok": true,
  "message": "All global chat sessions and associated files deleted for user."
}
```

---

### Get Chat Session Details

Get details and messages for a specific chat session.

**Endpoint:** `GET /api/chats/{chatSessionId}`

**Authentication Required:** Yes (`x-user-id` header)

**Path Parameters:**
- `chatSessionId` - ID of the chat session

**Response (200 OK):**

```json
{
  "id": 1,
  "title": "Chat about coding",
  "lastModel": "gemini-2.5-pro",
  "systemPrompt": "You are a helpful assistant.",
  "projectId": null,
  "updatedAt": "2024-01-15T10:30:00.000Z",
  "thinkingBudget": 1000,
  "messages": [
    {
      "id": 1,
      "position": 1,
      "role": "user",
      "parts": [{"type": "text", "text": "Hello!"}],
      "sources": [],
      "thoughtSummary": null
    }
  ]
}
```

---

### Update Chat Session

Update properties of a chat session.

**Endpoint:** `PATCH /api/chats/{chatSessionId}`

**Authentication Required:** Yes (`x-user-id` header)

**Path Parameters:**
- `chatSessionId` - ID of the chat session

**Request Body:**

```json
{
  "title": "Updated title",
  "lastModel": "gemini-2.5-flash",
  "systemPrompt": "New system prompt",
  "projectId": null,
  "thinkingBudget": 500
}
```

**Response (200 OK):**

```json
{
  "id": 1,
  "title": "Updated title",
  "lastModel": "gemini-2.5-flash",
  "systemPrompt": "New system prompt",
  "projectId": null,
  "thinkingBudget": 500
}
```

---

### Delete Chat Session

Delete a specific chat session and its associated files.

**Endpoint:** `DELETE /api/chats/{chatSessionId}`

**Authentication Required:** Yes (`x-user-id` header)

**Path Parameters:**
- `chatSessionId` - ID of the chat session

**Response (200 OK):**

```json
{
  "ok": true,
  "message": "Chat session and associated files (if any) deleted."
}
```

---

### Duplicate Chat Session

Create a copy of an existing chat session.

**Endpoint:** `POST /api/chats/duplicate`

**Authentication Required:** Yes (`x-user-id` header)

**Request Body:**

```json
{
  "chatId": 1
}
```

**Response (200 OK):**

```json
{
  "id": 2,
  "title": "Chat about coding (copy)",
  "lastModel": "gemini-2.5-pro",
  "systemPrompt": "You are a helpful assistant.",
  "projectId": 1,
  "thinkingBudget": 1000
}
```

---

### Persist Conversation Turn

Save a user message and model response as a conversation turn.

**Endpoint:** `POST /api/chats/persist-turn`

**Authentication Required:** Yes (`x-user-id` header)

**Request Body:**

```json
{
  "chatSessionId": 1,
  "userMessageParts": [{"type": "text", "text": "Hello!"}],
  "modelMessageParts": [{"type": "text", "text": "Hi there!"}],
  "modelThoughtSummary": "The user greeted me.",
  "modelSources": [{"title": "Example Source", "uri": "https://example.com"}],
  "modelName": "gemini-2.5-pro",
  "projectId": null,
  "thinkingBudget": 1000,
  "systemPrompt": "You are helpful."
}
```

**Response (200 OK):**

```json
{
  "newChatId": 1,
  "userMessage": {
    "id": 1,
    "position": 1,
    "role": "user",
    "parts": [{"type": "text", "text": "Hello!"}],
    "sources": [],
    "thoughtSummary": null
  },
  "modelMessage": {
    "id": 2,
    "position": 2,
    "role": "model",
    "parts": [{"type": "text", "text": "Hi there!"}],
    "sources": [],
    "thoughtSummary": "The user greeted me."
  }
}
```

---

### Persist User Message

Save only a user message (for streaming implementations).

**Endpoint:** `POST /api/chats/persist-user-message`

**Authentication Required:** Yes (`x-user-id` header)

**Request Body:**

```json
{
  "chatSessionId": 1,
  "userMessageParts": [{"type": "text", "text": "Hello!"}],
  "modelName": "gemini-2.5-pro",
  "projectId": null,
  "thinkingBudget": 1000,
  "systemPrompt": "You are helpful."
}
```

**Response (200 OK):**

```json
{
  "newChatId": 1,
  "userMessage": {
    "id": 1,
    "position": 1,
    "role": "user",
    "parts": [{"type": "text", "text": "Hello!"}],
    "sources": [],
    "thoughtSummary": null
  }
}
```

---

### Update Message

Update a specific message in a chat session.

**Endpoint:** `PATCH /api/chats/{chatSessionId}/messages`

**Authentication Required:** Yes (`x-user-id` header)

**Path Parameters:**
- `chatSessionId` - ID of the chat session

**Request Body:**

```json
{
  "messageId": 1,
  "newParts": [
    {"type": "text", "text": "Updated text!"},
    {"type": "file", "fileName": "image.png", "objectName": "abc123", "mimeType": "image/png"}
  ]
}
```

**Response (200 OK):**

```json
{
  "ok": true
}
```

---

### Delete Messages

Delete messages from a specific position onward.

**Endpoint:** `DELETE /api/chats/{chatSessionId}/messages?fromPosition=3`

**Authentication Required:** Yes (`x-user-id` header)

**Path Parameters:**
- `chatSessionId` - ID of the chat session

**Query Parameters:**
- `fromPosition` - Starting position from which to delete (required)

**Response (200 OK):**

```json
{
  "ok": true,
  "message": "Messages from position 3 deleted."
}
```

---

### Append Model Message

Append a model response message to an existing chat session (for streaming implementations).

**Endpoint:** `POST /api/chats/{chatSessionId}/append-model-message`

**Authentication Required:** Yes (`x-user-id` header)

**Path Parameters:**
- `chatSessionId` - ID of the chat session

**Request Body:**

```json
{
  "modelMessageParts": [{"type": "text", "text": "Hi there!"}],
  "modelThoughtSummary": "The user greeted me.",
  "modelSources": []
}
```

**Response (200 OK):**

```json
{
  "success": true
}
```

**Errors:**
- `400` - Cannot save an empty model message
- `401` - Chat session not found or not owned by user

---

## Project Management Endpoints

### List Projects

Get all projects for the authenticated user, ordered by title (alphabetical).

**Endpoint:** `GET /api/projects`

**Authentication Required:** Yes (`x-user-id` header)

**Response (200 OK):**

```json
[
  {
    "id": 1,
    "title": "My Project",
    "systemPrompt": "You are a coding assistant.",
    "createdAt": "2024-01-15T10:30:00.000Z",
    "updatedAt": "2024-01-15T10:30:00.000Z"
  }
]
```

---

### Create Project

Create a new project.

**Endpoint:** `POST /api/projects`

**Authentication Required:** Yes (`x-user-id` header)

**Request Body:**

```json
{
  "title": "My New Project"
}
```

**Response (200 OK):**

```json
{
  "id": 1,
  "title": "My New Project",
  "systemPrompt": "",
  "createdAt": "2024-01-15T10:30:00.000Z",
  "updatedAt": "2024-01-15T10:30:00.000Z"
}
```

---

### Get Project Details

Get details of a specific project.

**Endpoint:** `GET /api/projects/{projectId}`

**Authentication Required:** Yes (`x-user-id` header)

**Path Parameters:**
- `projectId` - ID of the project

**Response (200 OK):**

```json
{
  "id": 1,
  "title": "My Project",
  "systemPrompt": "You are a coding assistant.",
  "createdAt": "2024-01-15T10:30:00.000Z",
  "updatedAt": "2024-01-15T10:30:00.000Z",
  "files": [
    {
      "id": 1,
      "objectName": "abc123_file.txt",
      "fileName": "file.txt",
      "mimeType": "text/plain",
      "size": 1024
    }
  ]
}
```

---

### Update Project

Update project properties.

**Endpoint:** `PATCH /api/projects/{projectId}`

**Authentication Required:** Yes (`x-user-id` header)

**Path Parameters:**
- `projectId` - ID of the project

**Request Body:**

```json
{
  "title": "Updated Project Title",
  "systemPrompt": "You are an advanced coding assistant."
}
```

**Response (200 OK):**

```json
{
  "id": 1,
  "title": "Updated Project Title",
  "systemPrompt": "You are an advanced coding assistant.",
  "createdAt": "2024-01-15T10:30:00.000Z",
  "updatedAt": "2024-01-15T11:00:00.000Z"
}
```

---

### Delete Project

Delete a project and its associated files.

**Endpoint:** `DELETE /api/projects/{projectId}`

**Authentication Required:** Yes (`x-user-id` header)

**Path Parameters:**
- `projectId` - ID of the project

**Response (200 OK):**

```json
{
  "ok": true,
  "message": "Project, its chats, and associated files (if any) deleted."
}
```

---

### List Project Files

Get all files associated with a project.

**Endpoint:** `GET /api/projects/{projectId}/files`

**Authentication Required:** Yes (`x-user-id` header)

**Path Parameters:**
- `projectId` - ID of the project

**Response (200 OK):**

```json
[
  {
    "id": 1,
    "objectName": "abc123_file.txt",
    "fileName": "file.txt",
    "mimeType": "text/plain",
    "size": 1024
  }
]
```

---

### Upload File to Project

Upload a file to a specific project.

**Endpoint:** `POST /api/projects/{projectId}/files`

**Authentication Required:** Yes (`Authorization: Bearer <token>` or `__session` cookie)

**Path Parameters:**
- `projectId` - ID of the project

**Request Body (multipart/form-data):**

```
file: <binary file data>
```

**Response (200 OK):**

```json
{
  "type": "file",
  "success": true,
  "message": "File uploaded and associated with project successfully",
  "projectFileId": 1,
  "objectName": "abc123_file.txt",
  "fileName": "file.txt",
  "mimeType": "text/plain",
  "size": 1024,
  "isProjectFile": true
}
```

---

### Delete Project File

Delete a specific file from a project.

**Endpoint:** `DELETE /api/projects/{projectId}/files/{fileId}`

**Authentication Required:** Yes (`x-user-id` header)

**Path Parameters:**
- `projectId` - ID of the project
- `fileId` - ID of the file

**Response (200 OK):**

```json
{
  "ok": true,
  "message": "Project file and associated object deleted successfully."
}
```

---

## File Management Endpoints

### Upload File

Upload a file to MinIO storage.

**Endpoint:** `POST /api/files/upload`

**Authentication Required:** Yes (`Authorization: Bearer <token>` or `__session` cookie)

**Request Body (multipart/form-data):**

```
file: <binary file data>
```

**Response (200 OK):**

```json
{
  "type": "file",
  "success": true,
  "message": "File uploaded successfully",
  "fileName": "original_file.png",
  "mimeType": "image/png",
  "objectName": "abc123_original_file.png",
  "size": 1024
}
```

Use the `objectName` to reference the file in chat messages.

---

### Get File

Retrieve an uploaded file from MinIO storage.

**Endpoint:** `GET /api/files/{...objectKey}`

**Authentication Required:** Yes (`x-user-id` header)

**Path Parameters:**
- `objectKey` - Path components of the object key (e.g., `abc123/file.txt`)

**Response (200 OK):**
Binary file content with appropriate Content-Type header.

---

## AI & Utility Endpoints

### List Models

Get available AI models from Google Gemini.

**Endpoint:** `GET /api/models`

**Authentication Required:** Yes (`x-user-id` header)

**Response (200 OK):**

```json
[
  {
    "name": "models/gemini-2.5-pro",
    "displayName": "Gemini 2.5 Pro",
    "description": "High-performance model",
    "inputTokenLimit": 1000000,
    "outputTokenLimit": 8000
  }
]
```

---

### List Custom Models

Get configured custom models (hardcoded Gemini, OpenAI, Anthropic entries).

**Endpoint:** `GET /api/models/list`

**Authentication Required:** Yes (`x-user-id` header)

**Response (200 OK):**

```json
{
  "models": [
    {
      "displayName": "Gemini 2.5 Pro",
      "modelId": "gemini-2.5-pro",
      "inputTokenLimit": 1048576,
      "outputTokenLimit": 65536,
      "provider": "gemini",
      "supportsReasoning": true,
      "supportsVerbosity": false
    }
  ],
  "count": 1
}
```

**Fields:**
- `modelId` - Model identifier used in chat requests (prefixed with `custom:` for custom models)
- `displayName` - Human-readable model name
- `provider` - Provider type: `"gemini"`, `"openai"`, `"anthropic"`, or `"custom-openai"`
- `inputTokenLimit` - Maximum input tokens supported
- `outputTokenLimit` - Maximum output tokens supported
- `supportsReasoning` - Whether the model supports a reasoning budget (Optional)
- `supportsVerbosity` - Whether the model supports verbosity control (Optional)

---

### List User's Custom Models

Fetch models from the user's configured custom OpenAI-compatible endpoint.

**Endpoint:** `GET /api/models/custom`

**Authentication Required:** Yes (`x-user-id` header)

**Response (200 OK):**

```json
{
  "models": [
    {
      "id": "llama-3.1-70b",
      "object": "model",
      "owned_by": "local"
    }
  ],
  "endpoint": "https://your-custom-endpoint.com/v1/"
}
```

**Errors:**
- Returns `{ "models": [], "error": "..." }` with status 200 if endpoint not configured or connection failed (to not break UI)

---

### Test Custom Model Endpoint

Test connection to a custom OpenAI-compatible endpoint without saving.

**Endpoint:** `POST /api/models/custom`

**Authentication Required:** Yes (`x-user-id` header)

**Request Body:**

```json
{
  "endpoint": "https://your-custom-endpoint.com/v1/",
  "apiKey": "your-api-key"
}
```

**Response (200 OK):**

```json
{
  "success": true,
  "models": [
    {
      "id": "llama-3.1-70b",
      "object": "model",
      "owned_by": "local"
    }
  ],
  "endpoint": "https://your-custom-endpoint.com/v1/",
  "count": 1
}
```

**Errors:**
- `400` - Invalid URL format or connection failed
- `408` - Connection timed out

---

### Health Check

Check if the API is running and the database is accessible.

**Endpoint:** `GET /api/ping`

**Authentication Required:** No

**Response (200 OK):**

```json
{
  "now": "2024-01-15T10:30:00.000Z"
}
```

---

### Search Chats

Search through chat sessions using full-text search with fuzzy matching.

**Endpoint:** `GET /api/search`

**Authentication Required:** Yes (`x-user-id` header)

**Query Parameters:**
- `q` - Search query

**Response (200 OK):**

```json
{
  "results": [
    {
      "chatId": 1,
      "chatTitle": "Chat about coding",
      "projectId": null,
      "projectTitle": null,
      "updatedAt": "2024-01-15T10:30:00.000Z",
      "headline": "Here's a <mark>match</mark> from the conversation...",
      "rank": 1.5
    }
  ]
}
```

---

### Get User Info

Get current user information.

**Endpoint:** `GET /api/user`

**Authentication Required:** Yes (`x-user-id` header)

**Request Headers:**
- `x-user-id` - User ID (Required)
- `x-user-email` - User email (Optional, returned in response if provided)

**Response (200 OK):**

```json
{
  "id": 1,
  "email": "user@example.com"
}
```

---

### Get User Settings

Get user settings including system prompt, TTS configuration, and custom provider settings.

**Endpoint:** `GET /api/settings`

**Authentication Required:** Yes (`x-user-id` header)

**Response (200 OK):**

```json
{
  "system_prompt": "You are a helpful assistant.",
  "tts_voice": "Sulafat",
  "tts_model": "gemini-2.5-flash-preview-tts",
  "custom_openai_endpoint": "https://your-endpoint.com/v1/",
  "custom_openai_key_set": true
}
```

**Fields:**
- `custom_openai_endpoint` - Configured custom OpenAI-compatible endpoint URL (null if not set)
- `custom_openai_key_set` - Whether an API key is configured (actual key never exposed)

---

### Update User Settings

Update user settings including custom provider configuration.

**Endpoint:** `POST /api/settings`

**Authentication Required:** Yes (`x-user-id` header)

**Request Body:**

```json
{
  "systemPrompt": "You are a coding assistant.",
  "ttsVoice": "Sulafat",
  "ttsModel": "gemini-2.5-flash-preview-tts",
  "customOpenaiEndpoint": "https://your-endpoint.com/v1/",
  "customOpenaiKey": "your-api-key"
}
```

**Fields:**
- `systemPrompt` - Default system prompt (optional)
- `ttsVoice` - TTS voice name (optional)
- `ttsModel` - TTS model identifier (optional)
- `customOpenaiEndpoint` - Custom OpenAI-compatible endpoint URL, set to null to clear (optional)
- `customOpenaiKey` - API key for custom endpoint, set to null to clear (optional, only updated if provided)

**Response (200 OK):**

```json
{
  "message": "Settings updated successfully",
  "system_prompt": "You are a coding assistant.",
  "tts_voice": "Sulafat",
  "tts_model": "gemini-2.5-flash-preview-tts",
  "custom_openai_endpoint": "https://your-endpoint.com/v1/",
  "updated_at": "2024-01-15T11:00:00.000Z"
}
```

---

### Count Tokens

Count tokens for a chat request (supports Gemini, OpenAI, Anthropic).

**Endpoint:** `POST /api/count-tokens`

**Authentication Required:** Yes (`x-user-id` header)

**Request Body:**

```json
{
  "history": [
    {
      "role": "user",
      "parts": [{"type": "text", "text": "Hello!"}]
    }
  ],
  "model": "gemini-2.5-pro",
  "chatSessionId": 1
}
```

**Response (200 OK):**

```json
{
  "totalTokens": 1250
}
```

---

### Generate System Prompt

Generate a system prompt from user input using AI (streaming response).

**Endpoint:** `POST /api/generate-system-prompt`

**Authentication Required:** Yes (`x-user-id` header)

**Request Body:**

```json
{
  "prompt": "I need help with Python data analysis",
  "model": "gemini-2.5-pro"
}
```

**Response:** Streaming JSONL

```json
{"type": "text", "value": "<chat_system_prompt>..."}
```

Supports all providers: Gemini, OpenAI, Anthropic, and custom-openai.

---

### Refine Prompt

Refine a user prompt for clarity and precision (streaming response).

**Endpoint:** `POST /api/refine-prompt`

**Authentication Required:** Yes (`x-user-id` header)

**Request Body:**

```json
{
  "prompt": "help me write code",
  "model": "gemini-2.5-pro"
}
```

**Response:** Streaming JSONL

```json
{"type": "text", "value": "Refined prompt content..."}
```

Supports Gemini and OpenAI providers. Other providers will fall back to Gemini.

---

### List Prompt Suggestions

Get user's custom prompt suggestions.

**Endpoint:** `GET /api/suggestions`

**Authentication Required:** Yes (`x-user-id` header)

**Response (200 OK):**

```json
[
  {
    "id": 1,
    "title": "Explain Code",
    "prompt": "Explain this code in simple terms",
    "icon": "SparklesIcon",
    "sort_order": 0
  }
]
```

---

### Create Prompt Suggestion

Create a new prompt suggestion.

**Endpoint:** `POST /api/suggestions`

**Authentication Required:** Yes (`x-user-id` header)

**Request Body:**

```json
{
  "title": "Explain Code",
  "prompt": "Explain this code in simple terms",
  "icon": "SparklesIcon"
}
```

**Response (201 Created):**

```json
{
  "id": 1,
  "title": "Explain Code",
  "prompt": "Explain this code in simple terms",
  "icon": "SparklesIcon",
  "sort_order": 0
}
```

---

### Reorder Prompt Suggestions

Update the display order of prompt suggestions.

**Endpoint:** `PATCH /api/suggestions`

**Authentication Required:** Yes (`x-user-id` header)

**Request Body:**

```json
{
  "orderedIds": [3, 1, 2]
}
```

**Response (200 OK):**

```json
{
  "message": "Order updated successfully"
}
```

---

### Delete Prompt Suggestion

Delete a prompt suggestion.

**Endpoint:** `DELETE /api/suggestions`

**Authentication Required:** Yes (`x-user-id` header)

**Request Body:**

```json
{
  "id": 1
}
```

**Response (200 OK):**

```json
{
  "message": "Suggestion deleted successfully"
}
```

**Errors:**
- `404` - Suggestion not found or not owned by user

---

### Generate Chat Title

Generate a short title for a chat based on user message.

**Endpoint:** `POST /api/generate-chat-title`

**Authentication Required:** Yes (`x-user-id` header)

**Request Body:**

```json
{
  "userMessageContent": "How do I implement a binary search tree in Python?"
}
```

**Response (200 OK):**

```json
{
  "title": "Binary Search Tree Implementation"
}
```

---

### Text-to-Speech

Convert text to speech using Gemini TTS.

**Endpoint:** `POST /api/tts`

**Authentication Required:** Yes (`x-user-id` header)

**Request Body:**

```json
{
  "text": "Hello, how can I help you?",
  "voice": "Sulafat",
  "model": "gemini-2.5-flash-preview-tts"
}
```

**Response (200 OK):**

```json
{
  "audioContent": "base64_encoded_audio_data_here"
}
```

**Available Voices:** Depends on the TTS model configuration. Common voices include "Sulafat", "Charon", etc.

---

### Speech-to-Text

Transcribe audio to text using the STT service.

**Endpoint:** `POST /api/stt/transcribe`

**Authentication Required:** Yes (`Authorization: Bearer <token>` or `__session` cookie)

**Request Body (multipart/form-data):**

```
audio_file: <binary audio data>
```

**Response (200 OK):**
Plain text transcription.

---

### Generate Live Streaming Token

Generate an ephemeral token for live streaming features.

**Endpoint:** `POST /api/live/token`

**Authentication Required:** Yes (`x-user-id` header)

**Response (200 OK):**

```json
{
  "token": "ephemeral_token_here"
}
```

---

## Code Examples

### Complete Flow: Login, Create Chat, Send Message

```javascript
// 1. Login
const loginResponse = await fetch('https://your-domain.com/api/auth/login', {
  method: 'POST',
  headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify({
    email: 'user@example.com',
    password: 'password123'
  })
});
const loginData = await loginResponse.json();
const userId = loginData.user.id;

// 2. Send a chat message
const chatResponse = await fetch('https://your-domain.com/api/chat', {
  method: 'POST',
  headers: {
    'Content-Type': 'application/json',
    'x-user-id': userId
  },
  body: JSON.stringify({
    messageParts: [{ type: 'text', text: 'Hello!' }],
    chatSessionId: null, // New chat
    model: 'gemini-2.5-pro'
  })
});

// 3. Handle streaming response
const reader = chatResponse.body.getReader();
const decoder = new TextDecoder();

while (true) {
  const { done, value } = await reader.read();
  if (done) break;

  const chunk = decoder.decode(value);
  const lines = chunk.split('\n');

  for (const line of lines) {
    if (line.trim()) {
      const data = JSON.parse(line);
      switch (data.type) {
        case 'text':
          console.log('Text:', data.value);
          break;
        case 'thought':
          console.log('Thought:', data.value);
          break;
        case 'error':
          console.error('Error:', data.value);
          break;
      }
    }
  }
}
```

### Upload File and Send with Message

```javascript
// 1. Upload file
const formData = new FormData();
formData.append('file', fileObject);

const uploadResponse = await fetch('https://your-domain.com/api/files/upload', {
  method: 'POST',
  headers: { 'Cookie': `__session=${token}` },
  body: formData
});
const uploadData = await uploadResponse.json();
const objectName = uploadData.objectName;

// 2. Send message with file
const chatResponse = await fetch('https://your-domain.com/api/chat', {
  method: 'POST',
  headers: {
    'Content-Type': 'application/json',
    'x-user-id': userId
  },
  body: JSON.stringify({
    messageParts: [
      { type: 'text', text: 'What do you see in this image?' },
      {
        type: 'file',
        fileName: uploadData.fileName,
        objectName: objectName,
        mimeType: uploadData.mimeType
      }
    ],
    chatSessionId: null,
    model: 'gemini-2.5-pro'
  })
});
```

---

## Notes

- IDs returned as numbers from authentication and data endpoints, but accepted as strings or numbers in requests.
- File uploads require multipart/form-data with token authentication
- Streaming endpoints return JSONL (JSON Lines) format
- System prompts cascade: chat level > project level > user level
