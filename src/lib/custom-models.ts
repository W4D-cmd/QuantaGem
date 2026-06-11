export type ModelProvider = "gemini" | "openai" | "anthropic" | "custom-openai" | "custom-anthropic";

// Prefix used to identify custom provider models
export const CUSTOM_PROVIDER_PREFIX = "custom:";
export const CUSTOM_OPENAI_PREFIX = "custom-openai:";
export const CUSTOM_ANTHROPIC_PREFIX = "custom-anthropic:";

export interface CustomModelEntry {
  displayName: string;
  modelId: string;
  inputTokenLimit: number;
  outputTokenLimit: number;
  provider: ModelProvider;
  supportsReasoning?: boolean;
  supportsVerbosity?: boolean;
  pricePer1MInputTokens?: number;
  pricePer1MOutputTokens?: number;
  inputTokenThreshold?: number;
  secondaryPricePer1MInputTokens?: number;
}

/**
 * Interface for models fetched from a custom OpenAI-compatible endpoint.
 */
export interface FetchedCustomModel {
  id: string;
  displayName: string;
  apiType?: "openai" | "anthropic";
  inputTokenLimit?: number;
  outputTokenLimit?: number;
  supportsReasoning?: boolean;
  supportsVerbosity?: boolean;
}

/**
 * Interface for manually defined custom models stored in the database.
 */
export interface ManualCustomModel {
  id: number;
  modelId: string;
  displayName: string;
  apiType: "openai" | "anthropic";
  inputTokenLimit: number;
  outputTokenLimit: number;
  supportsReasoning: boolean;
  supportsVerbosity: boolean;
}

/**
 * Checks if a model ID belongs to a custom provider.
 * Custom models are prefixed with "custom-openai:" or "custom-anthropic:" to distinguish them from built-in models.
 * For backwards compatibility, also checks "custom:"
 */
export function isCustomModel(modelId: string): boolean {
  return modelId.startsWith(CUSTOM_PROVIDER_PREFIX) || 
         modelId.startsWith(CUSTOM_OPENAI_PREFIX) || 
         modelId.startsWith(CUSTOM_ANTHROPIC_PREFIX);
}

/**
 * Extracts the original model ID from a custom model identifier.
 * E.g., "custom-openai:llama-3.2-3b" -> "llama-3.2-3b"
 */
export function getOriginalModelId(customModelId: string): string {
  if (customModelId.startsWith(CUSTOM_OPENAI_PREFIX)) {
    return customModelId.slice(CUSTOM_OPENAI_PREFIX.length);
  }
  if (customModelId.startsWith(CUSTOM_ANTHROPIC_PREFIX)) {
    return customModelId.slice(CUSTOM_ANTHROPIC_PREFIX.length);
  }
  if (customModelId.startsWith(CUSTOM_PROVIDER_PREFIX)) {
    return customModelId.slice(CUSTOM_PROVIDER_PREFIX.length);
  }
  return customModelId;
}

/**
 * Creates a custom model identifier from an original model ID.
 * E.g., "llama-3.2-3b" -> "custom-openai:llama-3.2-3b"
 */
export function createCustomModelId(originalModelId: string, apiType: "openai" | "anthropic" = "openai"): string {
  if (apiType === "anthropic") {
    return `${CUSTOM_ANTHROPIC_PREFIX}${originalModelId}`;
  }
  return `${CUSTOM_OPENAI_PREFIX}${originalModelId}`;
}

export function getProviderForModel(modelId: string): ModelProvider | undefined {
  // Check for custom provider first
  if (modelId.startsWith(CUSTOM_ANTHROPIC_PREFIX)) {
    return "custom-anthropic";
  }
  if (modelId.startsWith(CUSTOM_OPENAI_PREFIX) || modelId.startsWith(CUSTOM_PROVIDER_PREFIX)) {
    return "custom-openai";
  }

  const model = customModels.find((m) => m.modelId === modelId);
  return model?.provider;
}

export function modelSupportsVerbosity(modelId: string, manualModels?: ManualCustomModel[]): boolean {
  if (isCustomModel(modelId) && manualModels && manualModels.length > 0) {
    const originalId = getOriginalModelId(modelId);
    const apiType = modelId.startsWith(CUSTOM_ANTHROPIC_PREFIX) ? "anthropic" : "openai";
    const manualModel = manualModels.find((m) => m.modelId === originalId && m.apiType === apiType);
    if (manualModel) {
      return manualModel.supportsVerbosity;
    }
  }
  if (isCustomModel(modelId)) {
    return false;
  }

  const model = customModels.find((m) => m.modelId === modelId);
  return model?.supportsVerbosity ?? false;
}

