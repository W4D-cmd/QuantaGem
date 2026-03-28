export type GenerationStyle =
  | "default"
  | "scientific"
  | "creative"
  | "coding"
  | "concise"
  | "chatty";

export interface GenerationParameters {
  temperature?: number;
  topP?: number;
  topK?: number;
  frequencyPenalty?: number;
  presencePenalty?: number;
}

export const GENERATION_STYLES: Record<GenerationStyle, GenerationParameters> = {
  default: {},
  scientific: {
    temperature: 0.1,
    topP: 0.1,
    topK: 10,
    frequencyPenalty: 0.0,
    presencePenalty: 0.0,
  },
  creative: {
    temperature: 0.95,
    topP: 0.95,
    topK: 60,
    frequencyPenalty: 0.2,
    presencePenalty: 0.2,
  },
  coding: {
    temperature: 0.2,
    topP: 0.1,
    topK: 10,
    frequencyPenalty: 0.0,
    presencePenalty: 0.0,
  },
  concise: {
    temperature: 0.4,
    topP: 0.8,
    topK: 40,
    frequencyPenalty: 0.1,
    presencePenalty: 0.0,
  },
  chatty: {
    temperature: 0.85,
    topP: 0.9,
    topK: 50,
    frequencyPenalty: 0.1,
    presencePenalty: 0.1,
  },
};

export const STYLE_LABELS: Record<GenerationStyle, string> = {
  default: "Default",
  scientific: "Scientific",
  creative: "Creative",
  coding: "Coding",
  concise: "Concise",
  chatty: "Chatty",
};

export function getParametersForStyle(style: string): GenerationParameters {
  return GENERATION_STYLES[style as GenerationStyle] || GENERATION_STYLES.default;
}
