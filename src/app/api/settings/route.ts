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
      "SELECT system_prompt, custom_openai_endpoint, custom_openai_key, custom_anthropic_endpoint, custom_anthropic_key FROM user_settings WHERE user_id = $1",
      [userId],
    );

    if (rows.length === 0) {
      return NextResponse.json(
        {
          system_prompt: "",
          custom_openai_endpoint: null,
          custom_openai_key_set: false,
          custom_anthropic_endpoint: null,
          custom_anthropic_key_set: false,
        },
        { status: 200 },
      );
    }

    // Return masked API key status for security - never expose the actual key to the client
    const hasCustomKey = rows[0].custom_openai_key && rows[0].custom_openai_key.trim() !== "";
    const hasCustomAnthropicKey = rows[0].custom_anthropic_key && rows[0].custom_anthropic_key.trim() !== "";

    return NextResponse.json(
      {
        system_prompt: rows[0].system_prompt || "",
        custom_openai_endpoint: rows[0].custom_openai_endpoint || null,
        custom_openai_key_set: hasCustomKey,
        custom_anthropic_endpoint: rows[0].custom_anthropic_endpoint || null,
        custom_anthropic_key_set: hasCustomAnthropicKey,
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
    const { systemPrompt, customOpenaiEndpoint, customOpenaiKey, customAnthropicEndpoint, customAnthropicKey } = (await request.json()) as {
      systemPrompt?: string;
      customOpenaiEndpoint?: string | null;
      customOpenaiKey?: string | null;
      customAnthropicEndpoint?: string | null;
      customAnthropicKey?: string | null;
    };

    const finalSystemPrompt = systemPrompt ?? "";
    // Normalize endpoint: trim and set to null if empty
    const finalCustomEndpoint =
      customOpenaiEndpoint && customOpenaiEndpoint.trim() !== "" ? customOpenaiEndpoint.trim() : null;
    const finalCustomAnthropicEndpoint =
      customAnthropicEndpoint && customAnthropicEndpoint.trim() !== "" ? customAnthropicEndpoint.trim() : null;
    // Only update the key if a non-empty value is provided
    // If null/empty is passed and we want to clear it, we need a separate flag
    const shouldUpdateCustomKey = customOpenaiKey !== undefined;
    const finalCustomKey =
      customOpenaiKey && customOpenaiKey.trim() !== "" ? customOpenaiKey.trim() : null;
    const shouldUpdateCustomAnthropicKey = customAnthropicKey !== undefined;
    const finalCustomAnthropicKey =
      customAnthropicKey && customAnthropicKey.trim() !== "" ? customAnthropicKey.trim() : null;

    // Build the query dynamically based on whether we're updating the custom key
    let query: string;
    let params: (string | null)[];

    if (shouldUpdateCustomKey && shouldUpdateCustomAnthropicKey) {
      query = `INSERT INTO user_settings (user_id, system_prompt, custom_openai_endpoint, custom_openai_key, custom_anthropic_endpoint, custom_anthropic_key, updated_at)
         VALUES ($1, $2, $3, $4, $5, $6, NOW())
           ON CONFLICT (user_id) DO UPDATE
                                      SET system_prompt = EXCLUDED.system_prompt,
                                          custom_openai_endpoint = EXCLUDED.custom_openai_endpoint,
                                          custom_openai_key = EXCLUDED.custom_openai_key,
                                          custom_anthropic_endpoint = EXCLUDED.custom_anthropic_endpoint,
                                          custom_anthropic_key = EXCLUDED.custom_anthropic_key,
                                          updated_at    = NOW()
                                      RETURNING system_prompt, custom_openai_endpoint, custom_anthropic_endpoint, updated_at`;
      params = [userId, finalSystemPrompt, finalCustomEndpoint, finalCustomKey, finalCustomAnthropicEndpoint, finalCustomAnthropicKey];
    } else if (shouldUpdateCustomKey) {
      query = `INSERT INTO user_settings (user_id, system_prompt, custom_openai_endpoint, custom_openai_key, custom_anthropic_endpoint, updated_at)
         VALUES ($1, $2, $3, $4, $5, NOW())
           ON CONFLICT (user_id) DO UPDATE
                                      SET system_prompt = EXCLUDED.system_prompt,
                                          custom_openai_endpoint = EXCLUDED.custom_openai_endpoint,
                                          custom_openai_key = EXCLUDED.custom_openai_key,
                                          custom_anthropic_endpoint = EXCLUDED.custom_anthropic_endpoint,
                                          updated_at    = NOW()
                                      RETURNING system_prompt, custom_openai_endpoint, custom_anthropic_endpoint, updated_at`;
      params = [userId, finalSystemPrompt, finalCustomEndpoint, finalCustomKey, finalCustomAnthropicEndpoint];
    } else if (shouldUpdateCustomAnthropicKey) {
      query = `INSERT INTO user_settings (user_id, system_prompt, custom_openai_endpoint, custom_anthropic_endpoint, custom_anthropic_key, updated_at)
         VALUES ($1, $2, $3, $4, $5, NOW())
           ON CONFLICT (user_id) DO UPDATE
                                      SET system_prompt = EXCLUDED.system_prompt,
                                          custom_openai_endpoint = EXCLUDED.custom_openai_endpoint,
                                          custom_anthropic_endpoint = EXCLUDED.custom_anthropic_endpoint,
                                          custom_anthropic_key = EXCLUDED.custom_anthropic_key,
                                          updated_at    = NOW()
                                      RETURNING system_prompt, custom_openai_endpoint, custom_anthropic_endpoint, updated_at`;
      params = [userId, finalSystemPrompt, finalCustomEndpoint, finalCustomAnthropicEndpoint, finalCustomAnthropicKey];
    } else {
      query = `INSERT INTO user_settings (user_id, system_prompt, custom_openai_endpoint, custom_anthropic_endpoint, updated_at)
         VALUES ($1, $2, $3, $4, NOW())
           ON CONFLICT (user_id) DO UPDATE
                                      SET system_prompt = EXCLUDED.system_prompt,
                                          custom_openai_endpoint = EXCLUDED.custom_openai_endpoint,
                                          custom_anthropic_endpoint = EXCLUDED.custom_anthropic_endpoint,
                                          updated_at    = NOW()
                                      RETURNING system_prompt, custom_openai_endpoint, custom_anthropic_endpoint, updated_at`;
      params = [userId, finalSystemPrompt, finalCustomEndpoint, finalCustomAnthropicEndpoint];
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
        custom_openai_endpoint: rows[0].custom_openai_endpoint,
        custom_anthropic_endpoint: rows[0].custom_anthropic_endpoint,
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
