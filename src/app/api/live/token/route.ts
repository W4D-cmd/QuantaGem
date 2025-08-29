import { NextRequest, NextResponse } from "next/server";
import { GoogleGenAI } from "@google/genai";
import { getUserFromToken } from "@/lib/auth";

export async function POST(request: NextRequest) {
  const user = await getUserFromToken(request);
  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { keySelection } = await request.json();
  const apiKey = process.env.PAID_GOOGLE_API_KEY;

  if (!apiKey) {
    return NextResponse.json({ error: `${keySelection.toUpperCase()}_GOOGLE_API_KEY not configured` }, { status: 500 });
  }

  try {
    const genAI = new GoogleGenAI({ apiKey: apiKey, apiVersion: "v1alpha" });

    const token = await genAI.authTokens.create({
      config: {
        httpOptions: { apiVersion: "v1alpha" },
      },
    });

    if (!token.name) {
      throw new Error("Failed to retrieve token name from Google GenAI");
    }

    return NextResponse.json({ token: token.name });
  } catch (error) {
    console.error("Error creating ephemeral token:", error);
    const errorMessage = error instanceof Error ? error.message : "An unknown error occurred";
    return NextResponse.json({ error: "Failed to create ephemeral token", details: errorMessage }, { status: 500 });
  }
}
