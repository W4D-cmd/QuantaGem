import { NextRequest, NextResponse } from "next/server";
import { GoogleGenAI, HarmCategory, HarmBlockThreshold } from "@google/genai";
import { getUserFromToken } from "@/lib/auth";

export async function POST(request: NextRequest) {
  const user = await getUserFromToken(request);
  if (!user) {
    return NextResponse.json({ error: "Unauthorized: User not authenticated" }, { status: 401 });
  }

  const {
    text,
    voice,
    model,
  }: {
    text: string;
    voice: string;
    model: string;
  } = await request.json();

  if (!text) {
    return NextResponse.json({ error: "Text is required" }, { status: 400 });
  }
  if (!voice) {
    return NextResponse.json({ error: "Voice is required" }, { status: 400 });
  }
  if (!model) {
    return NextResponse.json({ error: "TTS Model is required" }, { status: 400 });
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
    const result = await genAI.models.generateContent({
      model: model,
      contents: [{ parts: [{ text: text }] }],
      config: {
        safetySettings: safetySettings,
        responseModalities: ["AUDIO"],
        speechConfig: {
          voiceConfig: {
            prebuiltVoiceConfig: {
              voiceName: voice,
            },
          },
        },
      },
    });

    const audioPart = result.candidates?.[0]?.content?.parts?.[0];

    if (audioPart && audioPart.inlineData?.data) {
      return NextResponse.json({ audioContent: audioPart.inlineData.data });
    } else {
      console.error("DEBUG: Full response from Google API:", JSON.stringify(result, null, 2));
      throw new Error("Audio data not found in response from Google API.");
    }
  } catch (error) {
    console.error("Error generating speech:", error);
    const errorMessage = error instanceof Error ? error.message : "An unknown error occurred.";
    return NextResponse.json({ error: "Failed to generate speech", details: errorMessage }, { status: 500 });
  }
}
