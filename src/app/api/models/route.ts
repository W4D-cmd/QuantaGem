import { NextResponse } from "next/server";
import { OAIModel } from "@/lib/custom-models";

interface ApiModel {
  id: string;
  name: string;
  description?: string;
  context_length?: number;
  top_provider?: {
    max_completion_tokens?: number;
  };
}

export async function GET() {
  const apiKey = process.env.OPENAI_API_KEY;
  const baseUrl = process.env.OPENAI_API_BASE_URL;

  if (!apiKey || !baseUrl) {
    return NextResponse.json({ error: "OpenAI API key or base URL not configured" }, { status: 500 });
  }

  try {
    const response = await fetch(`${baseUrl}/models`, {
      method: "GET",
      headers: {
        Authorization: `Bearer ${apiKey}`,
      },
    });

    if (!response.ok) {
      const errorBody = await response.json();
      throw new Error(errorBody.error?.message || `API Error: ${response.statusText}`);
    }

    const data = await response.json();

    const models: OAIModel[] = data.data.map((m: ApiModel) => ({
      id: m.id,
      name: m.name,
      description: m.description,
      context_length: m.context_length,
      max_completion_tokens: m.top_provider?.max_completion_tokens,
    }));

    return NextResponse.json(models);
  } catch (e) {
    return NextResponse.json({ error: (e as Error).message }, { status: 500 });
  }
}
