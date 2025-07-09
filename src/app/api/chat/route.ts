import { Content, GoogleGenAI, GroundingMetadata, Part } from "@google/genai";
import { NextRequest, NextResponse } from "next/server";
import { pool } from "@/lib/db";
import { MessagePart } from "@/app/page";
import { MINIO_BUCKET_NAME, minioClient } from "@/lib/minio";
import { getUserFromToken } from "@/lib/auth";

interface ChatRequest {
  history: Array<{ role: string; parts: MessagePart[] }>;
  messageParts: MessagePart[];
  chatSessionId: string;
  model: string;
  keySelection: "free" | "paid";
  isSearchActive?: boolean;
  isRegeneration?: boolean;
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

const SOURCE_CODE_EXTENSIONS = [
  // Web Development
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
  // Backend & General Purpose
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
  // Shell & Scripting
  ".sh",
  ".bash",
  ".zsh",
  ".ps1",
  ".psm1",
  ".psd1",
  ".bat",
  ".cmd",
  // Data & Configuration
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
  // Build & Infrastructure
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
  // SQL
  ".sql",
  ".ddl",
  ".dml",
  // Markup & Docs
  ".md",
  ".markdown",
  ".rst",
  ".adoc",
  ".asciidoc",
  ".tex",
  ".bib",
  // Other text-based formats
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

export async function POST(request: NextRequest) {
  const user = await getUserFromToken(request);
  if (!user) {
    return NextResponse.json({ error: "Unauthorized: User not authenticated" }, { status: 401 });
  }
  const userId = user.id.toString();

  const {
    history: clientHistoryWithAppParts,
    messageParts: newMessageAppParts,
    chatSessionId,
    model,
    keySelection,
    isSearchActive,
    isRegeneration,
  } = (await request.json()) as ChatRequest;

  const apiKey = keySelection === "paid" ? process.env.PAID_GOOGLE_API_KEY : process.env.FREE_GOOGLE_API_KEY;

  if (!apiKey) {
    return NextResponse.json({ error: `${keySelection.toUpperCase()}_GOOGLE_API_KEY not configured` }, { status: 500 });
  }
  if (!chatSessionId) {
    return NextResponse.json({ error: "chatSessionId missing" }, { status: 400 });
  }
  if (!model) {
    return NextResponse.json({ error: "model missing" }, { status: 400 });
  }

  const genAI = new GoogleGenAI({ apiKey });

  const newMessageGeminiParts: Part[] = [];
  let combinedUserTextForDB = "";

  for (const appPart of newMessageAppParts) {
    if (appPart.type === "text" && appPart.text) {
      newMessageGeminiParts.push({ text: appPart.text });
      combinedUserTextForDB += (combinedUserTextForDB ? " " : "") + appPart.text;
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
        combinedUserTextForDB +=
          (combinedUserTextForDB ? " " : "") +
          `[file: ${appPart.fileName || "file"} - type ${appPart.mimeType} unsupported by AI]`;
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
        if (appPart.fileName) {
          combinedUserTextForDB += (combinedUserTextForDB ? " " : "") + `[file: ${appPart.fileName}]`;
        }
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

  try {
    if (!isRegeneration) {
      await pool.query(
        `INSERT INTO messages (chat_session_id, role, content, parts, position, sources)
         SELECT $1, $2, $3, $4, COALESCE(MAX(position), 0) + 1, $5
         FROM messages
         WHERE chat_session_id = $1`,
        [chatSessionId, "user", combinedUserTextForDB, JSON.stringify(newMessageAppParts), JSON.stringify([])],
      );
    }

    const historyGeminiContents: Content[] = [];
    if (clientHistoryWithAppParts) {
      for (const prevMsg of clientHistoryWithAppParts) {
        const prevMsgGeminiParts: Part[] = [];
        for (const appPart of prevMsg.parts) {
          if (appPart.type === "text" && appPart.text) {
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
            } else if (prevMsg.role === "model" && appPart.text) {
              prevMsgGeminiParts.push({ text: appPart.text });
            }
          }
        }
        if (prevMsgGeminiParts.length > 0 || prevMsg.role === "model") {
          historyGeminiContents.push({
            role: prevMsg.role,
            parts: prevMsgGeminiParts,
          });
        }
      }
    }

    const contentsForApi: Content[] = [...historyGeminiContents, { role: "user", parts: newMessageGeminiParts }];

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
      console.warn("Failed to fetch system prompt, proceeding without it:", dbError);
    }

    const generationConfig: {
      systemInstruction?: string;
      tools?: Array<{ googleSearch: Record<string, never> }>;
    } = {};

    if (systemPromptText && systemPromptText.trim() !== "") {
      generationConfig.systemInstruction = systemPromptText;
    }

    if (isSearchActive) {
      generationConfig.tools = [{ googleSearch: {} }];
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
        const sourcesToStore: Array<{ title: string; uri: string }> = [];

        for await (const chunk of streamingResult) {
          if (chunk.text) {
            modelOutput += chunk.text;
            const jsonTextChunk = { type: "text", value: chunk.text };
            controller.enqueue(encoder.encode(JSON.stringify(jsonTextChunk) + "\n"));
          }

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
          }
        }

        if (modelOutput.trim() === "") {
          console.warn("Gemini model returned an empty message.");
          const emptyMessageError = {
            type: "error",
            value: "Model returned an empty message. Please try again.",
          };
          controller.enqueue(encoder.encode(JSON.stringify(emptyMessageError) + "\n"));
        } else {
          await pool.query(
            `INSERT INTO messages (chat_session_id, role, content, parts, position, sources)
             SELECT $1, $2, $3, $4, COALESCE(MAX(position), 0) + 1, $5
             FROM messages
             WHERE chat_session_id = $1`,
            [
              chatSessionId,
              "model",
              modelOutput,
              JSON.stringify([{ type: "text", text: modelOutput }]),
              JSON.stringify(sourcesToStore),
            ],
          );
          await pool.query(
            `UPDATE chat_sessions
             SET last_model = $2,
                 key_selection = $3,
                 updated_at = now()
             WHERE id = $1
               AND user_id = $4`,
            [chatSessionId, model, keySelection, userId],
          );
        }
        controller.close();
      },
      cancel() {},
    });
    return new Response(readableStream, {
      headers: { "Content-Type": "application/jsonl; charset=utf-8" },
    });
  } catch (error) {
    console.error("Error in Gemini API call or DB operation:", error);
    let detailedError = error instanceof Error ? error.message : String(error);
    if (error instanceof Error && error.message.includes("got status: 400 Bad Request.")) {
      try {
        const match = error.message.match(/{.*}/s);
        if (match && match[0]) {
          const jsonError = JSON.parse(match[0]);
          if (jsonError.error && jsonError.error.message) {
            try {
              const nestedJsonError = JSON.parse(jsonError.error.message);
              if (nestedJsonError.error && nestedJsonError.error.message) {
                detailedError = `Gemini API Error: ${nestedJsonError.error.message}`;
              } else {
                detailedError = `Gemini API Error: ${jsonError.error.message}`;
              }
            } catch (e_nested_parsing) {
              console.warn("Failed to parse nested Gemini error message string:", e_nested_parsing);
              detailedError = `Gemini API Error: ${jsonError.error.message}`;
            }
          }
        }
      } catch (e_main_parsing) {
        console.warn("Failed to parse main Gemini error message string:", e_main_parsing);
      }
    }
    return NextResponse.json({ error: detailedError }, { status: 500 });
  }
}
