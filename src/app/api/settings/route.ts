import { NextRequest, NextResponse } from "next/server";
import { pool } from "@/lib/db";

export async function GET(request: NextRequest) {
  const userIdHeader = request.headers.get("x-user-id");
  if (!userIdHeader) {
    return NextResponse.json({ error: "Unauthorized: Missing user identification" }, { status: 401 });
  }
  const userId = userIdHeader; // oder parseInt(userIdHeader, 10);

  try {
    const { rows } = await pool.query(
      "SELECT system_prompt, tts_voice, tts_model FROM user_settings WHERE user_id = $1",
      [userId],
    );

    if (rows.length === 0) {
      return NextResponse.json(
        {
          system_prompt: "",
          tts_voice: "Sulafat",
          tts_model: "gemini-2.5-flash-preview-tts",
        },
        { status: 200 },
      );
    }

    return NextResponse.json(
      {
        system_prompt: rows[0].system_prompt || "",
        tts_voice: rows[0].tts_voice || "Sulafat",
        tts_model: rows[0].tts_model || "gemini-2.5-flash-preview-tts",
      },
      { status: 200 },
    );
  } catch (error) {
    console.error(`Error fetching user settings for user ${userId}:`, error);
    const errorMessage = error instanceof Error ? error.message : "An unknown error occurred.";
    return NextResponse.json({ error: "Failed to fetch settings", details: errorMessage }, { status: 500 });
  }
}

export async function POST(request: NextRequest) {
  const userIdHeader = request.headers.get("x-user-id");
  if (!userIdHeader) {
    return NextResponse.json({ error: "Unauthorized: Missing user identification" }, { status: 401 });
  }
  const userId = userIdHeader; // oder parseInt(userIdHeader, 10);

  try {
    const { systemPrompt, ttsVoice, ttsModel } = (await request.json()) as {
      systemPrompt?: string;
      ttsVoice?: string;
      ttsModel?: string;
    };

    const finalSystemPrompt = systemPrompt ?? "";
    const finalTtsVoice = ttsVoice ?? "Sulafat";
    const finalTtsModel = ttsModel ?? "gemini-2.5-flash-preview-tts";

    const { rows } = await pool.query(
      `INSERT INTO user_settings (user_id, system_prompt, tts_voice, tts_model, updated_at)
         VALUES ($1, $2, $3, $4, NOW())
           ON CONFLICT (user_id) DO UPDATE
                                      SET system_prompt = EXCLUDED.system_prompt,
                                          tts_voice     = EXCLUDED.tts_voice,
                                          tts_model     = EXCLUDED.tts_model,
                                          updated_at    = NOW()
                                      RETURNING system_prompt, tts_voice, tts_model, updated_at`,
      [userId, finalSystemPrompt, finalTtsVoice, finalTtsModel],
    );

    if (rows.length === 0) {
      return NextResponse.json(
        {
          error: "Failed to update settings, settings row not found or created for user.",
        },
        { status: 500 },
      );
    }

    return NextResponse.json(
      {
        message: "Settings updated successfully",
        system_prompt: rows[0].system_prompt,
        tts_voice: rows[0].tts_voice,
        tts_model: rows[0].tts_model,
        updated_at: rows[0].updated_at,
      },
      { status: 200 },
    );
  } catch (error) {
    console.error(`Error updating user settings for user ${userId}:`, error);
    const errorMessage = error instanceof Error ? error.message : "An unknown error occurred.";
    return NextResponse.json({ error: "Failed to update settings", details: errorMessage }, { status: 500 });
  }
}
