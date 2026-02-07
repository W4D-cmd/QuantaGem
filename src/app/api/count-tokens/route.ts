import { NextRequest, NextResponse } from "next/server";
import { Content, GoogleGenAI, Part } from "@google/genai";
import Anthropic from "@anthropic-ai/sdk";
import { getEncoding } from "js-tiktoken";
import { pool } from "@/lib/db";
import { MessagePart } from "@/app/page";
import { minioClient, MINIO_BUCKET_NAME } from "@/lib/minio";
import { getProviderForModel } from "@/lib/custom-models";

interface CountTokensRequest {
  history: Array<{ role: string; parts: MessagePart[] }>;
  model: string;
  chatSessionId: number;
}

const SUPPORTED_GEMINI_MIME_TYPES = [
  "application/pdf",
  "image/png",
  "image/jpeg",
  "image/webp",
  "image/heic",
  "image/heif",
  "text/plain",
  "text/html",
  "text/css",
  "text/javascript",
  "application/x-javascript",
  "text/x-python",
  "application/x-python",
  "text/markdown",
  "text/md",
  "text/csv",
  "text/xml",
  "text/rtf",
];

// OpenAI token estimation constants for multimodal content
// Based on OpenAI's vision pricing: high-detail images use ~85 base + 170 per 512x512 tile
// Using 1000 as a reasonable average for typical images
const OPENAI_IMAGE_TOKEN_ESTIMATE = 1000;
// Approximate tokens per KB for PDF documents (~200 tokens/KB is a reasonable estimate)
const OPENAI_PDF_TOKENS_PER_KB = 200;
// Minimum estimate for unknown file types
const OPENAI_UNKNOWN_FILE_TOKEN_ESTIMATE = 100;

// Text-based MIME types that can be read and counted directly with tiktoken
const TEXT_BASED_MIME_TYPES = [
  "text/plain",
  "text/html",
  "text/css",
  "text/javascript",
  "application/javascript",
  "application/x-javascript",
  "text/x-python",
  "application/x-python",
  "text/markdown",
  "text/md",
  "text/csv",
  "text/xml",
  "application/xml",
  "application/json",
  "text/rtf",
];

// Image MIME types for OpenAI estimation
const IMAGE_MIME_TYPES = ["image/png", "image/jpeg", "image/webp", "image/gif", "image/heic", "image/heif"];

const SOURCE_CODE_EXTENSIONS = [
  ".html",
  ".htm",
  ".css",
  ".scss",
  ".sass",
  ".less",
  ".js",
  ".mjs",
  ".cjs",
  ".ts",
  ".tsx",
  ".jsx",
  ".vue",
  ".svelte",
  ".astro",
  ".py",
  ".rb",
  ".php",
  ".java",
  ".kt",
  ".kts",
  ".scala",
  ".go",
  ".rs",
  ".cs",
  ".fs",
  ".fsx",
  ".swift",
  ".c",
  ".cpp",
  ".h",
  ".hpp",
  ".m",
  ".mm",
  ".dart",
  ".lua",
  ".pl",
  ".pm",
  ".t",
  ".r",
  ".erl",
  ".hrl",
  ".ex",
  ".exs",
  ".hs",
  ".d",
  ".zig",
  ".cr",
  ".jl",
  ".sh",
  ".bash",
  ".zsh",
  ".ps1",
  ".psm1",
  ".psd1",
  ".bat",
  ".cmd",
  ".json",
  ".jsonc",
  ".xml",
  ".yaml",
  ".yml",
  ".toml",
  ".ini",
  ".cfg",
  ".conf",
  ".env",
  ".properties",
  ".graphql",
  ".gql",
  ".proto",
  ".dockerfile",
  "Dockerfile",
  ".gitignore",
  ".gitattributes",
  ".gitlab-ci.yml",
  ".travis.yml",
  ".jenkinsfile",
  "Jenkinsfile",
  "Makefile",
  "makefile",
  "CMakeLists.txt",
  ".gradle",
  ".tf",
  ".tfvars",
  ".hcl",
  ".sql",
  ".ddl",
  ".dml",
  ".md",
  ".markdown",
  ".rst",
  ".adoc",
  ".asciidoc",
  ".tex",
  ".bib",
  ".txt",
  ".csv",
  ".tsv",
  ".log",
  ".diff",
  ".patch",
  ".svg",
  ".ipynb",
];

function getFileExtension(fileName?: string): string {
  if (!fileName) return "";
  return (fileName.split(".").pop() || "").toLowerCase();
}

function countTokensWithTiktoken(text: string): number {
  const encoding = getEncoding("o200k_base");
  const tokens = encoding.encode(text);
  return tokens.length;
}

