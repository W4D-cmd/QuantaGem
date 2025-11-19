import { NextRequest, NextResponse } from "next/server";
import { pool } from "@/lib/db";
import { getUserFromToken } from "@/lib/auth";
import { MessagePart } from "@/app/page";

interface PersistUserMessageRequest {
  chatSessionId: number | null;
  userMessageParts: MessagePart[];
  modelName: string;
  projectId: number | null;
  thinkingBudget: number;
  systemPrompt?: string;
}

export async function POST(request: NextRequest) {
  const user = await getUserFromToken(request);
  if (!user) {
    return NextResponse.json({ error: "Unauthorized: User not authenticated" }, { status: 401 });
  }
  const userId = user.id.toString();

  const { chatSessionId, userMessageParts, modelName, projectId, thinkingBudget, systemPrompt } =
    (await request.json()) as PersistUserMessageRequest;

  const client = await pool.connect();
  try {
    await client.query("BEGIN");

    let currentChatId = chatSessionId;

    if (!currentChatId) {
      const title =
        userMessageParts
          .find((p) => p.type === "text")
          ?.text?.substring(0, 50)
          .split("\n")[0] || "New Chat";

      const newChatResult = await client.query(
        `INSERT INTO chat_sessions (user_id, title, last_model, project_id, thinking_budget, system_prompt)
         VALUES ($1, $2, $3, $4, $5, $6) RETURNING id`,
        [userId, title, modelName, projectId, thinkingBudget, systemPrompt || ""],
      );
      currentChatId = newChatResult.rows[0].id;
    } else {
      const ownerCheck = await client.query(`SELECT id FROM chat_sessions WHERE id = $1 AND user_id = $2`, [
        currentChatId,
        userId,
      ]);
      if (ownerCheck.rowCount === 0) {
        throw new Error("Chat session not found or not owned by user");
      }
    }

    const userContent = userMessageParts
      .filter((p) => p.type === "text" && p.text)
      .map((p) => p.text)
      .join(" ");

    const userMessageResult = await client.query(
      `INSERT INTO messages (chat_session_id, role, content, parts, position)
       VALUES ($1, 'user', $2, $3, (SELECT COALESCE(MAX(position), 0) + 1 FROM messages WHERE chat_session_id = $1))
         RETURNING id, position, role, parts, sources, thought_summary as "thoughtSummary"`,
      [currentChatId, userContent, JSON.stringify(userMessageParts)],
    );

    const savedUserMessage = userMessageResult.rows[0];

    await client.query(`UPDATE chat_sessions SET updated_at = now(), last_model = $2 WHERE id = $1 AND user_id = $3`, [
      currentChatId,
      modelName,
      userId,
    ]);

    await client.query("COMMIT");

    return NextResponse.json({
      newChatId: currentChatId,
      userMessage: savedUserMessage,
    });
  } catch (error) {
    await client.query("ROLLBACK");
    console.error("Error persisting user message:", error);
    const errorMessage = error instanceof Error ? error.message : "An unknown error occurred.";
    return NextResponse.json({ error: "Failed to save user message", details: errorMessage }, { status: 500 });
  } finally {
    client.release();
  }
}
