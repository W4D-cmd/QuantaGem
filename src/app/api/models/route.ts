import { NextResponse, NextRequest } from "next/server";
import { GoogleGenAI, Model } from "@google/genai";

export async function GET(request: NextRequest) {
  const projectId = process.env.GOOGLE_CLOUD_PROJECT;
  const location = process.env.GOOGLE_CLOUD_LOCATION || "global";

  if (!projectId) {
    return NextResponse.json({ error: "GOOGLE_CLOUD_PROJECT is not configured." }, { status: 500 });
  }

  const genAI = new GoogleGenAI({ vertexai: true, project: projectId, location: location });

  try {
    const pager = await genAI.models.list();
    const models: Model[] = [];
    for await (const m of pager) {
      if (m.name) models.push(m);
    }
    return NextResponse.json(models);
  } catch (e) {
    return NextResponse.json({ error: (e as Error).message }, { status: 500 });
  }
}
