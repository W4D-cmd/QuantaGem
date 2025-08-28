export interface CustomModelEntry {
  modelId: string;
}

export interface OAIModel {
  id: string;
  name: string;
  description?: string;
  context_length?: number;
  max_completion_tokens?: number;
}

export const customModels: CustomModelEntry[] = [
  { modelId: "google/gemini-2.5-pro" },
  { modelId: "google/gemini-2.5-flash" },
  { modelId: "google/gemini-2.5-flash-lite" },
  { modelId: "google/gemini-2.0-flash-001" },
  { modelId: "google/gemini-2.0-flash-lite-001" },
];
