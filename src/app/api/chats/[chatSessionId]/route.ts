import { NextResponse } from "next/server";
import { pool } from "@/lib/db";
import { minioClient, MINIO_BUCKET_NAME } from "@/lib/minio";
import { MessagePart } from "@/app/page";

export async function GET(
  request: Request,
  context: { params: Promise<{ chatSessionId: string }> },
) {
  const { chatSessionId } = await context.params;
  const { rows } = await pool.query(
    `SELECT role, parts
       FROM messages
       WHERE chat_session_id = $1
       ORDER BY position`,
    [chatSessionId],
  );
  return NextResponse.json(rows);
}

export async function PATCH(
  request: Request,
  context: { params: Promise<{ chatSessionId: string }> },
) {
  const { chatSessionId } = await context.params;
  const { title, lastModel } = (await request.json()) as {
    title?: string;
    lastModel?: string;
  };

  const sets: string[] = [];
  const vals: (string | number)[] = [];
  let idx = 1;

  if (title) {
    sets.push(`title      = $${idx++}`);
    vals.push(title);
  }
  if (lastModel) {
    sets.push(`last_model = $${idx++}`);
    vals.push(lastModel);
  }
  if (!sets.length) {
    return NextResponse.json({ error: "nothing to update" }, { status: 400 });
  }
  sets.push(`updated_at = now()`);

  const sql = `
    UPDATE chat_sessions
       SET ${sets.join(", ")}
     WHERE id = $${idx}
  `;
  vals.push(chatSessionId);

  await pool.query(sql, vals);
  const { rows } = await pool.query(
    `SELECT id, title, last_model AS "lastModel" FROM chat_sessions WHERE id = $1`,
    [chatSessionId],
  );
  return NextResponse.json(rows[0]);
}

export async function DELETE(
  request: Request,
  context: { params: Promise<{ chatSessionId: string }> },
) {
  const { chatSessionId } = await context.params;

  try {
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
        `Attempting to delete ${uniqueObjectNames.length} objects from MinIO for chat session ${chatSessionId}:`,
        uniqueObjectNames,
      );
      try {
        await minioClient.removeObjects(MINIO_BUCKET_NAME, uniqueObjectNames);
        console.log(
          `Successfully submitted deletion request for ${uniqueObjectNames.length} objects from MinIO for chat session ${chatSessionId}.`,
        );
      } catch (minioError) {
        console.error(
          `Error deleting objects from MinIO for chat session ${chatSessionId}:`,
          minioError,
        );
      }
    }

    await pool.query(
      `DELETE FROM chat_sessions
        WHERE id = $1`,
      [chatSessionId],
    );

    return NextResponse.json({
      ok: true,
      message: "Chat session and associated files (if any) deleted.",
    });
  } catch (error) {
    console.error(`Error deleting chat session ${chatSessionId}:`, error);
    const errorMessage =
      error instanceof Error ? error.message : "An unknown error occurred.";
    return NextResponse.json(
      { error: "Failed to delete chat session", details: errorMessage },
      { status: 500 },
    );
  }
}
