import { GoogleGenAI } from "@google/genai";

const genAIInstances = new Map<string, GoogleGenAI>();
const DEFAULT_API_VERSION = "v1beta";

export function getGoogleGenAI(apiVersion: "v1" | "v1beta" | "v1alpha" = DEFAULT_API_VERSION): GoogleGenAI {
  if (genAIInstances.has(apiVersion)) {
    return genAIInstances.get(apiVersion)!;
  }

  const projectId = process.env.GOOGLE_CLOUD_PROJECT;
  const location = process.env.GOOGLE_CLOUD_LOCATION || "global";

  if (!projectId) {
    throw new Error("GOOGLE_CLOUD_PROJECT is not configured in environment variables.");
  }

  const newInstance = new GoogleGenAI({
    vertexai: true,
    project: projectId,
    location: location,
    apiVersion: apiVersion,
  });

  genAIInstances.set(apiVersion, newInstance);
  return newInstance;
}
