import { NextResponse } from "next/server";
import { pool } from "@/lib/db";
import bcrypt from "bcryptjs";
import { generateAuthToken } from "@/lib/auth";

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

      const token = await generateAuthToken(user.id, user.email);

      const response = NextResponse.json({
        message: "Login successful",
        user: { id: user.id, email: user.email },
      });

      response.cookies.set("__session", token, {
        httpOnly: true,
        secure: process.env.APP_USES_HTTPS === "true",
        maxAge: 7 * 24 * 60 * 60,
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
