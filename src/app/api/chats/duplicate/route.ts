import { NextRequest, NextResponse } from "next/server";
import { pool } from "@/lib/db";
import { getUserFromToken } from "@/lib/auth";
import { ChatListItem, MessagePart } from "@/app/page";
import { minioClient, MINIO_BUCKET_NAME } from "@/lib/minio";
import { randomUUID } from "crypto";

interface DbMessage {
  role: "user" | "model";
  content: string;
  parts: MessagePart[];
  position: number;
  sources: Array<{ title: string; uri: string }>;
  thought_summary: string | null;
}

async function duplicateFile(originalObjectName: string): Promise<string | null> {
  try {
    const originalFileStream = await minioClient.getObject(MINIO_BUCKET_NAME, originalObjectName);
    const chunks: Buffer[] = [];
    for await (const chunk of originalFileStream) {
      chunks.push(chunk as Buffer);
    }
    const fileBuffer = Buffer.concat(chunks);

    const stat = await minioClient.statObject(MINIO_BUCKET_NAME, originalObjectName);
    const originalMimeType = stat.metaData?.["content-type"] || "application/octet-stream";
    const originalSize = stat.size;

    const fileExtension = originalObjectName.split(".").pop() || "";
    const baseName = originalObjectName
      .substring(originalObjectName.indexOf("_") + 1, originalObjectName.lastIndexOf("."))
      .replace(/[^a-zA-Z0-9_.-]/g, "_");
    const newObjectName = `${randomUUID()}_${baseName}.${fileExtension}`;

    await minioClient.putObject(MINIO_BUCKET_NAME, newObjectName, fileBuffer, originalSize, {
      "Content-Type": originalMimeType,
    });

    return newObjectName;
  } catch (error) {
    console.error(`Failed to duplicate file ${originalObjectName}:`, error);
    return null;
  }
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
              project_id,
              thinking_budget
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
      `INSERT INTO chat_sessions (user_id, title, last_model, system_prompt, key_selection, project_id, thinking_budget, created_at, updated_at)
       VALUES ($1, $2, $3, $4, $5, $6, $7, NOW(), NOW())
         RETURNING id, title, last_model AS "lastModel", system_prompt AS "systemPrompt", key_selection AS "keySelection", project_id AS "projectId", thinking_budget AS "thinkingBudget"`,
      [
        userId,
        newChatTitle,
        originalChat.last_model,
        originalChat.system_prompt,
        originalChat.key_selection,
        originalChat.project_id,
        originalChat.thinking_budget,
      ],
    );

    const newChatSession: ChatListItem = newChatResult.rows[0];
    const newChatSessionId = newChatSession.id;

    const originalMessagesResult = await client.query<DbMessage>(
      `SELECT role, content, parts, position, sources, thought_summary
       FROM messages
       WHERE chat_session_id = $1
       ORDER BY position ASC`,
      [originalChatId],
    );

    const originalMessages = originalMessagesResult.rows;

    for (const msg of originalMessages) {
      const newParts: MessagePart[] = [];
      let hasFileParts = false;

      for (const part of msg.parts) {
        if (part.type === "file" && part.objectName) {
          hasFileParts = true;
          if (part.isProjectFile) {
            newParts.push(part);
          } else {
            const newObjectName = await duplicateFile(part.objectName);
            if (newObjectName) {
              newParts.push({ ...part, objectName: newObjectName });
            }
          }
        } else {
          newParts.push(part);
        }
      }

      await client.query(
        `INSERT INTO messages (chat_session_id, role, content, parts, position, sources, thought_summary)
         VALUES ($1, $2, $3, $4, $5, $6, $7)`,
        [
          newChatSessionId,
          msg.role,
          msg.content,
          hasFileParts ? JSON.stringify(newParts) : JSON.stringify(msg.parts),
          msg.position,
          JSON.stringify(msg.sources),
          msg.thought_summary,
        ],
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
