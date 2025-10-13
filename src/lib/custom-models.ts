export interface CustomModelEntry {
  displayName: string;
  modelId: string;
}

export const customModels: CustomModelEntry[] = [
  { displayName: "Gemini 2.5 Pro", modelId: "gemini-2.5-pro" },
  { displayName: "Gemini 2.5 Flash", modelId: "gemini-2.5-flash" },
  { displayName: "Gemini 2.5 Flash-Lite", modelId: "gemini-2.5-flash-lite" },
  { displayName: "Gemini 2.0 Flash", modelId: "gemini-2.0-flash-001" },
  { displayName: "Gemini 2.0 Flash-Lite", modelId: "gemini-2.0-flash-lite-001" },
];
