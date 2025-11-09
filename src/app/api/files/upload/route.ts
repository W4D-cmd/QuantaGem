import { NextRequest, NextResponse } from "next/server";
import { getUserFromToken } from "@/lib/auth";
import { getGoogleGenAI } from "@/lib/google-genai";

export async function POST(request: NextRequest) {
  const user = await getUserFromToken(request);
  if (!user) {
    return NextResponse.json({ error: "Unauthorized: User not authenticated" }, { status: 401 });
  }

  try {
    const formData = await request.formData();
    const file = formData.get("file") as File | null;

    if (!file) {
      return NextResponse.json({ error: "File not provided" }, { status: 400 });
    }

    const genAI = getGoogleGenAI();
    const googleFile = await genAI.files.upload({
      file: file,
      config: {
        displayName: file.name,
      },
    });

    if (!googleFile.name || !googleFile.uri) {
      throw new Error("Google File API did not return a valid file name or URI.");
    }

    return NextResponse.json({
      success: true,
      message: "File uploaded successfully to Google.",
      fileName: file.name,
      mimeType: googleFile.mimeType,
      size: Number(googleFile.sizeBytes),
      googleFileName: googleFile.name,
      googleFileUri: googleFile.uri,
    });
  } catch (error) {
    console.error("Error uploading file to Google:", error);
    const errorMessage = error instanceof Error ? error.message : "An unknown error occurred during file upload.";
    return NextResponse.json({ error: "Failed to upload file", details: errorMessage }, { status: 500 });
  }
}
