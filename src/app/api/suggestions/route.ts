import { NextRequest, NextResponse } from "next/server";
import { pool } from "@/lib/db";

export interface PromptSuggestion {
  id: number;
  title: string;
  prompt: string;
  icon: string;
  sort_order: number;
}

export async function GET(request: NextRequest) {
  const userIdHeader = request.headers.get("x-user-id");
  if (!userIdHeader) {
    return NextResponse.json({ error: "Unauthorized: Missing user identification" }, { status: 401 });
  }
  const userId = userIdHeader;

  try {
    const { rows } = await pool.query<PromptSuggestion>(
      "SELECT id, title, prompt, icon, sort_order FROM prompt_suggestions WHERE user_id = $1 ORDER BY sort_order ASC, created_at ASC",
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

    const maxOrderResult = await pool.query<{ max_order: number | null }>(
      "SELECT COALESCE(MAX(sort_order), -1) as max_order FROM prompt_suggestions WHERE user_id = $1",
      [userId],
    );
    const nextSortOrder = maxOrderResult.rows[0].max_order + 1;

    const { rows } = await pool.query<PromptSuggestion>(
      `INSERT INTO prompt_suggestions (user_id, title, prompt, icon, sort_order, created_at)
       VALUES ($1, $2, $3, $4, $5, NOW())
       RETURNING id, title, prompt, icon, sort_order`,
      [userId, title.trim(), prompt.trim(), finalIcon, nextSortOrder],
    );

    return NextResponse.json(rows[0], { status: 201 });
  } catch (error) {
    console.error(`Error creating prompt suggestion for user ${userId}:`, error);
    const errorMessage = error instanceof Error ? error.message : "An unknown error occurred.";
    return NextResponse.json({ error: "Failed to create suggestion", details: errorMessage }, { status: 500 });
  }
}

export async function PATCH(request: NextRequest) {
  const userIdHeader = request.headers.get("x-user-id");
  if (!userIdHeader) {
    return NextResponse.json({ error: "Unauthorized: Missing user identification" }, { status: 401 });
  }
  const userId = userIdHeader;

  try {
    const { orderedIds } = (await request.json()) as { orderedIds?: number[] };

    if (!orderedIds || !Array.isArray(orderedIds)) {
      return NextResponse.json({ error: "orderedIds array is required" }, { status: 400 });
    }

    const client = await pool.connect();
    try {
      await client.query("BEGIN");

      for (let i = 0; i < orderedIds.length; i++) {
        await client.query("UPDATE prompt_suggestions SET sort_order = $1 WHERE id = $2 AND user_id = $3", [
          i,
          orderedIds[i],
          userId,
        ]);
      }

      await client.query("COMMIT");
      return NextResponse.json({ message: "Order updated successfully" }, { status: 200 });
    } catch (e) {
      await client.query("ROLLBACK");
      throw e;
    } finally {
      client.release();
    }
  } catch (error) {
    console.error(`Error reordering prompt suggestions for user ${userId}:`, error);
    const errorMessage = error instanceof Error ? error.message : "An unknown error occurred.";
    return NextResponse.json({ error: "Failed to reorder suggestions", details: errorMessage }, { status: 500 });
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