/**
 * Determines if a file should be treated as text-based for OpenAI token counting.
 * Text files can be read and counted directly with tiktoken.
 */
function isTextBasedFile(mimeType: string, fileName?: string): boolean {
  const normalizedMime = mimeType.toLowerCase();
  if (TEXT_BASED_MIME_TYPES.includes(normalizedMime)) {
    return true;
  }
  const extension = getFileExtension(fileName);
  return extension ? SOURCE_CODE_EXTENSIONS.includes(`.${extension}`) : false;
}

/**
 * Determines if a file is an image for OpenAI estimation.
 */
function isImageFile(mimeType: string): boolean {
  const normalizedMime = mimeType.toLowerCase();
  return IMAGE_MIME_TYPES.includes(normalizedMime) || normalizedMime.startsWith("image/");
}

/**
 * Counts tokens for a single file attachment for OpenAI models.
 * - Text-based files: fetches content from MinIO and counts with tiktoken
 * - Images: returns a fixed estimate based on OpenAI's vision pricing
 * - PDFs: estimates based on file size
 * - Unknown types: returns a minimal estimate
 */
async function countFileTokensForOpenAI(filePart: MessagePart): Promise<number> {
  if (!filePart.objectName || !filePart.mimeType) {
    return 0;
  }

  const mimeType = filePart.mimeType.toLowerCase();

  // Handle images with fixed estimate
  if (isImageFile(mimeType)) {
    return OPENAI_IMAGE_TOKEN_ESTIMATE;
  }

  // Handle PDFs with size-based estimate
  if (mimeType === "application/pdf") {
    try {
      const stat = await minioClient.statObject(MINIO_BUCKET_NAME, filePart.objectName);
      const fileSizeKB = stat.size / 1024;
      return Math.max(Math.ceil(fileSizeKB * OPENAI_PDF_TOKENS_PER_KB), 100);
    } catch (error) {
      console.error(`Could not get PDF size for ${filePart.objectName}:`, error);
      return 1500; // Default estimate for ~1 page
    }
  }

  // Handle text-based files by reading content
  if (isTextBasedFile(mimeType, filePart.fileName)) {
    try {
      const fileStream = await minioClient.getObject(MINIO_BUCKET_NAME, filePart.objectName);
      const chunks: Buffer[] = [];
      for await (const chunk of fileStream) {
        chunks.push(chunk as Buffer);
      }
      const fileBuffer = Buffer.concat(chunks);
      const fileContent = fileBuffer.toString("utf-8");
      return countTokensWithTiktoken(fileContent);
    } catch (error) {
      console.error(`Could not retrieve file ${filePart.objectName} for token count:`, error);
      return 0;
    }
  }

  // Unknown file type - return minimal estimate
  return OPENAI_UNKNOWN_FILE_TOKEN_ESTIMATE;
}

async function fetchSystemPrompt(chatSessionId: number, userId: string): Promise<string | null> {
  let systemPromptText: string | null = null;

  try {
    const chatSettingsResult = await pool.query(
      "SELECT system_prompt, project_id FROM chat_sessions WHERE id = $1 AND user_id = $2",
      [chatSessionId, userId],
    );

    const chatSpecificPrompt = chatSettingsResult.rows[0]?.system_prompt?.trim();
    const associatedProjectId = chatSettingsResult.rows[0]?.project_id;

    if (chatSpecificPrompt) {
      systemPromptText = chatSpecificPrompt;
    } else if (associatedProjectId) {
      const projectSettingsResult = await pool.query(
        "SELECT system_prompt FROM projects WHERE id = $1 AND user_id = $2",
        [associatedProjectId, userId],
      );
      if (projectSettingsResult.rows.length > 0 && projectSettingsResult.rows[0].system_prompt?.trim() !== "") {
        systemPromptText = projectSettingsResult.rows[0].system_prompt;
      }
    }

    if (!systemPromptText) {
      const globalSettingsResult = await pool.query("SELECT system_prompt FROM user_settings WHERE user_id = $1", [
        userId,
      ]);
      if (globalSettingsResult.rows.length > 0 && globalSettingsResult.rows[0].system_prompt?.trim() !== "") {
        systemPromptText = globalSettingsResult.rows[0].system_prompt;
      }
    }
  } catch (dbError) {
    console.warn("Failed to fetch system prompt for token counting, proceeding without it:", dbError);
  }

  return systemPromptText;
}

