import { NextRequest, NextResponse } from "next/server";
import { pool } from "@/lib/db";

interface OpenAIModel {
  id: string;
  object: string;
  created?: number;
  owned_by?: string;
}

interface OpenAIModelsResponse {
  object: string;
  data: OpenAIModel[];
}

/**
 * GET /api/models/custom
 * Fetches models from the user's configured custom OpenAI-compatible endpoint.
 * Uses the stored credentials from the database.
 */
export async function GET(request: NextRequest) {
  const userIdHeader = request.headers.get("x-user-id");
  if (!userIdHeader) {
    return NextResponse.json({ error: "Unauthorized: Missing user identification" }, { status: 401 });
  }
  const userId = userIdHeader;

  try {
    // Fetch the user's custom endpoint configuration from the database
    const { rows } = await pool.query(
      "SELECT custom_openai_endpoint, custom_openai_key FROM user_settings WHERE user_id = $1",
      [userId],
    );

    if (rows.length === 0 || !rows[0].custom_openai_endpoint) {
      return NextResponse.json(
        { error: "No custom OpenAI endpoint configured", models: [] },
        { status: 200 },
      );
    }

    const endpoint = rows[0].custom_openai_endpoint;
    const apiKey = rows[0].custom_openai_key;

    // Construct the models URL
    const modelsUrl = endpoint.endsWith("/")
      ? `${endpoint}models`
      : `${endpoint}/models`;

    // Prepare headers
    const headers: Record<string, string> = {
      "Content-Type": "application/json",
    };

    if (apiKey) {
      headers["Authorization"] = `Bearer ${apiKey}`;
    }

    // Fetch models from the custom endpoint
    const response = await fetch(modelsUrl, {
      method: "GET",
      headers,
      signal: AbortSignal.timeout(10000), // 10 second timeout
    });

    if (!response.ok) {
      const errorText = await response.text().catch(() => "Unknown error");
      console.error(`Failed to fetch models from ${modelsUrl}: ${response.status} ${errorText}`);
      return NextResponse.json(
        { error: `Failed to fetch models: ${response.statusText}`, models: [] },
        { status: 200 }, // Return 200 with empty array to not break the UI
      );
    }

    const data: OpenAIModelsResponse = await response.json();

    // Extract and format the model list
    const models = (data.data || [])
      .filter((model) => model.id && typeof model.id === "string")
      .map((model) => ({
        id: model.id,
        object: model.object,
        owned_by: model.owned_by,
      }))
      .sort((a, b) => a.id.localeCompare(b.id));

    return NextResponse.json({ models, endpoint }, { status: 200 });
  } catch (error) {
    console.error(`Error fetching custom models for user ${userId}:`, error);

    if (error instanceof Error && error.name === "TimeoutError") {
      return NextResponse.json(
        { error: "Connection timed out", models: [] },
        { status: 200 },
      );
    }

    const errorMessage = error instanceof Error ? error.message : "An unknown error occurred.";
    return NextResponse.json(
      { error: errorMessage, models: [] },
      { status: 200 }, // Return 200 with empty array to not break the UI
    );
  }
}

/**
 * POST /api/models/custom
 * Tests connection to a custom OpenAI-compatible endpoint and fetches available models.
 * This endpoint allows testing without saving the configuration.
 */
export async function POST(request: NextRequest) {
  const userIdHeader = request.headers.get("x-user-id");
  if (!userIdHeader) {
    return NextResponse.json({ error: "Unauthorized: Missing user identification" }, { status: 401 });
  }
  const userId = userIdHeader;

  try {
    const body = (await request.json()) as {
      endpoint?: string;
      apiKey?: string;
    };

    const { endpoint, apiKey } = body;

    if (!endpoint || endpoint.trim() === "") {
      return NextResponse.json({ error: "Endpoint URL is required" }, { status: 400 });
    }

    const trimmedEndpoint = endpoint.trim();

    // Validate URL format
    try {
      new URL(trimmedEndpoint);
    } catch {
      return NextResponse.json({ error: "Invalid URL format" }, { status: 400 });
    }

    // Construct the models URL
    const modelsUrl = trimmedEndpoint.endsWith("/")
      ? `${trimmedEndpoint}models`
      : `${trimmedEndpoint}/models`;

    // Prepare headers
    const headers: Record<string, string> = {
      "Content-Type": "application/json",
    };

    if (apiKey && apiKey.trim() !== "") {
      headers["Authorization"] = `Bearer ${apiKey.trim()}`;
    }

    // Fetch models from the custom endpoint
    const response = await fetch(modelsUrl, {
      method: "GET",
      headers,
      signal: AbortSignal.timeout(10000), // 10 second timeout
    });

    if (!response.ok) {
      const errorText = await response.text().catch(() => "Unknown error");
      console.error(`Failed to fetch models from ${modelsUrl}: ${response.status} ${errorText}`);
      return NextResponse.json(
        { error: `Connection failed: ${response.status} ${response.statusText}` },
        { status: 400 },
      );
    }

    const data: OpenAIModelsResponse = await response.json();

    // Extract and format the model list
    const models = (data.data || [])
      .filter((model) => model.id && typeof model.id === "string")
      .map((model) => ({
        id: model.id,
        object: model.object,
        owned_by: model.owned_by,
      }))
      .sort((a, b) => a.id.localeCompare(b.id));

    return NextResponse.json({
      success: true,
      models,
      endpoint: trimmedEndpoint,
      count: models.length,
    }, { status: 200 });
  } catch (error) {
    console.error(`Error testing custom endpoint for user ${userId}:`, error);

    if (error instanceof Error && error.name === "TimeoutError") {
      return NextResponse.json({ error: "Connection timed out" }, { status: 408 });
    }

    const errorMessage = error instanceof Error ? error.message : "An unknown error occurred.";
    return NextResponse.json({ error: errorMessage }, { status: 500 });
  }
}
