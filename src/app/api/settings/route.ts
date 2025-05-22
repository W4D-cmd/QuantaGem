import { NextResponse } from "next/server";
import { pool } from "@/lib/db";

export async function GET() {
  try {
    const { rows } = await pool.query(
      "SELECT system_prompt FROM user_settings WHERE id = 1",
    );

    if (rows.length === 0) {
      return NextResponse.json({ system_prompt: "" }, { status: 200 });
    }

    return NextResponse.json(
      { system_prompt: rows[0].system_prompt || "" },
      { status: 200 },
    );
  } catch (error) {
    console.error("Error fetching user settings:", error);
    const errorMessage =
      error instanceof Error ? error.message : "An unknown error occurred.";
    return NextResponse.json(
      { error: "Failed to fetch settings", details: errorMessage },
      { status: 500 },
    );
  }
}

export async function POST(request: Request) {
  try {
    const { systemPrompt } = (await request.json()) as {
      systemPrompt?: string;
    };

    if (typeof systemPrompt === "undefined") {
      return NextResponse.json(
        { error: "systemPrompt is required" },
        { status: 400 },
      );
    }

    const { rows } = await pool.query(
      `INSERT INTO user_settings (id, system_prompt, updated_at)
       VALUES (1, $1, NOW())
       ON CONFLICT (id) DO UPDATE
       SET system_prompt = EXCLUDED.system_prompt,
           updated_at = NOW()
       RETURNING system_prompt, updated_at`,
      [systemPrompt ?? ""],
    );

    if (rows.length === 0) {
      return NextResponse.json(
        {
          error:
            "Failed to update settings, settings row not found or created.",
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
    console.error("Error updating user settings:", error);
    const errorMessage =
      error instanceof Error ? error.message : "An unknown error occurred.";
    return NextResponse.json(
      { error: "Failed to update settings", details: errorMessage },
      { status: 500 },
    );
  }
}
