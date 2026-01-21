export type ThinkingOption = "dynamic" | "off" | "low" | "medium" | "high";

export type OpenAIReasoningEffort = "none" | "low" | "medium" | "high" | "xhigh";

export type VerbosityOption = "low" | "medium" | "high";

interface ThinkingModelConfig {
  min: number;
  max: number;
  canBeOff: boolean;
  medium: number;
}

interface OpenAIReasoningModelConfig {
  supportedEfforts: OpenAIReasoningEffort[];
  defaultEffort: OpenAIReasoningEffort;
  supportsVerbosity: boolean;
}

const modelConfigs: Record<string, ThinkingModelConfig> = {
  "2.5-pro": { min: 2048, max: 32768, canBeOff: false, medium: 8192 },
  "2.5-flash": { min: 2048, max: 24576, canBeOff: true, medium: 8192 },
};

const openAIReasoningModelConfigs: Record<string, OpenAIReasoningModelConfig> = {
  "gpt-5.2": {
    supportedEfforts: ["none", "low", "medium", "high", "xhigh"],
    defaultEffort: "medium",
    supportsVerbosity: true,
  },
  "gpt-5.1": {
    supportedEfforts: ["none", "low", "medium", "high"],
    defaultEffort: "medium",
    supportsVerbosity: true,
  },
};

export function isOpenAIReasoningModel(modelName: string | null | undefined): boolean {
  if (!modelName) return false;
  return modelName in openAIReasoningModelConfigs;
}

const GPT5_FAMILY_MODELS = ["gpt-5", "gpt-5-mini", "gpt-5.1", "gpt-5.2", "gpt-5.2-mini"];

export function isGPT5FamilyModel(modelName: string | null | undefined): boolean {
  if (!modelName) return false;
  return GPT5_FAMILY_MODELS.includes(modelName);
}

export function getOpenAIReasoningConfig(modelName: string | null | undefined): OpenAIReasoningModelConfig | null {
  if (!modelName) return null;
  return openAIReasoningModelConfigs[modelName] ?? null;
}

export function supportsVerbosity(modelName: string | null | undefined): boolean {
  if (!modelName) return false;
  const config = openAIReasoningModelConfigs[modelName];
  return config?.supportsVerbosity ?? false;
}

export function getSupportedReasoningEfforts(modelName: string | null | undefined): OpenAIReasoningEffort[] {
  if (!modelName) return [];
  const config = openAIReasoningModelConfigs[modelName];
  return config?.supportedEfforts ?? [];
}

export function getDefaultReasoningEffort(modelName: string | null | undefined): OpenAIReasoningEffort {
  if (!modelName) return "medium";
  const config = openAIReasoningModelConfigs[modelName];
  return config?.defaultEffort ?? "medium";
}

export function getThinkingConfigForModel(modelName: string | null | undefined): ThinkingModelConfig | null {
  if (!modelName) return null;
  if (modelName.includes("2.5-pro")) return modelConfigs["2.5-pro"];
  if (modelName.includes("2.5-flash")) return modelConfigs["2.5-flash"];
  if (isOpenAIReasoningModel(modelName)) {
    return { min: 0, max: 0, canBeOff: false, medium: 0 };
  }
  return null;
}

export function getThinkingBudgetMap(modelName: string | null | undefined): Record<ThinkingOption, number> | null {
  if (!modelName) return null;

  if (isOpenAIReasoningModel(modelName)) {
    const config = getOpenAIReasoningConfig(modelName);
    const efforts = config?.supportedEfforts ?? [];
    return {
      dynamic: -1,
      off: efforts.includes("none") ? 0 : -1,
      low: efforts.includes("low") ? 1 : -1,
      medium: efforts.includes("medium") ? 2 : -1,
      high: efforts.includes("high") ? 3 : -1,
    };
  }

  const config = getThinkingConfigForModel(modelName);
  if (!config) return null;

  return {
    dynamic: -1,
    off: config.canBeOff ? 0 : -1,
    low: config.min,
    medium: config.medium,
    high: config.max,
  };
}

export function getThinkingValueMap(modelName: string | null | undefined): { [key: number]: ThinkingOption } | null {
  if (!modelName) return null;

  if (isOpenAIReasoningModel(modelName)) {
    const config = getOpenAIReasoningConfig(modelName);
    const efforts = config?.supportedEfforts ?? [];
    const valueMap: { [key: number]: ThinkingOption } = {
      [-1]: "dynamic",
    };
    if (efforts.includes("none")) valueMap[0] = "off";
    if (efforts.includes("low")) valueMap[1] = "low";
    if (efforts.includes("medium")) valueMap[2] = "medium";
    if (efforts.includes("high")) valueMap[3] = "high";
    return valueMap;
  }

  const config = getThinkingConfigForModel(modelName);
  if (!config) return null;

  const valueMap: { [key: number]: ThinkingOption } = {
    [-1]: "dynamic",
    [config.min]: "low",
    [config.medium]: "medium",
    [config.max]: "high",
  };
  if (config.canBeOff) {
    valueMap[0] = "off";
  }

  return valueMap;
}

export function mapBudgetToOpenAIReasoningEffort(
  modelName: string | null | undefined,
  budget: number | undefined
): OpenAIReasoningEffort {
  const config = getOpenAIReasoningConfig(modelName);
  if (!config) return "medium";

  if (budget === undefined || budget === -1) {
    return config.defaultEffort;
  }

  const efforts = config.supportedEfforts;
  if (budget === 0 && efforts.includes("none")) return "none";
  if (budget === 1 && efforts.includes("low")) return "low";
  if (budget === 2 && efforts.includes("medium")) return "medium";
  if (budget === 3 && efforts.includes("high")) return "high";
  if (budget === 4 && efforts.includes("xhigh")) return "xhigh";

  return config.defaultEffort;
}
