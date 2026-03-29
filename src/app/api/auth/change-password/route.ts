import { NextRequest, NextResponse } from "next/server";
import { pool } from "@/lib/db";
import bcrypt from "bcryptjs";

const BCRYPT_SALT_ROUNDS = 12;

export async function POST(request: NextRequest) {
  const userIdHeader = request.headers.get("x-user-id");
  if (!userIdHeader) {
    return NextResponse.json({ error: "Unauthorized: Missing user identification" }, { status: 401 });
  }
  const userId = parseInt(userIdHeader, 10);

  try {
    const { currentPassword, newPassword } = await request.json();

    if (!currentPassword || !newPassword) {
      return NextResponse.json({ error: "Current password and new password are required" }, { status: 400 });
    }

    if (newPassword.length < 8) {
      return NextResponse.json({ error: "New password must be at least 8 characters long" }, { status: 400 });
    }

    const client = await pool.connect();
    try {
      // Fetch user's current password hash
      const userResult = await client.query("SELECT password_hash FROM users WHERE id = $1", [userId]);

      if (userResult.rows.length === 0) {
        return NextResponse.json({ error: "User not found" }, { status: 404 });
      }

      const { password_hash: passwordHash } = userResult.rows[0];

      // Verify current password
      const isMatch = await bcrypt.compare(currentPassword, passwordHash);
      if (!isMatch) {
        return NextResponse.json({ error: "Invalid current password" }, { status: 401 });
      }

      // Hash new password
      const newPasswordHash = await bcrypt.hash(newPassword, BCRYPT_SALT_ROUNDS);

      // Update password hash in database
      await client.query("UPDATE users SET password_hash = $1 WHERE id = $2", [newPasswordHash, userId]);

      return NextResponse.json({ message: "Password updated successfully" }, { status: 200 });
    } finally {
      client.release();
    }
  } catch (error) {
    console.error(`Error changing password for user ${userId}:`, error);
    const errorMessage = error instanceof Error ? error.message : "An unknown error occurred.";
    return NextResponse.json({ error: "Failed to change password", details: errorMessage }, { status: 500 });
  }
}
