import { NextRequest, NextResponse } from "next/server";
import { pool } from "@/lib/db";
import { MessagePart } from "@/app/page";
import { MINIO_BUCKET_NAME, minioClient } from "@/lib/minio";
import { getUserFromToken } from "@/lib/auth";
import * as cheerio from "cheerio";

type OpenAIMessageContent =
  | string
  | (
      | { type: "text"; text: string }
      | { type: "image_url"; image_url: { url: string } }
      | { type: "file"; file: { filename: string; file_data: string } }
    )[];

interface OpenAIMessage {
  role: "user" | "assistant" | "system";
  content: OpenAIMessageContent;
}

interface ChatRequest {
  history: Array<{ role: string; parts: MessagePart[] }>;
  messageParts: MessagePart[];
  chatSessionId: string;
  model: string;
  isSearchActive?: boolean;
  isRegeneration?: boolean;
  systemPrompt?: string;
  projectId?: number | null;
}

const TEXT_MIME_TYPES = new Set([
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
  "application/json",
  "application/xml",
  "application/sql",
]);

const SOURCE_CODE_EXTENSIONS = new Set([
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
  ".jsonc",
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
  ".rst",
  ".adoc",
  ".asciidoc",
  ".tex",
  ".bib",
  ".txt",
  ".tsv",
  ".log",
  ".diff",
  ".patch",
  ".svg",
  ".ipynb",
]);

function isTextBasedFile(mimeType: string, fileName?: string): boolean {
  if (TEXT_MIME_TYPES.has(mimeType.toLowerCase())) {
    return true;
  }
  if (fileName) {
    const extension = `.${fileName.split(".").pop() || ""}`.toLowerCase();
    if (SOURCE_CODE_EXTENSIONS.has(extension)) {
      return true;
    }
  }
  return false;
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
  } catch (error) {}

  try {
    const response = await fetch(url, {
      headers: { "User-Agent": REALISTIC_USER_AGENT },
      signal: AbortSignal.timeout(20000),
    });
    if (response.ok) {
      const html = await response.text();
      return parseHtml(html);
    }
    return null;
  } catch (error) {
    return null;
  }
}

async function convertAppPartsToOAIContent(
  appParts: MessagePart[],
): Promise<{ oaiContent: OpenAIMessageContent; combinedText: string }> {
  const oaiContentParts: Exclude<OpenAIMessageContent, string> = [];
  const textParts: string[] = [];

  for (const part of appParts) {
    if (part.type === "text" && part.text) {
      textParts.push(part.text);
    } else if (part.type === "scraped_url" && part.text) {
      textParts.push(part.text);
    } else if (part.type === "file" && part.objectName && part.mimeType && part.fileName) {
      try {
        const fileStream = await minioClient.getObject(MINIO_BUCKET_NAME, part.objectName);
        const chunks: Buffer[] = [];
        for await (const chunk of fileStream) {
          chunks.push(chunk as Buffer);
        }
        const fileBuffer = Buffer.concat(chunks);

        if (isTextBasedFile(part.mimeType, part.fileName)) {
          const fileText = fileBuffer.toString("utf-8");
          const textBlock = `--- START OF FILE: ${part.fileName} ---\n${fileText}\n--- END OF FILE: ${part.fileName} ---`;
          textParts.push(textBlock);
        } else {
          const base64data = fileBuffer.toString("base64");
          if (part.mimeType.startsWith("image/")) {
            oaiContentParts.push({
              type: "image_url",
              image_url: { url: `data:${part.mimeType};base64,${base64data}` },
            });
          } else if (part.mimeType === "application/pdf") {
            oaiContentParts.push({
              type: "file",
              file: {
                filename: part.fileName,
                file_data: `data:application/pdf;base64,${base64data}`,
              },
            });
          } else {
            textParts.push(`[Unsupported file attached: ${part.fileName}]`);
          }
        }
      } catch (fileError) {
        console.error(`Failed to process file ${part.objectName}:`, fileError);
        textParts.push(`[Error processing file: ${part.fileName}]`);
      }
    }
  }

  const combinedText = textParts.join("\n\n");
  if (combinedText.trim()) {
    oaiContentParts.unshift({ type: "text", text: combinedText });
  }

  return {
    oaiContent: oaiContentParts,
    combinedText: combinedText.trim(),
  };
}

