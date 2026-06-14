import { NextRequest, NextResponse } from "next/server";
import { pool } from "@/lib/db";

export async function GET(request: NextRequest) {
  const userIdHeader = request.headers.get("x-user-id");
  if (!userIdHeader) {
    return NextResponse.json({ error: "Unauthorized: Missing user identification" }, { status: 401 });
  }
  const userId = userIdHeader;

  const { searchParams } = new URL(request.url);
  const scope = searchParams.get("scope");
  const chatSessionId = searchParams.get("chat_session_id");

  if (!scope || (scope !== "global" && scope !== "chat")) {
    return NextResponse.json({ error: "scope parameter must be 'global' or 'chat'" }, { status: 400 });
  }

  if (scope === "chat" && !chatSessionId) {
    return NextResponse.json({ error: "chat_session_id is required when scope is 'chat'" }, { status: 400 });
  }

  try {
    let query: string;
    let params: (string | number)[];

    if (scope === "global") {
      query = `SELECT skill_id FROM user_skill_activations WHERE user_id = $1 AND scope = 'global' AND chat_session_id IS NULL`;
      params = [userId];
    } else {
      query = `SELECT skill_id FROM user_skill_activations WHERE user_id = $1 AND scope = 'chat' AND chat_session_id = $2`;
      params = [userId, parseInt(chatSessionId!, 10)];
    }

    const { rows } = await pool.query(query, params);
    return NextResponse.json({ skillIds: rows.map((r) => r.skill_id) });
  } catch (error) {
    console.error("Error fetching skill activations:", error);
    const errorMessage = error instanceof Error ? error.message : "An unknown error occurred.";
    return NextResponse.json({ error: "Failed to fetch skill activations", details: errorMessage }, { status: 500 });
  }
}

export async function PUT(request: NextRequest) {
  const userIdHeader = request.headers.get("x-user-id");
  if (!userIdHeader) {
    return NextResponse.json({ error: "Unauthorized: Missing user identification" }, { status: 401 });
  }
  const userId = userIdHeader;

  try {
    const { scope, chatSessionId, skillIds } = (await request.json()) as {
      scope: "global" | "chat";
      chatSessionId?: number;
      skillIds: number[];
    };

    if (!scope || (scope !== "global" && scope !== "chat")) {
      return NextResponse.json({ error: "scope must be 'global' or 'chat'" }, { status: 400 });
    }

    if (scope === "chat" && !chatSessionId) {
      return NextResponse.json({ error: "chatSessionId is required when scope is 'chat'" }, { status: 400 });
    }

    if (!Array.isArray(skillIds)) {
      return NextResponse.json({ error: "skillIds must be an array" }, { status: 400 });
    }

    // Validate all skill_ids belong to the user
    if (skillIds.length > 0) {
      const { rows: ownedSkills } = await pool.query("SELECT id FROM skills WHERE user_id = $1 AND id = ANY($2)", [userId, skillIds]);
      if (ownedSkills.length !== skillIds.length) {
        return NextResponse.json({ error: "One or more skill IDs do not belong to this user" }, { status: 403 });
      }
    }

    const client = await pool.connect();
    try {
      await client.query("BEGIN");

      // Delete existing activations for this scope
      if (scope === "global") {
        await client.query("DELETE FROM user_skill_activations WHERE user_id = $1 AND scope = 'global' AND chat_session_id IS NULL", [userId]);
      } else {
        await client.query("DELETE FROM user_skill_activations WHERE user_id = $1 AND scope = 'chat' AND chat_session_id = $2", [userId, chatSessionId]);
      }

      // Insert new activations using parameterized queries
      for (const skillId of skillIds) {
        if (scope === "global") {
          await client.query(
            "INSERT INTO user_skill_activations (user_id, skill_id, scope, chat_session_id) VALUES ($1, $2, 'global', NULL)",
            [userId, skillId],
          );
        } else {
          await client.query(
            "INSERT INTO user_skill_activations (user_id, skill_id, scope, chat_session_id) VALUES ($1, $2, 'chat', $3)",
            [userId, skillId, chatSessionId],
          );
        }
      }

      await client.query("COMMIT");
    } catch (error) {
      await client.query("ROLLBACK");
      throw error;
    } finally {
      client.release();
    }

    return NextResponse.json({ ok: true, skillIds });
  } catch (error) {
    console.error("Error updating skill activations:", error);
    const errorMessage = error instanceof Error ? error.message : "An unknown error occurred.";
    return NextResponse.json({ error: "Failed to update skill activations", details: errorMessage }, { status: 500 });
  }
}