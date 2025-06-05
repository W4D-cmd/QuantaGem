import { NextRequest, NextResponse } from "next/server";
import { GoogleGenAI } from "@google/genai";
import { getUserFromToken } from "@/lib/auth";

export async function POST(request: NextRequest) {
  const user = await getUserFromToken(request);
  if (!user) {
    return NextResponse.json({ error: "Unauthorized: User not authenticated" }, { status: 401 });
  }

  const { userMessageContent, keySelection } = await request.json();

  if (!userMessageContent || typeof userMessageContent !== "string") {
    return NextResponse.json({ error: "User message content is required" }, { status: 400 });
  }

  const apiKey = keySelection === "paid" ? process.env.PAID_GOOGLE_API_KEY : process.env.FREE_GOOGLE_API_KEY;

  if (!apiKey) {
    return NextResponse.json({ error: "FREE_GOOGLE_API_KEY not configured" }, { status: 500 });
  }

  const genAI = new GoogleGenAI({ apiKey });

  try {
    const prompt = `You are a chat title generator. Your sole purpose is to provide a concise, few-word chat title (2-5 words) from user input. The title must consist ONLY of relevant keywords. Do NOT include any conversational filler, greetings, introductory phrases, alternative suggestions (e.g., "or simply"), or any additional explanations. Provide only the title itself and make sure to use the same language as the user used.

    User message: "${userMessageContent}"

Title:`;

    const result = await genAI.models.generateContent({
      model: "models/gemma-3-27b-it",
      contents: [{ role: "user", parts: [{ text: prompt }] }],
    });
    const generatedTitle = (result.text || "").trim();

    return NextResponse.json({ title: generatedTitle });
  } catch (error) {
    console.error("Error generating chat title:", error);
    let detailedError = error instanceof Error ? error.message : String(error);
    if (error instanceof Error && error.message.includes("got status: 400 Bad Request.")) {
      try {
        const match = error.message.match(/{.*}/s);
        if (match && match[0]) {
          const jsonError = JSON.parse(match[0]);
          if (jsonError.error && jsonError.error.message) {
            detailedError = `Gemini API Error: ${jsonError.error.message}`;
          }
        }
      } catch (e) {
        console.warn("Failed to parse detailed Gemini error message:", e);
      }
    }
    return NextResponse.json({ error: "Failed to generate chat title", details: detailedError }, { status: 500 });
  }
}
