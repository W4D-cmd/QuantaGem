import { NextRequest, NextResponse } from "next/server";
import { GoogleGenAI } from "@google/genai";

export async function POST(request: NextRequest) {
  const userIdHeader = request.headers.get("x-user-id");
  if (!userIdHeader) {
    return NextResponse.json({ error: "Unauthorized: Missing user identification" }, { status: 401 });
  }
  const userId = userIdHeader; // oder parseInt(userIdHeader, 10);

  const projectId = process.env.GOOGLE_CLOUD_PROJECT;
  const location = process.env.GOOGLE_CLOUD_LOCATION || "global";

  if (!projectId) {
    return NextResponse.json({ error: "GOOGLE_CLOUD_PROJECT is not configured." }, { status: 500 });
  }

  try {
    const genAI = new GoogleGenAI({ vertexai: true, project: projectId, location: location, apiVersion: "v1alpha" });

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
