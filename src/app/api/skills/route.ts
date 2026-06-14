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
      `SELECT s.id, s.name, s.content, s.created_at, s.updated_at,
              (usa.id IS NOT NULL) AS is_active_globally
       FROM skills s
       LEFT JOIN user_skill_activations usa
         ON usa.skill_id = s.id AND usa.user_id = s.user_id
         AND usa.scope = 'global' AND usa.chat_session_id IS NULL
       WHERE s.user_id = $1
       ORDER BY s.name`,
      [userId],
    );

    return NextResponse.json({
      skills: rows.map((row) => ({
        id: row.id,
        name: row.name,
        content: row.content,
        createdAt: row.created_at,
        updatedAt: row.updated_at,
        isActiveGlobally: row.is_active_globally,
      })),
    });
  } catch (error) {
    console.error("Error fetching skills:", error);
    const errorMessage = error instanceof Error ? error.message : "An unknown error occurred.";
    return NextResponse.json({ error: "Failed to fetch skills", details: errorMessage }, { status: 500 });
  }
}

export async function POST(request: NextRequest) {
  const userIdHeader = request.headers.get("x-user-id");
  if (!userIdHeader) {
    return NextResponse.json({ error: "Unauthorized: Missing user identification" }, { status: 401 });
  }
  const userId = userIdHeader;

  try {
    const { name, content } = (await request.json()) as { name?: string; content?: string };

    if (!name || name.trim() === "") {
      return NextResponse.json({ error: "Skill name is required" }, { status: 400 });
    }

    const trimmedName = name.trim();
    const trimmedContent = content ?? "";

    const { rows } = await pool.query(
      `INSERT INTO skills (user_id, name, content)
       VALUES ($1, $2, $3)
       RETURNING id, name, content, created_at, updated_at`,
      [userId, trimmedName, trimmedContent],
    );

    return NextResponse.json(
      {
        id: rows[0].id,
        name: rows[0].name,
        content: rows[0].content,
        createdAt: rows[0].created_at,
        updatedAt: rows[0].updated_at,
      },
      { status: 201 },
    );
  } catch (error: unknown) {
    if (error && typeof error === "object" && "code" in error && (error as { code: string }).code === "23505") {
      return NextResponse.json({ error: "A skill with this name already exists" }, { status: 409 });
    }
    console.error("Error creating skill:", error);
    const errorMessage = error instanceof Error ? error.message : "An unknown error occurred.";
    return NextResponse.json({ error: "Failed to create skill", details: errorMessage }, { status: 500 });
  }
}