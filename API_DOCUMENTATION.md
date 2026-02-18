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

1. **Sign Up or Login**: Call `/api/auth/signup` or `/api/auth/login` to get your user ID and token
2. **Include Headers**: Add the following header to authenticated requests:

```
x-user-id: <your_user_id>
```

Or include the `__session` cookie with the token received from login/signup.

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
  | { type: "file"; fileName: string; objectName: string; mimeType: string; isProjectFile?: boolean }
  | { type: "scraped_url"; text: string }
```

### Chat Request

Request body for the main chat endpoint.

```typescript
{
  history: Array<{ role: string; parts: MessagePart[] }>;
  messageParts: MessagePart[];
  chatSessionId: string;
  model: string;
  isSearchActive?: boolean;
  thinkingBudget?: number;
  systemPrompt?: string;
  projectId?: number | null;
  verbosity?: "low" | "medium" | "high";
}
```

**Fields:**
- `history` - Array of previous messages with roles ("user" or "model")
- `messageParts` - Parts of the new message to send
- `chatSessionId` - ID of the chat session (optional for new chats)
- `model` - Model identifier (e.g., "gemini-2.5-pro", "gpt-4o", "claude-3-5-sonnet")
- `isSearchActive` - Enable Google Search integration (default: false)
- `thinkingBudget` - Reasoning budget for supported models (0-1000000)
- `systemPrompt` - Override system prompt for this request
- `projectId` - Associate with a specific project
- `verbosity` - Output verbosity level (default: "medium")

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
- `grounding` - Search sources (when isSearchActive is true)
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
    "id": "1",
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
    "id": "1",
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

**Gemini:** PDF, PNG, JPEG, WEBP, HEIC, HEIF, text files, source code
**OpenAI:** PNG, JPEG, WEBP, GIF, PDF, text files, source code
**Anthropic:** JPEG, PNG, GIF, WEBP, PDF, text files, source code

---

### List Chat Sessions

Get all chat sessions for the authenticated user.

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
  "modelSources": [],
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

### Get Chat Messages

Get all messages for a specific chat session.

**Endpoint:** `GET /api/chats/{chatSessionId}/messages`

**Authentication Required:** Yes (`x-user-id` header)

**Path Parameters:**
- `chatSessionId` - ID of the chat session

**Response (200 OK):**

```json
[
  {
    "id": 1,
    "position": 1,
    "role": "user",
    "parts": [{"type": "text", "text": "Hello!"}],
    "sources": [],
    "thoughtSummary": null
  },
  {
    "id": 2,
    "position": 2,
    "role": "model",
    "parts": [{"type": "text", "text": "Hi there!"}],
    "sources": [],
    "thoughtSummary": null
  }
]
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

## Project Management Endpoints

### List Projects

Get all projects for the authenticated user.

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
  "message": "Project deleted successfully."
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

**Authentication Required:** Yes (`x-user-id` header, token for multipart)

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

### Get Project File

Get a specific file from a project.

**Endpoint:** `GET /api/projects/{projectId}/files/{fileId}`

**Authentication Required:** Yes (`x-user-id` header)

**Path Parameters:**
- `projectId` - ID of the project
- `fileId` - ID of the file

**Response (200 OK):**
Binary file content with appropriate Content-Type header.

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

**Authentication Required:** Yes (`__session` cookie/token for multipart)

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

**Authentication Required:** No

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

**Endpoint:** `POST /api/search`

**Authentication Required:** Yes (`x-user-id` header)

**Request Body:**

```json
{
  "q": "search query"
}
```

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
- `x-user-id` - User ID
- `x-user-email` - User email (optional)

**Response (200 OK):**

```json
{
  "id": "1",
  "email": "user@example.com"
}
```

---

### Get User Settings

Get user settings including system prompt and TTS configuration.

**Endpoint:** `GET /api/settings`

**Authentication Required:** Yes (`x-user-id` header)

**Response (200 OK):**

```json
{
  "system_prompt": "You are a helpful assistant.",
  "tts_voice": "Sulafat",
  "tts_model": "gemini-2.5-flash-preview-tts"
}
```

---

### Update User Settings

Update user settings.

**Endpoint:** `POST /api/settings`

**Authentication Required:** Yes (`x-user-id` header)

**Request Body:**

```json
{
  "systemPrompt": "You are a coding assistant.",
  "ttsVoice": "Sulafat",
  "ttsModel": "gemini-2.5-flash-preview-tts"
}
```

**Response (200 OK):**

```json
{
  "message": "Settings updated successfully",
  "system_prompt": "You are a coding assistant.",
  "tts_voice": "Sulafat",
  "tts_model": "gemini-2.5-flash-preview-tts",
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

**Authentication Required:** Yes (`__session` cookie/token for multipart)

**Request Body (multipart/form-data):**

```
audio_file: <binary audio data>
```

**Response (200 OK):**
Plain text transcription.

---

### Generate Live Streaming Token

Generate an ephemeral token for live streaming features.

**Endpoint:** `GET /api/live/token`

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

- All datetimes are in ISO 8601 format
- File uploads require multipart/form-data with token authentication
- Streaming endpoints return JSONL (JSON Lines) format
- IDs returned as strings from authentication endpoints, numbers elsewhere
- System prompts cascade: chat level > project level > user level
