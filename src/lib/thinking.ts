export type ThinkingOption = "dynamic" | "off" | "low" | "medium" | "high" | "xhigh";

export type OpenAIReasoningEffort = "none" | "low" | "medium" | "high" | "xhigh";

export type AnthropicEffort = "low" | "medium" | "high";

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
    defaultEffort: "none",
    supportsVerbosity: true,
  },
  "gpt-5.1": {
    supportedEfforts: ["none", "low", "medium", "high"],
    defaultEffort: "none",
    supportsVerbosity: true,
  },
};

interface AnthropicReasoningModelConfig {
  supportedEfforts: AnthropicEffort[];
  defaultEffort: AnthropicEffort;
}

const anthropicReasoningModelConfigs: Record<string, AnthropicReasoningModelConfig> = {
  "claude-opus-4-6": {
    supportedEfforts: ["low", "medium", "high"],
    defaultEffort: "high",
  },
};

function getAnthropicModelBase(modelName: string): string | null {
  if (modelName.startsWith("claude-opus-4-6")) return "claude-opus-4-6";
  return null;
}

export function isAnthropicReasoningModel(modelName: string | null | undefined): boolean {
  if (!modelName) return false;
  const baseModel = getAnthropicModelBase(modelName);
  return baseModel !== null && baseModel in anthropicReasoningModelConfigs;
}

export function getAnthropicReasoningConfig(modelName: string | null | undefined): AnthropicReasoningModelConfig | null {
  if (!modelName) return null;
  const baseModel = getAnthropicModelBase(modelName);
  if (!baseModel) return null;
  return anthropicReasoningModelConfigs[baseModel] ?? null;
}

export function mapBudgetToAnthropicEffort(
  modelName: string | null | undefined,
  budget: number | undefined,
): AnthropicEffort {
  const config = getAnthropicReasoningConfig(modelName);
  if (!config) return "high";

  if (budget === undefined || budget === -1) {
    return config.defaultEffort;
  }

  // Map budget values: 0/1=low, 2=medium, 3/4=high
  if (budget <= 1) return "low";
  if (budget === 2) return "medium";
  return "high";
}

function getOpenAIModelBase(modelName: string): string | null {
  if (modelName.startsWith("gpt-5.2")) return "gpt-5.2";
  if (modelName.startsWith("gpt-5.1")) return "gpt-5.1";
  return null;
}

export function isOpenAIReasoningModel(modelName: string | null | undefined): boolean {
  if (!modelName) return false;
  const baseModel = getOpenAIModelBase(modelName);
  return baseModel !== null && baseModel in openAIReasoningModelConfigs;
}

const GPT5_FAMILY_PREFIXES = ["gpt-5-", "gpt-5.1", "gpt-5.2"];

export function isGPT5FamilyModel(modelName: string | null | undefined): boolean {
  if (!modelName) return false;
  return GPT5_FAMILY_PREFIXES.some(prefix => modelName.startsWith(prefix));
}

export function getOpenAIReasoningConfig(modelName: string | null | undefined): OpenAIReasoningModelConfig | null {
  if (!modelName) return null;
  const baseModel = getOpenAIModelBase(modelName);
  if (!baseModel) return null;
  return openAIReasoningModelConfigs[baseModel] ?? null;
}

export function supportsVerbosity(modelName: string | null | undefined): boolean {
  if (!modelName) return false;
  const baseModel = getOpenAIModelBase(modelName);
  if (!baseModel) return false;
  const config = openAIReasoningModelConfigs[baseModel];
  return config?.supportsVerbosity ?? false;
}

export function getSupportedReasoningEfforts(modelName: string | null | undefined): OpenAIReasoningEffort[] {
  if (!modelName) return [];
  const baseModel = getOpenAIModelBase(modelName);
  if (!baseModel) return [];
  const config = openAIReasoningModelConfigs[baseModel];
  return config?.supportedEfforts ?? [];
}

export function getDefaultReasoningEffort(modelName: string | null | undefined): OpenAIReasoningEffort {
  if (!modelName) return "none";
  const baseModel = getOpenAIModelBase(modelName);
  if (!baseModel) return "none";
  const config = openAIReasoningModelConfigs[baseModel];
  return config?.defaultEffort ?? "none";
}

export function getThinkingConfigForModel(modelName: string | null | undefined): ThinkingModelConfig | null {
  if (!modelName) return null;
  if (modelName.includes("2.5-pro")) return modelConfigs["2.5-pro"];
  if (modelName.includes("2.5-flash")) return modelConfigs["2.5-flash"];
  if (isOpenAIReasoningModel(modelName)) {
    const config = getOpenAIReasoningConfig(modelName);
    const canBeOff = config?.supportedEfforts.includes("none") ?? false;
    return { min: 0, max: 0, canBeOff, medium: 0 };
  }
  if (isAnthropicReasoningModel(modelName)) {
    return { min: 0, max: 0, canBeOff: false, medium: 0 };
  }
  return null;
}

export function getThinkingBudgetMap(modelName: string | null | undefined): Record<ThinkingOption, number> | null {
  if (!modelName) return null;

  if (isAnthropicReasoningModel(modelName)) {
    return {
      dynamic: -1,
      off: -1,
      low: 1,
      medium: 2,
      high: 3,
      xhigh: -1,
    };
  }

  if (isOpenAIReasoningModel(modelName)) {
    const config = getOpenAIReasoningConfig(modelName);
    const efforts = config?.supportedEfforts ?? [];
    return {
      dynamic: -1,
      off: efforts.includes("none") ? 0 : -1,
      low: efforts.includes("low") ? 1 : -1,
      medium: efforts.includes("medium") ? 2 : -1,
      high: efforts.includes("high") ? 3 : -1,
      xhigh: efforts.includes("xhigh") ? 4 : -1,
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
    xhigh: -1,
  };
}

export function getThinkingValueMap(modelName: string | null | undefined): { [key: number]: ThinkingOption } | null {
  if (!modelName) return null;

  if (isAnthropicReasoningModel(modelName)) {
    return {
      [-1]: "dynamic",
      1: "low",
      2: "medium",
      3: "high",
    };
  }

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
    if (efforts.includes("xhigh")) valueMap[4] = "xhigh";
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
  if (!config) return "none";

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
