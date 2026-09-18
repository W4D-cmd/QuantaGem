import { isCustomModel, ManualCustomModel, CUSTOM_OPENAI_PREFIX, CUSTOM_ANTHROPIC_PREFIX, getOriginalModelId } from "./custom-models";

export type ThinkingOption = "dynamic" | "off" | "minimal" | "low" | "medium" | "high" | "xhigh";

export type OpenAIReasoningEffort = "none" | "low" | "medium" | "high" | "xhigh";

export type AnthropicEffort = "low" | "medium" | "high" | "xhigh";

export type VerbosityOption = "low" | "medium" | "high";

interface ThinkingModelConfig {
  min: number;
  max: number;
  canBeOff: boolean;
  medium: number;
  minimal?: number;
  useThinkingLevel?: boolean;
  supportedLevels?: ThinkingOption[];
  defaultLevel?: ThinkingOption;
}

const modelConfigs: Record<string, ThinkingModelConfig> = {
  "2.5-pro": { min: 2048, max: 32768, canBeOff: false, medium: 8192 },
  "2.5-flash": { min: 2048, max: 24576, canBeOff: true, medium: 8192 },
  "3.7-flash": {
    min: 0, max: 0, canBeOff: false, medium: 0,
    useThinkingLevel: true,
    supportedLevels: ["low", "medium", "high"],
    defaultLevel: "medium",
  },
  "3.8-flash": {
    min: 0, max: 0, canBeOff: false, medium: 0,
    useThinkingLevel: true,
    supportedLevels: ["low", "medium", "high"],
    defaultLevel: "high",
  },
  "3.1-pro": {
    min: 0, max: 0, canBeOff: false, medium: 0,
    useThinkingLevel: true,
    supportedLevels: ["low", "medium", "high"],
    defaultLevel: "high",
  },
  "3.5-flash-lite": {
    min: 0, max: 0, canBeOff: false, medium: 0,
    useThinkingLevel: true,
    supportedLevels: ["minimal", "low", "medium", "high"],
    defaultLevel: "minimal",
  },
  "3-flash": {
    min: 0, max: 0, canBeOff: false, medium: 0,
    useThinkingLevel: true,
    supportedLevels: ["minimal", "low", "medium", "high"],
    defaultLevel: "high",
  },
};

export function isAnthropicReasoningModel(modelName: string | null | undefined, manualModels?: ManualCustomModel[]): boolean {
  if (!modelName) return false;
  if (modelName.startsWith(CUSTOM_ANTHROPIC_PREFIX) && manualModels) {
    const originalId = getOriginalModelId(modelName);
    const manualModel = manualModels.find((m) => m.modelId === originalId && m.apiType === "anthropic");
    return manualModel?.supportsReasoning ?? false;
  }
  return false;
}

export function mapBudgetToAnthropicEffort(
  modelName: string | null | undefined,
  budget: number | undefined,
  manualModels?: ManualCustomModel[],
): AnthropicEffort {
  if (modelName && isCustomModel(modelName) && modelName.startsWith(CUSTOM_ANTHROPIC_PREFIX) && manualModels) {
    const isReasoning = isAnthropicReasoningModel(modelName, manualModels);
    if (!isReasoning) return "high";
    if (budget === undefined || budget === -1) return "high";
    if (budget <= 1) return "low";
    if (budget === 2) return "medium";
    if (budget === 3) return "high";
    return "xhigh";
  }
  return "high";
}

export function isOpenAIReasoningModel(modelName: string | null | undefined, manualModels?: ManualCustomModel[]): boolean {
  if (!modelName) return false;
  if (modelName.startsWith(CUSTOM_OPENAI_PREFIX) && manualModels) {
    const originalId = getOriginalModelId(modelName);
    const manualModel = manualModels.find((m) => m.modelId === originalId && m.apiType === "openai");
    return manualModel?.supportsReasoning ?? false;
  }
  return false;
}

export function getThinkingConfigForModel(modelName: string | null | undefined, manualModels?: ManualCustomModel[]): ThinkingModelConfig | null {
  if (!modelName) return null;
  if (isCustomModel(modelName) && manualModels) {
    const originalId = getOriginalModelId(modelName);
    const apiType = modelName.startsWith(CUSTOM_ANTHROPIC_PREFIX) ? "anthropic" : "openai";
    const manualModel = manualModels.find((m) => m.modelId === originalId && m.apiType === apiType);
    if (manualModel?.supportsReasoning) {
      return { min: 0, max: 0, canBeOff: apiType === "openai", medium: 0 };
    }
  }
  if (modelName.includes("2.5-pro")) return modelConfigs["2.5-pro"];
  if (modelName.includes("3.1-pro")) return modelConfigs["3.1-pro"];
  if (modelName.includes("3.8-flash")) return modelConfigs["3.8-flash"];
  if (modelName.includes("3.7-flash")) return modelConfigs["3.7-flash"];
  if (modelName.includes("3.5-flash-lite")) return modelConfigs["3.5-flash-lite"];
  if (modelName.includes("gemini-3-flash")) return modelConfigs["3-flash"];
  if (modelName.includes("2.5-flash")) return modelConfigs["2.5-flash"];
  return null;
}

