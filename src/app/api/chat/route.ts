import { Content, GoogleGenAI, GroundingMetadata, Part, HarmCategory, HarmBlockThreshold } from "@google/genai";
import OpenAI from "openai";
import Anthropic from "@anthropic-ai/sdk";
import { ChatCompletionMessageParam, ChatCompletionContentPart } from "openai/resources/chat/completions";
import { NextRequest, NextResponse } from "next/server";
import { pool } from "@/lib/db";
import { MessagePart } from "@/app/page";
import { MINIO_BUCKET_NAME, minioClient } from "@/lib/minio";
import {
  getProviderForModel,
  ModelProvider,
  modelSupportsVerbosity,
  isCustomModel,
  getOriginalModelId,
} from "@/lib/custom-models";
import {
  isOpenAIReasoningModel,
  isGPT5FamilyModel,
  mapBudgetToOpenAIReasoningEffort,
  mapBudgetToAnthropicEffort,
  VerbosityOption,
  supportsVerbosity,
} from "@/lib/thinking";

// Allow long-running requests for AI processing
export const maxDuration = 600;

interface ChatRequest {
  history: Array<{ role: string; parts: MessagePart[] }>;
  messageParts: MessagePart[];
  chatSessionId: string;
  model: string;
  isSearchActive?: boolean;
  thinkingBudget?: number;
  isRegeneration?: boolean;
  systemPrompt?: string;
  projectId?: number | null;
  verbosity?: VerbosityOption;
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

const SUPPORTED_OPENAI_IMAGE_TYPES = ["image/png", "image/jpeg", "image/webp", "image/gif"];

const SUPPORTED_OPENAI_DOCUMENT_TYPES = ["application/pdf"];

const SUPPORTED_ANTHROPIC_IMAGE_TYPES = ["image/jpeg", "image/png", "image/gif", "image/webp"];

const SUPPORTED_ANTHROPIC_DOCUMENT_TYPES = ["application/pdf"];

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

const safetySettings = [
  {
    category: HarmCategory.HARM_CATEGORY_HARASSMENT,
    threshold: HarmBlockThreshold.BLOCK_NONE,
  },
  {
    category: HarmCategory.HARM_CATEGORY_HATE_SPEECH,
    threshold: HarmBlockThreshold.BLOCK_NONE,
  },
  {
    category: HarmCategory.HARM_CATEGORY_SEXUALLY_EXPLICIT,
    threshold: HarmBlockThreshold.BLOCK_NONE,
  },
  {
    category: HarmCategory.HARM_CATEGORY_DANGEROUS_CONTENT,
    threshold: HarmBlockThreshold.BLOCK_NONE,
  },
  {
    category: HarmCategory.HARM_CATEGORY_CIVIC_INTEGRITY,
    threshold: HarmBlockThreshold.BLOCK_NONE,
  },
];

// File processing constants are defined inline where needed

function getFileExtension(fileName?: string): string {
  if (!fileName) return "";
  return (fileName.split(".").pop() || "").toLowerCase();
}

async function fetchSystemPrompt(
  newChatSystemPrompt: string | undefined,
  chatSessionId: string | undefined,
  projectId: number | null | undefined,
  userId: number,
): Promise<string | null> {
  let systemPromptText: string | null = null;

  try {
    if (newChatSystemPrompt && newChatSystemPrompt.trim() !== "") {
      systemPromptText = newChatSystemPrompt;
    } else if (chatSessionId) {
      const chatSettingsResult = await pool.query(
        "SELECT system_prompt, project_id FROM chat_sessions WHERE id = $1 AND user_id = $2",
        [chatSessionId, userId],
      );
      const chatSettings = chatSettingsResult.rows[0];

      if (chatSettings?.system_prompt?.trim()) {
        systemPromptText = chatSettings.system_prompt;
      } else if (chatSettings?.project_id) {
        const projectSettingsResult = await pool.query(
          "SELECT system_prompt FROM projects WHERE id = $1 AND user_id = $2",
          [chatSettings.project_id, userId],
        );
        if (projectSettingsResult.rows[0]?.system_prompt?.trim()) {
          systemPromptText = projectSettingsResult.rows[0].system_prompt;
        }
      }
    } else if (projectId) {
      const projectSettingsResult = await pool.query(
        "SELECT system_prompt FROM projects WHERE id = $1 AND user_id = $2",
        [projectId, userId],
      );
      if (projectSettingsResult.rows[0]?.system_prompt?.trim()) {
        systemPromptText = projectSettingsResult.rows[0].system_prompt;
      }
    }

    if (!systemPromptText) {
      const globalSettingsResult = await pool.query("SELECT system_prompt FROM user_settings WHERE user_id = $1", [
        userId,
      ]);
      if (globalSettingsResult.rows[0]?.system_prompt?.trim()) {
        systemPromptText = globalSettingsResult.rows[0].system_prompt;
      }
    }
  } catch (dbError) {
    console.warn("Failed to fetch system prompt, proceeding without it:", dbError);
  }

  return systemPromptText;
}

async function handleGeminiRequest(
  model: string,
  newMessageAppParts: MessagePart[],
  clientHistoryWithAppParts: Array<{ role: string; parts: MessagePart[] }>,
  systemPromptText: string | null,
  isSearchActive: boolean | undefined,
  thinkingBudget: number | undefined,
): Promise<Response> {
  const cloudProjectId = process.env.GOOGLE_CLOUD_PROJECT;
  const location = process.env.GOOGLE_CLOUD_LOCATION || "global";

  if (!cloudProjectId) {
    return NextResponse.json({ error: "GOOGLE_CLOUD_PROJECT is not configured." }, { status: 500 });
  }

  const genAI = new GoogleGenAI({ vertexai: true, project: cloudProjectId, location: location });

  const newMessageGeminiParts: Part[] = [];

  for (const appPart of newMessageAppParts) {
    if (appPart.type === "text" && appPart.text) {
      newMessageGeminiParts.push({ text: appPart.text });
    } else if (appPart.type === "scraped_url" && appPart.text) {
      newMessageGeminiParts.push({ text: appPart.text });
    } else if (appPart.type === "file" && appPart.objectName && appPart.mimeType) {
      let effectiveMimeType = appPart.mimeType.toLowerCase();
      const extension = getFileExtension(appPart.fileName);

      if (
        !SUPPORTED_GEMINI_MIME_TYPES.includes(effectiveMimeType) &&
        SOURCE_CODE_EXTENSIONS.includes(`.${extension}`)
      ) {
        console.warn(
          `Overriding MIME type for source code file ${appPart.fileName || appPart.objectName} from ${effectiveMimeType} to text/plain for Gemini.`,
        );
        effectiveMimeType = "text/plain";
      }

      if (!SUPPORTED_GEMINI_MIME_TYPES.includes(effectiveMimeType)) {
        console.warn(
          `Skipping new file ${appPart.fileName || appPart.objectName} for Gemini due to unsupported MIME type: ${appPart.mimeType} (effective: ${effectiveMimeType})`,
        );
        continue;
      }

      try {
        const fileStream = await minioClient.getObject(MINIO_BUCKET_NAME, appPart.objectName);
        const chunks: Buffer[] = [];
        for await (const chunk of fileStream) {
          chunks.push(chunk as Buffer);
        }
        const fileBuffer = Buffer.concat(chunks);
        newMessageGeminiParts.push({
          inlineData: {
            mimeType: effectiveMimeType,
            data: fileBuffer.toString("base64"),
          },
        });
      } catch (fileError) {
        console.error(
          `Failed to retrieve or process file ${appPart.objectName} from MinIO for new message:`,
          fileError,
        );
        return NextResponse.json(
          {
            error: `Failed to process file: ${appPart.fileName || appPart.objectName}`,
          },
          { status: 500 },
        );
      }
    }
  }

  if (newMessageGeminiParts.length === 0) {
    const hasActualTextContent = newMessageAppParts.some((p) => p.type === "text" && p.text && p.text.trim() !== "");
    if (!hasActualTextContent && newMessageAppParts.length > 0) {
      return NextResponse.json(
        {
          error:
            "All uploaded files have types unsupported by the AI or could not be processed. Supported types include common images (PNG, JPEG, WEBP), PDF, and text formats (including source code).",
        },
        { status: 400 },
      );
    }
    return NextResponse.json(
      {
        error: "No valid content to send to Gemini (message empty or all files unsupported/unprocessed).",
      },
      { status: 400 },
    );
  }

  const historyGeminiContents: Content[] = [];
  if (clientHistoryWithAppParts) {
    for (const prevMsg of clientHistoryWithAppParts) {
      const prevMsgGeminiParts: Part[] = [];
      if (prevMsg.parts && Array.isArray(prevMsg.parts)) {
        for (const appPart of prevMsg.parts) {
          if (appPart.type === "text" && appPart.text) {
            prevMsgGeminiParts.push({ text: appPart.text });
          } else if (appPart.type === "scraped_url" && appPart.text) {
            prevMsgGeminiParts.push({ text: appPart.text });
          } else if (appPart.type === "file" && appPart.objectName && appPart.mimeType) {
            if (prevMsg.role === "user") {
              let effectiveMimeType = appPart.mimeType.toLowerCase();
              const extension = getFileExtension(appPart.fileName);

              if (
                !SUPPORTED_GEMINI_MIME_TYPES.includes(effectiveMimeType) &&
                SOURCE_CODE_EXTENSIONS.includes(`.${extension}`)
              ) {
                effectiveMimeType = "text/plain";
              }

              if (!SUPPORTED_GEMINI_MIME_TYPES.includes(effectiveMimeType)) {
                console.warn(
                  `Skipping historical file ${appPart.fileName || appPart.objectName} for Gemini due to unsupported MIME type: ${appPart.mimeType} (effective: ${effectiveMimeType})`,
                );
                continue;
              }
              try {
                const fileStream = await minioClient.getObject(MINIO_BUCKET_NAME, appPart.objectName);
                const chunks: Buffer[] = [];
                for await (const chunk of fileStream) {
                  chunks.push(chunk as Buffer);
                }
                const fileBuffer = Buffer.concat(chunks);
                prevMsgGeminiParts.push({
                  inlineData: {
                    mimeType: effectiveMimeType,
                    data: fileBuffer.toString("base64"),
                  },
                });
              } catch (fileError) {
                console.error(`Failed to retrieve historical file ${appPart.objectName} from MinIO:`, fileError);
                return NextResponse.json(
                  {
                    error: `Failed to process historical file: ${appPart.fileName || appPart.objectName}`,
                  },
                  { status: 500 },
                );
              }
            }
          }
        }
      }
      if (prevMsgGeminiParts.length > 0) {
        historyGeminiContents.push({
          role: prevMsg.role,
          parts: prevMsgGeminiParts,
        });
      }
    }
  }

  const contentsForApi: Content[] = [...historyGeminiContents, { role: "user", parts: newMessageGeminiParts }];

  const generationConfig: {
    systemInstruction?: string;
    tools?: Array<{ googleSearch: Record<string, never> }>;
    thinkingConfig?: { thinkingBudget?: number; includeThoughts?: boolean };
    safetySettings?: typeof safetySettings;
  } = {};

  generationConfig.safetySettings = safetySettings;

  if (systemPromptText && systemPromptText.trim() !== "") {
    generationConfig.systemInstruction = systemPromptText;
  }

  if (isSearchActive) {
    generationConfig.tools = [{ googleSearch: {} }];
  }

  const isThinkingSupported = model.includes("2.5-pro") || model.includes("2.5-flash");
  if (isThinkingSupported) {
    const effectiveThinkingConfig: { thinkingBudget?: number; includeThoughts?: boolean } = {};

    if (thinkingBudget !== 0) {
      effectiveThinkingConfig.includeThoughts = true;
    }

    if (thinkingBudget !== undefined) {
      const isProModel = model.includes("2.5-pro");
      if (!isProModel || (isProModel && thinkingBudget !== 0)) {
        effectiveThinkingConfig.thinkingBudget = thinkingBudget;
      }
    }

    if (Object.keys(effectiveThinkingConfig).length > 0) {
      generationConfig.thinkingConfig = effectiveThinkingConfig;
    }
  }

  const streamParams: {
    model: string;
    contents: Content[];
    config?: typeof generationConfig;
  } = {
    model,
    contents: contentsForApi,
  };

  if (Object.keys(generationConfig).length > 0) {
    streamParams.config = generationConfig;
  }

  const streamingResult = await genAI.models.generateContentStream(streamParams);

  const encoder = new TextEncoder();
  const readableStream = new ReadableStream({
    async start(controller) {
      let modelOutput = "";
      let thoughtSummaryOutput = "";
      const sourcesToStore: Array<{ title: string; uri: string }> = [];

      try {
        for await (const chunk of streamingResult) {
          if (chunk.candidates && chunk.candidates.length > 0) {
            const candidate = chunk.candidates[0];

            if (candidate.groundingMetadata) {
              const groundingMetadata: GroundingMetadata = candidate.groundingMetadata;

              if (groundingMetadata.groundingChunks) {
                for (const gc of groundingMetadata.groundingChunks) {
                  if (gc.web && gc.web.title && gc.web.uri) {
                    const webInfo = gc.web;

                    const isDuplicate = sourcesToStore.some((s) => s.uri === webInfo.uri);
                    if (!isDuplicate) {
                      const source = {
                        title: webInfo.title!,
                        uri: webInfo.uri!,
                      };
                      sourcesToStore.push(source);
                      const jsonGroundingChunk = {
                        type: "grounding",
                        sources: [source],
                      };
                      controller.enqueue(encoder.encode(JSON.stringify(jsonGroundingChunk) + "\n"));
                    }
                  }
                }
              }
            }

            if (candidate.content?.parts) {
              for (const part of candidate.content.parts) {
                if (part.text) {
                  if (part.thought) {
                    thoughtSummaryOutput += part.text;
                    const jsonChunk = { type: "thought", value: part.text };
                    controller.enqueue(encoder.encode(JSON.stringify(jsonChunk) + "\n"));
                  } else {
                    modelOutput += part.text;
                    const jsonChunk = { type: "text", value: part.text };
                    controller.enqueue(encoder.encode(JSON.stringify(jsonChunk) + "\n"));
                  }
                }
              }
            }
          }
        }

        if (modelOutput.trim() === "") {
          console.warn(
            `Gemini model returned an empty message (thoughts received: ${thoughtSummaryOutput.trim() !== ""}). Not saving to DB.`,
          );
          const emptyMessageError = {
            type: "error",
            value: "Model returned an empty message. Please try again.",
          };
          controller.enqueue(encoder.encode(JSON.stringify(emptyMessageError) + "\n"));
        }
      } catch (streamError) {
        console.error("Error during stream processing:", streamError);
        const errorMessage = {
          type: "error",
          value: "An error occurred during stream processing. Please try again.",
        };
        controller.enqueue(encoder.encode(JSON.stringify(errorMessage) + "\n"));
      } finally {
        controller.close();
      }
    },
    cancel() {
      console.log("Stream cancelled for chat session");
    },
  });

  return new Response(readableStream, {
    headers: {
      "Content-Type": "application/jsonl; charset=utf-8",
      "Cache-Control": "no-cache",
      Connection: "keep-alive",
    },
  });
}

async function handleOpenAIRequest(
  model: string,
  newMessageAppParts: MessagePart[],
  clientHistoryWithAppParts: Array<{ role: string; parts: MessagePart[] }>,
  systemPromptText: string | null,
  thinkingBudget: number | undefined,
  verbosity: VerbosityOption | undefined,
): Promise<Response> {
  const apiKey = process.env.OPENAI_API_KEY;

  if (!apiKey) {
    return NextResponse.json({ error: "OPENAI_API_KEY is not configured." }, { status: 500 });
  }

  const openai = new OpenAI({ apiKey });

  const messages: ChatCompletionMessageParam[] = [];

  if (systemPromptText && systemPromptText.trim() !== "") {
    messages.push({
      role: "system",
      content: systemPromptText,
    });
  }

  if (clientHistoryWithAppParts) {
    for (const prevMsg of clientHistoryWithAppParts) {
      const contentParts: ChatCompletionContentPart[] = [];

      if (prevMsg.parts && Array.isArray(prevMsg.parts)) {
        for (const appPart of prevMsg.parts) {
          if (appPart.type === "text" && appPart.text) {
            contentParts.push({ type: "text", text: appPart.text });
          } else if (appPart.type === "scraped_url" && appPart.text) {
            contentParts.push({ type: "text", text: appPart.text });
          } else if (appPart.type === "file" && appPart.objectName && appPart.mimeType) {
            const mimeType = appPart.mimeType.toLowerCase();

            if (SUPPORTED_OPENAI_IMAGE_TYPES.includes(mimeType)) {
              try {
                const fileStream = await minioClient.getObject(MINIO_BUCKET_NAME, appPart.objectName);
                const chunks: Buffer[] = [];
                for await (const chunk of fileStream) {
                  chunks.push(chunk as Buffer);
                }
                const fileBuffer = Buffer.concat(chunks);
                const base64Data = fileBuffer.toString("base64");
                contentParts.push({
                  type: "image_url",
                  image_url: {
                    url: `data:${mimeType};base64,${base64Data}`,
                  },
                });
              } catch (fileError) {
                console.error(`Failed to retrieve historical file ${appPart.objectName} from MinIO:`, fileError);
                return NextResponse.json(
                  {
                    error: `Failed to process historical file: ${appPart.fileName || appPart.objectName}`,
                  },
                  { status: 500 },
                );
              }
            } else {
              const extension = getFileExtension(appPart.fileName);
              const isTextFile =
                SOURCE_CODE_EXTENSIONS.includes(`.${extension}`) ||
                mimeType.startsWith("text/") ||
                mimeType === "application/json";

              if (isTextFile) {
                try {
                  const fileStream = await minioClient.getObject(MINIO_BUCKET_NAME, appPart.objectName);
                  const chunks: Buffer[] = [];
                  for await (const chunk of fileStream) {
                    chunks.push(chunk as Buffer);
                  }
                  const fileBuffer = Buffer.concat(chunks);
                  const textContent = fileBuffer.toString("utf-8");
                  const fileHeader = appPart.fileName ? `--- File: ${appPart.fileName} ---\n` : "";
                  contentParts.push({ type: "text", text: fileHeader + textContent });
                } catch (fileError) {
                  console.error(`Failed to retrieve historical file ${appPart.objectName} from MinIO:`, fileError);
                }
              } else {
                console.warn(
                  `Skipping historical file ${appPart.fileName || appPart.objectName} for OpenAI due to unsupported MIME type: ${appPart.mimeType}`,
                );
              }
            }
          }
        }
      }

      if (contentParts.length > 0) {
        if (prevMsg.role === "model") {
          const textContent = contentParts
            .filter((p): p is { type: "text"; text: string } => p.type === "text")
            .map((p) => p.text)
            .join("\n");
          if (textContent) {
            messages.push({
              role: "assistant",
              content: textContent,
            });
          }
        } else {
          messages.push({
            role: "user",
            content: contentParts,
          });
        }
      }
    }
  }

  const newMessageContentParts: ChatCompletionContentPart[] = [];

  for (const appPart of newMessageAppParts) {
    if (appPart.type === "text" && appPart.text) {
      newMessageContentParts.push({ type: "text", text: appPart.text });
    } else if (appPart.type === "scraped_url" && appPart.text) {
      newMessageContentParts.push({ type: "text", text: appPart.text });
    } else if (appPart.type === "file" && appPart.objectName && appPart.mimeType) {
      const mimeType = appPart.mimeType.toLowerCase();

      if (SUPPORTED_OPENAI_IMAGE_TYPES.includes(mimeType)) {
        try {
          const fileStream = await minioClient.getObject(MINIO_BUCKET_NAME, appPart.objectName);
          const chunks: Buffer[] = [];
          for await (const chunk of fileStream) {
            chunks.push(chunk as Buffer);
          }
          const fileBuffer = Buffer.concat(chunks);
          const base64Data = fileBuffer.toString("base64");
          newMessageContentParts.push({
            type: "image_url",
            image_url: {
              url: `data:${mimeType};base64,${base64Data}`,
            },
          });
        } catch (fileError) {
          console.error(`Failed to retrieve or process file ${appPart.objectName} from MinIO for new message:`, fileError);
          return NextResponse.json(
            {
              error: `Failed to process file: ${appPart.fileName || appPart.objectName}`,
            },
            { status: 500 },
          );
        }
      } else {
        const extension = getFileExtension(appPart.fileName);
        const isTextFile =
          SOURCE_CODE_EXTENSIONS.includes(`.${extension}`) ||
          mimeType.startsWith("text/") ||
          mimeType === "application/json";

        if (isTextFile) {
          try {
            const fileStream = await minioClient.getObject(MINIO_BUCKET_NAME, appPart.objectName);
            const chunks: Buffer[] = [];
            for await (const chunk of fileStream) {
              chunks.push(chunk as Buffer);
            }
            const fileBuffer = Buffer.concat(chunks);
            const textContent = fileBuffer.toString("utf-8");
            const fileHeader = appPart.fileName ? `--- File: ${appPart.fileName} ---\n` : "";
            newMessageContentParts.push({ type: "text", text: fileHeader + textContent });
          } catch (fileError) {
            console.error(`Failed to retrieve or process file ${appPart.objectName} from MinIO:`, fileError);
            return NextResponse.json(
              {
                error: `Failed to process file: ${appPart.fileName || appPart.objectName}`,
              },
              { status: 500 },
            );
          }
        } else {
          console.warn(
            `Skipping new file ${appPart.fileName || appPart.objectName} for OpenAI due to unsupported MIME type: ${appPart.mimeType}`,
          );
        }
      }
    }
  }

  if (newMessageContentParts.length === 0) {
    const hasActualTextContent = newMessageAppParts.some((p) => p.type === "text" && p.text && p.text.trim() !== "");
    if (!hasActualTextContent && newMessageAppParts.length > 0) {
      return NextResponse.json(
        {
          error:
            "All uploaded files have types unsupported by OpenAI or could not be processed. Supported types include images (PNG, JPEG, WEBP, GIF) and text files.",
        },
        { status: 400 },
      );
    }
    return NextResponse.json(
      {
        error: "No valid content to send to OpenAI (message empty or all files unsupported/unprocessed).",
      },
      { status: 400 },
    );
  }

  messages.push({
    role: "user",
    content: newMessageContentParts,
  });

  const requestOptions: OpenAI.ChatCompletionCreateParamsStreaming & {
    reasoning_effort?: string;
    text?: { verbosity: string };
  } = {
    model,
    messages,
    stream: true,
  };

  if (isOpenAIReasoningModel(model)) {
    const reasoningEffort = mapBudgetToOpenAIReasoningEffort(model, thinkingBudget);
    requestOptions.reasoning_effort = reasoningEffort;
  }

  if (supportsVerbosity(model) || modelSupportsVerbosity(model)) {
    const effectiveVerbosity = verbosity ?? "medium";
    requestOptions.text = { verbosity: effectiveVerbosity };
  }

  const stream = await openai.chat.completions.create(requestOptions);

  const encoder = new TextEncoder();
  const readableStream = new ReadableStream({
    async start(controller) {
      let modelOutput = "";

      try {
        for await (const chunk of stream) {
          const delta = chunk.choices[0]?.delta;

          if (isOpenAIReasoningModel(model) && (delta as Record<string, unknown>)?.reasoning_content) {
            const reasoningText = (delta as Record<string, unknown>).reasoning_content as string;
            const jsonChunk = { type: "thought", value: reasoningText };
            controller.enqueue(encoder.encode(JSON.stringify(jsonChunk) + "\n"));
          }

          if (delta?.content) {
            modelOutput += delta.content;
            const jsonChunk = { type: "text", value: delta.content };
            controller.enqueue(encoder.encode(JSON.stringify(jsonChunk) + "\n"));
          }
        }

        if (modelOutput.trim() === "") {
          console.warn("OpenAI model returned an empty message. Not saving to DB.");
          const emptyMessageError = {
            type: "error",
            value: "Model returned an empty message. Please try again.",
          };
          controller.enqueue(encoder.encode(JSON.stringify(emptyMessageError) + "\n"));
        }
      } catch (streamError) {
        console.error("Error during OpenAI stream processing:", streamError);
        const errorMessage = {
          type: "error",
          value: "An error occurred during stream processing. Please try again.",
        };
        controller.enqueue(encoder.encode(JSON.stringify(errorMessage) + "\n"));
      } finally {
        controller.close();
      }
    },
    cancel() {
      console.log("OpenAI stream cancelled for chat session");
    },
  });

  return new Response(readableStream, {
    headers: {
      "Content-Type": "application/jsonl; charset=utf-8",
      "Cache-Control": "no-cache",
      Connection: "keep-alive",
    },
  });
}

type ResponsesAPIInputItem =
  | { role: "user" | "assistant" | "developer"; content: string }
  | {
      role: "user";
      content: Array<
        | { type: "input_text"; text: string }
        | { type: "input_image"; image_url: string }
        | { type: "input_file"; filename: string; file_data: string }
      >;
    };

async function handleCustomOpenAIRequest(
  model: string,
  newMessageAppParts: MessagePart[],
  clientHistoryWithAppParts: Array<{ role: string; parts: MessagePart[] }>,
  systemPromptText: string | null,
  userId: number,
): Promise<Response> {
  // Fetch custom endpoint and key from database
  const settingsResult = await pool.query(
    "SELECT custom_openai_endpoint, custom_openai_key FROM user_settings WHERE user_id = $1",
    [userId],
  );

  const settings = settingsResult.rows[0];
  if (!settings?.custom_openai_endpoint) {
    return NextResponse.json(
      { error: "Custom OpenAI endpoint not configured. Please set it in Settings > Providers." },
      { status: 400 },
    );
  }

  const baseURL = settings.custom_openai_endpoint;
  const apiKey = settings.custom_openai_key || "no-key";

  // Create OpenAI client with custom baseURL
  const openai = new OpenAI({ apiKey, baseURL });

  // Get the original model ID (remove "custom:" prefix)
  const actualModelId = getOriginalModelId(model);

  const messages: ChatCompletionMessageParam[] = [];

  if (systemPromptText && systemPromptText.trim() !== "") {
    messages.push({
      role: "system",
      content: systemPromptText,
    });
  }

  // Build history messages
  if (clientHistoryWithAppParts) {
    for (const prevMsg of clientHistoryWithAppParts) {
      const contentParts: ChatCompletionContentPart[] = [];

      if (prevMsg.parts && Array.isArray(prevMsg.parts)) {
        for (const appPart of prevMsg.parts) {
          if (appPart.type === "text" && appPart.text) {
            contentParts.push({ type: "text", text: appPart.text });
          } else if (appPart.type === "scraped_url" && appPart.text) {
            contentParts.push({ type: "text", text: appPart.text });
          } else if (appPart.type === "file" && appPart.objectName && appPart.mimeType) {
            const mimeType = appPart.mimeType.toLowerCase();

            if (SUPPORTED_OPENAI_IMAGE_TYPES.includes(mimeType)) {
              try {
                const fileStream = await minioClient.getObject(MINIO_BUCKET_NAME, appPart.objectName);
                const chunks: Buffer[] = [];
                for await (const chunk of fileStream) {
                  chunks.push(chunk as Buffer);
                }
                const fileBuffer = Buffer.concat(chunks);
                const base64Data = fileBuffer.toString("base64");
                contentParts.push({
                  type: "image_url",
                  image_url: {
                    url: `data:${mimeType};base64,${base64Data}`,
                  },
                });
              } catch (fileError) {
                console.error(`Failed to retrieve historical file ${appPart.objectName} from MinIO:`, fileError);
                return NextResponse.json(
                  { error: `Failed to process historical file: ${appPart.fileName || appPart.objectName}` },
                  { status: 500 },
                );
              }
            } else {
              const extension = getFileExtension(appPart.fileName);
              const isTextFile =
                SOURCE_CODE_EXTENSIONS.includes(`.${extension}`) ||
                mimeType.startsWith("text/") ||
                mimeType === "application/json";

              if (isTextFile) {
                try {
                  const fileStream = await minioClient.getObject(MINIO_BUCKET_NAME, appPart.objectName);
                  const chunks: Buffer[] = [];
                  for await (const chunk of fileStream) {
                    chunks.push(chunk as Buffer);
                  }
                  const fileBuffer = Buffer.concat(chunks);
                  const textContent = fileBuffer.toString("utf-8");
                  const fileHeader = appPart.fileName ? `--- File: ${appPart.fileName} ---\n` : "";
                  contentParts.push({ type: "text", text: fileHeader + textContent });
                } catch (fileError) {
                  console.error(`Failed to retrieve historical file ${appPart.objectName} from MinIO:`, fileError);
                }
              } else {
                console.warn(
                  `Skipping historical file ${appPart.fileName || appPart.objectName} for Custom OpenAI due to unsupported MIME type: ${appPart.mimeType}`,
                );
              }
            }
          }
        }
      }

      if (contentParts.length > 0) {
        if (prevMsg.role === "model") {
          const textContent = contentParts
            .filter((p): p is { type: "text"; text: string } => p.type === "text")
            .map((p) => p.text)
            .join("\n");
          if (textContent) {
            messages.push({
              role: "assistant",
              content: textContent,
            });
          }
        } else {
          messages.push({
            role: "user",
            content: contentParts,
          });
        }
      }
    }
  }

  // Build new message content parts
  const newMessageContentParts: ChatCompletionContentPart[] = [];

  for (const appPart of newMessageAppParts) {
    if (appPart.type === "text" && appPart.text) {
      newMessageContentParts.push({ type: "text", text: appPart.text });
    } else if (appPart.type === "scraped_url" && appPart.text) {
      newMessageContentParts.push({ type: "text", text: appPart.text });
    } else if (appPart.type === "file" && appPart.objectName && appPart.mimeType) {
      const mimeType = appPart.mimeType.toLowerCase();

      if (SUPPORTED_OPENAI_IMAGE_TYPES.includes(mimeType)) {
        try {
          const fileStream = await minioClient.getObject(MINIO_BUCKET_NAME, appPart.objectName);
          const chunks: Buffer[] = [];
          for await (const chunk of fileStream) {
            chunks.push(chunk as Buffer);
          }
          const fileBuffer = Buffer.concat(chunks);
          const base64Data = fileBuffer.toString("base64");
          newMessageContentParts.push({
            type: "image_url",
            image_url: {
              url: `data:${mimeType};base64,${base64Data}`,
            },
          });
        } catch (fileError) {
          console.error(`Failed to retrieve or process file ${appPart.objectName} from MinIO:`, fileError);
          return NextResponse.json(
            { error: `Failed to process file: ${appPart.fileName || appPart.objectName}` },
            { status: 500 },
          );
        }
      } else {
        const extension = getFileExtension(appPart.fileName);
        const isTextFile =
          SOURCE_CODE_EXTENSIONS.includes(`.${extension}`) ||
          mimeType.startsWith("text/") ||
          mimeType === "application/json";

        if (isTextFile) {
          try {
            const fileStream = await minioClient.getObject(MINIO_BUCKET_NAME, appPart.objectName);
            const chunks: Buffer[] = [];
            for await (const chunk of fileStream) {
              chunks.push(chunk as Buffer);
            }
            const fileBuffer = Buffer.concat(chunks);
            const textContent = fileBuffer.toString("utf-8");
            const fileHeader = appPart.fileName ? `--- File: ${appPart.fileName} ---\n` : "";
            newMessageContentParts.push({ type: "text", text: fileHeader + textContent });
          } catch (fileError) {
            console.error(`Failed to retrieve or process file ${appPart.objectName} from MinIO:`, fileError);
            return NextResponse.json(
              { error: `Failed to process file: ${appPart.fileName || appPart.objectName}` },
              { status: 500 },
            );
          }
        } else {
          console.warn(
            `Skipping new file ${appPart.fileName || appPart.objectName} for Custom OpenAI due to unsupported MIME type: ${appPart.mimeType}`,
          );
        }
      }
    }
  }

  if (newMessageContentParts.length === 0) {
    const hasActualTextContent = newMessageAppParts.some((p) => p.type === "text" && p.text && p.text.trim() !== "");
    if (!hasActualTextContent && newMessageAppParts.length > 0) {
      return NextResponse.json(
        {
          error:
            "All uploaded files have types unsupported by the custom provider or could not be processed. Supported types include images and text files.",
        },
        { status: 400 },
      );
    }
    return NextResponse.json(
      { error: "No valid content to send to custom provider (message empty or all files unsupported/unprocessed)." },
      { status: 400 },
    );
  }

  messages.push({
    role: "user",
    content: newMessageContentParts,
  });

  const stream = await openai.chat.completions.create({
    model: actualModelId,
    messages,
    stream: true,
  });

  const encoder = new TextEncoder();
  const readableStream = new ReadableStream({
    async start(controller) {
      let modelOutput = "";

      try {
        for await (const chunk of stream) {
          const delta = chunk.choices[0]?.delta;

          if (delta?.content) {
            modelOutput += delta.content;
            const jsonChunk = { type: "text", value: delta.content };
            controller.enqueue(encoder.encode(JSON.stringify(jsonChunk) + "\n"));
          }
        }

        if (modelOutput.trim() === "") {
          console.warn("Custom OpenAI model returned an empty message.");
          const emptyMessageError = {
            type: "error",
            value: "Model returned an empty message. Please try again.",
          };
          controller.enqueue(encoder.encode(JSON.stringify(emptyMessageError) + "\n"));
        }
      } catch (streamError) {
        console.error("Error during Custom OpenAI stream processing:", streamError);
        const errorMessage = {
          type: "error",
          value: "An error occurred during stream processing. Please try again.",
        };
        controller.enqueue(encoder.encode(JSON.stringify(errorMessage) + "\n"));
      } finally {
        controller.close();
      }
    },
    cancel() {
      console.log("Custom OpenAI stream cancelled for chat session");
    },
  });

  return new Response(readableStream, {
    headers: {
      "Content-Type": "application/jsonl; charset=utf-8",
      "Cache-Control": "no-cache",
      Connection: "keep-alive",
    },
  });
}

async function handleOpenAIResponsesAPIRequest(
  model: string,
  newMessageAppParts: MessagePart[],
  clientHistoryWithAppParts: Array<{ role: string; parts: MessagePart[] }>,
  systemPromptText: string | null,
  thinkingBudget: number | undefined,
  verbosity: VerbosityOption | undefined,
): Promise<Response> {
  const apiKey = process.env.OPENAI_API_KEY;

  if (!apiKey) {
    return NextResponse.json({ error: "OPENAI_API_KEY is not configured." }, { status: 500 });
  }

  const openai = new OpenAI({ apiKey });

  const inputItems: ResponsesAPIInputItem[] = [];

  if (clientHistoryWithAppParts) {
    for (const prevMsg of clientHistoryWithAppParts) {
      const contentParts: Array<
        | { type: "input_text"; text: string }
        | { type: "input_image"; image_url: string }
        | { type: "input_file"; filename: string; file_data: string }
      > = [];

      if (prevMsg.parts && Array.isArray(prevMsg.parts)) {
        for (const appPart of prevMsg.parts) {
          if (appPart.type === "text" && appPart.text) {
            contentParts.push({ type: "input_text", text: appPart.text });
          } else if (appPart.type === "scraped_url" && appPart.text) {
            contentParts.push({ type: "input_text", text: appPart.text });
          } else if (appPart.type === "file" && appPart.objectName && appPart.mimeType) {
            const mimeType = appPart.mimeType.toLowerCase();

            if (SUPPORTED_OPENAI_IMAGE_TYPES.includes(mimeType)) {
              try {
                const fileStream = await minioClient.getObject(MINIO_BUCKET_NAME, appPart.objectName);
                const chunks: Buffer[] = [];
                for await (const chunk of fileStream) {
                  chunks.push(chunk as Buffer);
                }
                const fileBuffer = Buffer.concat(chunks);
                const base64Data = fileBuffer.toString("base64");
                contentParts.push({
                  type: "input_image",
                  image_url: `data:${mimeType};base64,${base64Data}`,
                });
              } catch (fileError) {
                console.error(`Failed to retrieve historical file ${appPart.objectName} from MinIO:`, fileError);
                return NextResponse.json(
                  {
                    error: `Failed to process historical file: ${appPart.fileName || appPart.objectName}`,
                  },
                  { status: 500 },
                );
              }
            } else if (SUPPORTED_OPENAI_DOCUMENT_TYPES.includes(mimeType)) {
              try {
                const fileStream = await minioClient.getObject(MINIO_BUCKET_NAME, appPart.objectName);
                const chunks: Buffer[] = [];
                for await (const chunk of fileStream) {
                  chunks.push(chunk as Buffer);
                }
                const fileBuffer = Buffer.concat(chunks);
                const base64Data = fileBuffer.toString("base64");
                const filename = appPart.fileName || appPart.objectName;

                // Send PDF directly as base64 to OpenAI Responses API
                contentParts.push({
                  type: "input_file",
                  filename,
                  file_data: `data:application/pdf;base64,${base64Data}`,
                });
              } catch (fileError) {
                console.error(`Failed to retrieve historical file ${appPart.objectName} from MinIO:`, fileError);
                return NextResponse.json(
                  {
                    error: `Failed to process historical file: ${appPart.fileName || appPart.objectName}`,
                  },
                  { status: 500 },
                );
              }
            } else {
              const extension = getFileExtension(appPart.fileName);
              const isTextFile =
                SOURCE_CODE_EXTENSIONS.includes(`.${extension}`) ||
                mimeType.startsWith("text/") ||
                mimeType === "application/json";

              if (isTextFile) {
                try {
                  const fileStream = await minioClient.getObject(MINIO_BUCKET_NAME, appPart.objectName);
                  const chunks: Buffer[] = [];
                  for await (const chunk of fileStream) {
                    chunks.push(chunk as Buffer);
                  }
                  const fileBuffer = Buffer.concat(chunks);
                  const textContent = fileBuffer.toString("utf-8");
                  const fileHeader = appPart.fileName ? `--- File: ${appPart.fileName} ---\n` : "";
                  contentParts.push({ type: "input_text", text: fileHeader + textContent });
                } catch (fileError) {
                  console.error(`Failed to retrieve historical file ${appPart.objectName} from MinIO:`, fileError);
                }
              } else {
                console.warn(
                  `Skipping historical file ${appPart.fileName || appPart.objectName} for OpenAI Responses API due to unsupported MIME type: ${appPart.mimeType}`,
                );
              }
            }
          }
        }
      }

      if (contentParts.length > 0) {
        const role = prevMsg.role === "model" ? "assistant" : "user";
        if (role === "assistant") {
          const textContent = contentParts
            .filter((p): p is { type: "input_text"; text: string } => p.type === "input_text")
            .map((p) => p.text)
            .join("\n");
          if (textContent) {
            inputItems.push({ role: "assistant", content: textContent });
          }
        } else {
          inputItems.push({ role: "user", content: contentParts });
        }
      }
    }
  }

  const newMessageContentParts: Array<
    | { type: "input_text"; text: string }
    | { type: "input_image"; image_url: string }
    | { type: "input_file"; filename: string; file_data: string }
  > = [];

  for (const appPart of newMessageAppParts) {
    if (appPart.type === "text" && appPart.text) {
      newMessageContentParts.push({ type: "input_text", text: appPart.text });
    } else if (appPart.type === "scraped_url" && appPart.text) {
      newMessageContentParts.push({ type: "input_text", text: appPart.text });
    } else if (appPart.type === "file" && appPart.objectName && appPart.mimeType) {
      const mimeType = appPart.mimeType.toLowerCase();

      if (SUPPORTED_OPENAI_IMAGE_TYPES.includes(mimeType)) {
        try {
          const fileStream = await minioClient.getObject(MINIO_BUCKET_NAME, appPart.objectName);
          const chunks: Buffer[] = [];
          for await (const chunk of fileStream) {
            chunks.push(chunk as Buffer);
          }
          const fileBuffer = Buffer.concat(chunks);
          const base64Data = fileBuffer.toString("base64");
          newMessageContentParts.push({
            type: "input_image",
            image_url: `data:${mimeType};base64,${base64Data}`,
          });
        } catch (fileError) {
          console.error(`Failed to retrieve or process file ${appPart.objectName} from MinIO for new message:`, fileError);
          return NextResponse.json(
            {
              error: `Failed to process file: ${appPart.fileName || appPart.objectName}`,
            },
            { status: 500 },
          );
        }
      } else if (SUPPORTED_OPENAI_DOCUMENT_TYPES.includes(mimeType)) {
        try {
          const fileStream = await minioClient.getObject(MINIO_BUCKET_NAME, appPart.objectName);
          const chunks: Buffer[] = [];
          for await (const chunk of fileStream) {
            chunks.push(chunk as Buffer);
          }
          const fileBuffer = Buffer.concat(chunks);
          const base64Data = fileBuffer.toString("base64");
          const filename = appPart.fileName || appPart.objectName;

          // Send PDF directly as base64 to OpenAI Responses API
          newMessageContentParts.push({
            type: "input_file",
            filename,
            file_data: `data:application/pdf;base64,${base64Data}`,
          });
        } catch (fileError) {
          console.error(`Failed to retrieve or process file ${appPart.objectName} from MinIO for new message:`, fileError);
          return NextResponse.json(
            {
              error: `Failed to process file: ${appPart.fileName || appPart.objectName}`,
            },
            { status: 500 },
          );
        }
      } else {
        const extension = getFileExtension(appPart.fileName);
        const isTextFile =
          SOURCE_CODE_EXTENSIONS.includes(`.${extension}`) ||
          mimeType.startsWith("text/") ||
          mimeType === "application/json";

        if (isTextFile) {
          try {
            const fileStream = await minioClient.getObject(MINIO_BUCKET_NAME, appPart.objectName);
            const chunks: Buffer[] = [];
            for await (const chunk of fileStream) {
              chunks.push(chunk as Buffer);
            }
            const fileBuffer = Buffer.concat(chunks);
            const textContent = fileBuffer.toString("utf-8");
            const fileHeader = appPart.fileName ? `--- File: ${appPart.fileName} ---\n` : "";
            newMessageContentParts.push({ type: "input_text", text: fileHeader + textContent });
          } catch (fileError) {
            console.error(`Failed to retrieve or process file ${appPart.objectName} from MinIO:`, fileError);
            return NextResponse.json(
              {
                error: `Failed to process file: ${appPart.fileName || appPart.objectName}`,
              },
              { status: 500 },
            );
          }
        } else {
          console.warn(
            `Skipping new file ${appPart.fileName || appPart.objectName} for OpenAI Responses API due to unsupported MIME type: ${appPart.mimeType}`,
          );
        }
      }
    }
  }

  if (newMessageContentParts.length === 0) {
    const hasActualTextContent = newMessageAppParts.some((p) => p.type === "text" && p.text && p.text.trim() !== "");
    if (!hasActualTextContent && newMessageAppParts.length > 0) {
      return NextResponse.json(
        {
          error:
            "All uploaded files have types unsupported by OpenAI or could not be processed. Supported types include images (PNG, JPEG, WEBP, GIF), PDFs, and text files.",
        },
        { status: 400 },
      );
    }
    return NextResponse.json(
      {
        error: "No valid content to send to OpenAI (message empty or all files unsupported/unprocessed).",
      },
      { status: 400 },
    );
  }

  inputItems.push({ role: "user", content: newMessageContentParts });

  const reasoningEffort = mapBudgetToOpenAIReasoningEffort(model, thinkingBudget);
  const effectiveVerbosity = verbosity ?? "medium";

  type ResponsesCreateParams = {
    model: string;
    input: ResponsesAPIInputItem[];
    instructions?: string;
    stream: true;
    reasoning?: { effort: string; summary?: string };
    text?: { format: { type: string }; verbosity?: string };
  };

  const requestOptions: ResponsesCreateParams = {
    model,
    input: inputItems,
    stream: true,
  };

  if (systemPromptText && systemPromptText.trim() !== "") {
    requestOptions.instructions = systemPromptText;
  }

  if (reasoningEffort !== "none") {
    requestOptions.reasoning = { effort: reasoningEffort, summary: "auto" };
  }

  requestOptions.text = { format: { type: "text" }, verbosity: effectiveVerbosity };

  const stream = await (openai.responses as unknown as {
    create(params: ResponsesCreateParams): Promise<AsyncIterable<{
      type: string;
      delta?: string;
      text?: string;
    }>>;
  }).create(requestOptions);

  const encoder = new TextEncoder();
  const readableStream = new ReadableStream({
    async start(controller) {
      let modelOutput = "";
      let hasReceivedContent = false;

      try {
        for await (const event of stream) {
          if (event.type === "response.output_text.delta" && event.delta) {
            modelOutput += event.delta;
            hasReceivedContent = true;
            const jsonChunk = { type: "text", value: event.delta };
            controller.enqueue(encoder.encode(JSON.stringify(jsonChunk) + "\n"));
          } else if (event.type === "response.reasoning_summary_text.delta" && event.delta) {
            const jsonChunk = { type: "thought", value: event.delta };
            controller.enqueue(encoder.encode(JSON.stringify(jsonChunk) + "\n"));
          } else if (event.type === "response.reasoning_text.delta" && event.delta) {
            const jsonChunk = { type: "thought", value: event.delta };
            controller.enqueue(encoder.encode(JSON.stringify(jsonChunk) + "\n"));
          } else if (event.type === "response.failed") {
            console.error("OpenAI Responses API stream failed:", event);
            const errorMessage = {
              type: "error",
              value: "The model encountered an error while generating a response.",
            };
            controller.enqueue(encoder.encode(JSON.stringify(errorMessage) + "\n"));
          } else if (event.type === "response.incomplete") {
            console.warn("OpenAI Responses API stream incomplete:", event);
            if (!hasReceivedContent) {
              const errorMessage = {
                type: "error",
                value: "The response was incomplete. Please try again.",
              };
              controller.enqueue(encoder.encode(JSON.stringify(errorMessage) + "\n"));
            }
          }
        }

        if (modelOutput.trim() === "" && !hasReceivedContent) {
          console.warn("OpenAI Responses API model returned an empty message. Not saving to DB.");
          const emptyMessageError = {
            type: "error",
            value: "Model returned an empty message. Please try again.",
          };
          controller.enqueue(encoder.encode(JSON.stringify(emptyMessageError) + "\n"));
        }
      } catch (streamError) {
        console.error("Error during OpenAI Responses API stream processing:", streamError);
        const errorMessage = {
          type: "error",
          value: "An error occurred during stream processing. Please try again.",
        };
        controller.enqueue(encoder.encode(JSON.stringify(errorMessage) + "\n"));
      } finally {
        controller.close();
      }
    },
    cancel() {
      console.log("OpenAI Responses API stream cancelled for chat session");
    },
  });

  return new Response(readableStream, {
    headers: {
      "Content-Type": "application/jsonl; charset=utf-8",
      "Cache-Control": "no-cache",
      Connection: "keep-alive",
    },
  });
}

type AnthropicContentBlock =
  | { type: "text"; text: string }
  | { type: "image"; source: { type: "base64"; media_type: string; data: string } }
  | { type: "document"; source: { type: "base64"; media_type: "application/pdf"; data: string } };

type AnthropicMessage = {
  role: "user" | "assistant";
  content: string | AnthropicContentBlock[];
};

async function handleAnthropicRequest(
  model: string,
  newMessageAppParts: MessagePart[],
  clientHistoryWithAppParts: Array<{ role: string; parts: MessagePart[] }>,
  systemPromptText: string | null,
  thinkingBudget: number | undefined,
): Promise<Response> {
  const apiKey = process.env.ANTHROPIC_API_KEY;

  if (!apiKey) {
    return NextResponse.json({ error: "ANTHROPIC_API_KEY is not configured." }, { status: 500 });
  }

  const anthropic = new Anthropic({ apiKey });

  const messages: AnthropicMessage[] = [];

  // Build history messages
  if (clientHistoryWithAppParts) {
    for (const prevMsg of clientHistoryWithAppParts) {
      const contentBlocks: AnthropicContentBlock[] = [];

      if (prevMsg.parts && Array.isArray(prevMsg.parts)) {
        for (const appPart of prevMsg.parts) {
          if (appPart.type === "text" && appPart.text) {
            contentBlocks.push({ type: "text", text: appPart.text });
          } else if (appPart.type === "scraped_url" && appPart.text) {
            contentBlocks.push({ type: "text", text: appPart.text });
          } else if (appPart.type === "file" && appPart.objectName && appPart.mimeType) {
            if (prevMsg.role !== "user") continue;

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
                console.error(`Failed to retrieve historical file ${appPart.objectName} from MinIO:`, fileError);
                return NextResponse.json(
                  { error: `Failed to process historical file: ${appPart.fileName || appPart.objectName}` },
                  { status: 500 },
                );
              }
            } else if (SUPPORTED_ANTHROPIC_DOCUMENT_TYPES.includes(mimeType)) {
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
                console.error(`Failed to retrieve historical file ${appPart.objectName} from MinIO:`, fileError);
                return NextResponse.json(
                  { error: `Failed to process historical file: ${appPart.fileName || appPart.objectName}` },
                  { status: 500 },
                );
              }
            } else {
              const extension = getFileExtension(appPart.fileName);
              const isTextFile =
                SOURCE_CODE_EXTENSIONS.includes(`.${extension}`) ||
                mimeType.startsWith("text/") ||
                mimeType === "application/json";

              if (isTextFile) {
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
                  console.error(`Failed to retrieve historical file ${appPart.objectName} from MinIO:`, fileError);
                }
              } else {
                console.warn(
                  `Skipping historical file ${appPart.fileName || appPart.objectName} for Anthropic due to unsupported MIME type: ${appPart.mimeType}`,
                );
              }
            }
          }
        }
      }

      if (contentBlocks.length > 0) {
        const role = prevMsg.role === "model" ? "assistant" : "user";
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

  // Build new message content blocks
  const newMessageBlocks: AnthropicContentBlock[] = [];

  for (const appPart of newMessageAppParts) {
    if (appPart.type === "text" && appPart.text) {
      newMessageBlocks.push({ type: "text", text: appPart.text });
    } else if (appPart.type === "scraped_url" && appPart.text) {
      newMessageBlocks.push({ type: "text", text: appPart.text });
    } else if (appPart.type === "file" && appPart.objectName && appPart.mimeType) {
      const mimeType = appPart.mimeType.toLowerCase();

      if (SUPPORTED_ANTHROPIC_IMAGE_TYPES.includes(mimeType)) {
        try {
          const fileStream = await minioClient.getObject(MINIO_BUCKET_NAME, appPart.objectName);
          const chunks: Buffer[] = [];
          for await (const chunk of fileStream) {
            chunks.push(chunk as Buffer);
          }
          const fileBuffer = Buffer.concat(chunks);
          newMessageBlocks.push({
            type: "image",
            source: {
              type: "base64",
              media_type: mimeType,
              data: fileBuffer.toString("base64"),
            },
          });
        } catch (fileError) {
          console.error(`Failed to retrieve or process file ${appPart.objectName} from MinIO:`, fileError);
          return NextResponse.json(
            { error: `Failed to process file: ${appPart.fileName || appPart.objectName}` },
            { status: 500 },
          );
        }
      } else if (SUPPORTED_ANTHROPIC_DOCUMENT_TYPES.includes(mimeType)) {
        try {
          const fileStream = await minioClient.getObject(MINIO_BUCKET_NAME, appPart.objectName);
          const chunks: Buffer[] = [];
          for await (const chunk of fileStream) {
            chunks.push(chunk as Buffer);
          }
          const fileBuffer = Buffer.concat(chunks);
          newMessageBlocks.push({
            type: "document",
            source: {
              type: "base64",
              media_type: "application/pdf",
              data: fileBuffer.toString("base64"),
            },
          });
        } catch (fileError) {
          console.error(`Failed to retrieve or process file ${appPart.objectName} from MinIO:`, fileError);
          return NextResponse.json(
            { error: `Failed to process file: ${appPart.fileName || appPart.objectName}` },
            { status: 500 },
          );
        }
      } else {
        const extension = getFileExtension(appPart.fileName);
        const isTextFile =
          SOURCE_CODE_EXTENSIONS.includes(`.${extension}`) ||
          mimeType.startsWith("text/") ||
          mimeType === "application/json";

        if (isTextFile) {
          try {
            const fileStream = await minioClient.getObject(MINIO_BUCKET_NAME, appPart.objectName);
            const chunks: Buffer[] = [];
            for await (const chunk of fileStream) {
              chunks.push(chunk as Buffer);
            }
            const fileBuffer = Buffer.concat(chunks);
            const textContent = fileBuffer.toString("utf-8");
            const fileHeader = appPart.fileName ? `--- File: ${appPart.fileName} ---\n` : "";
            newMessageBlocks.push({ type: "text", text: fileHeader + textContent });
          } catch (fileError) {
            console.error(`Failed to retrieve or process file ${appPart.objectName} from MinIO:`, fileError);
            return NextResponse.json(
              { error: `Failed to process file: ${appPart.fileName || appPart.objectName}` },
              { status: 500 },
            );
          }
        } else {
          console.warn(
            `Skipping new file ${appPart.fileName || appPart.objectName} for Anthropic due to unsupported MIME type: ${appPart.mimeType}`,
          );
        }
      }
    }
  }

  if (newMessageBlocks.length === 0) {
    const hasActualTextContent = newMessageAppParts.some((p) => p.type === "text" && p.text && p.text.trim() !== "");
    if (!hasActualTextContent && newMessageAppParts.length > 0) {
      return NextResponse.json(
        {
          error:
            "All uploaded files have types unsupported by Anthropic or could not be processed. Supported types include images (JPEG, PNG, GIF, WebP), PDFs, and text files.",
        },
        { status: 400 },
      );
    }
    return NextResponse.json(
      { error: "No valid content to send to Anthropic (message empty or all files unsupported/unprocessed)." },
      { status: 400 },
    );
  }

  messages.push({ role: "user", content: newMessageBlocks });

  // Build request parameters
  const effort = mapBudgetToAnthropicEffort(model, thinkingBudget);

  /* eslint-disable @typescript-eslint/no-explicit-any */
  const requestParams: any = {
    model,
    max_tokens: 128000,
    messages,
    thinking: {
      type: "adaptive",
    },
    output_config: {
      effort,
    },
  };
  /* eslint-enable @typescript-eslint/no-explicit-any */

  if (systemPromptText && systemPromptText.trim() !== "") {
    requestParams.system = systemPromptText;
  }

  const stream = anthropic.messages.stream(requestParams);

  const encoder = new TextEncoder();
  const readableStream = new ReadableStream({
    async start(controller) {
      let modelOutput = "";
      let thoughtSummaryOutput = "";

      try {
        stream.on("text", (text) => {
          modelOutput += text;
          const jsonChunk = { type: "text", value: text };
          controller.enqueue(encoder.encode(JSON.stringify(jsonChunk) + "\n"));
        });

        stream.on("streamEvent", (event) => {
          if (event.type === "content_block_delta" && event.delta.type === "thinking_delta") {
            const thinkingText = (event.delta as { type: "thinking_delta"; thinking: string }).thinking;
            thoughtSummaryOutput += thinkingText;
            const jsonChunk = { type: "thought", value: thinkingText };
            controller.enqueue(encoder.encode(JSON.stringify(jsonChunk) + "\n"));
          }
        });

        await stream.finalMessage();

        if (modelOutput.trim() === "") {
          console.warn(
            `Anthropic model returned an empty message (thoughts received: ${thoughtSummaryOutput.trim() !== ""}). Not saving to DB.`,
          );
          const emptyMessageError = {
            type: "error",
            value: "Model returned an empty message. Please try again.",
          };
          controller.enqueue(encoder.encode(JSON.stringify(emptyMessageError) + "\n"));
        }
      } catch (streamError) {
        console.error("Error during Anthropic stream processing:", streamError);
        const errorMessage = {
          type: "error",
          value: "An error occurred during stream processing. Please try again.",
        };
        controller.enqueue(encoder.encode(JSON.stringify(errorMessage) + "\n"));
      } finally {
        controller.close();
      }
    },
    cancel() {
      stream.abort();
      console.log("Anthropic stream cancelled for chat session");
    },
  });

  return new Response(readableStream, {
    headers: {
      "Content-Type": "application/jsonl; charset=utf-8",
      "Cache-Control": "no-cache",
      Connection: "keep-alive",
    },
  });
}

