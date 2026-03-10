import { NextRequest, NextResponse } from "next/server";
import { pool } from "@/lib/db";

export async function PATCH(request: NextRequest, { params }: { params: Promise<{ chatSessionId: string }> }) {
  const userIdHeader = request.headers.get("x-user-id");
  if (!userIdHeader) {
    return NextResponse.json({ error: "Unauthorized: Missing user identification" }, { status: 401 });
  }
  const userId = userIdHeader;

  const { chatSessionId } = await params;
  const chatId = parseInt(chatSessionId, 10);

  if (isNaN(chatId)) {
    return NextResponse.json({ error: "Invalid chat session ID" }, { status: 400 });
  }

  try {
    const result = await pool.query<{ pinned_at: string | null }>(
      `UPDATE chat_sessions 
       SET pinned_at = CASE WHEN pinned_at IS NULL THEN now() ELSE NULL END
       WHERE id = $1 AND user_id = $2
       RETURNING pinned_at`,
      [chatId, userId]
    );

    if (result.rowCount === 0) {
      return NextResponse.json({ error: "Chat session not found" }, { status: 404 });
    }

    return NextResponse.json({ 
      ok: true, 
      pinnedAt: result.rows[0].pinned_at 
    });
  } catch (error) {
    console.error(`Error toggling pin for chat ${chatId}:`, error);
    const errorMessage = error instanceof Error ? error.message : "An unknown error occurred.";
    return NextResponse.json(
      { error: "Failed to toggle pin status", details: errorMessage },
      { status: 500 }
    );
  }
}
