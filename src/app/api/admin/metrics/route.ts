import { NextRequest, NextResponse } from "next/server";
import { requireAdmin } from "@/lib/admin-auth";
import { pool } from "@/lib/db";

export async function GET(request: NextRequest) {
  const adminCheck = await requireAdmin(request);
  if (adminCheck instanceof NextResponse) return adminCheck;

  const { searchParams } = new URL(request.url);
  const userIdParam = searchParams.get("userId");

  let filterUserId: number | null = null;
  if (userIdParam) {
    filterUserId = parseInt(userIdParam, 10);
    if (isNaN(filterUserId)) {
      return NextResponse.json({ error: "Invalid userId parameter" }, { status: 400 });
    }
    const userCheck = await pool.query("SELECT id FROM users WHERE id = $1", [filterUserId]);
    if (userCheck.rows.length === 0) {
      return NextResponse.json({ error: "User not found" }, { status: 404 });
    }
  }

    const u = filterUserId !== null ? "AND id = $1" : "";
    const cs = filterUserId !== null ? "AND cs.user_id = $1" : "";
    const csOuter = filterUserId !== null ? "WHERE user_id = $1" : "";  const params = filterUserId !== null ? [filterUserId] : [];

  try {
    const [
      totalUsers,
      totalAdmins,
      totalChats,
      totalMessages,
      totalUserMessages,
      totalModelMessages,
      totalCost,
      totalTokens,
      totalProjects,
      totalProjectFiles,
      totalStorageBytes,
      totalTempFiles,
      avgMessagesPerChat,
      avgCostPerChat,
      modelUsage,
      newUsers7d,
      newUsers30d,
      activeUsers7d,
      activeUsers30d,
      chats7d,
      chats30d,
      messages7d,
      messages30d,
      cost7d,
      cost30d,
    ] = await Promise.all([
      pool.query(`SELECT COUNT(*) as value FROM users WHERE 1=1 ${u}`, params),
      pool.query(`SELECT COUNT(*) as value FROM users WHERE role = 'admin' ${u}`, params),
      pool.query(`SELECT COUNT(*) as value FROM chat_sessions ${csOuter}`, params),
      pool.query(
        `SELECT COUNT(*) as value FROM messages m JOIN chat_sessions cs ON m.chat_session_id = cs.id WHERE 1=1 ${cs}`,
        params
      ),
      pool.query(
        `SELECT COUNT(*) as value FROM messages m JOIN chat_sessions cs ON m.chat_session_id = cs.id WHERE m.role = 'user' ${cs}`,
        params
      ),
      pool.query(
        `SELECT COUNT(*) as value FROM messages m JOIN chat_sessions cs ON m.chat_session_id = cs.id WHERE m.role = 'model' ${cs}`,
        params
      ),
      pool.query(`SELECT COALESCE(SUM(accumulated_cost), 0) as value FROM chat_sessions ${csOuter}`, params),
      pool.query(`SELECT COALESCE(SUM(total_tokens), 0) as value FROM chat_sessions ${csOuter}`, params),
      pool.query(`SELECT COUNT(*) as value FROM projects p WHERE 1=1 ${filterUserId !== null ? "AND p.user_id = $1" : ""}`, params),
      pool.query(
        `SELECT COUNT(*) as value FROM project_files pf JOIN projects p ON pf.project_id = p.id WHERE 1=1 ${filterUserId !== null ? "AND p.user_id = $1" : ""}`,
        params
      ),
      pool.query(
        `SELECT COALESCE(SUM(pf.size), 0) as value FROM project_files pf JOIN projects p ON pf.project_id = p.id WHERE 1=1 ${filterUserId !== null ? "AND p.user_id = $1" : ""}`,
        params
      ),
      pool.query(`SELECT COUNT(*) as value FROM temporary_files WHERE 1=1 ${filterUserId !== null ? "AND user_id = $1" : ""}`, params),
      pool.query(
        `SELECT COALESCE(AVG(msg_count), 0) as value FROM (SELECT COUNT(*) as msg_count FROM messages m JOIN chat_sessions cs ON m.chat_session_id = cs.id WHERE 1=1 ${cs} GROUP BY chat_session_id) sub`,
        params
      ),
      pool.query(`SELECT COALESCE(AVG(accumulated_cost), 0) as value FROM chat_sessions ${csOuter}`, params),
      pool.query(
        `SELECT last_model, COUNT(*) as usage_count FROM chat_sessions WHERE last_model IS NOT NULL ${cs ? cs.replace("cs.", "") : ""} GROUP BY last_model ORDER BY usage_count DESC`,
        filterUserId !== null ? [filterUserId] : []
      ),
      pool.query(`SELECT COUNT(*) as value FROM users WHERE created_at >= NOW() - INTERVAL '7 days' ${u}`, params),
      pool.query(`SELECT COUNT(*) as value FROM users WHERE created_at >= NOW() - INTERVAL '30 days' ${u}`, params),
      pool.query(
        `SELECT COUNT(DISTINCT cs.user_id) as value FROM chat_sessions cs JOIN messages m ON m.chat_session_id = cs.id WHERE m.created_at >= NOW() - INTERVAL '7 days' ${cs}`,
        params
      ),
      pool.query(
        `SELECT COUNT(DISTINCT cs.user_id) as value FROM chat_sessions cs JOIN messages m ON m.chat_session_id = cs.id WHERE m.created_at >= NOW() - INTERVAL '30 days' ${cs}`,
        params
      ),
      pool.query(`SELECT COUNT(*) as value FROM chat_sessions WHERE created_at >= NOW() - INTERVAL '7 days' ${csOuter ? "AND user_id = $1" : ""}`, filterUserId !== null ? [filterUserId] : []),
      pool.query(`SELECT COUNT(*) as value FROM chat_sessions WHERE created_at >= NOW() - INTERVAL '30 days' ${csOuter ? "AND user_id = $1" : ""}`, filterUserId !== null ? [filterUserId] : []),
      pool.query(
        `SELECT COUNT(*) as value FROM messages m JOIN chat_sessions cs ON m.chat_session_id = cs.id WHERE m.created_at >= NOW() - INTERVAL '7 days' ${cs}`,
        params
      ),
      pool.query(
        `SELECT COUNT(*) as value FROM messages m JOIN chat_sessions cs ON m.chat_session_id = cs.id WHERE m.created_at >= NOW() - INTERVAL '30 days' ${cs}`,
        params
      ),
      pool.query(`SELECT COALESCE(SUM(accumulated_cost), 0) as value FROM chat_sessions WHERE updated_at >= NOW() - INTERVAL '7 days' ${csOuter ? "AND user_id = $1" : ""}`, filterUserId !== null ? [filterUserId] : []),
      pool.query(`SELECT COALESCE(SUM(accumulated_cost), 0) as value FROM chat_sessions WHERE updated_at >= NOW() - INTERVAL '30 days' ${csOuter ? "AND user_id = $1" : ""}`, filterUserId !== null ? [filterUserId] : []),
    ]);

    const v = (r: { rows: { value: string }[] }) => Number(r.rows[0].value);

    return NextResponse.json({
      totalUsers: v(totalUsers),
      totalAdmins: v(totalAdmins),
      totalChats: v(totalChats),
      totalMessages: v(totalMessages),
      totalUserMessages: v(totalUserMessages),
      totalModelMessages: v(totalModelMessages),
      totalCost: v(totalCost),
      totalTokens: v(totalTokens),
      totalProjects: v(totalProjects),
      totalProjectFiles: v(totalProjectFiles),
      totalStorageBytes: v(totalStorageBytes),
      totalTempFiles: v(totalTempFiles),
      avgMessagesPerChat: parseFloat(avgMessagesPerChat.rows[0].value) || 0,
      avgCostPerChat: parseFloat(avgCostPerChat.rows[0].value) || 0,
      modelUsage: modelUsage.rows.map((r: { last_model: string; usage_count: string }) => ({
        model: r.last_model,
        count: Number(r.usage_count),
      })),
      newUsers7d: v(newUsers7d),
      newUsers30d: v(newUsers30d),
      activeUsers7d: v(activeUsers7d),
      activeUsers30d: v(activeUsers30d),
      chats7d: v(chats7d),
      chats30d: v(chats30d),
      messages7d: v(messages7d),
      messages30d: v(messages30d),
      cost7d: v(cost7d),
      cost30d: v(cost30d),
    });
  } catch (error) {
    console.error("Admin metrics error:", error);
    return NextResponse.json({ error: "Failed to fetch metrics" }, { status: 500 });
  }
}
