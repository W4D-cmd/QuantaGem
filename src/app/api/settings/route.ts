import { NextRequest, NextResponse } from "next/server";
import { pool } from "@/lib/db";

export async function GET(request: NextRequest) {
  const userIdHeader = request.headers.get("x-user-id");
  if (!userIdHeader) {
    return NextResponse.json({ error: "Unauthorized: Missing user identification" }, { status: 401 });
  }
  const userId = userIdHeader;

  try {
    const { rows } = await pool.query(
      "SELECT system_prompt, tts_voice, tts_model, custom_openai_endpoint, custom_openai_key FROM user_settings WHERE user_id = $1",
      [userId],
    );

    if (rows.length === 0) {
      return NextResponse.json(
        {
          system_prompt: "",
          tts_voice: "Sulafat",
          tts_model: "gemini-2.5-flash-preview-tts",
          custom_openai_endpoint: null,
          // Never return the actual API key - just indicate if one is set
          custom_openai_key_set: false,
        },
        { status: 200 },
      );
    }

    // Return masked API key status for security - never expose the actual key to the client
    const hasCustomKey = rows[0].custom_openai_key && rows[0].custom_openai_key.trim() !== "";

    return NextResponse.json(
      {
        system_prompt: rows[0].system_prompt || "",
        tts_voice: rows[0].tts_voice || "Sulafat",
        tts_model: rows[0].tts_model || "gemini-2.5-flash-preview-tts",
        custom_openai_endpoint: rows[0].custom_openai_endpoint || null,
        // Indicate whether a custom key is configured without exposing it
        custom_openai_key_set: hasCustomKey,
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
  const userId = userIdHeader;

  try {
    const { systemPrompt, ttsVoice, ttsModel, customOpenaiEndpoint, customOpenaiKey } = (await request.json()) as {
      systemPrompt?: string;
      ttsVoice?: string;
      ttsModel?: string;
      customOpenaiEndpoint?: string | null;
      customOpenaiKey?: string | null;
    };

    const finalSystemPrompt = systemPrompt ?? "";
    const finalTtsVoice = ttsVoice ?? "Sulafat";
    const finalTtsModel = ttsModel ?? "gemini-2.5-flash-preview-tts";
    // Normalize endpoint: trim and set to null if empty
    const finalCustomEndpoint =
      customOpenaiEndpoint && customOpenaiEndpoint.trim() !== "" ? customOpenaiEndpoint.trim() : null;
    // Only update the key if a non-empty value is provided
    // If null/empty is passed and we want to clear it, we need a separate flag
    const shouldUpdateCustomKey = customOpenaiKey !== undefined;
    const finalCustomKey =
      customOpenaiKey && customOpenaiKey.trim() !== "" ? customOpenaiKey.trim() : null;

    // Build the query dynamically based on whether we're updating the custom key
    let query: string;
    let params: (string | null)[];

    if (shouldUpdateCustomKey) {
      query = `INSERT INTO user_settings (user_id, system_prompt, tts_voice, tts_model, custom_openai_endpoint, custom_openai_key, updated_at)
         VALUES ($1, $2, $3, $4, $5, $6, NOW())
           ON CONFLICT (user_id) DO UPDATE
                                      SET system_prompt = EXCLUDED.system_prompt,
                                          tts_voice     = EXCLUDED.tts_voice,
                                          tts_model     = EXCLUDED.tts_model,
                                          custom_openai_endpoint = EXCLUDED.custom_openai_endpoint,
                                          custom_openai_key = EXCLUDED.custom_openai_key,
                                          updated_at    = NOW()
                                      RETURNING system_prompt, tts_voice, tts_model, custom_openai_endpoint, updated_at`;
      params = [userId, finalSystemPrompt, finalTtsVoice, finalTtsModel, finalCustomEndpoint, finalCustomKey];
    } else {
      query = `INSERT INTO user_settings (user_id, system_prompt, tts_voice, tts_model, custom_openai_endpoint, updated_at)
         VALUES ($1, $2, $3, $4, $5, NOW())
           ON CONFLICT (user_id) DO UPDATE
                                      SET system_prompt = EXCLUDED.system_prompt,
                                          tts_voice     = EXCLUDED.tts_voice,
                                          tts_model     = EXCLUDED.tts_model,
                                          custom_openai_endpoint = EXCLUDED.custom_openai_endpoint,
                                          updated_at    = NOW()
                                      RETURNING system_prompt, tts_voice, tts_model, custom_openai_endpoint, updated_at`;
      params = [userId, finalSystemPrompt, finalTtsVoice, finalTtsModel, finalCustomEndpoint];
    }

    const { rows } = await pool.query(query, params);

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
        custom_openai_endpoint: rows[0].custom_openai_endpoint,
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
