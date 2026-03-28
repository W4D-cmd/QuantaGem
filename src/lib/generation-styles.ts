export type GenerationStyleId =
  | "default"
  | "precise"
  | "balanced"
  | "creative"
  | "unconstrained"
  | "custom";

export interface GenerationParameters {
  temperature: number | null;
  topP: number | null;
  topK: number | null;
}

export interface GenerationStyle {
  id: GenerationStyleId;
  label: string;
  description: string;
  params: GenerationParameters;
}

export const GENERATION_STYLES: Record<GenerationStyleId, GenerationStyle> = {
  default: {
    id: "default",
    label: "Default",
    description: "Uses the AI provider's native tuned defaults for all parameters.",
    params: { temperature: null, topP: null, topK: null },
  },
  precise: {
    id: "precise",
    label: "Precise",
    description: "Maximum accuracy and determinism. Ideal for coding, math, and factual queries.",
    params: { temperature: 0.1, topP: 0.1, topK: 10 },
  },
  balanced: {
    id: "balanced",
    label: "Balanced",
    description: "The standard conversational zone. Good for general assistance and writing.",
    params: { temperature: 0.7, topP: 0.8, topK: 40 },
  },
  creative: {
    id: "creative",
    label: "Creative",
    description: "High variety and imagination. Great for storytelling and brainstorming.",
    params: { temperature: 1.2, topP: 0.95, topK: 64 },
  },
  unconstrained: {
    id: "unconstrained",
    label: "Unconstrained",
    description: "Maximum exploration. High risk of incoherence but maximum variety.",
    params: { temperature: 1.5, topP: 1.0, topK: 100 },
  },
  custom: {
    id: "custom",
    label: "Custom",
    description: "Manually set your own sampling parameters.",
    params: { temperature: 1.0, topP: 0.95, topK: 40 }, // Default custom baseline
  },
};

export function getStyleFromParams(params: GenerationParameters): GenerationStyleId {
  if (params.temperature === null && params.topP === null && params.topK === null) {
    return "default";
  }

  for (const styleId in GENERATION_STYLES) {
    if (styleId === "default" || styleId === "custom") continue;
    const style = GENERATION_STYLES[styleId as GenerationStyleId];
    if (
      style.params.temperature === params.temperature &&
      style.params.topP === params.topP &&
      style.params.topK === params.topK
    ) {
      return styleId as GenerationStyleId;
    }
  }

  return "custom";
}
