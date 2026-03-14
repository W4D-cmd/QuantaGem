# Token Counting During Streaming Responses

This guide explains how to extract input and output token counts when streaming responses from three major AI SDKs: Anthropic, Google Gemini, and OpenAI.

## Table of Contents

1. [Anthropic SDK](#1-anthropic-sdk)
2. [Google Gemini SDK](#2-google-gemini-sdk)
3. [OpenAI SDK](#3-openai-sdk)
4. [Quick Reference](#quick-reference)

---

## 1. Anthropic SDK

### Installation

```bash
npm install @anthropic-ai/sdk
```

### Import

```typescript
import Anthropic from '@anthropic-ai/sdk';
```

### Client Initialization

```typescript
const client = new Anthropic({
  apiKey: process.env.ANTHROPIC_API_KEY, // Optional, defaults to ANTHROPIC_API_KEY env var
});
```

### Streaming Methods

The Anthropic SDK provides two ways to stream:

#### Method A: `client.messages.stream()` (Recommended)

This method returns a `MessageStream` object that provides convenient methods for handling the stream.

```typescript
const stream = client.messages.stream({
  model: 'claude-sonnet-4-20250514',
  max_tokens: 1024,
  messages: [{ role: 'user', content: 'Your prompt here' }],
});
```

#### Method B: `client.messages.create({ stream: true })`

This method returns an async iterable of events.

```typescript
const stream = client.messages.create({
  model: 'claude-sonnet-4-20250514',
  max_tokens: 1024,
  messages: [{ role: 'user', content: 'Your prompt here' }],
  stream: true,
});
```

### Getting Token Counts

#### Using `stream.finalMessage()` (Recommended)

The `finalMessage()` method waits for the stream to complete and returns the full message object, which includes the `usage` field.

```typescript
async function anthropicStreamWithUsage() {
  const stream = client.messages.stream({
    model: 'claude-sonnet-4-20250514',
    max_tokens: 1024,
    messages: [{ role: 'user', content: 'Explain quantum computing' }],
  });

  // Process text as it arrives
  stream.on('text', (text) => {
    process.stdout.write(text);
  });

  // Get the final message with usage data
  const finalMessage = await stream.finalMessage();

  console.log('\n--- Token Usage ---');
  console.log('Input tokens:', finalMessage.usage.input_tokens);
  console.log('Output tokens:', finalMessage.usage.output_tokens);
  console.log('Cache creation tokens:', finalMessage.usage.cache_creation_input_tokens);
  console.log('Cache read tokens:', finalMessage.usage.cache_read_input_tokens);

  return finalMessage.usage;
}
```

#### Using Event Listeners

For real-time usage updates during streaming:

```typescript
async function anthropicStreamWithEvents() {
  const stream = client.messages.stream({
    model: 'claude-sonnet-4-20250514',
    max_tokens: 1024,
    messages: [{ role: 'user', content: 'Hello!' }],
  });

  // Initial usage (input tokens only at this point)
  stream.on('message_start', (event) => {
    console.log('Input tokens:', event.message.usage.input_tokens);
  });

  // Updated usage as output is generated
  stream.on('message_delta', (event) => {
    if (event.usage) {
      console.log('Output tokens so far:', event.usage.output_tokens);
    }
  });

  // Process text
  stream.on('text', (text) => {
    process.stdout.write(text);
  });

  await stream.done();
}
```

### Usage Type Definition

```typescript
interface Usage {
  input_tokens: number;
  output_tokens: number;
  cache_creation_input_tokens: number | null;
  cache_read_input_tokens: number | null;
}
```

### Integrating into Existing Implementation

If you already have a streaming implementation, you can add token counting by storing the stream reference and calling `finalMessage()`:

```typescript
// Before: Your existing streaming code
async function existingStream(messages: any[]) {
  const stream = client.messages.stream({
    model: 'claude-sonnet-4-20250514',
    max_tokens: 1024,
    messages,
  });

  for await (const event of stream) {
    if (event.type === 'content_block_delta' && event.delta.type === 'text_delta') {
      yield event.delta.text;
    }
  }
}

// After: With token counting
async function streamWithTokenCount(messages: any[]) {
  const stream = client.messages.stream({
    model: 'claude-sonnet-4-20250514',
    max_tokens: 1024,
    messages,
  });

  for await (const event of stream) {
    if (event.type === 'content_block_delta' && event.delta.type === 'text_delta') {
      yield { type: 'text', content: event.delta.text };
    }
  }

  // After streaming completes, get usage
  const finalMessage = await stream.finalMessage();
  yield {
    type: 'usage',
    usage: {
      input_tokens: finalMessage.usage.input_tokens,
      output_tokens: finalMessage.usage.output_tokens,
    },
  };
}
```

---

## 2. Google Gemini SDK

### Installation

```bash
npm install @google/genai
```

### Import

```typescript
import { GoogleGenAI } from '@google/genai';
```

### Client Initialization

#### Using Vertex AI (Recommended for production)

```typescript
const ai = new GoogleGenAI({
  vertexai: true,
  project: 'your-project-id',
  location: 'global',
});
```

#### Using API Key (Developer mode)

```typescript
const ai = new GoogleGenAI({
  apiKey: process.env.GEMINI_API_KEY,
});
```

### Streaming Method

```typescript
const stream = await ai.models.generateContentStream({
  model: 'gemini-2.5-flash',
  contents: [
    {
      role: 'user',
      parts: [{ text: 'Your prompt here' }],
    },
  ],
});
```

### Getting Token Counts

Token usage is available in the `usageMetadata` property of the response chunks. The complete usage data is typically in the final chunk.

```typescript
async function geminiStreamWithUsage() {
  const stream = await ai.models.generateContentStream({
    model: 'gemini-2.5-flash',
    contents: [
      {
        role: 'user',
        parts: [{ text: 'Explain machine learning' }],
      },
    ],
  });

  let usageMetadata = null;

  // Iterate through stream chunks
  for await (const chunk of stream) {
    // Output text as it arrives
    const text = chunk.text;
    if (text) {
      process.stdout.write(text);
    }

    // Store the latest usage metadata (final chunk has complete data)
    if (chunk.usageMetadata) {
      usageMetadata = chunk.usageMetadata;
    }
  }

  if (usageMetadata) {
    console.log('\n--- Token Usage ---');
    console.log('Input tokens:', usageMetadata.promptTokenCount);
    console.log('Output tokens:', usageMetadata.candidatesTokenCount);
    console.log('Total tokens:', usageMetadata.totalTokenCount);
  }

  return usageMetadata;
}
```

### Usage Metadata Type Definition

```typescript
interface GenerateContentResponseUsageMetadata {
  promptTokenCount: number;           // Input tokens
  candidatesTokenCount: number;       // Output tokens
  totalTokenCount: number;            // Total tokens
  cachedContentTokenCount?: number;   // Tokens from cached content
  thoughtsTokenCount?: number;        // Tokens used for thinking/reasoning
  toolUsePromptTokenCount?: number;   // Tokens for tool use prompts
}
```

### Integrating into Existing Implementation

```typescript
// Before: Your existing streaming code
async function* existingStream(prompt: string) {
  const stream = await ai.models.generateContentStream({
    model: 'gemini-2.5-flash',
    contents: [{ role: 'user', parts: [{ text: prompt }] }],
  });

  for await (const chunk of stream) {
    if (chunk.text) {
      yield chunk.text;
    }
  }
}

// After: With token counting
async function* streamWithTokenCount(prompt: string) {
  const stream = await ai.models.generateContentStream({
    model: 'gemini-2.5-flash',
    contents: [{ role: 'user', parts: [{ text: prompt }] }],
  });

  let usageMetadata = null;

  for await (const chunk of stream) {
    if (chunk.text) {
      yield { type: 'text', content: chunk.text };
    }
    if (chunk.usageMetadata) {
      usageMetadata = chunk.usageMetadata;
    }
  }

  // Yield usage at the end
  if (usageMetadata) {
    yield {
      type: 'usage',
      usage: {
        input_tokens: usageMetadata.promptTokenCount,
        output_tokens: usageMetadata.candidatesTokenCount,
        total_tokens: usageMetadata.totalTokenCount,
      },
    };
  }
}
```

### With System Instructions

```typescript
async function geminiStreamWithSystem(prompt: string, systemInstruction: string) {
  const stream = await ai.models.generateContentStream({
    model: 'gemini-2.5-flash',
    contents: [{ role: 'user', parts: [{ text: prompt }] }],
    config: {
      systemInstruction: systemInstruction,
    },
  });

  // ... rest of implementation
}
```

---

## 3. OpenAI SDK

### Installation

```bash
npm install openai
```

### Import

```typescript
import OpenAI from 'openai';
```

### Client Initialization

```typescript
const client = new OpenAI({
  apiKey: process.env.OPENAI_API_KEY, // Optional, defaults to OPENAI_API_KEY env var
});
```

### Streaming Method

**Important:** To receive token usage during streaming, you MUST include `stream_options: { include_usage: true }` in your request. Without this option, the `usage` field will be `null`.

```typescript
const stream = await client.chat.completions.create({
  model: 'gpt-4o',
  messages: [{ role: 'user', content: 'Your prompt here' }],
  stream: true,
  stream_options: { include_usage: true }, // REQUIRED for usage data!
});
```

### Getting Token Counts

Token usage is delivered in the final chunk of the stream. This chunk has an empty `choices` array but contains the `usage` field.

```typescript
async function openaiStreamWithUsage() {
  const stream = await client.chat.completions.create({
    model: 'gpt-4o',
    messages: [{ role: 'user', content: 'Explain neural networks' }],
    stream: true,
    stream_options: { include_usage: true }, // REQUIRED!
  });

  let usage = null;

  for await (const chunk of stream) {
    // Extract and output text content
    const content = chunk.choices[0]?.delta?.content;
    if (content) {
      process.stdout.write(content);
    }

    // Usage comes in the final chunk (when choices array is empty)
    if (chunk.usage) {
      usage = chunk.usage;
    }
  }

  if (usage) {
    console.log('\n--- Token Usage ---');
    console.log('Input tokens:', usage.prompt_tokens);
    console.log('Output tokens:', usage.completion_tokens);
    console.log('Total tokens:', usage.total_tokens);
  }

  return usage;
}
```

### Usage Type Definition

```typescript
interface CompletionUsage {
  prompt_tokens: number;
  completion_tokens: number;
  total_tokens: number;
  prompt_tokens_details?: {
    cached_tokens?: number;
    audio_tokens?: number;
  };
  completion_tokens_details?: {
    reasoning_tokens?: number;
    audio_tokens?: number;
  };
}
```

### Integrating into Existing Implementation

```typescript
// Before: Your existing streaming code
async function* existingStream(messages: any[]) {
  const stream = await client.chat.completions.create({
    model: 'gpt-4o',
    messages,
    stream: true,
  });

  for await (const chunk of stream) {
    const content = chunk.choices[0]?.delta?.content;
    if (content) {
      yield content;
    }
  }
}

// After: With token counting
async function* streamWithTokenCount(messages: any[]) {
  const stream = await client.chat.completions.create({
    model: 'gpt-4o',
    messages,
    stream: true,
    stream_options: { include_usage: true }, // Add this!
  });

  let usage = null;

  for await (const chunk of stream) {
    const content = chunk.choices[0]?.delta?.content;
    if (content) {
      yield { type: 'text', content };
    }

    // Capture usage from final chunk
    if (chunk.usage) {
      usage = chunk.usage;
    }
  }

  // Yield usage at the end
  if (usage) {
    yield {
      type: 'usage',
      usage: {
        input_tokens: usage.prompt_tokens,
        output_tokens: usage.completion_tokens,
        total_tokens: usage.total_tokens,
      },
    };
  }
}
```

### With Reasoning Models (o1, o3, etc.)

For reasoning models, you may also get `reasoning_tokens` in the usage details:

```typescript
if (usage?.completion_tokens_details?.reasoning_tokens) {
  console.log('Reasoning tokens:', usage.completion_tokens_details.reasoning_tokens);
}
```

---

## Quick Reference

### Side-by-Side Comparison

| Aspect | Anthropic | Gemini | OpenAI |
|--------|-----------|--------|--------|
| **Package** | `@anthropic-ai/sdk` | `@google/genai` | `openai` |
| **Streaming Method** | `client.messages.stream()` | `ai.models.generateContentStream()` | `client.chat.completions.create({ stream: true })` |
| **Special Config** | None | None | `stream_options: { include_usage: true }` |
| **Usage Location** | `stream.finalMessage().usage` | `chunk.usageMetadata` (last chunk) | `chunk.usage` (final chunk) |
| **Input Token Field** | `input_tokens` | `promptTokenCount` | `prompt_tokens` |
| **Output Token Field** | `output_tokens` | `candidatesTokenCount` | `completion_tokens` |
| **Total Token Field** | Sum manually | `totalTokenCount` | `total_tokens` |

### Minimal Working Examples

#### Anthropic

```typescript
import Anthropic from '@anthropic-ai/sdk';
const client = new Anthropic();

const stream = client.messages.stream({
  model: 'claude-sonnet-4-20250514',
  max_tokens: 1024,
  messages: [{ role: 'user', content: 'Hello' }],
});

stream.on('text', (t) => process.stdout.write(t));
const { usage } = await stream.finalMessage();
console.log(`\nTokens: ${usage.input_tokens} in, ${usage.output_tokens} out`);
```

#### Gemini

```typescript
import { GoogleGenAI } from '@google/genai';
const ai = new GoogleGenAI({ apiKey: process.env.GEMINI_API_KEY });

const stream = await ai.models.generateContentStream({
  model: 'gemini-2.5-flash',
  contents: [{ role: 'user', parts: [{ text: 'Hello' }] }],
});

let usage = null;
for await (const chunk of stream) {
  if (chunk.text) process.stdout.write(chunk.text);
  if (chunk.usageMetadata) usage = chunk.usageMetadata;
}
console.log(`\nTokens: ${usage.promptTokenCount} in, ${usage.candidatesTokenCount} out`);
```

#### OpenAI

```typescript
import OpenAI from 'openai';
const client = new OpenAI();

const stream = await client.chat.completions.create({
  model: 'gpt-4o',
  messages: [{ role: 'user', content: 'Hello' }],
  stream: true,
  stream_options: { include_usage: true },
});

let usage = null;
for await (const chunk of stream) {
  if (chunk.choices[0]?.delta?.content) process.stdout.write(chunk.choices[0].delta.content);
  if (chunk.usage) usage = chunk.usage;
}
console.log(`\nTokens: ${usage.prompt_tokens} in, ${usage.completion_tokens} out`);
```

---

## Common Patterns

### Unified Token Counting Interface

If you're building a multi-provider application, consider creating a unified interface:

```typescript
interface TokenUsage {
  inputTokens: number;
  outputTokens: number;
  totalTokens: number;
}

// Anthropic adapter
function fromAnthropicUsage(usage: Anthropic.Messages.Usage): TokenUsage {
  return {
    inputTokens: usage.input_tokens,
    outputTokens: usage.output_tokens,
    totalTokens: usage.input_tokens + usage.output_tokens,
  };
}

// Gemini adapter
function fromGeminiUsage(metadata: any): TokenUsage {
  return {
    inputTokens: metadata.promptTokenCount,
    outputTokens: metadata.candidatesTokenCount,
    totalTokens: metadata.totalTokenCount,
  };
}

// OpenAI adapter
function fromOpenAIUsage(usage: OpenAI.Completions.CompletionUsage): TokenUsage {
  return {
    inputTokens: usage.prompt_tokens,
    outputTokens: usage.completion_tokens,
    totalTokens: usage.total_tokens,
  };
}
```

### Streaming with Yield Pattern

```typescript
interface StreamEvent {
  type: 'text' | 'usage' | 'error';
  content?: string;
  usage?: TokenUsage;
  error?: string;
}

async function* streamWithUsage(
  provider: 'anthropic' | 'gemini' | 'openai',
  prompt: string
): AsyncGenerator<StreamEvent> {
  try {
    switch (provider) {
      case 'anthropic': {
        const stream = anthropicClient.messages.stream({
          model: 'claude-sonnet-4-20250514',
          max_tokens: 1024,
          messages: [{ role: 'user', content: prompt }],
        });

        stream.on('text', (text) => {
          // Note: This pattern requires a different approach for generators
        });

        const message = await stream.finalMessage();
        yield { type: 'usage', usage: fromAnthropicUsage(message.usage) };
        break;
      }
      // ... other providers
    }
  } catch (error) {
    yield { type: 'error', error: String(error) };
  }
}
```

---

## Troubleshooting

### OpenAI: Usage is null

**Problem:** `chunk.usage` is always `null` during streaming.

**Solution:** Add `stream_options: { include_usage: true }` to your request.

```typescript
// Wrong
const stream = await client.chat.completions.create({
  model: 'gpt-4o',
  messages: [...],
  stream: true,
});

// Correct
const stream = await client.chat.completions.create({
  model: 'gpt-4o',
  messages: [...],
  stream: true,
  stream_options: { include_usage: true }, // Add this!
});
```

### Gemini: Usage metadata is incomplete

**Problem:** Early chunks may have partial usage data.

**Solution:** Always use the usage from the last chunk that contains `usageMetadata`.

```typescript
let usageMetadata = null;
for await (const chunk of stream) {
  // Always update to get the latest/most complete usage
  if (chunk.usageMetadata) {
    usageMetadata = chunk.usageMetadata;
  }
}
```

### Anthropic: Stream already consumed

**Problem:** Error when calling `finalMessage()` after manually iterating.

**Solution:** The `MessageStream` can only be consumed once. If you need both iteration and final message, use the event-based approach or accumulate the final message yourself.

```typescript
// Option 1: Use event handlers
stream.on('text', (text) => { /* handle */ });
const message = await stream.finalMessage();

// Option 2: Manual accumulation during iteration
const message = await stream.finalMessage(); // This iterates internally
```

---

## Additional Resources

- [Anthropic API Documentation](https://docs.anthropic.com/)
- [Google Gemini API Documentation](https://ai.google.dev/docs)
- [OpenAI API Documentation](https://platform.openai.com/docs/)
