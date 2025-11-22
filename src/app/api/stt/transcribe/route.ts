import { NextRequest, NextResponse } from "next/server";

export async function POST(request: NextRequest) {
  const userIdHeader = request.headers.get("x-user-id");
  if (!userIdHeader) {
    return NextResponse.json({ error: "Unauthorized: Missing user identification" }, { status: 401 });
  }
  const userId = userIdHeader; // oder parseInt(userIdHeader, 10);

  try {
    const formData = await request.formData();
    const audioFile = formData.get("audio_file") as Blob | null;

    if (!audioFile) {
      return NextResponse.json({ error: "Audio file not provided" }, { status: 400 });
    }

    const buffer = Buffer.from(await audioFile.arrayBuffer());

    const sttFormData = new FormData();
    sttFormData.append("audio_file", new Blob([buffer], { type: audioFile.type }), "recording.webm");

    const sttResponse = await fetch("http://stt-service:8000/transcribe", {
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