export function modelSupportsReasoning(modelId: string, manualModels?: ManualCustomModel[]): boolean {
  if (isCustomModel(modelId) && manualModels && manualModels.length > 0) {
    const originalId = getOriginalModelId(modelId);
    const apiType = modelId.startsWith(CUSTOM_ANTHROPIC_PREFIX) ? "anthropic" : "openai";
    const manualModel = manualModels.find((m) => m.modelId === originalId && m.apiType === apiType);
    if (manualModel) {
      return manualModel.supportsReasoning;
    }
  }
  if (isCustomModel(modelId)) {
    return false;
  }

  const model = customModels.find((m) => m.modelId === modelId);
  return model?.supportsReasoning ?? false;
}

/**
 * Gets token limits for a model. For custom models, uses manual model data if available, otherwise sensible defaults.
 */
export function getModelTokenLimits(
  modelId: string,
  manualModels?: ManualCustomModel[],
): { inputTokenLimit: number; outputTokenLimit: number } {
  // Default limits for custom models (conservative estimates)
  const CUSTOM_MODEL_DEFAULTS = {
    inputTokenLimit: 128000,
    outputTokenLimit: 4096,
  };

  if (isCustomModel(modelId)) {
    if (manualModels && manualModels.length > 0) {
      const originalId = getOriginalModelId(modelId);
      const apiType = modelId.startsWith(CUSTOM_ANTHROPIC_PREFIX) ? "anthropic" : "openai";
      const manualModel = manualModels.find((m) => m.modelId === originalId && m.apiType === apiType);
      if (manualModel) {
        return {
          inputTokenLimit: manualModel.inputTokenLimit,
          outputTokenLimit: manualModel.outputTokenLimit,
        };
      }
    }
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

/**
 * Merges auto-fetched custom models with manually defined ones.
 * Manual models take precedence: if a manual model has the same (id, apiType) as a fetched model,
 * the manual model's attributes override the fetched model's display name, token limits, and capabilities.
 */
export function mergeCustomModels(
  fetched: FetchedCustomModel[],
  manual: ManualCustomModel[],
): FetchedCustomModel[] {
  const result: FetchedCustomModel[] = [];
  const manualMap = new Map<string, ManualCustomModel>();
  for (const m of manual) {
    manualMap.set(`${m.apiType}:${m.modelId}`, m);
  }

  const seenManual = new Set<string>();

  // Process fetched models, overriding with manual data where available
  for (const fm of fetched) {
    const apiType = fm.apiType || "openai";
    const key = `${apiType}:${fm.id}`;
    const manualEntry = manualMap.get(key);

    if (manualEntry) {
      seenManual.add(key);
      result.push({
        id: fm.id,
        displayName: manualEntry.displayName,
        apiType: manualEntry.apiType as "openai" | "anthropic",
        inputTokenLimit: manualEntry.inputTokenLimit,
        outputTokenLimit: manualEntry.outputTokenLimit,
        supportsReasoning: manualEntry.supportsReasoning,
        supportsVerbosity: manualEntry.supportsVerbosity,
      });
    } else {
      result.push(fm);
    }
  }

  // Add manual models that don't exist in fetched models
  for (const m of manual) {
    const key = `${m.apiType}:${m.modelId}`;
    if (!seenManual.has(key)) {
      result.push({
        id: m.modelId,
        displayName: m.displayName,
        apiType: m.apiType,
        inputTokenLimit: m.inputTokenLimit,
        outputTokenLimit: m.outputTokenLimit,
        supportsReasoning: m.supportsReasoning,
        supportsVerbosity: m.supportsVerbosity,
      });
    }
  }

  return result;
}

/**
 * Gets pricing for a model. For custom models, returns null.
 */
export function getModelPricing(modelId: string): {
  pricePer1MInputTokens?: number;
  pricePer1MOutputTokens?: number;
  inputTokenThreshold?: number;
  secondaryPricePer1MInputTokens?: number;
} | null {
  if (isCustomModel(modelId)) {
    return null;
  }

  const model = customModels.find((m) => m.modelId === modelId);
  if (model) {
    return {
      pricePer1MInputTokens: model.pricePer1MInputTokens,
      pricePer1MOutputTokens: model.pricePer1MOutputTokens,
      inputTokenThreshold: model.inputTokenThreshold,
      secondaryPricePer1MInputTokens: model.secondaryPricePer1MInputTokens,
    };
  }

  return null;
}

/**
 * Static models for specific custom providers that don't implement the /models endpoint.
 */
export const STATIC_CUSTOM_PROVIDERS: Record<string, FetchedCustomModel[]> = {
  "minimax.io": [
    { id: "MiniMax-M3", displayName: "MiniMax-M3", apiType: "anthropic" },
    { id: "MiniMax-M2.7", displayName: "MiniMax-M2.7", apiType: "anthropic" },
    { id: "MiniMax-M2.5", displayName: "MiniMax-M2.5", apiType: "anthropic" },
  ],
};

/**
 * Returns hardcoded models for a given endpoint if it's a known static provider.
 */
export function getStaticModelsForEndpoint(endpoint: string): FetchedCustomModel[] | null {
  try {
    const url = new URL(endpoint);
    const host = url.hostname;
    
    // Check for exact match or subdomain match
    for (const [providerHost, models] of Object.entries(STATIC_CUSTOM_PROVIDERS)) {
      if (host === providerHost || host.endsWith(`.${providerHost}`)) {
        return models;
      }
    }
  } catch (e) {
    // Invalid URL, ignore
  }
  return null;
}

export const customModels: CustomModelEntry[] = [
  {
    displayName: "Gemini 3.5 Flash",
    modelId: "gemini-3.5-flash",
    inputTokenLimit: 1048576,
    outputTokenLimit: 65536,
    provider: "gemini",
    supportsReasoning: true,
    pricePer1MInputTokens: 1.50,
    pricePer1MOutputTokens: 9.00,
  },
  {
    displayName: "Gemini 3.1 Pro Preview",
    modelId: "gemini-3.1-pro-preview",
    inputTokenLimit: 1048576,
    outputTokenLimit: 65536,
    provider: "gemini",
    supportsReasoning: true,
    pricePer1MInputTokens: 2.00,
    pricePer1MOutputTokens: 12.00,
    inputTokenThreshold: 200000,
    secondaryPricePer1MInputTokens: 4.00,
  },
  {
    displayName: "Gemini 3.1 Flash-Lite",
    modelId: "gemini-3.1-flash-lite",
    inputTokenLimit: 1048576,
    outputTokenLimit: 65536,
    provider: "gemini",
    supportsReasoning: true,
    pricePer1MInputTokens: 0.25,
    pricePer1MOutputTokens: 1.50,
  },
  {
    displayName: "Gemini 3 Flash Preview",
    modelId: "gemini-3-flash-preview",
    inputTokenLimit: 1048576,
    outputTokenLimit: 65536,
    provider: "gemini",
    supportsReasoning: true,
    pricePer1MInputTokens: 0.50,
    pricePer1MOutputTokens: 3.00,
  },
  {
    displayName: "Gemini 2.5 Pro",
    modelId: "gemini-2.5-pro",
    inputTokenLimit: 1048576,
    outputTokenLimit: 65536,
    provider: "gemini",
    supportsReasoning: true,
    pricePer1MInputTokens: 1.25,
    pricePer1MOutputTokens: 10.00,
    inputTokenThreshold: 200000,
    secondaryPricePer1MInputTokens: 2.50,
  },
  {
    displayName: "GPT-5.4",
    modelId: "gpt-5.4-2026-03-05",
    inputTokenLimit: 400000,
    outputTokenLimit: 128000,
    provider: "openai",
    supportsReasoning: true,
    supportsVerbosity: true,
    pricePer1MInputTokens: 2.50,
    pricePer1MOutputTokens: 15.00,
  },
  {
    displayName: "Claude Opus 4.8",
    modelId: "claude-opus-4-8",
    inputTokenLimit: 1000000,
    outputTokenLimit: 128000,
    provider: "anthropic",
    supportsReasoning: true,
    pricePer1MInputTokens: 5.00,
    pricePer1MOutputTokens: 25.00,
  },
];
