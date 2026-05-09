import { NextRequest, NextResponse } from "next/server";
import { pool } from "@/lib/db";

export async function GET(request: NextRequest) {
  const userIdHeader = request.headers.get("x-user-id");
  if (!userIdHeader) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const userId = parseInt(userIdHeader, 10);
  if (isNaN(userId)) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  try {
    const result = await pool.query("SELECT role FROM users WHERE id = $1", [userId]);

    if (result.rows.length === 0) {
      return NextResponse.json({ isAdmin: false, userId });
    }

    return NextResponse.json({
      isAdmin: result.rows[0].role === "admin",
      userId,
    });
  } catch (error) {
    console.error("Admin check error:", error);
    return NextResponse.json({ isAdmin: false, userId });
  }
}
