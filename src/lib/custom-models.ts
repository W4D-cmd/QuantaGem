export type ModelProvider = "gemini" | "openai" | "anthropic" | "custom-openai";

// Prefix used to identify custom provider models
export const CUSTOM_PROVIDER_PREFIX = "custom:";

export interface CustomModelEntry {
  displayName: string;
  modelId: string;
  inputTokenLimit: number;
  outputTokenLimit: number;
  provider: ModelProvider;
  supportsReasoning?: boolean;
  supportsVerbosity?: boolean;
}

/**
 * Interface for models fetched from a custom OpenAI-compatible endpoint.
 */
export interface FetchedCustomModel {
  id: string;
  displayName: string;
}

/**
 * Checks if a model ID belongs to a custom provider.
 * Custom models are prefixed with "custom:" to distinguish them from built-in models.
 */
export function isCustomModel(modelId: string): boolean {
  return modelId.startsWith(CUSTOM_PROVIDER_PREFIX);
}

/**
 * Extracts the original model ID from a custom model identifier.
 * E.g., "custom:llama-3.2-3b" -> "llama-3.2-3b"
 */
export function getOriginalModelId(customModelId: string): string {
  if (isCustomModel(customModelId)) {
    return customModelId.slice(CUSTOM_PROVIDER_PREFIX.length);
  }
  return customModelId;
}

/**
 * Creates a custom model identifier from an original model ID.
 * E.g., "llama-3.2-3b" -> "custom:llama-3.2-3b"
 */
export function createCustomModelId(originalModelId: string): string {
  return `${CUSTOM_PROVIDER_PREFIX}${originalModelId}`;
}

export function getProviderForModel(modelId: string): ModelProvider | undefined {
  // Check for custom provider first
  if (isCustomModel(modelId)) {
    return "custom-openai";
  }

  const model = customModels.find((m) => m.modelId === modelId);
  return model?.provider;
}

export function modelSupportsVerbosity(modelId: string): boolean {
  // Custom models don't support verbosity control
  if (isCustomModel(modelId)) {
    return false;
  }

  const model = customModels.find((m) => m.modelId === modelId);
  return model?.supportsVerbosity ?? false;
}

export function modelSupportsReasoning(modelId: string): boolean {
  // Custom models don't support extended reasoning
  if (isCustomModel(modelId)) {
    return false;
  }

  const model = customModels.find((m) => m.modelId === modelId);
  return model?.supportsReasoning ?? false;
}

/**
 * Gets token limits for a model. For custom models, uses sensible defaults.
 */
export function getModelTokenLimits(
  modelId: string,
): { inputTokenLimit: number; outputTokenLimit: number } {
  // Default limits for custom models (conservative estimates)
  const CUSTOM_MODEL_DEFAULTS = {
    inputTokenLimit: 128000,
    outputTokenLimit: 4096,
  };

  if (isCustomModel(modelId)) {
    return CUSTOM_MODEL_DEFAULTS;
  }

  const model = customModels.find((m) => m.modelId === modelId);
  if (model) {
    return {
      inputTokenLimit: model.inputTokenLimit,
      outputTokenLimit: model.outputTokenLimit,
    };
  }

  // Fallback for unknown models
  return CUSTOM_MODEL_DEFAULTS;
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
