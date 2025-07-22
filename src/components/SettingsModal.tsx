"use client";

import React, { useState, useEffect, ChangeEvent, useRef } from "react";
import Modal from "./Modal";
import { ToastProps } from "./Toast";
import { dialogVoices } from "@/lib/voices";
import DropdownMenu, { DropdownItem } from "./DropdownMenu";
import { CheckIcon, ChevronDownIcon } from "@heroicons/react/24/outline";

const ttsModels = [
  {
    id: "gemini-2.5-flash-preview-tts",
    name: "Gemini 2.5 Flash TTS",
    description: "Faster, suitable for most use cases.",
  },
  {
    id: "gemini-2.5-pro-preview-tts",
    name: "Gemini 2.5 Pro TTS",
    description: "Higher quality, slightly slower.",
  },
];

interface SettingsModalProps {
  isOpen: boolean;
  onClose: () => void;
  chatId: number | null;
  initialSystemPromptValue: string | null;
  onSettingsSaved: (newSettings?: { ttsVoice: string; ttsModel: string }) => void;
  getAuthHeaders: () => HeadersInit;
  showToast: (message: string, type?: ToastProps["type"]) => void;
}

const SettingsModal: React.FC<SettingsModalProps> = ({
  isOpen,
  onClose,
  chatId,
  initialSystemPromptValue,
  onSettingsSaved,
  getAuthHeaders,
  showToast,
}) => {
  const [systemPrompt, setSystemPrompt] = useState<string>("");
  const [ttsVoice, setTtsVoice] = useState<string>("Sulafat");
  const [ttsModel, setTtsModel] = useState<string>(ttsModels[0].id);
  const [isVoiceMenuOpen, setIsVoiceMenuOpen] = useState(false);
  const voiceButtonRef = useRef<HTMLButtonElement>(null);

  const [initialSettings, setInitialSettings] = useState({
    systemPrompt: "",
    ttsVoice: "Sulafat",
    ttsModel: ttsModels[0].id,
  });
  const [isLoading, setIsLoading] = useState<boolean>(false);

  useEffect(() => {
    if (isOpen) {
      setIsLoading(true);
      if (chatId !== null) {
        const prompt = initialSystemPromptValue || "";
        setSystemPrompt(prompt);
        setInitialSettings((prev) => ({ ...prev, systemPrompt: prompt }));
        setIsLoading(false);
      } else {
        fetch("/api/settings", { headers: getAuthHeaders() })
          .then(async (res) => {
            if (!res.ok) {
              const errData = await res.json().catch(() => ({
                error: `Failed to fetch global settings: ${res.statusText}`,
              }));
              throw new Error(errData.error || "Failed to fetch global settings");
            }
            return res.json();
          })
          .then((data) => {
            const settings = {
              systemPrompt: data.system_prompt || "",
              ttsVoice: data.tts_voice || "Sulafat",
              ttsModel: data.tts_model || ttsModels[0].id,
            };
            setSystemPrompt(settings.systemPrompt);
            setTtsVoice(settings.ttsVoice);
            setTtsModel(settings.ttsModel);
            setInitialSettings(settings);
          })
          .catch((err) => {
            showToast(err.message, "error");
          })
          .finally(() => {
            setIsLoading(false);
          });
      }
    }
  }, [isOpen, chatId, initialSystemPromptValue, getAuthHeaders, showToast]);

  const handleSave = async () => {
    setIsLoading(true);
    try {
      let response;
      if (chatId !== null) {
        response = await fetch(`/api/chats/${chatId}`, {
          method: "PATCH",
          headers: { "Content-Type": "application/json", ...getAuthHeaders() },
          body: JSON.stringify({ systemPrompt }),
        });
      } else {
        response = await fetch("/api/settings", {
          method: "POST",
          headers: { "Content-Type": "application/json", ...getAuthHeaders() },
          body: JSON.stringify({ systemPrompt, ttsVoice, ttsModel }),
        });
      }

      if (!response.ok) {
        const errData = await response.json().catch(() => ({
          error: `Failed to save settings: ${response.statusText}`,
        }));
        throw new Error(errData.error || "Failed to save settings");
      }
      onSettingsSaved(chatId === null ? { ttsVoice, ttsModel } : undefined);
    } catch (err: unknown) {
      const errorMessage = err instanceof Error ? err.message : "An unexpected error occurred.";
      showToast(errorMessage, "error");
    } finally {
      setIsLoading(false);
    }
  };

  const handleCancel = () => {
    setSystemPrompt(initialSettings.systemPrompt);
    if (chatId === null) {
      setTtsVoice(initialSettings.ttsVoice);
      setTtsModel(initialSettings.ttsModel);
    }
    onClose();
  };

  const hasChanges =
    systemPrompt !== initialSettings.systemPrompt ||
    (chatId === null && (ttsVoice !== initialSettings.ttsVoice || ttsModel !== initialSettings.ttsModel));

  const modalTitle = chatId !== null ? "Chat Settings" : "Global Settings";
  const promptDescription =
    chatId !== null
      ? "Define the behavior and persona for the AI in this specific chat. This overrides project or global settings."
      : "Define the default behavior and persona for the AI in all new chats.";

  const voiceDropdownItems: DropdownItem[] = dialogVoices.map((voice) => ({
    id: voice.name,
    label: `${voice.name} - ${voice.description}`,
    onClick: () => setTtsVoice(voice.name),
    className: ttsVoice === voice.name ? "font-semibold" : "",
    icon: ttsVoice === voice.name ? <CheckIcon className="size-4 text-blue-500" /> : <div className="size-4" />,
  }));

  const selectedVoiceDesc = dialogVoices.find((v) => v.name === ttsVoice)?.description || "";

  return (
    <Modal isOpen={isOpen} onClose={handleCancel} title={modalTitle} size="lg">
      <div className="space-y-6">
        <div>
          <label className="block text-sm font-medium text-neutral-700 dark:text-neutral-300">System Prompt</label>
          <p className="text-xs text-neutral-500 dark:text-neutral-400 mb-2 mt-1">{promptDescription}</p>
          {isLoading ? (
            <div className="w-full h-32 bg-neutral-100 dark:bg-neutral-800 rounded-lg animate-pulse"></div>
          ) : (
            <textarea
              rows={8}
              className="w-full resize-none p-3 border border-neutral-300 dark:border-neutral-700 rounded-xl shadow-sm
                text-sm bg-white dark:bg-neutral-950 text-black dark:text-white placeholder-neutral-400
                dark:placeholder-neutral-500 focus:outline-none focus:border-blue-500 focus:ring-2 focus:ring-blue-500
                focus:ring-opacity-50 transition-all"
              value={systemPrompt}
              onChange={(e) => setSystemPrompt(e.target.value)}
              placeholder="e.g., You are a helpful assistant that speaks like a pirate."
              disabled={isLoading}
            />
          )}
        </div>

        {chatId === null && (
          <>
            <div>
              <label className="block text-sm font-medium text-neutral-700 dark:text-neutral-300">
                Text-to-Speech Model
              </label>
              <p className="text-xs text-neutral-500 dark:text-neutral-400 mb-2 mt-1">
                Select the model for generating audio.
              </p>
              <div className="space-y-2">
                {ttsModels.map((model) => (
                  <label
                    key={model.id}
                    className="flex items-center p-3 border border-neutral-300 dark:border-neutral-700 rounded-xl
                      cursor-pointer hover:bg-neutral-50 dark:hover:bg-neutral-800"
                  >
                    <input
                      type="radio"
                      name="tts-model"
                      value={model.id}
                      checked={ttsModel === model.id}
                      onChange={(e) => setTtsModel(e.target.value)}
                      className="h-4 w-4 text-blue-600 border-neutral-300 focus:ring-blue-500"
                    />
                    <span className="ml-3 flex flex-col">
                      <span className="text-sm font-medium text-neutral-900 dark:text-neutral-100">{model.name}</span>
                      <span className="text-xs text-neutral-500 dark:text-neutral-400">{model.description}</span>
                    </span>
                  </label>
                ))}
              </div>
            </div>
            <div>
              <label className="block text-sm font-medium text-neutral-700 dark:text-neutral-300">
                Text-to-Speech Voice
              </label>
              <p className="text-xs text-neutral-500 dark:text-neutral-400 mb-2 mt-1">
                Select the default voice for audio playback.
              </p>
              <div className="relative">
                <button
                  ref={voiceButtonRef}
                  onClick={() => setIsVoiceMenuOpen(!isVoiceMenuOpen)}
                  disabled={isLoading}
                  className="w-full flex justify-between items-center p-3 border border-neutral-300
                    dark:border-neutral-700 rounded-xl shadow-sm text-sm bg-white dark:bg-neutral-950 text-black
                    dark:text-white focus:outline-none focus:border-blue-500 focus:ring-2 focus:ring-blue-500
                    focus:ring-opacity-50 transition-all"
                >
                  <span>
                    <span className="font-medium">{ttsVoice}</span> - {selectedVoiceDesc}
                  </span>
                  <ChevronDownIcon className="size-4 text-neutral-500" />
                </button>
                <DropdownMenu
                  open={isVoiceMenuOpen}
                  onCloseAction={() => setIsVoiceMenuOpen(false)}
                  anchorRef={voiceButtonRef}
                  items={voiceDropdownItems}
                  position="left"
                  extraWidthPx={0}
                />
              </div>
            </div>
          </>
        )}

        <div className="flex justify-end space-x-3 pt-2">
          <button
            type="button"
            onClick={handleCancel}
            disabled={isLoading}
            className="cursor-pointer h-9 px-4 rounded-full text-sm font-medium transition-colors bg-white
              dark:bg-neutral-900 border border-neutral-300 dark:border-neutral-800 hover:bg-neutral-100
              dark:hover:bg-neutral-800 text-neutral-500 dark:text-neutral-300 focus:outline-none disabled:opacity-50"
          >
            Cancel
          </button>
          <button
            type="button"
            onClick={handleSave}
            disabled={isLoading || !hasChanges}
            className="cursor-pointer disabled:cursor-not-allowed h-9 px-4 rounded-full text-sm font-medium
              transition-colors bg-black dark:bg-blue-600 text-white border border-transparent shadow-sm
              hover:bg-neutral-600 dark:hover:bg-blue-700 focus:outline-none disabled:opacity-50"
          >
            {isLoading ? "Saving..." : "Save"}
          </button>
        </div>
      </div>
    </Modal>
  );
};

export default SettingsModal;
