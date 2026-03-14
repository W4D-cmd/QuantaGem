import { NextRequest, NextResponse } from "next/server";
import { pool } from "@/lib/db";
import { MessagePart, Message } from "@/app/page";
import { migrateTemporaryFile } from "@/lib/minio";

interface PersistUserMessageRequest {
  chatSessionId: number | null;
  userMessageParts: MessagePart[];
  modelName: string;
  projectId: number | null;
  thinkingBudget: number;
  systemPrompt?: string;
  unsavedMessages?: Message[];
  totalTokens?: number;
  accumulatedCost?: number;
}

function collectTemporaryObjectNames(parts: MessagePart[]): string[] {
  return parts
    .filter((p) => p.type === "file" && p.objectName?.startsWith("temporary/"))
    .map((p) => p.objectName!);
}

function replaceObjectNames(parts: MessagePart[], migrations: Map<string, string>): MessagePart[] {
  return parts.map((part) => {
    if (part.type === "file" && part.objectName && migrations.has(part.objectName)) {
      return { ...part, objectName: migrations.get(part.objectName)! };
    }
    return part;
  });
}

export async function POST(request: NextRequest) {
  const userIdHeader = request.headers.get("x-user-id");
  if (!userIdHeader) {
    return NextResponse.json({ error: "Unauthorized: Missing user identification" }, { status: 401 });
  }
  const userId = parseInt(userIdHeader, 10);
  if (isNaN(userId)) {
    return NextResponse.json({ error: "Invalid user ID" }, { status: 401 });
  }

  const requestData = (await request.json()) as PersistUserMessageRequest;
  const { chatSessionId, userMessageParts, modelName, projectId, thinkingBudget, systemPrompt, unsavedMessages, totalTokens, accumulatedCost } =
    requestData;

  const allParts: MessagePart[] = [
    ...userMessageParts,
    ...(unsavedMessages?.flatMap((m) => m.parts) || []),
  ];
  const temporaryObjectNames = [...new Set(collectTemporaryObjectNames(allParts))];

  const client = await pool.connect();
  try {
    await client.query("BEGIN");

    const userCheck = await client.query("SELECT id FROM users WHERE id = $1", [userId]);
    if (userCheck.rowCount === 0) {
      await client.query("ROLLBACK");
      return NextResponse.json({ error: "User not found. Please log in again." }, { status: 401 });
    }

    let currentChatId = chatSessionId;

    if (!currentChatId) {
      const title =
        userMessageParts
          .find((p) => p.type === "text")
          ?.text?.substring(0, 50)
          .split("\n")[0] || "New Chat";

      const newChatResult = await client.query(
        `INSERT INTO chat_sessions (user_id, title, last_model, project_id, thinking_budget, system_prompt, total_tokens, accumulated_cost)
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8) RETURNING id`,
        [userId, title, modelName, projectId, thinkingBudget, systemPrompt || "", requestData.totalTokens || 0, requestData.accumulatedCost || 0],
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

    const savedUnsavedMessages: { id: number; msg: Message }[] = [];
    if (unsavedMessages && unsavedMessages.length > 0) {
      for (const msg of unsavedMessages) {
        const msgContent = msg.parts
          .filter((p) => p.type === "text" && p.text)
          .map((p) => p.text)
          .join(" ");

        const unsavedResult = await client.query(
          `INSERT INTO messages (chat_session_id, role, content, parts, position, sources, thought_summary)
           VALUES ($1, $2, $3, $4, (SELECT COALESCE(MAX(position), 0) + 1 FROM messages WHERE chat_session_id = $1), $5, $6)
           RETURNING id`,
          [
            currentChatId,
            msg.role,
            msgContent,
            JSON.stringify(msg.parts),
            JSON.stringify(msg.sources || []),
            msg.thoughtSummary || null,
          ]
        );
        savedUnsavedMessages.push({ id: unsavedResult.rows[0].id, msg });
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

    if (totalTokens !== undefined && accumulatedCost !== undefined) {
      await client.query(`UPDATE chat_sessions SET updated_at = now(), last_model = $2, total_tokens = $4, accumulated_cost = $5 WHERE id = $1 AND user_id = $3`, [
        currentChatId,
        modelName,
        userId,
        totalTokens,
        accumulatedCost,
      ]);
    } else {
      await client.query(`UPDATE chat_sessions SET updated_at = now(), last_model = $2 WHERE id = $1 AND user_id = $3`, [
        currentChatId,
        modelName,
        userId,
      ]);
    }

    await client.query("COMMIT");

    const migrations = new Map<string, string>();
    const migrationErrors: string[] = [];

    for (const oldObjectName of temporaryObjectNames) {
      try {
        const newObjectName = await migrateTemporaryFile(oldObjectName);
        migrations.set(oldObjectName, newObjectName);

        await pool.query(
          `DELETE FROM temporary_files WHERE object_name = $1`,
          [oldObjectName]
        );
      } catch (err) {
        console.error(`Failed to migrate temporary file ${oldObjectName}:`, err);
        migrationErrors.push(oldObjectName);
      }
    }

    if (migrations.size > 0) {
      const updatedUserParts = replaceObjectNames(savedUserMessage.parts, migrations);

      await pool.query(
        `UPDATE messages SET parts = $1 WHERE id = $2`,
        [JSON.stringify(updatedUserParts), savedUserMessage.id]
      );

      if (savedUnsavedMessages.length > 0) {
        for (const saved of savedUnsavedMessages) {
          const updatedParts = replaceObjectNames(saved.msg.parts, migrations);
          await pool.query(
            `UPDATE messages SET parts = $1 WHERE id = $2`,
            [JSON.stringify(updatedParts), saved.id]
          );
          saved.msg.parts = updatedParts;
        }
      }

      savedUserMessage.parts = updatedUserParts;
    }

    const finalizedUnsavedMessages = savedUnsavedMessages.map(({ id, msg }) => ({
      oldId: msg.id,
      newId: id,
      parts: msg.parts,
    }));

    return NextResponse.json({
      newChatId: currentChatId,
      userMessage: savedUserMessage,
      migrationErrors: migrationErrors.length > 0 ? migrationErrors : undefined,
      unsavedMessagesMap: finalizedUnsavedMessages,
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
