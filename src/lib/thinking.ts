export type ThinkingOption = "dynamic" | "off" | "low" | "medium" | "high";

interface ThinkingModelConfig {
  min: number;
  max: number;
  canBeOff: boolean;
  medium: number;
}

const modelConfigs: Record<string, ThinkingModelConfig> = {
  "2.5-pro": { min: 128, max: 32768, canBeOff: false, medium: 8192 },
  "2.5-flash": { min: 0, max: 24576, canBeOff: true, medium: 8192 },
  "2.5-flash-lite": { min: 512, max: 24576, canBeOff: true, medium: 4096 },
};

export function getThinkingConfigForModel(modelName: string | null | undefined): ThinkingModelConfig | null {
  if (!modelName) return null;
  if (modelName.includes("2.5-pro")) return modelConfigs["2.5-pro"];
  if (modelName.includes("2.5-flash-lite")) return modelConfigs["2.5-flash-lite"];
  if (modelName.includes("2.5-flash")) return modelConfigs["2.5-flash"];
  return null;
}

export function getThinkingBudgetMap(modelName: string | null | undefined): Record<ThinkingOption, number> | null {
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
