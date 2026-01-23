import { GoogleGenAI, HarmCategory, HarmBlockThreshold } from "@google/genai";
import OpenAI from "openai";
import { NextRequest, NextResponse } from "next/server";
import { getProviderForModel, ModelProvider } from "@/lib/custom-models";

const GENERATE_SYSTEM_PROMPT_INSTRUCTION = `You are an expert at creating system prompts for Large Language Models. Your sole mission is to generate the perfect, ready-to-use system prompt from the description provided by the user.

**Your Task:**

Based on the user's description of what they want an AI assistant to do or be, create a comprehensive and effective system prompt that will instruct a Large Language Model to behave exactly as described.

**Guidelines for Creating the System Prompt:**

1. **Define the Role Clearly:** Start with a clear statement of who or what the AI should act as.

2. **Establish Expertise and Knowledge:** Specify the areas of expertise, knowledge domains, and capabilities the AI should have.

3. **Set the Communication Style:** Define how the AI should communicate:
   - Tone (formal, casual, friendly, authoritative, etc.)
   - Verbosity (concise, detailed, balanced)
   - Format preferences (bullet points, paragraphs, structured, etc.)

4. **Include Behavioral Guidelines:** Specify:
   - What the AI should always do
   - What the AI should never do
   - How to handle edge cases or unclear requests

5. **Add Constraints if Needed:** Include any limitations or boundaries for the AI's responses.

**Your Output:**

- Output ONLY the system prompt itself, nothing else.
- Do NOT include any explanations, introductions, or meta-commentary.
- Do NOT wrap the output in markdown code blocks or quotes.
- The output should be ready to be directly used as a system prompt.`;

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
