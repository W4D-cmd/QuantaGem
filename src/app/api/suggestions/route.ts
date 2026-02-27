import { NextRequest, NextResponse } from "next/server";
import { pool } from "@/lib/db";

export interface PromptSuggestion {
  id: number;
  title: string;
  prompt: string;
  icon: string;
}

export async function GET(request: NextRequest) {
  const userIdHeader = request.headers.get("x-user-id");
  if (!userIdHeader) {
    return NextResponse.json({ error: "Unauthorized: Missing user identification" }, { status: 401 });
  }
  const userId = userIdHeader;

  try {
    const { rows } = await pool.query<PromptSuggestion>(
      "SELECT id, title, prompt, icon FROM prompt_suggestions WHERE user_id = $1 ORDER BY created_at ASC",
      [userId],
    );

    return NextResponse.json(rows, { status: 200 });
  } catch (error) {
    console.error(`Error fetching prompt suggestions for user ${userId}:`, error);
    const errorMessage = error instanceof Error ? error.message : "An unknown error occurred.";
    return NextResponse.json({ error: "Failed to fetch suggestions", details: errorMessage }, { status: 500 });
  }
}

export async function POST(request: NextRequest) {
  const userIdHeader = request.headers.get("x-user-id");
  if (!userIdHeader) {
    return NextResponse.json({ error: "Unauthorized: Missing user identification" }, { status: 401 });
  }
  const userId = userIdHeader;

  try {
    const { title, prompt, icon } = (await request.json()) as {
      title?: string;
      prompt?: string;
      icon?: string;
    };

    if (!title || title.trim() === "") {
      return NextResponse.json({ error: "Title is required" }, { status: 400 });
    }

    if (!prompt || prompt.trim() === "") {
      return NextResponse.json({ error: "Prompt is required" }, { status: 400 });
    }

    const finalIcon = icon || "SparklesIcon";

    const { rows } = await pool.query<PromptSuggestion>(
      `INSERT INTO prompt_suggestions (user_id, title, prompt, icon, created_at)
       VALUES ($1, $2, $3, $4, NOW())
       RETURNING id, title, prompt, icon`,
      [userId, title.trim(), prompt.trim(), finalIcon],
    );

    return NextResponse.json(rows[0], { status: 201 });
  } catch (error) {
    console.error(`Error creating prompt suggestion for user ${userId}:`, error);
    const errorMessage = error instanceof Error ? error.message : "An unknown error occurred.";
    return NextResponse.json({ error: "Failed to create suggestion", details: errorMessage }, { status: 500 });
  }
}

export async function DELETE(request: NextRequest) {
  const userIdHeader = request.headers.get("x-user-id");
  if (!userIdHeader) {
    return NextResponse.json({ error: "Unauthorized: Missing user identification" }, { status: 401 });
  }
  const userId = userIdHeader;

  try {
    const { id } = (await request.json()) as { id?: number };

    if (!id) {
      return NextResponse.json({ error: "Suggestion ID is required" }, { status: 400 });
    }

    const { rowCount } = await pool.query(
      "DELETE FROM prompt_suggestions WHERE id = $1 AND user_id = $2",
      [id, userId],
    );

    if (rowCount === 0) {
      return NextResponse.json({ error: "Suggestion not found or not owned by user" }, { status: 404 });
    }

    return NextResponse.json({ message: "Suggestion deleted successfully" }, { status: 200 });
  } catch (error) {
    console.error(`Error deleting prompt suggestion for user ${userId}:`, error);
    const errorMessage = error instanceof Error ? error.message : "An unknown error occurred.";
    return NextResponse.json({ error: "Failed to delete suggestion", details: errorMessage }, { status: 500 });
  }
}
