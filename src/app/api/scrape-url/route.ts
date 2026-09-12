import { NextRequest, NextResponse } from "next/server";
import { scrapeUrl, ScrapeError, ScrapeResult } from "@/lib/web-scrape";

interface ScrapeRequest {
  url: string;
}

export async function POST(request: NextRequest) {
  const userIdHeader = request.headers.get("x-user-id");
  if (!userIdHeader) {
    return NextResponse.json({ error: "Unauthorized: Missing user identification" }, { status: 401 });
  }
  const userId = parseInt(userIdHeader, 10);
  if (isNaN(userId)) {
    return NextResponse.json({ error: "Invalid user ID" }, { status: 401 });
  }

  const { url } = (await request.json()) as ScrapeRequest;
  if (typeof url !== "string" || !url.trim()) {
    return NextResponse.json({ error: "URL is required" }, { status: 400 });
  }

  try {
    const result: ScrapeResult = await scrapeUrl(url.trim());
    return NextResponse.json(result);
  } catch (error: unknown) {
    if (error instanceof ScrapeError) {
      switch (error.code) {
        case "invalid-url":
        case "ssrf-blocked":
          return NextResponse.json({ error: "Invalid URL", details: error.message }, { status: 400 });
        case "unsupported-content-type":
          return NextResponse.json({ error: "Unsupported content type", details: error.message }, { status: 415 });
        case "timeout":
        case "fetch-failed":
          return NextResponse.json({ error: "Failed to fetch URL", details: error.message }, { status: 422 });
      }
    }
    console.error("Scrape URL error:", error);
    const details = error instanceof Error ? error.message : "An unknown error occurred.";
    return NextResponse.json({ error: "Failed to fetch URL", details }, { status: 502 });
  }
}
