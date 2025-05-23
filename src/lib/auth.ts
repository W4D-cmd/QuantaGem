import { Pool } from "pg";
import { NextRequest } from "next/server";

export interface User {
  id: number;
  email: string;
}

const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
});

export async function getUserFromSession(
  cookies: NextRequest["cookies"],
): Promise<User | null> {
  const sessionId = cookies.get("session")?.value;

  if (!sessionId) {
    return null;
  }

  try {
    const sessionResult = await pool.query(
      `SELECT s.user_id, u.email
             FROM sessions s
                      JOIN users u ON s.user_id = u.id
             WHERE s.id = $1 AND s.expires_at > NOW()`,
      [sessionId],
    );

    if (sessionResult.rows.length > 0) {
      return {
        id: sessionResult.rows[0].user_id,
        email: sessionResult.rows[0].email,
      };
    } else {
      return null;
    }
  } catch (error) {
    console.error("Error retrieving session or user:", error);
    return null;
  }
}
