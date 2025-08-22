import { NextRequest, NextResponse } from "next/server";
import { pool } from "@/lib/db";
import { minioClient, MINIO_BUCKET_NAME } from "@/lib/minio";
import { MessagePart } from "@/app/page";
import { getUserFromToken } from "@/lib/auth";

export async function GET(request: NextRequest) {
  const user = await getUserFromToken(request);
  if (!user) {
    return NextResponse.json({ error: "Unauthorized: User not authenticated" }, { status: 401 });
  }
  const userId = user.id.toString();

  const { rows } = await pool.query(
    `
      SELECT id
           , title
           , last_model      AS "lastModel"
           , system_prompt   AS "systemPrompt"
           , key_selection   AS "keySelection"
           , project_id      AS "projectId"
           , updated_at      AS "updatedAt"
           , thinking_budget AS "thinkingBudget"
      FROM chat_sessions
      WHERE user_id = $1
      ORDER BY updated_at DESC
    `,
    [userId],
  );
  return NextResponse.json(rows);
}

export async function DELETE(request: NextRequest) {
  const user = await getUserFromToken(request);
  if (!user) {
    return NextResponse.json({ error: "Unauthorized: User not authenticated" }, { status: 401 });
  }
  const userId = user.id.toString();

  try {
    const chatSessionIdsResult = await pool.query(
      `SELECT id FROM chat_sessions WHERE user_id = $1 AND project_id IS NULL`,
      [userId],
    );
    const chatSessionIds = chatSessionIdsResult.rows.map((row) => row.id);

    if (chatSessionIds.length === 0) {
      return NextResponse.json({
        ok: true,
        message: "No global chat sessions found for user to delete.",
      });
    }

    const messagesResult = await pool.query<{ parts: MessagePart[] }>(
      `SELECT parts FROM messages WHERE chat_session_id = ANY($1::int[])`,
      [chatSessionIds],
    );

    const objectNamesToDelete: string[] = [];
    messagesResult.rows.forEach((message) => {
      if (message.parts && Array.isArray(message.parts)) {
        message.parts.forEach((part: MessagePart) => {
          if (part.type === "file" && part.objectName) {
            objectNamesToDelete.push(part.objectName);
          }
        });
      }
    });

    if (objectNamesToDelete.length > 0) {
      const uniqueObjectNames = Array.from(new Set(objectNamesToDelete));
      console.log(
        `Attempting to delete ${uniqueObjectNames.length} objects from Minio for user ${userId}'s global chats:`,
        uniqueObjectNames,
      );
      try {
        await minioClient.removeObjects(MINIO_BUCKET_NAME, uniqueObjectNames);
        console.log(
          `Successfully submitted deletion request for ${uniqueObjectNames.length} objects from MinIO for user ${userId}'s global chats.`,
        );
      } catch (minioError) {
        console.error(`Error deleting objects from MinIO for user ${userId}'s global chats:`, minioError);
      }
    }

    await pool.query(`DELETE FROM chat_sessions WHERE user_id = $1 AND project_id IS NULL`, [userId]);

    return NextResponse.json({
      ok: true,
      message: "All global chat sessions and associated files deleted for user.",
    });
  } catch (error) {
    console.error(`Error deleting all global chat sessions for user ${userId}:`, error);
    const errorMessage = error instanceof Error ? error.message : "An unknown error occurred.";
    return NextResponse.json(
      { error: "Failed to delete all global chat sessions", details: errorMessage },
      { status: 500 },
    );
  }
}