export async function POST(request: NextRequest) {
  const user = await getUserFromToken(request);
  if (!user) {
    return NextResponse.json({ error: "Unauthorized: User not authenticated" }, { status: 401 });
  }
  const userId = user.id.toString();

  const {
    history: clientHistoryWithAppParts,
    messageParts: originalNewMessageAppParts,
    chatSessionId,
    model,
    isRegeneration,
    projectId,
    systemPrompt: newChatSystemPrompt,
  } = (await request.json()) as ChatRequest;

  const apiKey = process.env.OPENAI_API_KEY;
  const baseUrl = process.env.OPENAI_API_BASE_URL;

  if (!apiKey || !baseUrl) {
    return NextResponse.json({ error: "OpenAI API key or base URL not configured" }, { status: 500 });
  }
  if (!model) {
    return NextResponse.json({ error: "Model missing" }, { status: 400 });
  }

  try {
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

    const messagesForApi: OpenAIMessage[] = [];

    let systemPromptText: string | null = null;
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

    if (systemPromptText) {
      messagesForApi.push({ role: "system", content: systemPromptText });
    }

    for (const prevMsg of clientHistoryWithAppParts) {
      const { oaiContent } = await convertAppPartsToOAIContent(prevMsg.parts);
      if ((oaiContent as unknown[]).length > 0) {
        messagesForApi.push({
          role: prevMsg.role === "model" ? "assistant" : "user",
          content: oaiContent,
        });
      }
    }

    const { oaiContent: newMsgOaiContent } = await convertAppPartsToOAIContent(newMessageAppParts);
    if ((newMsgOaiContent as unknown[]).length > 0) {
      messagesForApi.push({ role: "user", content: newMsgOaiContent });
    }

    const apiResponse = await fetch(`${baseUrl}/chat/completions`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${apiKey}`,
      },
      body: JSON.stringify({
        model: model,
        messages: messagesForApi,
        stream: true,
      }),
    });

    if (!apiResponse.ok) {
      const errorBody = await apiResponse.json();
      return NextResponse.json({ error: errorBody.error?.message || "API Error" }, { status: apiResponse.status });
    }

    const encoder = new TextEncoder();
    const readableStream = new ReadableStream({
      async start(controller) {
        const reader = apiResponse.body!.getReader();
        const decoder = new TextDecoder();
        let buffer = "";

        while (true) {
          const { done, value } = await reader.read();
          if (done) {
            break;
          }
          buffer += decoder.decode(value, { stream: true });
          const lines = buffer.split("\n");
          buffer = lines.pop() || "";

          for (const line of lines) {
            if (line.startsWith("data: ")) {
              const data = line.substring(6);
              if (data.trim() === "[DONE]") {
                controller.close();
                return;
              }
              try {
                const json = JSON.parse(data);
                const textChunk = json.choices?.[0]?.delta?.content;
                if (textChunk) {
                  const jsonlChunk = { type: "text", value: textChunk };
                  controller.enqueue(encoder.encode(JSON.stringify(jsonlChunk) + "\n"));
                }
              } catch (e) {
                console.error("Error parsing stream chunk:", e);
              }
            }
          }
        }
        controller.close();
      },
    });

    return new Response(readableStream, {
      headers: { "Content-Type": "application/jsonl; charset=utf-8" },
    });
  } catch (error: unknown) {
    console.error("Error in chat API handler:", error);
    const detailedError = error instanceof Error ? error.message : "An unknown server error occurred.";
    return NextResponse.json({ error: detailedError }, { status: 500 });
  }
}
