import { NextResponse } from "next/server";
import { pool } from "@/lib/db";
import bcrypt from "bcryptjs";
import { v4 as uuidv4 } from "uuid";

const SESSION_EXPIRATION_SECONDS = 7 * 24 * 60 * 60;

export async function POST(request: Request) {
  try {
    const { email, password } = await request.json();

    if (!email || !password) {
      return NextResponse.json(
        { error: "Email and password are required" },
        { status: 400 },
      );
    }

    const client = await pool.connect();
    try {
      const userResult = await client.query(
        "SELECT id, email, password_hash FROM users WHERE email = $1",
        [email],
      );

      const user = userResult.rows[0];

      if (!user) {
        return NextResponse.json(
          { error: "Invalid credentials" },
          { status: 401 },
        );
      }

      const passwordMatch = await bcrypt.compare(password, user.password_hash);

      if (!passwordMatch) {
        return NextResponse.json(
          { error: "Invalid credentials" },
          { status: 401 },
        );
      }

      const sessionId = uuidv4();
      const expiresAt = new Date(
        Date.now() + SESSION_EXPIRATION_SECONDS * 1000,
      );

      await client.query(
        "INSERT INTO sessions (id, user_id, expires_at) VALUES ($1, $2, $3)",
        [sessionId, user.id, expiresAt],
      );

      const response = NextResponse.json({
        message: "Login successful",
        user: { id: user.id, email: user.email },
      });

      response.cookies.set("session", sessionId, {
        httpOnly: true,
        secure: process.env.APP_USES_HTTPS === "true",
        maxAge: SESSION_EXPIRATION_SECONDS,
        path: "/",
        sameSite: "lax",
      });

      return response;
    } finally {
      client.release();
    }
  } catch (error) {
    console.error("Login error:", error);
    return NextResponse.json(
      { error: "Internal server error during login" },
      { status: 500 },
    );
  }
}
