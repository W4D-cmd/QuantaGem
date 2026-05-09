import { NextRequest, NextResponse } from "next/server";
import { requireAdmin } from "@/lib/admin-auth";
import { pool } from "@/lib/db";

export async function GET(request: NextRequest) {
  const adminCheck = await requireAdmin(request);
  if (adminCheck instanceof NextResponse) return adminCheck;

  try {
    const result = await pool.query(`
      SELECT
        u.id, u.email, u.role, u.created_at,
        COUNT(DISTINCT cs.id) as chat_count,
        COUNT(DISTINCT m.id) as message_count,
        COALESCE(SUM(cs.accumulated_cost), 0) as total_cost,
        COALESCE(SUM(cs.total_tokens), 0) as total_tokens,
        COUNT(DISTINCT p.id) as project_count,
        MAX(m.created_at) as last_message_at,
        MAX(cs.updated_at) as last_chat_activity
      FROM users u
      LEFT JOIN chat_sessions cs ON cs.user_id = u.id
      LEFT JOIN messages m ON m.chat_session_id = cs.id
      LEFT JOIN projects p ON p.user_id = u.id
      GROUP BY u.id, u.email, u.role, u.created_at
      ORDER BY u.id ASC
    `);

    return NextResponse.json(result.rows);
  } catch (error) {
    console.error("Admin users list error:", error);
    return NextResponse.json({ error: "Failed to fetch users" }, { status: 500 });
  }
}
