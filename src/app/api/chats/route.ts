import { NextResponse } from "next/server";
import { pool } from "@/lib/db";

export async function GET() {
  const { rows } = await pool.query(`
    SELECT id
         , title
         , last_model   AS "lastModel"
         , system_prompt AS "systemPrompt"
    FROM chat_sessions
    ORDER BY updated_at DESC
  `);
  return NextResponse.json(rows);
}

export async function POST(request: Request) {
  const { title } = await request.json();
  const { rows } = await pool.query(
    `INSERT INTO chat_sessions (title, last_model)
       VALUES ($1, $2)
         RETURNING id, title, last_model AS "lastModel", system_prompt AS "systemPrompt"`,
    [title, ""],
  );
  return NextResponse.json(rows[0]);
}

export async function DELETE() {
  await pool.query(`DELETE FROM chat_sessions`);
  return NextResponse.json({ ok: true });
}
