import { NextRequest, NextResponse } from "next/server";
import { pool } from "@/lib/db";
import { getUserFromToken } from "@/lib/auth";

export async function GET(request: NextRequest) {
  const user = await getUserFromToken(request);
  if (!user) {
    return NextResponse.json({ error: "Unauthorized: User not authenticated" }, { status: 401 });
  }
  const userId = user.id.toString();

  try {
    const { rows } = await pool.query("SELECT system_prompt FROM user_settings WHERE user_id = $1", [userId]);

    if (rows.length === 0) {
      return NextResponse.json({ system_prompt: "" }, { status: 200 });
    }

    return NextResponse.json({ system_prompt: rows[0].system_prompt || "" }, { status: 200 });
  } catch (error) {
    console.error(`Error fetching user settings for user ${userId}:`, error);
    const errorMessage = error instanceof Error ? error.message : "An unknown error occurred.";
    return NextResponse.json({ error: "Failed to fetch settings", details: errorMessage }, { status: 500 });
  }
}

export async function POST(request: NextRequest) {
  const user = await getUserFromToken(request);
  if (!user) {
    return NextResponse.json({ error: "Unauthorized: User not authenticated" }, { status: 401 });
  }
  const userId = user.id.toString();

  try {
    const { systemPrompt } = (await request.json()) as {
      systemPrompt?: string;
    };

    if (typeof systemPrompt === "undefined") {
      return NextResponse.json({ error: "systemPrompt is required" }, { status: 400 });
    }

    const { rows } = await pool.query(
      `INSERT INTO user_settings (user_id, system_prompt, updated_at)
         VALUES ($1, $2, NOW())
           ON CONFLICT (user_id) DO UPDATE
                                      SET system_prompt = EXCLUDED.system_prompt,
                                      updated_at = NOW()
                                      RETURNING system_prompt, updated_at`,
      [userId, systemPrompt ?? ""],
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
