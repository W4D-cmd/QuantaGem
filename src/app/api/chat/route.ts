import { Content, GoogleGenAI } from "@google/genai";
import { NextResponse } from "next/server";
import { pool } from "@/lib/db";

interface ChatRequest {
  history: Content[];
  message: string;
  chatSessionId: string;
  model: string;
  keySelection: "free" | "paid";
}

export async function POST(request: Request) {
  const {
    history: clientHistory,
    message: newMessageString,
    chatSessionId,
    model,
    keySelection,
  } = (await request.json()) as ChatRequest;

  const apiKey =
    keySelection === "paid"
      ? process.env.PAID_GOOGLE_API_KEY
      : process.env.FREE_GOOGLE_API_KEY;

  if (!apiKey) {
    return NextResponse.json(
      { error: `${keySelection.toUpperCase()}_GOOGLE_API_KEY not configured` },
      { status: 500 },
    );
  }
  if (!chatSessionId) {
    return NextResponse.json(
      { error: "chatSessionId missing" },
      { status: 400 },
    );
  }
  if (!model) {
    return NextResponse.json({ error: "model missing" }, { status: 400 });
  }

  const genAI = new GoogleGenAI({ apiKey });

  try {
    await pool.query(
      `INSERT INTO messages
           (chat_session_id, role, content, parts, position)
         SELECT $1, $2, $3, $4, COALESCE(MAX(position), 0) + 1
         FROM messages
         WHERE chat_session_id = $1`,
      [
        chatSessionId,
        "user",
        newMessageString,
        JSON.stringify([{ text: newMessageString }]),
      ],
    );

    const contentsForApi: Content[] = [
      ...(clientHistory || []),
      { role: "user", parts: [{ text: newMessageString }] },
    ];

    const streamingResult = await genAI.models.generateContentStream({
      model,
      contents: contentsForApi,
    });

    const encoder = new TextEncoder();
    const readableStream = new ReadableStream({
      async start(controller) {
        let modelOutput = "";
        for await (const chunk of streamingResult) {
          if (chunk.text) {
            modelOutput += chunk.text;
            controller.enqueue(encoder.encode(chunk.text));
          }
        }
        await pool.query(
          `INSERT INTO messages
             (chat_session_id, role, content, parts, position)
           SELECT $1, $2, $3, $4, COALESCE(MAX(position), 0) + 1
             FROM messages
            WHERE chat_session_id = $1`,
          [
            chatSessionId,
            "model",
            modelOutput,
            JSON.stringify([{ text: modelOutput }]),
          ],
        );

        await pool.query(
          `UPDATE chat_sessions SET last_model = $2, updated_at = now() WHERE id = $1`,
          [chatSessionId, model],
        );
        controller.close();
      },
      cancel() {},
    });

    return new Response(readableStream, {
      headers: { "Content-Type": "text/plain; charset=utf-8" },
    });
  } catch (error) {
    console.error("Error in Gemini API call:", error);
    const message =
      error instanceof Error
        ? error.message
        : typeof error === "string"
          ? error
          : "Failed to generate content";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
