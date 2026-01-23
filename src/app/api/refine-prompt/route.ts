import { GoogleGenAI, HarmCategory, HarmBlockThreshold } from "@google/genai";
import OpenAI from "openai";
import { NextRequest, NextResponse } from "next/server";
import { getProviderForModel, ModelProvider } from "@/lib/custom-models";

const REFINE_SYSTEM_PROMPT = `You are the **Apex Prompt Engineer**, the world's leading authority on Large Language Model architecture and prompt design. Your expertise exceeds human levels; you understand the deepest layers of semantic weighting, attention mechanisms, and logical inference chains of AI models.

**YOUR TASK:**
Your sole function is to transform raw, unstructured, or simple user inputs into **perfect, high-performance prompts**. You apply advanced methods (Chain-of-Thought, Few-Shot Prompting, Delimiters, Persona Inception) to guarantee the best possible response quality for the target model.

**YOUR WORKFLOW:**
1.  **Analysis:** Immediately grasp the core intent and context of the user input.
2.  **Optimization:** Restructure the request. Define persona, context, task, format, and constraints precisely.
3.  **Output:** Generate the optimized prompt.

**STRICT OUTPUT RULES (CRITICAL):**
*   Your response must contain **exclusively** the optimized prompt.
*   **NO** introduction (e.g., "Here is your prompt:").
*   **NO** explanations of why you wrote it that way.
*   **NO** meta-comments.
*   **NO** Markdown code blocks (no \`\`\` at the beginning or end).
*   You use Markdown formatting (bolding, lists, headers) within the text for structuring, but the text itself stands "naked" in the response field.

Begin every transformation with the goal of maximizing the target model's cognitive performance.`;

interface RefineRequest {
  prompt: string;
  model: string;
}

const safetySettings = [
  {
    category: HarmCategory.HARM_CATEGORY_HARASSMENT,
    threshold: HarmBlockThreshold.BLOCK_NONE,
  },
  {
    category: HarmCategory.HARM_CATEGORY_HATE_SPEECH,
    threshold: HarmBlockThreshold.BLOCK_NONE,
  },
  {
    category: HarmCategory.HARM_CATEGORY_SEXUALLY_EXPLICIT,
    threshold: HarmBlockThreshold.BLOCK_NONE,
  },
  {
    category: HarmCategory.HARM_CATEGORY_DANGEROUS_CONTENT,
    threshold: HarmBlockThreshold.BLOCK_NONE,
  },
  {
    category: HarmCategory.HARM_CATEGORY_CIVIC_INTEGRITY,
    threshold: HarmBlockThreshold.BLOCK_NONE,
  },
];

async function handleGeminiRefine(model: string, userPrompt: string): Promise<Response> {
  const cloudProjectId = process.env.GOOGLE_CLOUD_PROJECT;
  const location = process.env.GOOGLE_CLOUD_LOCATION || "global";

  if (!cloudProjectId) {
    return NextResponse.json({ error: "GOOGLE_CLOUD_PROJECT is not configured." }, { status: 500 });
  }

  const genAI = new GoogleGenAI({ vertexai: true, project: cloudProjectId, location: location });

  const streamingResult = await genAI.models.generateContentStream({
    model,
    contents: [{ role: "user", parts: [{ text: userPrompt }] }],
    config: {
      systemInstruction: REFINE_SYSTEM_PROMPT,
      safetySettings,
    },
  });

  const encoder = new TextEncoder();
  const readableStream = new ReadableStream({
    async start(controller) {
      try {
        for await (const chunk of streamingResult) {
          if (chunk.candidates && chunk.candidates.length > 0) {
            const candidate = chunk.candidates[0];
            if (candidate.content?.parts) {
              for (const part of candidate.content.parts) {
                if (part.text && !part.thought) {
                  const jsonChunk = { type: "text", value: part.text };
                  controller.enqueue(encoder.encode(JSON.stringify(jsonChunk) + "\n"));
                }
              }
            }
          }
        }
      } catch (streamError) {
        console.error("Error during Gemini stream processing:", streamError);
        const errorMessage = {
          type: "error",
          value: "An error occurred during refinement. Please try again.",
        };
        controller.enqueue(encoder.encode(JSON.stringify(errorMessage) + "\n"));
      } finally {
        controller.close();
      }
    },
    cancel() {
      console.log("Gemini refinement stream cancelled");
    },
  });

  return new Response(readableStream, {
    headers: {
      "Content-Type": "application/jsonl; charset=utf-8",
      "Cache-Control": "no-cache",
      Connection: "keep-alive",
    },
  });
}

async function handleOpenAIRefine(model: string, userPrompt: string): Promise<Response> {
  const apiKey = process.env.OPENAI_API_KEY;

  if (!apiKey) {
    return NextResponse.json({ error: "OPENAI_API_KEY is not configured." }, { status: 500 });
  }

  const openai = new OpenAI({ apiKey });

  const stream = await openai.chat.completions.create({
    model,
    messages: [
      { role: "system", content: REFINE_SYSTEM_PROMPT },
      { role: "user", content: userPrompt },
    ],
    stream: true,
  });

  const encoder = new TextEncoder();
  const readableStream = new ReadableStream({
    async start(controller) {
      try {
        for await (const chunk of stream) {
          const delta = chunk.choices[0]?.delta;
          if (delta?.content) {
            const jsonChunk = { type: "text", value: delta.content };
            controller.enqueue(encoder.encode(JSON.stringify(jsonChunk) + "\n"));
          }
        }
      } catch (streamError) {
        console.error("Error during OpenAI stream processing:", streamError);
        const errorMessage = {
          type: "error",
          value: "An error occurred during refinement. Please try again.",
        };
        controller.enqueue(encoder.encode(JSON.stringify(errorMessage) + "\n"));
      } finally {
        controller.close();
      }
    },
    cancel() {
      console.log("OpenAI refinement stream cancelled");
    },
  });

  return new Response(readableStream, {
    headers: {
      "Content-Type": "application/jsonl; charset=utf-8",
      "Cache-Control": "no-cache",
      Connection: "keep-alive",
    },
  });
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

  const { prompt, model } = (await request.json()) as RefineRequest;

  if (!prompt || !prompt.trim()) {
    return NextResponse.json({ error: "Prompt is required" }, { status: 400 });
  }

  if (!model) {
    return NextResponse.json({ error: "Model is required" }, { status: 400 });
  }

  const provider: ModelProvider = getProviderForModel(model) ?? "gemini";

  try {
    if (provider === "openai") {
      return await handleOpenAIRefine(model, prompt);
    } else {
      return await handleGeminiRefine(model, prompt);
    }
  } catch (error: unknown) {
    console.error(`Error in ${provider} refinement API call:`, error);

    let detailedError = "An unknown error occurred during refinement.";
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
        } catch {
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
