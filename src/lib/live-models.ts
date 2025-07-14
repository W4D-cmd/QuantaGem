import { LiveConnectConfig, Modality } from "@google/genai";

export interface LiveModel {
  name: string;
  displayName: string;
  configType: "dialog" | "standard";
}

export const liveModels: LiveModel[] = [
  {
    name: "models/gemini-2.5-flash-preview-native-audio-dialog",
    displayName: "Gemini 2.5 Flash Native Audio",
    configType: "dialog",
  },
  {
    name: "models/gemini-2.5-flash-exp-native-audio-thinking-dialog",
    displayName: "Gemini 2.5 Flash Native Audio Thinking",
    configType: "dialog",
  },
  {
    name: "models/gemini-2.5-flash-live-preview",
    displayName: "Gemini 2.5 Flash (Live)",
    configType: "standard",
  },
  {
    name: "models/gemini-2.0-flash-live-001",
    displayName: "Gemini 2.0 Flash (Live)",
    configType: "standard",
  },
];

export const languageCodes = [
  "de-DE",
  "en-US",
  "fr-FR",
  "pt-BR",
  "id-ID",
  "ja-JP",
  "vi-VN",
  "mr-IN",
  "ta-IN",
  "nl-NL",
  "ru-RU",
  "en-IN",
  "es-US",
  "hi-IN",
  "ar-XA",
  "it-IT",
  "tr-TR",
  "bn-IN",
  "te-IN",
  "ko-KR",
  "pl-PL",
  "th-TH",
];

export function getLiveConnectConfig(
  model: LiveModel,
  languageCode: string,
  voiceName: string,
  sessionHandle: string | null,
): LiveConnectConfig {
  if (model.configType === "dialog") {
    return {
      responseModalities: [Modality.AUDIO],
      speechConfig: { voiceConfig: { prebuiltVoiceConfig: { voiceName: voiceName } } },
      enableAffectiveDialog: true,
      proactivity: { proactiveAudio: true },
      sessionResumption: { handle: sessionHandle ?? undefined },
      contextWindowCompression: { slidingWindow: {} },
    };
  } else {
    return {
      responseModalities: [Modality.AUDIO],
      speechConfig: {
        languageCode: languageCode,
        voiceConfig: {
          prebuiltVoiceConfig: {
            voiceName: voiceName,
          },
        },
      },
      sessionResumption: { handle: sessionHandle ?? undefined },
      contextWindowCompression: { slidingWindow: {} },
    };
  }
}
