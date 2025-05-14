import { NextResponse, NextRequest } from "next/server";
import { GoogleGenAI, Model } from "@google/genai";

export async function GET(request: NextRequest) {
  const keySelection =
    (request.nextUrl.searchParams.get("keySelection") as "free" | "paid") ??
    "free";
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

  const ai = new GoogleGenAI({ apiKey });
  try {
    const pager = await ai.models.list();
    const models: Model[] = [];
    for await (const m of pager) {
      if (m.name) models.push(m);
    }
    return NextResponse.json(models);
  } catch (e) {
    return NextResponse.json({ error: (e as Error).message }, { status: 500 });
  }
}
