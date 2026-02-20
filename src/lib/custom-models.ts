export type ModelProvider = "gemini" | "openai" | "anthropic";

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
    displayName: "Gemini 3.1 Pro Preview",
    modelId: "gemini-3.1-pro-preview",
    inputTokenLimit: 1048576,
    outputTokenLimit: 65536,
    provider: "gemini",
	supportsReasoning: true,
  },
  {
    displayName: "Gemini 3 Pro Preview",
    modelId: "gemini-3-pro-preview",
    inputTokenLimit: 1048576,
    outputTokenLimit: 65536,
    provider: "gemini",
	supportsReasoning: true,
  },
  {
    displayName: "Gemini 3 Flash Preview",
    modelId: "gemini-3-flash-preview",
    inputTokenLimit: 1048576,
    outputTokenLimit: 65536,
    provider: "gemini",
	supportsReasoning: true,
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
    displayName: "GPT-5.2",
    modelId: "gpt-5.2-2025-12-11",
    inputTokenLimit: 400000,
    outputTokenLimit: 128000,
    provider: "openai",
    supportsReasoning: true,
    supportsVerbosity: true,
  },
  {
    displayName: "GPT-5.1",
    modelId: "gpt-5.1-2025-11-13",
    inputTokenLimit: 400000,
    outputTokenLimit: 128000,
    provider: "openai",
    supportsReasoning: true,
    supportsVerbosity: true,
  },
  {
    displayName: "Claude Opus 4.6",
    modelId: "claude-opus-4-6",
    inputTokenLimit: 200000,
    outputTokenLimit: 128000,
    provider: "anthropic",
    supportsReasoning: true,
  },
];
