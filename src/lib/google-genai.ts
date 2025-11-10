import { GoogleGenAI } from "@google/genai";

const genAIInstances = new Map<string, GoogleGenAI>();
const DEFAULT_API_KEY = "default";

export function getGoogleGenAI(apiVersion?: "v1" | "v1beta" | "v1alpha"): GoogleGenAI {
  const cacheKey = apiVersion || DEFAULT_API_KEY;

  if (genAIInstances.has(cacheKey)) {
    return genAIInstances.get(cacheKey)!;
  }

  const projectId = process.env.GOOGLE_CLOUD_PROJECT;
  const location = process.env.GOOGLE_CLOUD_LOCATION || "global";

  if (!projectId) {
    throw new Error("GOOGLE_CLOUD_PROJECT is not configured in environment variables.");
  }

  const config: {
    vertexai: true;
    project: string;
    location: string;
    apiVersion?: string;
    httpOptions?: { timeout: number };
  } = {
    vertexai: true,
    project: projectId,
    location: location,
    httpOptions: { timeout: 600000 },
  };

  if (apiVersion) {
    config.apiVersion = apiVersion;
  }

  const newInstance = new GoogleGenAI(config);

  genAIInstances.set(cacheKey, newInstance);
  return newInstance;
}
