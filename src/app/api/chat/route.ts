import { Content, GroundingMetadata, Part, HarmCategory, HarmBlockThreshold } from "@google/genai";
import { NextRequest, NextResponse } from "next/server";
import { pool } from "@/lib/db";
import { MessagePart } from "@/app/page";
import { getUserFromToken } from "@/lib/auth";
import * as cheerio from "cheerio";
import { getGoogleGenAI } from "@/lib/google-genai";

export const maxDuration = 600;

interface ChatRequest {
  history: Array<{ role: string; parts: MessagePart[] }>;
  messageParts: MessagePart[];
  chatSessionId: string;
  model: string;
  keySelection: "free" | "paid";
  isSearchActive?: boolean;
  thinkingBudget?: number;
  isRegeneration?: boolean;
  systemPrompt?: string;
  projectId?: number | null;
}

const safetySettings = [
  { category: HarmCategory.HARM_CATEGORY_HARASSMENT, threshold: HarmBlockThreshold.BLOCK_NONE },
  { category: HarmCategory.HARM_CATEGORY_HATE_SPEECH, threshold: HarmBlockThreshold.BLOCK_NONE },
  { category: HarmCategory.HARM_CATEGORY_SEXUALLY_EXPLICIT, threshold: HarmBlockThreshold.BLOCK_NONE },
  { category: HarmCategory.HARM_CATEGORY_DANGEROUS_CONTENT, threshold: HarmBlockThreshold.BLOCK_NONE },
  { category: HarmCategory.HARM_CATEGORY_CIVIC_INTEGRITY, threshold: HarmBlockThreshold.BLOCK_NONE },
];

async function scrapeUrl(url: string): Promise<string | null> {
  const GOOGLEBOT_USER_AGENT = "Mozilla/5.0 (compatible; Googlebot/2.1; +http://www.google.com/bot.html)";
  const REALISTIC_USER_AGENT =
    "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/125.0.0.0 Safari/537.36";

  const parseHtml = (html: string): string => {
    const $ = cheerio.load(html);
    $("script, style, nav, footer, header, aside, form, .sidebar, #sidebar").remove();
    return $("body").text().replace(/\s\s+/g, " ").trim();
  };

  try {
    const response = await fetch(url, {
      headers: { "User-Agent": GOOGLEBOT_USER_AGENT },
      signal: AbortSignal.timeout(15000),
    });
    if (response.ok) {
      const html = await response.text();
      return parseHtml(html);
    }
    console.warn(`Googlebot scrape for ${url} failed with status: ${response.status}. Retrying...`);
  } catch (error) {
    console.warn(`Googlebot scrape for ${url} threw an error. Retrying...`, error);
  }

  try {
    const response = await fetch(url, {
      headers: { "User-Agent": REALISTIC_USER_AGENT },
      signal: AbortSignal.timeout(20000),
    });
    if (response.ok) {
      const html = await response.text();
      return parseHtml(html);
    }
    console.error(`Fallback scrape for ${url} also failed with status: ${response.status}`);
    return null;
  } catch (error) {
    console.error(`Fallback scrape for ${url} also failed with an error:`, error);
    return null;
  }
}

async function getGoogleFileUriForPart(
  appPart: MessagePart,
  userId: string,
): Promise<{ uri: string; mimeType: string } | null> {
  if (appPart.googleFileUri && appPart.mimeType) {
    return { uri: appPart.googleFileUri, mimeType: appPart.mimeType };
  }
  return null;
}

