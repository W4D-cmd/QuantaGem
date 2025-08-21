import { NextRequest, NextResponse } from "next/server";
import { pool } from "@/lib/db";
import { getUserFromToken } from "@/lib/auth";
import { MINIO_BUCKET_NAME, minioClient } from "@/lib/minio";
import { MessagePart } from "@/app/page";

export async function POST(request: NextRequest, { params }: { params: Promise<{ chatSessionId: string }> }) {
  const user = await getUserFromToken(request);
  if (!user) {
    return NextResponse.json({ error: "Unauthorized: User not authenticated" }, { status: 401 });
  }
  const userId = user.id.toString();

  const { chatSessionId } = await params;
  const { parts } = (await request.json()) as { parts: MessagePart[] };

  if (!parts || parts.length === 0) {
    return NextResponse.json({ error: "Cannot save an empty message." }, { status: 400 });
  }

  const client = await pool.connect();
  try {
    await client.query("BEGIN");

    const chatOwnerCheck = await client.query(`SELECT id FROM chat_sessions WHERE id = $1 AND user_id = $2`, [
      chatSessionId,
      userId,
    ]);

    if (chatOwnerCheck.rowCount === 0) {
      await client.query("ROLLBACK");
      return NextResponse.json({ error: "Chat session not found or not owned by user" }, { status: 404 });
    }

    const content = parts
      .filter((p) => p.type === "text" && p.text)
      .map((p) => p.text)
      .join(" ");

    const { rows } = await client.query(
      `INSERT INTO messages (chat_session_id, role, content, parts, position)
       VALUES ($1, 'user', $2, $3, (SELECT COALESCE(MAX(position), 0) + 1 FROM messages WHERE chat_session_id = $1))
         RETURNING *`,
      [chatSessionId, content, JSON.stringify(parts)],
    );

    await client.query("COMMIT");
    return NextResponse.json(rows[0], { status: 201 });
  } catch (error) {
    await client.query("ROLLBACK");
    console.error(`Error saving new message for chat session ${chatSessionId}:`, error);
    const errorMessage = error instanceof Error ? error.message : "An unknown error occurred.";
    return NextResponse.json({ error: "Failed to save message", details: errorMessage }, { status: 500 });
  } finally {
    client.release();
  }
}

export async function PATCH(request: NextRequest, { params }: { params: Promise<{ chatSessionId: string }> }) {
  const user = await getUserFromToken(request);
  if (!user) {
    return NextResponse.json({ error: "Unauthorized: User not authenticated" }, { status: 401 });
  }
  const userId = user.id.toString();

  const { chatSessionId } = await params;
  const { messageId, newParts } = (await request.json()) as { messageId: number; newParts: MessagePart[] };

  if (!messageId || !newParts) {
    return NextResponse.json({ error: "messageId and newParts are required" }, { status: 400 });
  }

  if (newParts.length === 0) {
    return NextResponse.json({ error: "Cannot save an empty message." }, { status: 400 });
  }

  const client = await pool.connect();
  try {
    await client.query("BEGIN");

    const chatOwnerCheck = await client.query(`SELECT id FROM chat_sessions WHERE id = $1 AND user_id = $2`, [
      chatSessionId,
      userId,
    ]);

    if (chatOwnerCheck.rowCount === 0) {
      await client.query("ROLLBACK");
      return NextResponse.json({ error: "Chat session not found or not owned by user" }, { status: 404 });
    }

    const originalMessageResult = await client.query<{ parts: MessagePart[] }>(
      `SELECT parts FROM messages WHERE id = $1 AND chat_session_id = $2`,
      [messageId, chatSessionId],
    );

    if (originalMessageResult.rowCount === 0) {
      await client.query("ROLLBACK");
      return NextResponse.json({ error: "Message not found or does not belong to this chat session" }, { status: 404 });
    }

    const originalParts: MessagePart[] = originalMessageResult.rows[0].parts || [];
    const originalFileObjectNames = new Set(
      originalParts.filter((p) => p.type === "file" && p.objectName).map((p) => p.objectName!),
    );
    const newFileObjectNames = new Set(
      newParts.filter((p) => p.type === "file" && p.objectName).map((p) => p.objectName!),
    );

    const objectNamesToDelete: string[] = [];
    originalFileObjectNames.forEach((name) => {
      if (!newFileObjectNames.has(name)) {
        objectNamesToDelete.push(name);
      }
    });

    if (objectNamesToDelete.length > 0) {
      console.log(`Deleting ${objectNamesToDelete.length} orphaned files from message edit.`);
      await minioClient.removeObjects(MINIO_BUCKET_NAME, objectNamesToDelete);
    }

    const newContent = newParts
      .filter((p) => p.type === "text" && p.text)
      .map((p) => p.text)
      .join(" ");

    await client.query(`UPDATE messages SET parts = $1, content = $2 WHERE id = $3 AND chat_session_id = $4`, [
      JSON.stringify(newParts),
      newContent,
      messageId,
      chatSessionId,
    ]);

    await client.query("COMMIT");
    return NextResponse.json({ ok: true });
  } catch (error) {
    await client.query("ROLLBACK");
    console.error(`Error updating message ${messageId} for chat session ${chatSessionId}:`, error);
    const errorMessage = error instanceof Error ? error.message : "An unknown error occurred.";
    return NextResponse.json({ error: "Failed to update message", details: errorMessage }, { status: 500 });
  } finally {
    client.release();
  }
}