async function countTokensForGemini(
  history: Array<{ role: string; parts: MessagePart[] }>,
  model: string,
  systemPromptText: string | null,
): Promise<number> {
  const projectId = process.env.GOOGLE_CLOUD_PROJECT;
  const location = process.env.GOOGLE_CLOUD_LOCATION || "global";

  if (!projectId) {
    throw new Error("GOOGLE_CLOUD_PROJECT is not configured.");
  }

  const genAI = new GoogleGenAI({ vertexai: true, project: projectId, location: location });
  const contentsForApi: Content[] = [];

  if (systemPromptText && systemPromptText.trim() !== "") {
    contentsForApi.push({ role: "user", parts: [{ text: systemPromptText }] });
    contentsForApi.push({ role: "model", parts: [{ text: "OK" }] });
  }

  if (history) {
    for (const msg of history) {
      const msgGeminiParts: Part[] = [];
      for (const appPart of msg.parts) {
        if (appPart.type === "text" && appPart.text) {
          msgGeminiParts.push({ text: appPart.text });
        } else if (appPart.type === "file" && appPart.objectName && appPart.mimeType) {
          if (msg.role === "user") {
            let effectiveMimeType = appPart.mimeType.toLowerCase();
            const extension = getFileExtension(appPart.fileName);

            if (
              !SUPPORTED_GEMINI_MIME_TYPES.includes(effectiveMimeType) &&
              SOURCE_CODE_EXTENSIONS.includes(`.${extension}`)
            ) {
              effectiveMimeType = "text/plain";
            }

            if (!SUPPORTED_GEMINI_MIME_TYPES.includes(effectiveMimeType)) {
              continue;
            }

            try {
              const fileStream = await minioClient.getObject(MINIO_BUCKET_NAME, appPart.objectName);
              const chunks: Buffer[] = [];
              for await (const chunk of fileStream) {
                chunks.push(chunk as Buffer);
              }
              const fileBuffer = Buffer.concat(chunks);
              msgGeminiParts.push({
                inlineData: {
                  mimeType: effectiveMimeType,
                  data: fileBuffer.toString("base64"),
                },
              });
            } catch (fileError) {
              console.error(`Could not retrieve file ${appPart.objectName} for token count:`, fileError);
            }
          } else if (msg.role === "model" && appPart.text) {
            msgGeminiParts.push({ text: appPart.text });
          }
        }
      }
      if (msgGeminiParts.length > 0) {
        contentsForApi.push({ role: msg.role, parts: msgGeminiParts });
      }
    }
  }

  const { totalTokens } = await genAI.models.countTokens({ model, contents: contentsForApi });
  return totalTokens ?? 0;
}

/**
 * Counts tokens for OpenAI models including file attachments.
 * - Text parts: counted directly with tiktoken
 * - File attachments: fetched from MinIO and counted/estimated appropriately
 */
async function countTokensForOpenAI(
  history: Array<{ role: string; parts: MessagePart[] }>,
  systemPromptText: string | null,
): Promise<number> {
  let totalTokens = 0;

  // Count system prompt tokens
  if (systemPromptText && systemPromptText.trim() !== "") {
    totalTokens += countTokensWithTiktoken(systemPromptText);
    totalTokens += countTokensWithTiktoken("OK");
  }

  // Process each message in history
  for (const msg of history) {
    for (const appPart of msg.parts) {
      if (appPart.type === "text" && appPart.text) {
        totalTokens += countTokensWithTiktoken(appPart.text);
      } else if (appPart.type === "file" && appPart.objectName && appPart.mimeType) {
        // Only count files from user messages (same pattern as Gemini)
        if (msg.role === "user") {
          const fileTokens = await countFileTokensForOpenAI(appPart);
          totalTokens += fileTokens;
        }
      }
    }
  }

  return totalTokens;
}

const SUPPORTED_ANTHROPIC_IMAGE_TYPES = ["image/jpeg", "image/png", "image/gif", "image/webp"];

type AnthropicCountContentBlock =
  | { type: "text"; text: string }
  | { type: "image"; source: { type: "base64"; media_type: string; data: string } }
  | { type: "document"; source: { type: "base64"; media_type: "application/pdf"; data: string } };

type AnthropicCountMessage = {
  role: "user" | "assistant";
  content: string | AnthropicCountContentBlock[];
};

