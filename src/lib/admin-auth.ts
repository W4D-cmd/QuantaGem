import { NextRequest, NextResponse } from "next/server";
import { verifyAuthToken } from "@/lib/auth";
import { pool } from "@/lib/db";

export async function requireAdmin(
  request: NextRequest
): Promise<{ userId: number; email: string } | NextResponse> {
  const authTokenFromHeader = request.headers.get("Authorization");
  const sessionCookie = request.cookies.get("__session");

  let tokenToVerify: string | undefined;

  if (authTokenFromHeader?.startsWith("Bearer ")) {
    tokenToVerify = authTokenFromHeader.substring(7);
  } else if (sessionCookie) {
    tokenToVerify = sessionCookie.value;
  }

  if (!tokenToVerify) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const payload = await verifyAuthToken(tokenToVerify);
  if (!payload || typeof payload.userId !== "number") {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const result = await pool.query("SELECT role, email FROM users WHERE id = $1", [payload.userId]);

  if (result.rows.length === 0 || result.rows[0].role !== "admin") {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  return { userId: payload.userId, email: result.rows[0].email };
}
