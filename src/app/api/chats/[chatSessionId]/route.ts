import { NextResponse } from "next/server";
import { pool } from "@/lib/db";

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
  await pool.query(
    `DELETE FROM chat_sessions
      WHERE id = $1`,
    [chatSessionId],
  );
  return NextResponse.json({ ok: true });
}
