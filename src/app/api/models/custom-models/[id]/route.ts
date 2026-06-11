import { NextRequest, NextResponse } from "next/server";
import { pool } from "@/lib/db";

export const dynamic = "force-dynamic";

interface UpdateCustomModelBody {
  modelId?: string;
  displayName?: string;
  apiType?: "openai" | "anthropic";
  inputTokenLimit?: number;
  outputTokenLimit?: number;
  supportsReasoning?: boolean;
  supportsVerbosity?: boolean;
}

/**
 * PATCH /api/models/custom-models/[id]
 * Updates a manually defined custom model for the authenticated user.
 */
export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const userIdHeader = request.headers.get("x-user-id");
  if (!userIdHeader) {
    return NextResponse.json({ error: "Unauthorized: Missing user identification" }, { status: 401 });
  }
  const userId = userIdHeader;

  try {
    const { id } = await params;
    const modelId = parseInt(id, 10);

    if (isNaN(modelId)) {
      return NextResponse.json({ error: "Invalid model ID" }, { status: 400 });
    }

    const body = (await request.json()) as UpdateCustomModelBody;

    const setClauses: string[] = [];
    const values: (string | number | boolean | null)[] = [];
    let paramIndex = 2;

    if (body.modelId !== undefined) {
      if (!body.modelId.trim()) {
        return NextResponse.json({ error: "Model ID cannot be empty" }, { status: 400 });
      }
      setClauses.push(`model_id = $${paramIndex++}`);
      values.push(body.modelId.trim());
    }
    if (body.displayName !== undefined) {
      if (!body.displayName.trim()) {
        return NextResponse.json({ error: "Display name cannot be empty" }, { status: 400 });
      }
      setClauses.push(`display_name = $${paramIndex++}`);
      values.push(body.displayName.trim());
    }
    if (body.apiType !== undefined) {
      if (!["openai", "anthropic"].includes(body.apiType)) {
        return NextResponse.json({ error: "API type must be 'openai' or 'anthropic'" }, { status: 400 });
      }
      setClauses.push(`api_type = $${paramIndex++}`);
      values.push(body.apiType);
    }
    if (body.inputTokenLimit !== undefined) {
      setClauses.push(`input_token_limit = $${paramIndex++}`);
      values.push(body.inputTokenLimit);
    }
    if (body.outputTokenLimit !== undefined) {
      setClauses.push(`output_token_limit = $${paramIndex++}`);
      values.push(body.outputTokenLimit);
    }
    if (body.supportsReasoning !== undefined) {
      setClauses.push(`supports_reasoning = $${paramIndex++}`);
      values.push(body.supportsReasoning);
    }
    if (body.supportsVerbosity !== undefined) {
      setClauses.push(`supports_verbosity = $${paramIndex++}`);
      values.push(body.supportsVerbosity);
    }

    if (setClauses.length === 0) {
      return NextResponse.json({ error: "No fields to update" }, { status: 400 });
    }

    setClauses.push(`updated_at = NOW()`);

    const query = `UPDATE custom_models SET ${setClauses.join(", ")} WHERE id = $1 AND user_id = ${paramIndex++} RETURNING id, model_id, display_name, api_type, input_token_limit, output_token_limit, supports_reasoning, supports_verbosity, created_at, updated_at`;
    values.unshift(modelId);
    values.push(userId);

    const { rows } = await pool.query(query, values);

    if (rows.length === 0) {
      return NextResponse.json({ error: "Model not found or not owned by user" }, { status: 404 });
    }

    const model = {
      id: rows[0].id,
      modelId: rows[0].model_id,
      displayName: rows[0].display_name,
      apiType: rows[0].api_type,
      inputTokenLimit: rows[0].input_token_limit,
      outputTokenLimit: rows[0].output_token_limit,
      supportsReasoning: rows[0].supports_reasoning,
      supportsVerbosity: rows[0].supports_verbosity,
      createdAt: rows[0].created_at,
      updatedAt: rows[0].updated_at,
    };

    return NextResponse.json({ model }, { status: 200 });
  } catch (error) {
    console.error(`Error updating manual custom model:`, error);
    const errorMessage = error instanceof Error ? error.message : "An unknown error occurred.";
    return NextResponse.json({ error: "Failed to update custom model", details: errorMessage }, { status: 500 });
  }
}

/**
 * DELETE /api/models/custom-models/[id]
 * Deletes a manually defined custom model for the authenticated user.
 */
export async function DELETE(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const userIdHeader = request.headers.get("x-user-id");
  if (!userIdHeader) {
    return NextResponse.json({ error: "Unauthorized: Missing user identification" }, { status: 401 });
  }
  const userId = userIdHeader;

  try {
    const { id } = await params;
    const modelId = parseInt(id, 10);

    if (isNaN(modelId)) {
      return NextResponse.json({ error: "Invalid model ID" }, { status: 400 });
    }

    const { rowCount } = await pool.query(
      "DELETE FROM custom_models WHERE id = $1 AND user_id = $2",
      [modelId, userId],
    );

    if (rowCount === 0) {
      return NextResponse.json({ error: "Model not found or not owned by user" }, { status: 404 });
    }

    return NextResponse.json({ success: true }, { status: 200 });
  } catch (error) {
    console.error(`Error deleting manual custom model:`, error);
    const errorMessage = error instanceof Error ? error.message : "An unknown error occurred.";
    return NextResponse.json({ error: "Failed to delete custom model", details: errorMessage }, { status: 500 });
  }
}