export async function DELETE(request: NextRequest, { params }: { params: Promise<{ chatSessionId: string }> }) {
  const user = await getUserFromToken(request);
  if (!user) {
    return NextResponse.json({ error: "Unauthorized: User not authenticated" }, { status: 401 });
  }
  const userId = user.id.toString();

  const { chatSessionId } = await params;
  const fromPositionStr = request.nextUrl.searchParams.get("fromPosition");

  if (!fromPositionStr) {
    return NextResponse.json({ error: "fromPosition query parameter is required" }, { status: 400 });
  }
  const fromPosition = parseInt(fromPositionStr, 10);
  if (isNaN(fromPosition)) {
    return NextResponse.json({ error: "fromPosition must be a number" }, { status: 400 });
  }

  const client = await pool.connect();

  try {
    await client.query("BEGIN");

    const chatOwnerCheck = await client.query(`SELECT id FROM chat_sessions WHERE id = $1 AND user_id = $2`, [
      chatSessionId,
      userId,
    ]);

    if (chatOwnerCheck.rowCount === 0) {
      await client.query("ROLLBACK");
      return NextResponse.json({ error: "Chat session not found or not owned by user" }, { status: 404 });
    }

    const messagesToDeleteResult = await client.query<{ parts: MessagePart[] }>(
      `SELECT parts FROM messages WHERE chat_session_id = $1 AND position >= $2`,
      [chatSessionId, fromPosition],
    );

    const objectNamesToDelete: string[] = [];
    messagesToDeleteResult.rows.forEach((msg) => {
      if (msg.parts && Array.isArray(msg.parts)) {
        msg.parts.forEach((part) => {
          if (part.type === "file" && part.objectName && !part.isProjectFile) {
            objectNamesToDelete.push(part.objectName);
          }
        });
      }
    });

    if (objectNamesToDelete.length > 0) {
      const uniqueObjectNames = Array.from(new Set(objectNamesToDelete));
      try {
        await minioClient.removeObjects(MINIO_BUCKET_NAME, uniqueObjectNames);
      } catch (minioError) {
        console.error(`Error deleting objects from MinIO for chat session ${chatSessionId}:`, minioError);
      }
    }

    await client.query(`DELETE FROM messages WHERE chat_session_id = $1 AND position >= $2`, [
      chatSessionId,
      fromPosition,
    ]);

    await client.query("COMMIT");

    return NextResponse.json({ ok: true, message: `Messages from position ${fromPosition} deleted.` });
  } catch (error) {
    await client.query("ROLLBACK");
    console.error(`Error deleting messages for chat session ${chatSessionId} from position ${fromPosition}:`, error);
    const errorMessage = error instanceof Error ? error.message : "An unknown error occurred.";
    return NextResponse.json({ error: "Failed to delete messages", details: errorMessage }, { status: 500 });
  } finally {
    client.release();
  }
}