export async function POST(request: NextRequest) {
  const userIdHeader = request.headers.get("x-user-id");
  if (!userIdHeader) {
    return NextResponse.json({ error: "Unauthorized: Missing user identification" }, { status: 401 });
  }
  const userId = parseInt(userIdHeader, 10);
  if (isNaN(userId)) {
    return NextResponse.json({ error: "Invalid user ID" }, { status: 401 });
  }

  const {
    history: clientHistoryWithAppParts,
    messageParts: originalNewMessageAppParts,
    chatSessionId,
    model,
    isSearchActive,
    thinkingBudget,
    projectId,
    systemPrompt: newChatSystemPrompt,
    verbosity,
  } = (await request.json()) as Omit<ChatRequest, "keySelection" | "isRegeneration">;

  const newMessageAppParts: MessagePart[] = [...originalNewMessageAppParts];

  if (!model) {
    return NextResponse.json({ error: "model missing" }, { status: 400 });
  }

  const provider: ModelProvider = getProviderForModel(model) ?? "gemini";

  const systemPromptText = await fetchSystemPrompt(newChatSystemPrompt, chatSessionId, projectId, userId);

  try {
    if (provider === "anthropic") {
      return await handleAnthropicRequest(
        model,
        newMessageAppParts,
        clientHistoryWithAppParts,
        systemPromptText,
        thinkingBudget,
      );
    } else if (provider === "openai") {
      if (isGPT5FamilyModel(model)) {
        return await handleOpenAIResponsesAPIRequest(
          model,
          newMessageAppParts,
          clientHistoryWithAppParts,
          systemPromptText,
          thinkingBudget,
          verbosity,
        );
      } else {
        return await handleOpenAIRequest(
          model,
          newMessageAppParts,
          clientHistoryWithAppParts,
          systemPromptText,
          thinkingBudget,
          verbosity,
        );
      }
    } else if (provider === "custom-openai") {
      return await handleCustomOpenAIRequest(
        model,
        newMessageAppParts,
        clientHistoryWithAppParts,
        systemPromptText,
        userId,
      );
    } else {
      return await handleGeminiRequest(
        model,
        newMessageAppParts,
        clientHistoryWithAppParts,
        systemPromptText,
        isSearchActive,
        thinkingBudget,
      );
    }
  } catch (error: unknown) {
    console.error(`Error in ${provider} API call:`, error);

    let detailedError = "An unknown error occurred during the API call.";
    let status = 500;

    if (typeof error === "object" && error !== null) {
      if ("status" in error && typeof (error as { status: unknown }).status === "number") {
        status = (error as { status: number }).status;
      }

      if ("message" in error && typeof (error as { message: unknown }).message === "string") {
        let errorMessage = (error as { message: string }).message;
        try {
          const match = errorMessage.match(/{.*}/s);
          if (match && match[0]) {
            const jsonError = JSON.parse(match[0]);
            if (jsonError.error && jsonError.error.message) {
              errorMessage = jsonError.error.message;
            }
          }
        } catch {
          console.warn("Could not parse nested JSON from error message.");
        }
        detailedError = errorMessage;
      }
    } else {
      detailedError = String(error);
    }

    return NextResponse.json({ error: detailedError }, { status });
  }
}