export function getThinkingBudgetMap(modelName: string | null | undefined, manualModels?: ManualCustomModel[]): Record<ThinkingOption, number> | null {
  if (!modelName) return null;

  if (isAnthropicReasoningModel(modelName, manualModels)) {
    return {
      dynamic: -1,
      off: -1,
      minimal: -1,
      low: 1,
      medium: 2,
      high: 3,
      xhigh: 4,
    };
  }

  if (isOpenAIReasoningModel(modelName, manualModels)) {
    return {
      dynamic: -1,
      off: 0,
      minimal: -1,
      low: 1,
      medium: 2,
      high: 3,
      xhigh: 4,
    };
  }

  const config = getThinkingConfigForModel(modelName, manualModels);
  if (!config) return null;

  if (config.useThinkingLevel && config.supportedLevels) {
    const budgetMap: Record<ThinkingOption, number> = {
      dynamic: -1,
      off: -1,
      minimal: -1,
      low: 1,
      medium: 2,
      high: 3,
      xhigh: -1,
    };
    for (const level of config.supportedLevels) {
      if (level === "minimal") budgetMap.minimal = 0;
      else if (level === "low") budgetMap.low = 1;
      else if (level === "medium") budgetMap.medium = 2;
      else if (level === "high") budgetMap.high = 3;
    }
    return budgetMap;
  }

  return {
    dynamic: -1,
    off: config.canBeOff ? 0 : -1,
    minimal: config.minimal ?? -1,
    low: config.min,
    medium: config.medium,
    high: config.max,
    xhigh: -1,
  };
}

export function getThinkingValueMap(modelName: string | null | undefined, manualModels?: ManualCustomModel[]): { [key: number]: ThinkingOption } | null {
  if (!modelName) return null;

  if (isAnthropicReasoningModel(modelName, manualModels)) {
    return {
      [-1]: "dynamic",
      1: "low",
      2: "medium",
      3: "high",
      4: "xhigh",
    };
  }

  if (isOpenAIReasoningModel(modelName, manualModels)) {
    return {
      [-1]: "dynamic",
      0: "off",
      1: "low",
      2: "medium",
      3: "high",
      4: "xhigh",
    };
  }

  const config = getThinkingConfigForModel(modelName, manualModels);
  if (!config) return null;

  if (config.useThinkingLevel && config.supportedLevels) {
    const valueMap: { [key: number]: ThinkingOption } = {
      [-1]: "dynamic",
    };
    for (const level of config.supportedLevels) {
      if (level === "minimal") valueMap[0] = "minimal";
      else if (level === "low") valueMap[1] = "low";
      else if (level === "medium") valueMap[2] = "medium";
      else if (level === "high") valueMap[3] = "high";
    }
    return valueMap;
  }

  const valueMap: { [key: number]: ThinkingOption } = {
    [-1]: "dynamic",
    [config.min]: "low",
    [config.medium]: "medium",
    [config.max]: "high",
  };
  if (config.canBeOff) {
    valueMap[0] = "off";
  }
  if (config.minimal !== undefined && config.minimal > 0) {
    valueMap[config.minimal] = "minimal";
  }

  return valueMap;
}

export function modelUsesGeminiThinkingLevel(modelName: string | null | undefined, manualModels?: ManualCustomModel[]): boolean {
  const config = getThinkingConfigForModel(modelName, manualModels);
  return config?.useThinkingLevel === true;
}

export function getDefaultGeminiThinkingLevel(modelName: string | null | undefined, manualModels?: ManualCustomModel[]): ThinkingOption {
  const config = getThinkingConfigForModel(modelName, manualModels);
  return config?.defaultLevel ?? "medium";
}

export function getGeminiSupportedLevels(modelName: string | null | undefined, manualModels?: ManualCustomModel[]): ThinkingOption[] {
  const config = getThinkingConfigForModel(modelName, manualModels);
  return config?.supportedLevels ?? [];
}

export function mapBudgetToGeminiThinkingLevel(
  modelName: string | null | undefined,
  budget: number | undefined,
): "MINIMAL" | "LOW" | "MEDIUM" | "HIGH" | undefined {
  const config = getThinkingConfigForModel(modelName);

  if (budget === undefined || budget === -1) {
    return undefined;
  }

  if (budget === 0) {
    if (config?.supportedLevels && !config.supportedLevels.includes("minimal")) {
      return "LOW" as const;
    }
    return "MINIMAL" as const;
  }
  if (budget === 1) return "LOW" as const;
  if (budget === 2) return "MEDIUM" as const;
  if (budget === 3) return "HIGH" as const;
  return undefined;
}

export function mapBudgetToOpenAIReasoningEffort(
  modelName: string | null | undefined,
  budget: number | undefined,
  manualModels?: ManualCustomModel[],
): OpenAIReasoningEffort {
  if (modelName && isCustomModel(modelName) && modelName.startsWith(CUSTOM_OPENAI_PREFIX) && manualModels) {
    const isReasoning = isOpenAIReasoningModel(modelName, manualModels);
    if (!isReasoning) return "none";
    if (budget === undefined || budget === -1) return "none";
    if (budget === 0) return "none";
    if (budget === 1) return "low";
    if (budget === 2) return "medium";
    if (budget === 3) return "high";
    if (budget === 4) return "xhigh";
    return "none";
  }
  return "none";
}