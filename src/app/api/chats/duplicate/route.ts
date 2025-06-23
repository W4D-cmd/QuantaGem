import { NextRequest, NextResponse } from "next/server";
import { pool } from "@/lib/db";
import { getUserFromToken } from "@/lib/auth";
import { ChatListItem, MessagePart } from "@/app/page";

interface DbMessage {
  role: "user" | "model";
  content: string;
  parts: MessagePart[];
  position: number;
  sources: Array<{ title: string; uri: string }>;
}

export async function POST(request: NextRequest) {
  const user = await getUserFromToken(request);
  if (!user) {
    return NextResponse.json({ error: "Unauthorized: User not authenticated" }, { status: 401 });
  }
  const userId = user.id;

  const { chatId: originalChatId } = await request.json();

  if (!originalChatId) {
    return NextResponse.json({ error: "originalChatId is required" }, { status: 400 });
  }

  const client = await pool.connect();
  try {
    await client.query("BEGIN");

    const originalChatResult = await client.query(
      `SELECT title,
              last_model,
              system_prompt,
              key_selection,
              project_id
       FROM chat_sessions
       WHERE id = $1 AND user_id = $2`,
      [originalChatId, userId],
    );

    if (originalChatResult.rows.length === 0) {
      await client.query("ROLLBACK");
      return NextResponse.json({ error: "Original chat session not found or not owned by user" }, { status: 404 });
    }

    const originalChat = originalChatResult.rows[0];
    const newChatTitle = `${originalChat.title} (copy)`;

    const newChatResult = await client.query(
      `INSERT INTO chat_sessions (user_id, title, last_model, system_prompt, key_selection, project_id, created_at, updated_at)
       VALUES ($1, $2, $3, $4, $5, $6, NOW(), NOW())
       RETURNING id, title, last_model AS "lastModel", system_prompt AS "systemPrompt", key_selection AS "keySelection", project_id AS "projectId"`,
      [
        userId,
        newChatTitle,
        originalChat.last_model,
        originalChat.system_prompt,
        originalChat.key_selection,
        originalChat.project_id,
      ],
    );

    const newChatSession: ChatListItem = newChatResult.rows[0];
    const newChatSessionId = newChatSession.id;

    const originalMessagesResult = await client.query<DbMessage>(
      `SELECT role, content, parts, position, sources
       FROM messages
       WHERE chat_session_id = $1
       ORDER BY position ASC`,
      [originalChatId],
    );

    const originalMessages = originalMessagesResult.rows;

    for (const msg of originalMessages) {
      await client.query(
        `INSERT INTO messages (chat_session_id, role, content, parts, position, sources)
         VALUES ($1, $2, $3, $4, $5, $6)`,
        [newChatSessionId, msg.role, msg.content, JSON.stringify(msg.parts), msg.position, JSON.stringify(msg.sources)],
      );
    }

    await client.query("COMMIT");

    return NextResponse.json(newChatSession);
  } catch (error) {
    await client.query("ROLLBACK");
    console.error(`Error duplicating chat session ${originalChatId} for user ${userId}:`, error);
    const errorMessage = error instanceof Error ? error.message : "An unknown error occurred.";
    return NextResponse.json({ error: "Failed to duplicate chat session", details: errorMessage }, { status: 500 });
  } finally {
    client.release();
  }
}
