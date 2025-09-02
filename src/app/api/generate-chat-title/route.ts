import { NextRequest, NextResponse } from "next/server";
import { getUserFromToken } from "@/lib/auth";

export async function POST(request: NextRequest) {
  const user = await getUserFromToken(request);
  if (!user) {
    return NextResponse.json({ error: "Unauthorized: User not authenticated" }, { status: 401 });
  }

  const { userMessageContent } = await request.json();

  if (!userMessageContent || typeof userMessageContent !== "string") {
    return NextResponse.json({ error: "User message content is required" }, { status: 400 });
  }

  const apiKey = process.env.OPENAI_API_KEY;
  const baseUrl = process.env.OPENAI_API_BASE_URL;

  if (!apiKey || !baseUrl) {
    return NextResponse.json({ error: "OpenAI API key or base URL not configured" }, { status: 500 });
  }

  try {
    const prompt = `You are a chat title generator. Your sole purpose is to provide a concise, few-word chat title (2-5 words) from user input. The title must consist ONLY of relevant keywords. Do NOT include any conversational filler, greetings, introductory phrases, alternative suggestions (e.g., "or simply"), or any additional explanations. Provide only the title itself and make sure to use the same language as the user used.

    User message: "${userMessageContent}"

Title:`;

    const response = await fetch(`${baseUrl}/chat/completions`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${apiKey}`,
      },
      body: JSON.stringify({
        model: "google/gemma-3-4b-it",
        messages: [{ role: "user", content: prompt }],
        stream: false,
        max_tokens: 20,
      }),
    });

    if (!response.ok) {
      const errorBody = await response.json();
      throw new Error(errorBody.error?.message || `API Error: ${response.statusText}`);
    }

    const result = await response.json();
    const generatedTitle = (result.choices?.[0]?.message?.content || "").trim().replace(/^"|"$/g, "");

    return NextResponse.json({ title: generatedTitle });
  } catch (error) {
    console.error("Error generating chat title:", error);
    const detailedError = error instanceof Error ? error.message : String(error);
    return NextResponse.json({ error: "Failed to generate chat title", details: detailedError }, { status: 500 });
  }
}
