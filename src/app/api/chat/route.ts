import { Content, GoogleGenAI, GroundingMetadata, Part, HarmCategory, HarmBlockThreshold } from "@google/genai";
import { NextRequest, NextResponse } from "next/server";
import { pool } from "@/lib/db";
import { MessagePart } from "@/app/page";
import { MINIO_BUCKET_NAME, minioClient } from "@/lib/minio";
import * as cheerio from "cheerio";

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

function getFileExtension(fileName?: string): string {
  if (!fileName) return "";
  return (fileName.split(".").pop() || "").toLowerCase();
}

async function scrapeUrl(url: string): Promise<string | null> {
  const GOOGLEBOT_USER_AGENT = "Mozilla/5.0 (compatible; Googlebot/2.1; +http://www.google.com/bot.html)";
  const REALISTIC_USER_AGENT =
    "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/125.0.0.0 Safari/537.36";

  const parseHtml = (html: string): string => {
    const $ = cheerio.load(html);
    $("script, style, nav, footer, header, aside, form, .sidebar, #sidebar").remove();
    return $("body").text().replace(/\s\s+/g, " ").trim();
  };

  try {
    const response = await fetch(url, {
      headers: { "User-Agent": GOOGLEBOT_USER_AGENT },
      signal: AbortSignal.timeout(15000),
    });
    if (response.ok) {
      const html = await response.text();
      return parseHtml(html);
    }
    console.warn(`Googlebot scrape for ${url} failed with status: ${response.status}. Retrying...`);
  } catch (error) {
    console.warn(`Googlebot scrape for ${url} threw an error. Retrying...`, error);
  }

  try {
    const response = await fetch(url, {
      headers: { "User-Agent": REALISTIC_USER_AGENT },
      signal: AbortSignal.timeout(20000),
    });
    if (response.ok) {
      const html = await response.text();
      return parseHtml(html);
    }
    console.error(`Fallback scrape for ${url} also failed with status: ${response.status}`);
    return null;
  } catch (error) {
    console.error(`Fallback scrape for ${url} also failed with an error:`, error);
    return null;
  }
}

export async function POST(request: NextRequest) {
  const userIdHeader = request.headers.get("x-user-id");
  if (!userIdHeader) {
    return NextResponse.json({ error: "Unauthorized: Missing user identification" }, { status: 401 });
  }
  const userId = parseInt(userIdHeader, 10);

  const {
    history: clientHistoryWithAppParts,
    messageParts: originalNewMessageAppParts,
    chatSessionId,
    model,
    isSearchActive,
    thinkingBudget,
    projectId,
    systemPrompt: newChatSystemPrompt,
  } = (await request.json()) as Omit<ChatRequest, "keySelection" | "isRegeneration">;

  const newMessageAppParts: MessagePart[] = [...originalNewMessageAppParts];
  const urlRegex = /https?:\/\/[^\s"'<>()]+/g;
  const scrapingPromises: Promise<MessagePart | null>[] = [];

  for (const part of originalNewMessageAppParts) {
    if (part.type === "text" && part.text) {
      const urls = part.text.match(urlRegex);
      if (urls) {
        const uniqueUrls = [...new Set(urls)];
        for (const url of uniqueUrls) {
          const promise = scrapeUrl(url).then((scrapedText): MessagePart | null => {
            if (scrapedText) {
              return {
                type: "scraped_url",
                text: `CONTEXT FROM ${url}:\n---\n${scrapedText}\n---`,
                url: url,
              };
            }
            return null;
          });
          scrapingPromises.push(promise);
        }
      }
    }
  }

  if (scrapingPromises.length > 0) {
    const scrapedParts = await Promise.all(scrapingPromises);
    scrapedParts.forEach((part) => {
      if (part) {
        newMessageAppParts.push(part);
      }
    });
  }

  const cloudProjectId = process.env.GOOGLE_CLOUD_PROJECT;
  const location = process.env.GOOGLE_CLOUD_LOCATION || "global";

  if (!cloudProjectId) {
    return NextResponse.json({ error: "GOOGLE_CLOUD_PROJECT is not configured." }, { status: 500 });
  }

  if (!model) {
    return NextResponse.json({ error: "model missing" }, { status: 400 });
  }

  const genAI = new GoogleGenAI({ vertexai: true, project: cloudProjectId, location: location });

  const newMessageGeminiParts: Part[] = [];
  let combinedUserTextForDB = "";

  for (const appPart of newMessageAppParts) {
    if (appPart.type === "text" && appPart.text) {
      newMessageGeminiParts.push({ text: appPart.text });
      combinedUserTextForDB += (combinedUserTextForDB ? " " : "") + appPart.text;
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
        controller.close();
      },
      cancel() {},
    });
    return new Response(readableStream, {
      headers: { "Content-Type": "application/jsonl; charset=utf-8" },
    });
  } catch (error: unknown) {
    console.error("Error in Gemini API call or DB operation:", error);

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
        } catch (e) {
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
