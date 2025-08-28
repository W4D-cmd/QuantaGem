import { NextRequest, NextResponse } from "next/server";
import { pool } from "@/lib/db";
import { getUserFromToken } from "@/lib/auth";
import { MessagePart } from "@/app/page";
import { get_encoding } from "tiktoken";

interface CountTokensRequest {
  history: Array<{ role: string; parts: MessagePart[] }>;
  model: string;
  chatSessionId: number;
}

const encoding = get_encoding("cl100k_base");

export async function POST(request: NextRequest) {
  const user = await getUserFromToken(request);
  if (!user) {
    return NextResponse.json({ error: "Unauthorized: User not authenticated" }, { status: 401 });
  }
  const userId = user.id.toString();

  const { history, chatSessionId } = (await request.json()) as CountTokensRequest;

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
        console.warn("Failed to fetch system prompt for token counting:", dbError);
      }
    }

    let totalTokens = 0;
    if (systemPromptText) {
      totalTokens += encoding.encode(systemPromptText).length;
    }

    if (history) {
      for (const msg of history) {
        for (const part of msg.parts) {
          if (part.type === "text" && part.text) {
            totalTokens += encoding.encode(part.text).length;
          }
        }
      }
    }

    return NextResponse.json({ totalTokens });
  } catch (error) {
    console.error("Error in token counting:", error);
    const detailedError = error instanceof Error ? error.message : String(error);
    return NextResponse.json({ error: detailedError }, { status: 500 });
  }
}
