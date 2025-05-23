import { NextRequest, NextResponse } from "next/server";
import { pool } from "@/lib/db";
import { minioClient, MINIO_BUCKET_NAME } from "@/lib/minio";
import { MessagePart } from "@/app/page";
import { getUserFromSession } from "@/lib/auth";

export async function GET(request: NextRequest) {
  const user = await getUserFromSession(request.cookies);
  if (!user) {
    const response = NextResponse.json(
      { error: "Unauthorized: User ID missing" },
      { status: 401 },
    );
    response.cookies.delete("session");
    return response;
  }
  const userId = user.id.toString();

  const { rows } = await pool.query(
    `
        SELECT id
             , title
             , last_model   AS "lastModel"
             , system_prompt AS "systemPrompt"
             , key_selection AS "keySelection"
        FROM chat_sessions
        WHERE user_id = $1
        ORDER BY updated_at DESC
      `,
    [userId],
  );
  return NextResponse.json(rows);
}

export async function POST(request: NextRequest) {
  const user = await getUserFromSession(request.cookies);
  if (!user) {
    const response = NextResponse.json(
      { error: "Unauthorized: User ID missing" },
      { status: 401 },
    );
    response.cookies.delete("session");
    return response;
  }
  const userId = user.id.toString();

  const { title } = await request.json();
  const { rows } = await pool.query(
    `INSERT INTO chat_sessions (user_id, title, last_model, key_selection)
       VALUES ($1, $2, $3, $4)
         RETURNING id, title, last_model AS "lastModel", system_prompt AS "systemPrompt", key_selection AS "keySelection"`,
    [userId, title, "", "free"],
  );
  return NextResponse.json(rows[0]);
}

export async function DELETE(request: NextRequest) {
  const user = await getUserFromSession(request.cookies);
  if (!user) {
    const response = NextResponse.json(
      { error: "Unauthorized: User ID missing" },
      { status: 401 },
    );
    response.cookies.delete("session");
    return response;
  }
  const userId = user.id.toString();

  try {
    const chatSessionIdsResult = await pool.query(
      `SELECT id FROM chat_sessions WHERE user_id = $1`,
      [userId],
    );
    const chatSessionIds = chatSessionIdsResult.rows.map((row) => row.id);

    if (chatSessionIds.length === 0) {
      return NextResponse.json({
        ok: true,
        message: "No chat sessions found for user to delete.",
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
        `Attempting to delete ${uniqueObjectNames.length} objects from MinIO for user ${userId}'s chats:`,
        uniqueObjectNames,
      );
      try {
        await minioClient.removeObjects(MINIO_BUCKET_NAME, uniqueObjectNames);
        console.log(
          `Successfully submitted deletion request for ${uniqueObjectNames.length} objects from MinIO for user ${userId}'s chats.`,
        );
      } catch (minioError) {
        console.error(
          `Error deleting objects from MinIO for user ${userId}'s chats:`,
          minioError,
        );
      }
    }

    await pool.query(`DELETE FROM chat_sessions WHERE user_id = $1`, [userId]);

    return NextResponse.json({
      ok: true,
      message: "All chat sessions and associated files deleted for user.",
    });
  } catch (error) {
    console.error(
      `Error deleting all chat sessions for user ${userId}:`,
      error,
    );
    const errorMessage =
      error instanceof Error ? error.message : "An unknown error occurred.";
    return NextResponse.json(
      { error: "Failed to delete all chat sessions", details: errorMessage },
      { status: 500 },
    );
  }
}
