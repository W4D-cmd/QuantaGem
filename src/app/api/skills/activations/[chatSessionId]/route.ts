import { NextRequest, NextResponse } from "next/server";
import { pool } from "@/lib/db";

export async function DELETE(request: NextRequest, context: { params: Promise<{ chatSessionId: string }> }) {
  const userIdHeader = request.headers.get("x-user-id");
  if (!userIdHeader) {
    return NextResponse.json({ error: "Unauthorized: Missing user identification" }, { status: 401 });
  }
  const userId = userIdHeader;

  const { chatSessionId } = await context.params;
  const parsedChatSessionId = parseInt(chatSessionId, 10);
  if (isNaN(parsedChatSessionId)) {
    return NextResponse.json({ error: "Invalid chat session ID format" }, { status: 400 });
  }

  try {
    await pool.query(
      "DELETE FROM user_skill_activations WHERE user_id = $1 AND scope = 'chat' AND chat_session_id = $2",
      [userId, parsedChatSessionId],
    );

    return NextResponse.json({ ok: true, message: "Chat skill overrides cleared" });
  } catch (error) {
    console.error("Error clearing chat skill overrides:", error);
    const errorMessage = error instanceof Error ? error.message : "An unknown error occurred.";
    return NextResponse.json({ error: "Failed to clear chat skill overrides", details: errorMessage }, { status: 500 });
  }
}