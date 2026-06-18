import { NextRequest, NextResponse } from "next/server";
import { getUserFromToken } from "@/lib/auth";

export async function POST(request: NextRequest) {
  const user = await getUserFromToken(request);
  if (!user) {
    return NextResponse.json({ error: "Unauthorized: Invalid token" }, { status: 401 });
  }

  try {
    const formData = await request.formData();
    const audioFile = formData.get("audio_file") as File | null;

    if (!audioFile) {
      return NextResponse.json({ error: "Audio file not provided" }, { status: 400 });
    }

    if (audioFile.size < 100) {
      return NextResponse.json({ error: "Audio file too small to transcribe" }, { status: 400 });
    }

    const buffer = Buffer.from(await audioFile.arrayBuffer());
    const filename = audioFile.name || "recording.webm";

    const sttFormData = new FormData();
    sttFormData.append("audio_file", new Blob([buffer], { type: audioFile.type }), filename);

    const sttBaseUrl = process.env.STT_SERVICE_URL || "http://stt-service:50800";
    const sttResponse = await fetch(`${sttBaseUrl}/transcribe`, {
      method: "POST",
      body: sttFormData,
    });

    if (!sttResponse.ok) {
      const errorText = await sttResponse.text();
      console.error(`STT service error: ${sttResponse.status} - ${errorText}`);
      let errorMessage = "Failed to transcribe audio via STT service.";
      try {
        const errorJson = JSON.parse(errorText);
        errorMessage = errorJson.detail || errorMessage;
      } catch {}
      return NextResponse.json({ error: errorMessage }, { status: sttResponse.status });
    }

    const transcription = await sttResponse.text();
    return new NextResponse(transcription, { status: 200, headers: { "Content-Type": "text/plain" } });
  } catch (error) {
    console.error("Error in STT API route:", error);
    const errorMessage = error instanceof Error ? error.message : "An unknown error occurred during transcription.";
    return NextResponse.json(
      { error: "Internal server error during transcription", details: errorMessage },
      { status: 500 },
    );
  }
}