export async function POST(request: NextRequest) {
  const user = await getUserFromToken(request);
  if (!user) {
    return NextResponse.json({ error: "Unauthorized: User not authenticated" }, { status: 401 });
  }
  const userId = user.id.toString();

  const {
    history: clientHistoryWithAppParts,
    messageParts: originalNewMessageAppParts,
    model,
    isSearchActive,
    thinkingBudget,
    chatSessionId,
    projectId,
    systemPrompt: newChatSystemPrompt,
  } = (await request.json()) as Omit<ChatRequest, "keySelection" | "isRegeneration">;

  if (!model) {
    return NextResponse.json({ error: "model missing" }, { status: 400 });
  }

  const newMessageAppParts: MessagePart[] = [...originalNewMessageAppParts];
  const scrapingPromises = originalNewMessageAppParts
    .filter((part) => part.type === "text" && part.text)
    .flatMap((part) => (part.text?.match(/https?:\/\/[^\s"'<>()]+/g) || []).map((url) => new URL(url).href))
    .filter((url, index, self) => self.indexOf(url) === index)
    .map((url) =>
      scrapeUrl(url).then((scrapedText): MessagePart | null =>
        scrapedText ? { type: "scraped_url", text: `CONTEXT FROM ${url}:\n---\n${scrapedText}\n---`, url } : null,
      ),
    );

  const scrapedParts = (await Promise.all(scrapingPromises)).filter((p): p is MessagePart => p !== null);
  newMessageAppParts.push(...scrapedParts);

  const processParts = async (parts: MessagePart[]): Promise<Part[]> => {
    const geminiParts: Part[] = [];
    for (const appPart of parts) {
      if (appPart.type === "text" && appPart.text) {
        geminiParts.push({ text: appPart.text });
      } else if (appPart.type === "scraped_url" && appPart.text) {
        geminiParts.push({ text: appPart.text });
      } else if (appPart.type === "file") {
        try {
          const fileData = await getGoogleFileUriForPart(appPart, userId);
          if (fileData) {
            geminiParts.push({ fileData: { fileUri: fileData.uri, mimeType: fileData.mimeType } });
          } else {
            console.warn(`Could not process file part: ${appPart.fileName}`);
          }
        } catch (error) {
          console.error(`Error processing file part ${appPart.fileName}:`, error);
        }
      }
    }
    return geminiParts;
  };

  try {
    const newMessageGeminiParts = await processParts(newMessageAppParts);
    if (newMessageGeminiParts.length === 0 && newMessageAppParts.some((p) => p.type === "file")) {
      return NextResponse.json({ error: "No processable content found in message." }, { status: 400 });
    }

    const historyGeminiContents: Content[] = [];
    if (clientHistoryWithAppParts) {
      for (const prevMsg of clientHistoryWithAppParts) {
        const prevMsgGeminiParts = await processParts(prevMsg.parts);
        if (prevMsgGeminiParts.length > 0) {
          historyGeminiContents.push({ role: prevMsg.role, parts: prevMsgGeminiParts });
        }
      }
    }

    const contentsForApi: Content[] = [...historyGeminiContents, { role: "user", parts: newMessageGeminiParts }];

    let systemPromptText: string | null = null;
    try {
      if (newChatSystemPrompt && newChatSystemPrompt.trim() !== "") {
        systemPromptText = newChatSystemPrompt;
      } else if (chatSessionId) {
        const chatSettingsResult = await pool.query(
          "SELECT system_prompt, project_id FROM chat_sessions WHERE id = $1 AND user_id = $2",
          [chatSessionId, userId],
        );
        const chatSettings = chatSettingsResult.rows[0];

        if (chatSettings?.system_prompt?.trim()) {
          systemPromptText = chatSettings.system_prompt;
        } else if (chatSettings?.project_id) {
          const projectSettingsResult = await pool.query(
            "SELECT system_prompt FROM projects WHERE id = $1 AND user_id = $2",
            [chatSettings.project_id, userId],
          );
          if (projectSettingsResult.rows[0]?.system_prompt?.trim()) {
            systemPromptText = projectSettingsResult.rows[0].system_prompt;
          }
        }
      } else if (projectId) {
        const projectSettingsResult = await pool.query(
          "SELECT system_prompt FROM projects WHERE id = $1 AND user_id = $2",
          [projectId, userId],
        );
        if (projectSettingsResult.rows[0]?.system_prompt?.trim()) {
          systemPromptText = projectSettingsResult.rows[0].system_prompt;
        }
      }

      if (!systemPromptText) {
        const globalSettingsResult = await pool.query("SELECT system_prompt FROM user_settings WHERE user_id = $1", [
          userId,
        ]);
        if (globalSettingsResult.rows[0]?.system_prompt?.trim()) {
          systemPromptText = globalSettingsResult.rows[0].system_prompt;
        }
      }
    } catch (dbError) {
      console.warn("Failed to fetch system prompt, proceeding without it:", dbError);
    }

    const generationConfig: {
      systemInstruction?: Content;
      tools?: Array<{ googleSearch: Record<string, never> }>;
      thinkingConfig?: { thinkingBudget?: number; includeThoughts?: boolean };
      safetySettings?: typeof safetySettings;
    } = {};

    generationConfig.safetySettings = safetySettings;

    if (systemPromptText && systemPromptText.trim() !== "") {
      generationConfig.systemInstruction = { role: "user", parts: [{ text: systemPromptText }] };
    }

    if (isSearchActive) {
      generationConfig.tools = [{ googleSearch: {} }];
    }

    const isThinkingSupported = model.includes("2.5-pro") || model.includes("2.5-flash");
    if (isThinkingSupported) {
      const effectiveThinkingConfig: { thinkingBudget?: number; includeThoughts?: boolean } = {};
      if (thinkingBudget !== 0) effectiveThinkingConfig.includeThoughts = true;
      if (thinkingBudget !== undefined) {
        const isProModel = model.includes("2.5-pro");
        if (!isProModel || (isProModel && thinkingBudget !== 0)) {
          effectiveThinkingConfig.thinkingBudget = thinkingBudget;
        }
      }
      if (Object.keys(effectiveThinkingConfig).length > 0) {
        generationConfig.thinkingConfig = effectiveThinkingConfig;
      }
    }

    const genAI = getGoogleGenAI();
    const streamingResult = await genAI.models.generateContentStream({
      model,
      contents: contentsForApi,
      config: generationConfig,
    });

    const encoder = new TextEncoder();
    const readableStream = new ReadableStream({
      async start(controller) {
        let modelOutput = "";
        let thoughtSummaryOutput = "";
        const sourcesToStore: Array<{ title: string; uri: string }> = [];

        for await (const chunk of streamingResult) {
          if (chunk.candidates && chunk.candidates.length > 0) {
            const candidate = chunk.candidates[0];

            if (candidate.groundingMetadata) {
              const groundingMetadata: GroundingMetadata = candidate.groundingMetadata;

              if (groundingMetadata.groundingChunks) {
                for (const gc of groundingMetadata.groundingChunks) {
                  if (gc.web && gc.web.title && gc.web.uri) {
                    const webInfo = gc.web;

                    const isDuplicate = sourcesToStore.some((s) => s.uri === webInfo.uri);
                    if (!isDuplicate) {
                      const source = {
                        title: webInfo.title!,
                        uri: webInfo.uri!,
                      };
                      sourcesToStore.push(source);
                      const jsonGroundingChunk = {
                        type: "grounding",
                        sources: [source],
                      };
                      controller.enqueue(encoder.encode(JSON.stringify(jsonGroundingChunk) + "\n"));
                    }
                  }
                }
              }
            }

            if (candidate.content?.parts) {
              for (const part of candidate.content.parts) {
                if (part.text) {
                  if (part.thought) {
                    thoughtSummaryOutput += part.text;
                    const jsonChunk = { type: "thought", value: part.text };
                    controller.enqueue(encoder.encode(JSON.stringify(jsonChunk) + "\n"));
                  } else {
                    modelOutput += part.text;
                    const jsonChunk = { type: "text", value: part.text };
                    controller.enqueue(encoder.encode(JSON.stringify(jsonChunk) + "\n"));
                  }
                }
              }
            }
          }
        }

        if (modelOutput.trim() === "") {
          console.warn(
            `Gemini model returned an empty message (thoughts received: ${thoughtSummaryOutput.trim() !== ""}). Not saving to DB.`,
          );
          const emptyMessageError = {
            type: "error",
            value: "Model returned an empty message. Please try again.",
          };
          controller.enqueue(encoder.encode(JSON.stringify(emptyMessageError) + "\n"));
        }
        controller.close();
      },
      cancel() {},
    });
    return new Response(readableStream, {
      headers: { "Content-Type": "application/jsonl; charset=utf-8" },
    });
  } catch (error: unknown) {
    console.error("Error in Gemini API call or DB operation:", error);

    let detailedError = "An unknown error occurred during the API call.";
    let status = 500;

    if (typeof error === "object" && error !== null) {
      if ("status" in error && typeof (error as { status: unknown }).status === "number") {
        status = (error as { status: number }).status;
      }

      if ("message" in error && typeof (error as { message: unknown }).message === "string") {
        let errorMessage = (error as { message: string }).message;
        try {
          const match = errorMessage.match(/{.*}/s);
          if (match && match[0]) {
            const jsonError = JSON.parse(match[0]);
            if (jsonError.error && jsonError.error.message) {
              errorMessage = jsonError.error.message;
            }
          }
        } catch (e) {
          console.warn("Could not parse nested JSON from error message.");
        }
        detailedError = errorMessage;
      }
    } else {
      detailedError = String(error);
    }

    return NextResponse.json({ error: detailedError }, { status });
  }
}
