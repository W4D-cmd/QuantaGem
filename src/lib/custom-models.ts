export interface CustomModelEntry {
  displayName: string;
  modelId: string;
  inputTokenLimit: number;
  outputTokenLimit: number;
}

export const customModels: CustomModelEntry[] = [
  {
    displayName: "Gemini 3 Pro Preview",
    modelId: "gemini-3-pro-preview",
    inputTokenLimit: 1048576,
    outputTokenLimit: 65536,
  },
  {
    displayName: "Gemini 2.5 Pro",
    modelId: "gemini-2.5-pro",
    inputTokenLimit: 1048576,
    outputTokenLimit: 65536,
  },
  {
    displayName: "Gemini 2.5 Flash",
    modelId: "gemini-2.5-flash",
    inputTokenLimit: 1048576,
    outputTokenLimit: 65536,
  },
  {
    displayName: "Gemini 2.5 Flash-Lite",
    modelId: "gemini-2.5-flash-lite",
    inputTokenLimit: 1048576,
    outputTokenLimit: 65536,
  },
  {
    displayName: "Gemini 2.0 Flash",
    modelId: "gemini-2.0-flash-001",
    inputTokenLimit: 32768,
    outputTokenLimit: 4096,
  },
  {
    displayName: "Gemini 2.0 Flash-Lite",
    modelId: "gemini-2.0-flash-lite-001",
    inputTokenLimit: 32768,
    outputTokenLimit: 4096,
  },
];
