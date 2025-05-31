import { NextRequest, NextResponse } from "next/server";
import { pool } from "@/lib/db";
import { minioClient, MINIO_BUCKET_NAME } from "@/lib/minio";
import { MessagePart } from "@/app/page";
import { getUserFromToken } from "@/lib/auth";

export async function GET(request: NextRequest, context: { params: Promise<{ chatSessionId: string }> }) {
  const user = await getUserFromToken(request);
  if (!user) {
    return NextResponse.json({ error: "Unauthorized: User not authenticated" }, { status: 401 });
  }
  const userId = user.id.toString();

  const { chatSessionId } = await context.params;
  const client = await pool.connect();
  try {
    const chatSessionResult = await client.query(
      `SELECT title, last_model AS "lastModel", system_prompt AS "systemPrompt", key_selection AS "keySelection"
         FROM chat_sessions
         WHERE id = $1 AND user_id = $2`,
      [chatSessionId, userId],
    );

    if (chatSessionResult.rows.length === 0) {
      return NextResponse.json({ error: "Chat session not found or not owned by user" }, { status: 404 });
    }

    const chatSessionData = chatSessionResult.rows[0];

    const messagesResult = await client.query(
      `SELECT role, parts, sources
         FROM messages
         WHERE chat_session_id = $1
         ORDER BY position`,
      [chatSessionId],
    );
    return NextResponse.json({
      ...chatSessionData,
      messages: messagesResult.rows,
    });
  } catch (error) {
    console.error(`Error fetching chat session ${chatSessionId} for user ${userId}:`, error);
    const errorMessage = error instanceof Error ? error.message : "An unknown error occurred.";
    return NextResponse.json({ error: "Failed to fetch chat session", details: errorMessage }, { status: 500 });
  } finally {
    client.release();
  }
}

export async function PATCH(request: NextRequest, context: { params: Promise<{ chatSessionId: string }> }) {
  const user = await getUserFromToken(request);
  if (!user) {
    return NextResponse.json({ error: "Unauthorized: User not authenticated" }, { status: 401 });
  }
  const userId = user.id.toString();

  const { chatSessionId } = await context.params;
  const { title, lastModel, systemPrompt, keySelection } = (await request.json()) as {
    title?: string;
    lastModel?: string;
    systemPrompt?: string;
    keySelection?: "free" | "paid";
  };

  const sets: string[] = [];
  const vals: (string | number)[] = [];
  let idx = 1;

  if (title !== undefined) {
    sets.push(`title = $${idx++}`);
    vals.push(title);
  }
  if (lastModel !== undefined) {
    sets.push(`last_model = $${idx++}`);
    vals.push(lastModel);
  }
  if (systemPrompt !== undefined) {
    sets.push(`system_prompt = $${idx++}`);
    vals.push(systemPrompt);
  }
  if (keySelection !== undefined) {
    sets.push(`key_selection = $${idx++}`);
    vals.push(keySelection);
  }

  if (!sets.length) {
    return NextResponse.json({ error: "nothing to update" }, { status: 400 });
  }
  sets.push(`updated_at = now()`);

  const sql = `
    UPDATE chat_sessions
    SET ${sets.join(", ")}
    WHERE id = $${idx} AND user_id = $${idx + 1}
  `;
  vals.push(chatSessionId, userId);

  try {
    const result = await pool.query(sql, vals);
    if (result.rowCount === 0) {
      return NextResponse.json({ error: "Chat session not found or not owned by user" }, { status: 404 });
    }
    const { rows } = await pool.query(
      `SELECT id, title, last_model AS "lastModel", system_prompt AS "systemPrompt", key_selection AS "keySelection" FROM chat_sessions WHERE id = $1 AND user_id = $2`,
      [chatSessionId, userId],
    );
    return NextResponse.json(rows[0]);
  } catch (error) {
    console.error(`Error updating chat session ${chatSessionId} for user ${userId}:`, error);
    const errorMessage = error instanceof Error ? error.message : "An unknown error occurred.";
    return NextResponse.json({ error: "Failed to update chat session", details: errorMessage }, { status: 500 });
  }
}

export async function DELETE(request: NextRequest, context: { params: Promise<{ chatSessionId: string }> }) {
  const user = await getUserFromToken(request);
  if (!user) {
    return NextResponse.json({ error: "Unauthorized: User not authenticated" }, { status: 401 });
  }
  const userId = user.id.toString();

  const { chatSessionId } = await context.params;

  try {
    const chatSessionCheck = await pool.query(`SELECT id FROM chat_sessions WHERE id = $1 AND user_id = $2`, [
      chatSessionId,
      userId,
    ]);

    if (chatSessionCheck.rowCount === 0) {
      return NextResponse.json({ error: "Chat session not found or not owned by user" }, { status: 404 });
    }

    const messagesResult = await pool.query<{ parts: MessagePart[] }>(
      `SELECT parts FROM messages WHERE chat_session_id = $1`,
      [chatSessionId],
    );

    const objectNamesToDelete: string[] = [];
    if (messagesResult.rows.length > 0) {
      messagesResult.rows.forEach((message) => {
        if (message.parts && Array.isArray(message.parts)) {
          message.parts.forEach((part: MessagePart) => {
            if (part.type === "file" && part.objectName) {
              objectNamesToDelete.push(part.objectName);
            }
          });
        }
      });
    }

    if (objectNamesToDelete.length > 0) {
      const uniqueObjectNames = Array.from(new Set(objectNamesToDelete));
      console.log(
        `Attempting to delete ${uniqueObjectNames.length} objects from MinIO for chat session ${chatSessionId} (user ${userId}):`,
        uniqueObjectNames,
      );
      try {
        await minioClient.removeObjects(MINIO_BUCKET_NAME, uniqueObjectNames);
        console.log(
          `Successfully submitted deletion request for ${uniqueObjectNames.length} objects from MinIO for chat session ${chatSessionId} (user ${userId}).`,
        );
      } catch (minioError) {
        console.error(
          `Error deleting objects from MinIO for chat session ${chatSessionId} (user ${userId}):`,
          minioError,
        );
      }
    }

    const deleteResult = await pool.query(
      `DELETE FROM chat_sessions
         WHERE id = $1 AND user_id = $2`,
      [chatSessionId, userId],
    );

    if (deleteResult.rowCount === 0) {
      return NextResponse.json(
        {
          error: "Chat session not found or not owned by user, nothing deleted.",
        },
        { status: 404 },
      );
    }

    return NextResponse.json({
      ok: true,
      message: "Chat session and associated files (if any) deleted.",
    });
  } catch (error) {
    console.error(`Error deleting chat session ${chatSessionId} for user ${userId}:`, error);
    const errorMessage = error instanceof Error ? error.message : "An unknown error occurred.";
    return NextResponse.json({ error: "Failed to delete chat session", details: errorMessage }, { status: 500 });
  }
}
