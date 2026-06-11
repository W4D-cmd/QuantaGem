import { NextRequest, NextResponse } from "next/server";
import { pool } from "@/lib/db";

export const dynamic = "force-dynamic";

interface CreateCustomModelBody {
  modelId: string;
  displayName: string;
  apiType: "openai" | "anthropic";
  inputTokenLimit?: number;
  outputTokenLimit?: number;
  supportsReasoning?: boolean;
  supportsVerbosity?: boolean;
}

/**
 * GET /api/models/custom-models
 * Fetches all manually defined custom models for the authenticated user.
 */
export async function GET(request: NextRequest) {
  const userIdHeader = request.headers.get("x-user-id");
  if (!userIdHeader) {
    return NextResponse.json({ error: "Unauthorized: Missing user identification" }, { status: 401 });
  }
  const userId = userIdHeader;

  try {
    const { rows } = await pool.query(
      "SELECT id, model_id, display_name, api_type, input_token_limit, output_token_limit, supports_reasoning, supports_verbosity, created_at, updated_at FROM custom_models WHERE user_id = $1 ORDER BY display_name",
      [userId],
    );

    const models = rows.map((row) => ({
      id: row.id,
      modelId: row.model_id,
      displayName: row.display_name,
      apiType: row.api_type,
      inputTokenLimit: row.input_token_limit,
      outputTokenLimit: row.output_token_limit,
      supportsReasoning: row.supports_reasoning,
      supportsVerbosity: row.supports_verbosity,
      createdAt: row.created_at,
      updatedAt: row.updated_at,
    }));

    return NextResponse.json({ models }, { status: 200 });
  } catch (error) {
    console.error(`Error fetching manual custom models for user ${userId}:`, error);
    const errorMessage = error instanceof Error ? error.message : "An unknown error occurred.";
    return NextResponse.json({ error: "Failed to fetch custom models", details: errorMessage }, { status: 500 });
  }
}

/**
 * POST /api/models/custom-models
 * Creates a new manually defined custom model for the authenticated user.
 */
export async function POST(request: NextRequest) {
  const userIdHeader = request.headers.get("x-user-id");
  if (!userIdHeader) {
    return NextResponse.json({ error: "Unauthorized: Missing user identification" }, { status: 401 });
  }
  const userId = userIdHeader;

  try {
    const body = (await request.json()) as CreateCustomModelBody;

    const { modelId, displayName, apiType } = body;

    if (!modelId || !modelId.trim()) {
      return NextResponse.json({ error: "Model ID is required" }, { status: 400 });
    }
    if (!displayName || !displayName.trim()) {
      return NextResponse.json({ error: "Display name is required" }, { status: 400 });
    }
    if (!apiType || !["openai", "anthropic"].includes(apiType)) {
      return NextResponse.json({ error: "API type must be 'openai' or 'anthropic'" }, { status: 400 });
    }

    const inputTokenLimit = body.inputTokenLimit ?? 128000;
    const outputTokenLimit = body.outputTokenLimit ?? 4096;
    const supportsReasoning = body.supportsReasoning ?? false;
    const supportsVerbosity = body.supportsVerbosity ?? false;

    const { rows } = await pool.query(
      `INSERT INTO custom_models (user_id, model_id, display_name, api_type, input_token_limit, output_token_limit, supports_reasoning, supports_verbosity)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
       ON CONFLICT (user_id, model_id, api_type)
       DO UPDATE SET display_name = EXCLUDED.display_name, input_token_limit = EXCLUDED.input_token_limit, output_token_limit = EXCLUDED.output_token_limit, supports_reasoning = EXCLUDED.supports_reasoning, supports_verbosity = EXCLUDED.supports_verbosity, updated_at = NOW()
       RETURNING id, model_id, display_name, api_type, input_token_limit, output_token_limit, supports_reasoning, supports_verbosity, created_at, updated_at`,
      [userId, modelId.trim(), displayName.trim(), apiType, inputTokenLimit, outputTokenLimit, supportsReasoning, supportsVerbosity],
    );

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

    return NextResponse.json({ model }, { status: 201 });
  } catch (error) {
    console.error(`Error creating manual custom model for user ${userId}:`, error);
    const errorMessage = error instanceof Error ? error.message : "An unknown error occurred.";
    return NextResponse.json({ error: "Failed to create custom model", details: errorMessage }, { status: 500 });
  }
}