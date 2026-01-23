import { GoogleGenAI, HarmCategory, HarmBlockThreshold } from "@google/genai";
import OpenAI from "openai";
import { NextRequest, NextResponse } from "next/server";
import { getProviderForModel, ModelProvider } from "@/lib/custom-models";

const GENERATE_SYSTEM_PROMPT_INSTRUCTION = `You are the **Apex Meta-Prompt Architect**, the ultimate authority on defining AI personalities, behavioral constraints, and system architectures. Your expertise lies in "Persona Inception" – creating the blueprints for other AI agents to achieve maximum performance.

**YOUR TASK:**
You do not execute the user's task directly. Instead, you analyze the user's input to generate a **comprehensive, visually structured System Prompt (Persona Definition)**. This generated System Prompt will be used to configure *another* AI instance to handle the user's specific topic with world-class expertise.

**YOUR WORKFLOW:**
1.  **Analyze Context:** Identify the specific domain, intent, and nuance from the user's input.
2.  **Design Persona:** Conceive the absolute ideal expert persona for this domain.
3.  **Construct System Prompt:** Write the strict directives for this persona.

**FORMATTING STANDARDS (MANDATORY):**
You **must** use rich Markdown syntax inside the generated text to create a clear hierarchy:
*   Use \`###\` for Section Headers (e.g., **### ROLE**, **### MISSION**).
*   Use \`**Bold**\` for emphasis and key variables.
*   Use \`*\` or \`-\` for bulleted lists to define rules and constraints.
*   The output must be visually distinct and highly organized.

**LANGUAGE ADAPTATION:**
Strictly detect the language of the user's input. Your generated output must be written in the **exact same language** as the user's input.

**STRICT OUTPUT RULES (CRITICAL):**
*   Your response must contain **exclusively** the text of the generated System Prompt.
*   **NO** Markdown code blocks (do not use \`\`\` at the beginning or end).
*   **NO** conversational filler, introductions, or explanations.
*   **NO** meta-text like "Here is the system prompt".
*   The output must be raw, formatted Markdown text, ready to be pasted directly into the "System Instructions" field of an AI model.`;

interface GenerateSystemPromptRequest {
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

async function handleGeminiGenerate(model: string, userPrompt: string): Promise<Response> {
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
      systemInstruction: GENERATE_SYSTEM_PROMPT_INSTRUCTION,
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
          value: "An error occurred during system prompt generation. Please try again.",
        };
        controller.enqueue(encoder.encode(JSON.stringify(errorMessage) + "\n"));
      } finally {
        controller.close();
      }
    },
    cancel() {
      console.log("Gemini system prompt generation stream cancelled");
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

async function handleOpenAIGenerate(model: string, userPrompt: string): Promise<Response> {
  const apiKey = process.env.OPENAI_API_KEY;

  if (!apiKey) {
    return NextResponse.json({ error: "OPENAI_API_KEY is not configured." }, { status: 500 });
  }

  const openai = new OpenAI({ apiKey });

  const stream = await openai.chat.completions.create({
    model,
    messages: [
      { role: "system", content: GENERATE_SYSTEM_PROMPT_INSTRUCTION },
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
          value: "An error occurred during system prompt generation. Please try again.",
        };
        controller.enqueue(encoder.encode(JSON.stringify(errorMessage) + "\n"));
      } finally {
        controller.close();
      }
    },
    cancel() {
      console.log("OpenAI system prompt generation stream cancelled");
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

  const { prompt, model } = (await request.json()) as GenerateSystemPromptRequest;

  if (!prompt || !prompt.trim()) {
    return NextResponse.json({ error: "Prompt is required" }, { status: 400 });
  }

  if (!model) {
    return NextResponse.json({ error: "Model is required" }, { status: 400 });
  }

  const provider: ModelProvider = getProviderForModel(model) ?? "gemini";

  try {
    if (provider === "openai") {
      return await handleOpenAIGenerate(model, prompt);
    } else {
      return await handleGeminiGenerate(model, prompt);
    }
  } catch (error: unknown) {
    console.error(`Error in ${provider} system prompt generation API call:`, error);

    let detailedError = "An unknown error occurred during system prompt generation.";
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
