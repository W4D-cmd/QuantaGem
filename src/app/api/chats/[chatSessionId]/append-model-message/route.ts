import { NextRequest, NextResponse } from "next/server";
import { pool } from "@/lib/db";
import { MessagePart } from "@/app/page";

interface AppendModelMessageRequest {
  modelMessageParts: MessagePart[];
  modelThoughtSummary: string | null;
  modelSources: Array<{ title: string; uri: string }>;
}

export async function POST(request: NextRequest, context: { params: Promise<{ chatSessionId: string }> }) {
  const userIdHeader = request.headers.get("x-user-id");
  if (!userIdHeader) {
    return NextResponse.json({ error: "Unauthorized: Missing user identification" }, { status: 401 });
  }
  const userId = parseInt(userIdHeader, 10);
  if (isNaN(userId)) {
    return NextResponse.json({ error: "Invalid user ID" }, { status: 401 });
  }

  const { chatSessionId } = await context.params;
  if (!chatSessionId) {
    return NextResponse.json({ error: "Chat session ID is required" }, { status: 400 });
  }

  const { modelMessageParts, modelThoughtSummary, modelSources } = (await request.json()) as AppendModelMessageRequest;

  if (!modelMessageParts || modelMessageParts.length === 0) {
    return NextResponse.json({ error: "Cannot save an empty model message." }, { status: 400 });
  }

  const client = await pool.connect();
  try {
    await client.query("BEGIN");

    const ownerCheck = await client.query(`SELECT id FROM chat_sessions WHERE id = $1 AND user_id = $2`, [
      chatSessionId,
      userId,
    ]);
    if (ownerCheck.rowCount === 0) {
      throw new Error("Chat session not found or not owned by user");
    }

    const modelContent = modelMessageParts
      .filter((p) => p.type === "text" && p.text)
      .map((p) => p.text)
      .join(" ");

    await client.query(
      `INSERT INTO messages (chat_session_id, role, content, parts, position, sources, thought_summary)
             VALUES ($1, 'model', $2, $3, (SELECT COALESCE(MAX(position), 0) + 1 FROM messages WHERE chat_session_id = $1), $4, $5)`,
      [
        chatSessionId,
        modelContent,
        JSON.stringify(modelMessageParts),
        JSON.stringify(modelSources),
        modelThoughtSummary,
      ],
    );

    await client.query(`UPDATE chat_sessions SET updated_at = now() WHERE id = $1 AND user_id = $2`, [
      chatSessionId,
      userId,
    ]);

    await client.query("COMMIT");

    return NextResponse.json({ success: true });
  } catch (error) {
    await client.query("ROLLBACK");
    console.error("Error appending model message:", error);
    const errorMessage = error instanceof Error ? error.message : "An unknown error occurred.";
    return NextResponse.json({ error: "Failed to save model response", details: errorMessage }, { status: 500 });
  } finally {
    client.release();
  }
}
