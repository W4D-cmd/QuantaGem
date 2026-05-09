import { NextRequest, NextResponse } from "next/server";
import { requireAdmin } from "@/lib/admin-auth";
import { pool } from "@/lib/db";
import bcrypt from "bcryptjs";

export async function GET(request: NextRequest) {
  const adminCheck = await requireAdmin(request);
  if (adminCheck instanceof NextResponse) return adminCheck;

  const { searchParams } = new URL(request.url);
  const search = searchParams.get("search");

  try {
    let whereClause = "";
    let orderBy = "u.id ASC";
    let params: any[] = [];

    if (search) {
      whereClause = "WHERE u.email % $1 OR u.email ILIKE '%' || $1 || '%'";
      orderBy = "similarity(u.email, $1) DESC, u.id ASC";
      params.push(search);
    }

    const result = await pool.query(
      `
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
      ${whereClause}
      GROUP BY u.id, u.email, u.role, u.created_at
      ORDER BY ${orderBy}
    `,
      params
    );

    return NextResponse.json(result.rows);
  } catch (error) {
    console.error("Admin users list error:", error);
    return NextResponse.json({ error: "Failed to fetch users" }, { status: 500 });
  }
}

export async function POST(request: NextRequest) {
  const adminCheck = await requireAdmin(request);
  if (adminCheck instanceof NextResponse) return adminCheck;

  try {
    const { email, password, role } = await request.json();

    if (!email || !password) {
      return NextResponse.json({ error: "Email and password are required" }, { status: 400 });
    }

    if (password.length < 8) {
      return NextResponse.json({ error: "Password must be at least 8 characters long" }, { status: 400 });
    }

    const existingUser = await pool.query("SELECT id FROM users WHERE email = $1", [email]);
    if (existingUser.rows.length > 0) {
      return NextResponse.json({ error: "User already exists" }, { status: 400 });
    }

    const hashedPassword = await bcrypt.hash(password, 12);
    const newUser = await pool.query(
      "INSERT INTO users (email, password, role) VALUES ($1, $2, $3) RETURNING id, email, role, created_at",
      [email, hashedPassword, role || "user"]
    );

    // Initialize user settings
    await pool.query("INSERT INTO user_settings (user_id) VALUES ($1) ON CONFLICT DO NOTHING", [newUser.rows[0].id]);

    return NextResponse.json(newUser.rows[0], { status: 201 });
  } catch (error) {
    console.error("Admin user creation error:", error);
    return NextResponse.json({ error: "Failed to create user" }, { status: 500 });
  }
}
