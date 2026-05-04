import { NextRequest, NextResponse } from "next/server";
import { getUserFromToken } from "@/lib/auth";

export async function POST(request: NextRequest) {
  const user = await getUserFromToken(request);
  if (!user) {
    return NextResponse.json({ error: "Unauthorized: Invalid token" }, { status: 401 });
  }

  try {
    const response = await fetch("http://stt-service:8000/stream", {
      method: "POST",
      body: request.body,
      // @ts-ignore - duplex is required for streaming requests in Node.js fetch
      duplex: "half",
    });

    if (!response.ok) {
      console.error(`STT streaming error: ${response.status}`);
      return NextResponse.json({ error: "STT streaming failed" }, { status: response.status });
    }

    return new NextResponse(response.body, {
      status: 200,
      headers: {
        "Content-Type": "text/event-stream",
        "Cache-Control": "no-cache",
        "Connection": "keep-alive",
      },
    });
  } catch (error) {
    console.error("Error setting up streaming STT:", error);
    return NextResponse.json({ error: "Internal Server Error" }, { status: 500 });
  }
}