async function countTokensForAnthropic(
  history: Array<{ role: string; parts: MessagePart[] }>,
  model: string,
  systemPromptText: string | null,
): Promise<number> {
  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) {
    throw new Error("ANTHROPIC_API_KEY is not configured.");
  }

  const anthropic = new Anthropic({ apiKey });

  const messages: AnthropicCountMessage[] = [];

  if (systemPromptText && systemPromptText.trim() !== "") {
    // System prompt is counted separately via the system parameter
  }

  if (history) {
    for (const msg of history) {
      const contentBlocks: AnthropicCountContentBlock[] = [];

      for (const appPart of msg.parts) {
        if (appPart.type === "text" && appPart.text) {
          contentBlocks.push({ type: "text", text: appPart.text });
        } else if (appPart.type === "file" && appPart.objectName && appPart.mimeType) {
          if (msg.role !== "user") continue;

          const mimeType = appPart.mimeType.toLowerCase();

          if (SUPPORTED_ANTHROPIC_IMAGE_TYPES.includes(mimeType)) {
            try {
              const fileStream = await minioClient.getObject(MINIO_BUCKET_NAME, appPart.objectName);
              const chunks: Buffer[] = [];
              for await (const chunk of fileStream) {
                chunks.push(chunk as Buffer);
              }
              const fileBuffer = Buffer.concat(chunks);
              contentBlocks.push({
                type: "image",
                source: {
                  type: "base64",
                  media_type: mimeType,
                  data: fileBuffer.toString("base64"),
                },
              });
            } catch (fileError) {
              console.error(`Could not retrieve file ${appPart.objectName} for token count:`, fileError);
            }
          } else if (mimeType === "application/pdf") {
            try {
              const fileStream = await minioClient.getObject(MINIO_BUCKET_NAME, appPart.objectName);
              const chunks: Buffer[] = [];
              for await (const chunk of fileStream) {
                chunks.push(chunk as Buffer);
              }
              const fileBuffer = Buffer.concat(chunks);
              contentBlocks.push({
                type: "document",
                source: {
                  type: "base64",
                  media_type: "application/pdf",
                  data: fileBuffer.toString("base64"),
                },
              });
            } catch (fileError) {
              console.error(`Could not retrieve file ${appPart.objectName} for token count:`, fileError);
            }
          } else if (isTextBasedFile(mimeType, appPart.fileName)) {
            try {
              const fileStream = await minioClient.getObject(MINIO_BUCKET_NAME, appPart.objectName);
              const chunks: Buffer[] = [];
              for await (const chunk of fileStream) {
                chunks.push(chunk as Buffer);
              }
              const fileBuffer = Buffer.concat(chunks);
              const textContent = fileBuffer.toString("utf-8");
              const fileHeader = appPart.fileName ? `--- File: ${appPart.fileName} ---\n` : "";
              contentBlocks.push({ type: "text", text: fileHeader + textContent });
            } catch (fileError) {
              console.error(`Could not retrieve file ${appPart.objectName} for token count:`, fileError);
            }
          }
        }
      }

      if (contentBlocks.length > 0) {
        const role = msg.role === "model" ? "assistant" : "user";
        if (role === "assistant") {
          const textContent = contentBlocks
            .filter((b): b is { type: "text"; text: string } => b.type === "text")
            .map((b) => b.text)
            .join("\n");
          if (textContent) {
            messages.push({ role: "assistant", content: textContent });
          }
        } else {
          messages.push({ role: "user", content: contentBlocks });
        }
      }
    }
  }

  // If no messages, add a minimal one for counting
  if (messages.length === 0) {
    messages.push({ role: "user", content: "" });
  }

  /* eslint-disable @typescript-eslint/no-explicit-any */
  const countParams: any = {
    model,
    messages,
  };
  /* eslint-enable @typescript-eslint/no-explicit-any */

  if (systemPromptText && systemPromptText.trim() !== "") {
    countParams.system = systemPromptText;
  }

  const result = await anthropic.messages.countTokens(countParams);
  return result.input_tokens;
}

export async function POST(request: NextRequest) {
  const userIdHeader = request.headers.get("x-user-id");
  if (!userIdHeader) {
    return NextResponse.json({ error: "Unauthorized: Missing user identification" }, { status: 401 });
  }
  const userId = userIdHeader;

  const { history, model, chatSessionId } = (await request.json()) as CountTokensRequest;

  if (!model) {
    return NextResponse.json({ error: "model missing" }, { status: 400 });
  }

  const provider = getProviderForModel(model);

  try {
    let systemPromptText: string | null = null;
    if (chatSessionId) {
      systemPromptText = await fetchSystemPrompt(chatSessionId, userId);
    }

    let totalTokens: number;

    if (provider === "anthropic") {
      totalTokens = await countTokensForAnthropic(history ?? [], model, systemPromptText);
    } else if (provider === "openai") {
      totalTokens = await countTokensForOpenAI(history ?? [], systemPromptText);
    } else {
      totalTokens = await countTokensForGemini(history ?? [], model, systemPromptText);
    }

    return NextResponse.json({ totalTokens });
  } catch (error) {
    console.error("Error in token counting:", error);
    const detailedError = error instanceof Error ? error.message : String(error);
    return NextResponse.json({ error: detailedError }, { status: 500 });
  }
}
