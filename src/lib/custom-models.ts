export type ModelProvider = "gemini" | "openai";

export interface CustomModelEntry {
  displayName: string;
  modelId: string;
  inputTokenLimit: number;
  outputTokenLimit: number;
  provider: ModelProvider;
  supportsReasoning?: boolean;
  supportsVerbosity?: boolean;
}

export function getProviderForModel(modelId: string): ModelProvider | undefined {
  const model = customModels.find((m) => m.modelId === modelId);
  return model?.provider;
}

export function modelSupportsVerbosity(modelId: string): boolean {
  const model = customModels.find((m) => m.modelId === modelId);
  return model?.supportsVerbosity ?? false;
}

export function modelSupportsReasoning(modelId: string): boolean {
  const model = customModels.find((m) => m.modelId === modelId);
  return model?.supportsReasoning ?? false;
}

export const customModels: CustomModelEntry[] = [
  {
    displayName: "Gemini 3 Pro Preview",
    modelId: "gemini-3-pro-preview",
    inputTokenLimit: 1048576,
    outputTokenLimit: 65536,
    provider: "gemini",
  },
  {
    displayName: "Gemini 3 Flash Preview",
    modelId: "gemini-3-flash-preview",
    inputTokenLimit: 1048576,
    outputTokenLimit: 65536,
    provider: "gemini",
  },
  {
    displayName: "Gemini 2.5 Pro",
    modelId: "gemini-2.5-pro",
    inputTokenLimit: 1048576,
    outputTokenLimit: 65536,
    provider: "gemini",
    supportsReasoning: true,
  },
  {
    displayName: "Gemini 2.5 Flash",
    modelId: "gemini-2.5-flash",
    inputTokenLimit: 1048576,
    outputTokenLimit: 65536,
    provider: "gemini",
    supportsReasoning: true,
  },
  {
    displayName: "Gemini 2.5 Flash Preview",
    modelId: "gemini-2.5-flash-preview-09-2025",
    inputTokenLimit: 1048576,
    outputTokenLimit: 65536,
    provider: "gemini",
    supportsReasoning: true,
  },
  {
    displayName: "Gemini 2.5 Flash-Lite",
    modelId: "gemini-2.5-flash-lite",
    inputTokenLimit: 1048576,
    outputTokenLimit: 65536,
    provider: "gemini",
    supportsReasoning: true,
  },
  {
    displayName: "Gemini 2.5 Flash-Lite Preview",
    modelId: "gemini-2.5-flash-lite-preview-09-2025",
    inputTokenLimit: 1048576,
    outputTokenLimit: 65536,
    provider: "gemini",
    supportsReasoning: true,
  },
  {
    displayName: "Gemini 2.0 Flash",
    modelId: "gemini-2.0-flash-001",
    inputTokenLimit: 32768,
    outputTokenLimit: 4096,
    provider: "gemini",
  },
  {
    displayName: "Gemini 2.0 Flash-Lite",
    modelId: "gemini-2.0-flash-lite-001",
    inputTokenLimit: 32768,
    outputTokenLimit: 4096,
    provider: "gemini",
  },
  {
    displayName: "GPT-4o",
    modelId: "gpt-4o",
    inputTokenLimit: 128000,
    outputTokenLimit: 16384,
    provider: "openai",
  },
  {
    displayName: "GPT-4o Mini",
    modelId: "gpt-4o-mini",
    inputTokenLimit: 128000,
    outputTokenLimit: 16384,
    provider: "openai",
  },
  {
    displayName: "GPT-4.1",
    modelId: "gpt-4.1",
    inputTokenLimit: 1047576,
    outputTokenLimit: 32768,
    provider: "openai",
  },
  {
    displayName: "GPT-4.1 Mini",
    modelId: "gpt-4.1-mini",
    inputTokenLimit: 1047576,
    outputTokenLimit: 32768,
    provider: "openai",
  },
  {
    displayName: "GPT-4.1 Nano",
    modelId: "gpt-4.1-nano",
    inputTokenLimit: 1047576,
    outputTokenLimit: 32768,
    provider: "openai",
  },
  {
    displayName: "GPT-5",
    modelId: "gpt-5",
    inputTokenLimit: 1047576,
    outputTokenLimit: 32768,
    provider: "openai",
    supportsReasoning: true,
    supportsVerbosity: true,
  },
  {
    displayName: "GPT-5 Mini",
    modelId: "gpt-5-mini",
    inputTokenLimit: 1047576,
    outputTokenLimit: 32768,
    provider: "openai",
    supportsReasoning: true,
    supportsVerbosity: true,
  },
  {
    displayName: "GPT-5.1",
    modelId: "gpt-5.1",
    inputTokenLimit: 1047576,
    outputTokenLimit: 32768,
    provider: "openai",
    supportsReasoning: true,
    supportsVerbosity: true,
  },
  {
    displayName: "GPT-5.2",
    modelId: "gpt-5.2",
    inputTokenLimit: 1047576,
    outputTokenLimit: 32768,
    provider: "openai",
    supportsReasoning: true,
    supportsVerbosity: true,
  },
  {
    displayName: "GPT-5.2 Mini",
    modelId: "gpt-5.2-mini",
    inputTokenLimit: 1047576,
    outputTokenLimit: 32768,
    provider: "openai",
    supportsReasoning: true,
    supportsVerbosity: true,
  },
  {
    displayName: "o3",
    modelId: "o3",
    inputTokenLimit: 200000,
    outputTokenLimit: 100000,
    provider: "openai",
    supportsReasoning: true,
  },
  {
    displayName: "o4-mini",
    modelId: "o4-mini",
    inputTokenLimit: 200000,
    outputTokenLimit: 100000,
    provider: "openai",
    supportsReasoning: true,
  },
];
