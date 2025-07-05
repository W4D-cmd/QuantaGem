import { NextRequest, NextResponse } from "next/server";
import { Content, GoogleGenAI, Part } from "@google/genai";
import { pool } from "@/lib/db";
import { getUserFromToken } from "@/lib/auth";
import { MessagePart } from "@/app/page";
import { minioClient, MINIO_BUCKET_NAME } from "@/lib/minio";

interface CountTokensRequest {
  history: Array<{ role: string; parts: MessagePart[] }>;
  model: string;
  keySelection: "free" | "paid";
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

  const { history, model, keySelection, chatSessionId } = (await request.json()) as CountTokensRequest;

  const apiKey = keySelection === "paid" ? process.env.PAID_GOOGLE_API_KEY : process.env.FREE_GOOGLE_API_KEY;

  if (!apiKey) {
    return NextResponse.json({ error: `${keySelection.toUpperCase()}_GOOGLE_API_KEY not configured` }, { status: 500 });
  }
  if (!model) {
    return NextResponse.json({ error: "model missing" }, { status: 400 });
  }

  const genAI = new GoogleGenAI({ apiKey });
  const contentsForApi: Content[] = [];

  try {
    let systemPromptText: string | null = null;
    if (chatSessionId) {
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
    }

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

    const response = await genAI.models.countTokens({ model, contents: contentsForApi });
    return NextResponse.json({ totalTokens: response.totalTokens });
  } catch (error) {
    console.error("Error in token counting:", error);
    const detailedError = error instanceof Error ? error.message : String(error);
    return NextResponse.json({ error: detailedError }, { status: 500 });
  }
}
