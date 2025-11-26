import { NextRequest, NextResponse } from "next/server";
import { GoogleGenAI, HarmCategory, HarmBlockThreshold } from "@google/genai";

export async function POST(request: NextRequest) {
  const userIdHeader = request.headers.get("x-user-id");
  if (!userIdHeader) {
    return NextResponse.json({ error: "Unauthorized: Missing user identification" }, { status: 401 });
  }
  const userId = userIdHeader;

  const { userMessageContent } = (await request.json()) as { userMessageContent: string };

  if (!userMessageContent || typeof userMessageContent !== "string") {
    return NextResponse.json({ error: "User message content is required" }, { status: 400 });
  }

  const projectId = process.env.GOOGLE_CLOUD_PROJECT;
  const location = process.env.GOOGLE_CLOUD_LOCATION || "global";

  if (!projectId) {
    return NextResponse.json({ error: "GOOGLE_CLOUD_PROJECT is not configured." }, { status: 500 });
  }

  const genAI = new GoogleGenAI({ vertexai: true, project: projectId, location: location });

  const safetySettings = [
    {
      category: HarmCategory.HARM_CATEGORY_HARASSMENT,
      threshold: HarmBlockThreshold.BLOCK_NONE,
    },
    {
      category: HarmCategory.HARM_CATEGORY_HATE_SPEECH,
      threshold: HarmBlockThreshold.BLOCK_NONE,
    },
    {
      category: HarmCategory.HARM_CATEGORY_SEXUALLY_EXPLICIT,
      threshold: HarmBlockThreshold.BLOCK_NONE,
    },
    {
      category: HarmCategory.HARM_CATEGORY_DANGEROUS_CONTENT,
      threshold: HarmBlockThreshold.BLOCK_NONE,
    },
    {
      category: HarmCategory.HARM_CATEGORY_CIVIC_INTEGRITY,
      threshold: HarmBlockThreshold.BLOCK_NONE,
    },
  ];

  try {
    const prompt = `You are a chat title generator. Your sole purpose is to provide a concise, few-word chat title (2-5 words) from user input. The title must consist ONLY of relevant keywords. Do NOT include any conversational filler, greetings, introductory phrases, alternative suggestions (e.g., "or simply"), or any additional explanations. Provide only the title itself and make sure to use the same language as the user used.

    User message: "${userMessageContent}"

Title:`;

    const result = await genAI.models.generateContent({
      model: "gemini-2.0-flash-lite-001",
      contents: [{ role: "user", parts: [{ text: prompt }] }],
      config: {
        safetySettings: safetySettings,
      },
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
