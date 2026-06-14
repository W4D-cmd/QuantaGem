import { NextRequest, NextResponse } from "next/server";
import { pool } from "@/lib/db";

export async function GET(request: NextRequest, context: { params: Promise<{ skillId: string }> }) {
  const userIdHeader = request.headers.get("x-user-id");
  if (!userIdHeader) {
    return NextResponse.json({ error: "Unauthorized: Missing user identification" }, { status: 401 });
  }
  const userId = userIdHeader;

  const { skillId } = await context.params;
  const parsedSkillId = parseInt(skillId, 10);
  if (isNaN(parsedSkillId)) {
    return NextResponse.json({ error: "Invalid skill ID format" }, { status: 400 });
  }

  try {
    const { rows } = await pool.query("SELECT id, name, content, created_at, updated_at FROM skills WHERE id = $1 AND user_id = $2", [
      parsedSkillId,
      userId,
    ]);

    if (rows.length === 0) {
      return NextResponse.json({ error: "Skill not found or not owned by user" }, { status: 404 });
    }

    return NextResponse.json({
      id: rows[0].id,
      name: rows[0].name,
      content: rows[0].content,
      createdAt: rows[0].created_at,
      updatedAt: rows[0].updated_at,
    });
  } catch (error) {
    console.error("Error fetching skill:", error);
    const errorMessage = error instanceof Error ? error.message : "An unknown error occurred.";
    return NextResponse.json({ error: "Failed to fetch skill", details: errorMessage }, { status: 500 });
  }
}

export async function PATCH(request: NextRequest, context: { params: Promise<{ skillId: string }> }) {
  const userIdHeader = request.headers.get("x-user-id");
  if (!userIdHeader) {
    return NextResponse.json({ error: "Unauthorized: Missing user identification" }, { status: 401 });
  }
  const userId = userIdHeader;

  const { skillId } = await context.params;
  const parsedSkillId = parseInt(skillId, 10);
  if (isNaN(parsedSkillId)) {
    return NextResponse.json({ error: "Invalid skill ID format" }, { status: 400 });
  }

  try {
    const { name, content } = (await request.json()) as { name?: string; content?: string };

    const sets: string[] = [];
    const vals: (string | number)[] = [];
    let idx = 1;

    if (name !== undefined) {
      sets.push(`name = $${idx++}`);
      vals.push(name.trim());
    }
    if (content !== undefined) {
      sets.push(`content = $${idx++}`);
      vals.push(content);
    }

    if (sets.length === 0) {
      return NextResponse.json({ error: "No fields to update" }, { status: 400 });
    }

    sets.push(`updated_at = NOW()`);
    vals.push(parsedSkillId, userId);

    const sql = `UPDATE skills SET ${sets.join(", ")} WHERE id = $${idx} AND user_id = $${idx + 1} RETURNING id, name, content, created_at, updated_at`;
    const { rows } = await pool.query(sql, vals);

    if (rows.length === 0) {
      return NextResponse.json({ error: "Skill not found or not owned by user" }, { status: 404 });
    }

    return NextResponse.json({
      id: rows[0].id,
      name: rows[0].name,
      content: rows[0].content,
      createdAt: rows[0].created_at,
      updatedAt: rows[0].updated_at,
    });
  } catch (error: unknown) {
    if (error && typeof error === "object" && "code" in error && (error as { code: string }).code === "23505") {
      return NextResponse.json({ error: "A skill with this name already exists" }, { status: 409 });
    }
    console.error("Error updating skill:", error);
    const errorMessage = error instanceof Error ? error.message : "An unknown error occurred.";
    return NextResponse.json({ error: "Failed to update skill", details: errorMessage }, { status: 500 });
  }
}

export async function DELETE(request: NextRequest, context: { params: Promise<{ skillId: string }> }) {
  const userIdHeader = request.headers.get("x-user-id");
  if (!userIdHeader) {
    return NextResponse.json({ error: "Unauthorized: Missing user identification" }, { status: 401 });
  }
  const userId = userIdHeader;

  const { skillId } = await context.params;
  const parsedSkillId = parseInt(skillId, 10);
  if (isNaN(parsedSkillId)) {
    return NextResponse.json({ error: "Invalid skill ID format" }, { status: 400 });
  }

  try {
    const result = await pool.query("DELETE FROM skills WHERE id = $1 AND user_id = $2", [parsedSkillId, userId]);

    if (result.rowCount === 0) {
      return NextResponse.json({ error: "Skill not found or not owned by user" }, { status: 404 });
    }

    return NextResponse.json({ ok: true, message: "Skill deleted successfully" });
  } catch (error) {
    console.error("Error deleting skill:", error);
    const errorMessage = error instanceof Error ? error.message : "An unknown error occurred.";
    return NextResponse.json({ error: "Failed to delete skill", details: errorMessage }, { status: 500 });
  }
}