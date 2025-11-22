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
      `SELECT id, title, system_prompt AS "systemPrompt", created_at AS "createdAt", updated_at AS "updatedAt"
         FROM projects
         WHERE user_id = $1
         ORDER BY updated_at DESC`,
      [userId],
    );
    return NextResponse.json(rows);
  } catch (error) {
    console.error(`Error fetching projects for user ${userId}:`, error);
    const errorMessage = error instanceof Error ? error.message : "An unknown error occurred.";
    return NextResponse.json({ error: "Failed to fetch projects", details: errorMessage }, { status: 500 });
  }
}

export async function POST(request: NextRequest) {
  const userIdHeader = request.headers.get("x-user-id");
  if (!userIdHeader) {
    return NextResponse.json({ error: "Unauthorized: Missing user identification" }, { status: 401 });
  }
  const userId = userIdHeader; // oder parseInt(userIdHeader, 10);

  try {
    const { title } = await request.json();

    if (!title || typeof title !== "string") {
      return NextResponse.json({ error: "Title is required and must be a string" }, { status: 400 });
    }

    const { rows } = await pool.query(
      `INSERT INTO projects (user_id, title)
         VALUES ($1, $2)
         RETURNING id, title, system_prompt AS "systemPrompt", created_at AS "createdAt", updated_at AS "updatedAt"`,
      [userId, title],
    );
    return NextResponse.json(rows[0]);
  } catch (error) {
    console.error(`Error creating project for user ${userId}:`, error);
    const errorMessage = error instanceof Error ? error.message : "An unknown error occurred.";
    return NextResponse.json({ error: "Failed to create project", details: errorMessage }, { status: 500 });
  }
}
