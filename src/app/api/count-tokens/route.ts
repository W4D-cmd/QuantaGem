import { NextRequest, NextResponse } from "next/server";
import { Content, Part } from "@google/genai";
import { pool } from "@/lib/db";
import { getUserFromToken } from "@/lib/auth";
import { MessagePart } from "@/app/page";
import { getGoogleGenAI } from "@/lib/google-genai";

interface CountTokensRequest {
  history: Array<{ role: string; parts: MessagePart[] }>;
  model: string;
  chatSessionId: number;
}

export async function POST(request: NextRequest) {
  const user = await getUserFromToken(request);
  if (!user) {
    return NextResponse.json({ error: "Unauthorized: User not authenticated" }, { status: 401 });
  }
  const userId = user.id.toString();

  const { history, model, chatSessionId } = (await request.json()) as CountTokensRequest;

  if (!model) {
    return NextResponse.json({ error: "model missing" }, { status: 400 });
  }

  const genAI = getGoogleGenAI();
  const contentsForApi: Content[] = [];

  try {
    let systemPromptText: string | null = null;
    if (chatSessionId) {
      try {
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

        if (!systemPromptText) {
          const globalSettingsResult = await pool.query("SELECT system_prompt FROM user_settings WHERE user_id = $1", [
            userId,
          ]);
          if (globalSettingsResult.rows[0]?.system_prompt?.trim()) {
            systemPromptText = globalSettingsResult.rows[0].system_prompt;
          }
        }
      } catch (dbError) {
        console.warn("Failed to fetch system prompt for token counting, proceeding without it:", dbError);
      }
    }

    if (systemPromptText) {
      contentsForApi.push({ role: "user", parts: [{ text: systemPromptText }] });
      contentsForApi.push({ role: "model", parts: [{ text: "OK" }] });
    }

    for (const msg of history) {
      const msgGeminiParts: Part[] = [];
      for (const appPart of msg.parts) {
        if (appPart.type === "text" && appPart.text) {
          msgGeminiParts.push({ text: appPart.text });
        } else if (appPart.type === "file" && appPart.googleFileUri && appPart.mimeType) {
          msgGeminiParts.push({
            fileData: {
              fileUri: appPart.googleFileUri,
              mimeType: appPart.mimeType,
            },
          });
        }
      }
      if (msgGeminiParts.length > 0) {
        contentsForApi.push({ role: msg.role, parts: msgGeminiParts });
      }
    }

    const { totalTokens } = await genAI.models.countTokens({ model, contents: contentsForApi });
    return NextResponse.json({ totalTokens });
  } catch (error) {
    console.error("Error in token counting:", error);
    const detailedError = error instanceof Error ? error.message : String(error);
    return NextResponse.json({ error: detailedError }, { status: 500 });
  }
}
