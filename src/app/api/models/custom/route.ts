import { NextRequest, NextResponse } from "next/server";
import { pool } from "@/lib/db";
import { getStaticModelsForEndpoint } from "@/lib/custom-models";

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
 * Fetches models from the user's configured custom endpoints.
 * Uses the stored credentials from the database.
 */
export async function GET(request: NextRequest) {
  const userIdHeader = request.headers.get("x-user-id");
  if (!userIdHeader) {
    return NextResponse.json({ error: "Unauthorized: Missing user identification" }, { status: 401 });
  }
  const userId = userIdHeader;

  try {
    // Fetch the user's custom endpoint configurations from the database
    const { rows } = await pool.query(
      "SELECT custom_openai_endpoint, custom_openai_key, custom_anthropic_endpoint, custom_anthropic_key FROM user_settings WHERE user_id = $1",
      [userId],
    );

    if (rows.length === 0) {
      return NextResponse.json(
        { error: "No custom endpoints configured", models: [] },
        { status: 200 },
      );
    }

    const {
      custom_openai_endpoint: openaiEndpoint,
      custom_openai_key: openaiKey,
      custom_anthropic_endpoint: anthropicEndpoint,
      custom_anthropic_key: anthropicKey,
    } = rows[0];

    const allModels: Array<OpenAIModel & { apiType: "openai" | "anthropic" }> = [];

    // Helper to fetch models from an endpoint
    const fetchFromEndpoint = async (endpoint: string, apiKey: string | null, apiType: "openai" | "anthropic") => {
      try {
        const staticModels = getStaticModelsForEndpoint(endpoint);
        if (staticModels) {
          allModels.push(
            ...staticModels.map((m) => ({
              id: m.id,
              displayName: m.displayName,
              object: "model",
              owned_by: "static",
              apiType: m.apiType || apiType,
            }))
          );
          return;
        }

        const modelsUrl = endpoint.endsWith("/") ? `${endpoint}models` : `${endpoint}/models`;

        const headers: Record<string, string> = {
          "Content-Type": "application/json",
        };

        if (apiKey) {
          if (apiType === "anthropic") {
            headers["x-api-key"] = apiKey;
            headers["anthropic-version"] = "2023-06-01";
          } else {
            headers["Authorization"] = `Bearer ${apiKey}`;
          }
        }

        const response = await fetch(modelsUrl, {
          method: "GET",
          headers,
          signal: AbortSignal.timeout(10000),
        });

        if (!response.ok) {
          console.warn(`Failed to fetch models from ${apiType} endpoint ${modelsUrl}: ${response.status}`);
          return;
        }

        const data = await response.json();
        
        // Handle both standard OpenAI format and potentially Anthropic list format
        const modelsList = data.data || data.models || (Array.isArray(data) ? data : []);

        const formattedModels = modelsList
          .filter((model: any) => model.id && typeof model.id === "string")
          .map((model: any) => ({
            id: model.id,
            object: model.object || "model",
            owned_by: model.owned_by,
            apiType,
          }));

        allModels.push(...formattedModels);
      } catch (err) {
        console.warn(`Error fetching from ${apiType} endpoint:`, err);
      }
    };

    // Fetch from both endpoints concurrently if configured
    const fetchPromises = [];
    if (openaiEndpoint) {
      fetchPromises.push(fetchFromEndpoint(openaiEndpoint, openaiKey, "openai"));
    }
    if (anthropicEndpoint) {
      fetchPromises.push(fetchFromEndpoint(anthropicEndpoint, anthropicKey, "anthropic"));
    }

    await Promise.all(fetchPromises);

    if (allModels.length === 0 && (openaiEndpoint || anthropicEndpoint)) {
      // Both endpoints failed or returned no models, but at least one was configured.
      // We return an empty list but maybe log or we can return an error if we prefer.
    }

    // Deduplicate models just in case
    const uniqueModelsMap = new Map();
    for (const model of allModels) {
      // Use original id as key, or composite key if they might overlap
      uniqueModelsMap.set(`${model.apiType}:${model.id}`, model);
    }

    const finalModels = Array.from(uniqueModelsMap.values()).sort((a, b) => a.id.localeCompare(b.id));

    return NextResponse.json({ models: finalModels }, { status: 200 });
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
 * Tests connection to a custom OpenAI-compatible or Anthropic-compatible endpoint and fetches available models.
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
      apiType?: "openai" | "anthropic";
    };

    const { endpoint, apiKey, apiType = "openai" } = body;

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

    // Check for hardcoded models first
    const staticModels = getStaticModelsForEndpoint(trimmedEndpoint);
    if (staticModels) {
      const models = staticModels.map((m) => ({
        id: m.id,
        displayName: m.displayName,
        object: "model",
        owned_by: "static",
        apiType: m.apiType || apiType,
      }));
      return NextResponse.json({
        success: true,
        models,
        endpoint: trimmedEndpoint,
        count: models.length,
      }, { status: 200 });
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
      if (apiType === "anthropic") {
        headers["x-api-key"] = apiKey.trim();
        headers["anthropic-version"] = "2023-06-01";
      } else {
        headers["Authorization"] = `Bearer ${apiKey.trim()}`;
      }
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

    const data = await response.json();
    
    const modelsList = data.data || data.models || (Array.isArray(data) ? data : []);

    // Extract and format the model list
    const models = modelsList
      .filter((model: any) => model.id && typeof model.id === "string")
      .map((model: any) => ({
        id: model.id,
        object: model.object || "model",
        owned_by: model.owned_by,
        apiType,
      }))
      .sort((a: any, b: any) => a.id.localeCompare(b.id));

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
