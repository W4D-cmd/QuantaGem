import { NextRequest, NextResponse } from "next/server";
import { customModels, CustomModelEntry, ModelProvider } from "@/lib/custom-models";

export const dynamic = "force-dynamic";

export interface CustomModelResponse extends CustomModelEntry {
  provider: ModelProvider;
}

/**
 * GET /api/models/list
 * Returns the list of configured custom models (Gemini, OpenAI, Anthropic).
 * Requires authentication (x-user-id header set by proxy).
 */
export async function GET(request: NextRequest) {
  const userIdHeader = request.headers.get("x-user-id");
  if (!userIdHeader) {
    return NextResponse.json({ error: "Unauthorized: Missing user identification" }, { status: 401 });
  }

  const models: CustomModelResponse[] = customModels;

  return NextResponse.json({
    models,
    count: models.length,
  });
}
