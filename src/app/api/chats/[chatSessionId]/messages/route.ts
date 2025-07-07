import { NextRequest, NextResponse } from "next/server";
import { pool } from "@/lib/db";
import { getUserFromToken } from "@/lib/auth";
import { MINIO_BUCKET_NAME, minioClient } from "@/lib/minio";
import { MessagePart } from "@/app/page";

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
          if (part.type === "file" && part.objectName) {
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
