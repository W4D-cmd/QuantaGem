"use client";

import React, { useState, useEffect, useRef } from "react";
import Modal from "./Modal";
import { ToastProps } from "./Toast";
import { dialogVoices } from "@/lib/voices";
import DropdownMenu, { DropdownItem } from "./DropdownMenu";
import { CheckIcon, ChevronDownIcon, Cog6ToothIcon, ServerIcon, ArrowPathIcon } from "@heroicons/react/24/outline";
import { AnimatePresence, motion } from "framer-motion";

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

type SettingsTab = "general" | "providers";

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
  // General settings
  const [systemPrompt, setSystemPrompt] = useState<string>("");
  const [ttsVoice, setTtsVoice] = useState<string>("Sulafat");
  const [ttsModel, setTtsModel] = useState<string>(ttsModels[0].id);
  const [isVoiceMenuOpen, setIsVoiceMenuOpen] = useState(false);
  const voiceButtonRef = useRef<HTMLButtonElement>(null);

  // Provider settings
  const [customEndpoint, setCustomEndpoint] = useState<string>("");
  const [customApiKey, setCustomApiKey] = useState<string>("");
  const [hasExistingKey, setHasExistingKey] = useState<boolean>(false);
  const [isTestingConnection, setIsTestingConnection] = useState<boolean>(false);

  // UI state
  const [activeTab, setActiveTab] = useState<SettingsTab>("general");
  const [isLoading, setIsLoading] = useState<boolean>(false);

  const [initialSettings, setInitialSettings] = useState({
    systemPrompt: "",
    ttsVoice: "Sulafat",
    ttsModel: ttsModels[0].id,
    customEndpoint: "",
  });

  useEffect(() => {
    if (isOpen) {
      setIsLoading(true);
      setActiveTab("general"); // Reset to general tab when opening

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
              customEndpoint: data.custom_openai_endpoint || "",
            };
            setSystemPrompt(settings.systemPrompt);
            setTtsVoice(settings.ttsVoice);
            setTtsModel(settings.ttsModel);
            setCustomEndpoint(settings.customEndpoint);
            setHasExistingKey(data.custom_openai_key_set || false);
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

  const handleTestConnection = async () => {
    if (!customEndpoint.trim()) {
      showToast("Please enter a valid endpoint URL", "error");
      return;
    }

    setIsTestingConnection(true);
    try {
      const response = await fetch("/api/models/custom", {
        method: "POST",
        headers: { "Content-Type": "application/json", ...getAuthHeaders() },
        body: JSON.stringify({
          endpoint: customEndpoint,
          apiKey: customApiKey || undefined,
        }),
      });

      if (!response.ok) {
        const errData = await response.json().catch(() => ({
          error: `Connection test failed: ${response.statusText}`,
        }));
        throw new Error(errData.error || "Connection test failed");
      }

      const data = await response.json();
      showToast(`Connection successful! Found ${data.models?.length || 0} models.`, "success");
    } catch (err: unknown) {
      const errorMessage = err instanceof Error ? err.message : "Connection test failed";
      showToast(errorMessage, "error");
    } finally {
      setIsTestingConnection(false);
    }
  };

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
          body: JSON.stringify({
            systemPrompt,
            ttsVoice,
            ttsModel,
            customOpenaiEndpoint: customEndpoint || null,
            customOpenaiKey: customApiKey || null,
          }),
        });
      }

      if (!response.ok) {
        const errData = await response.json().catch(() => ({
          error: `Failed to save settings: ${response.statusText}`,
        }));
        throw new Error(errData.error || "Failed to save settings");
      }

      // Clear the API key field after successful save (it's now stored)
      setCustomApiKey("");
      setHasExistingKey(true);

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
      setCustomEndpoint(initialSettings.customEndpoint);
      setCustomApiKey("");
    }
    onClose();
  };

  const hasGeneralChanges =
    systemPrompt !== initialSettings.systemPrompt ||
    (chatId === null && (ttsVoice !== initialSettings.ttsVoice || ttsModel !== initialSettings.ttsModel));

  const hasProviderChanges =
    chatId === null &&
    (customEndpoint !== initialSettings.customEndpoint || customApiKey.trim() !== "");

  const hasChanges = hasGeneralChanges || hasProviderChanges;

  const modalTitle = chatId !== null ? "Chat Settings" : "Settings";
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

  const tabs = [
    { id: "general" as const, label: "General", icon: Cog6ToothIcon },
    ...(chatId === null ? [{ id: "providers" as const, label: "Providers", icon: ServerIcon }] : []),
  ];

  return (
    <AnimatePresence>
      {isOpen && (
        <Modal isOpen={isOpen} onClose={handleCancel} title={modalTitle} size="lg">
          <div className="flex flex-col h-full">
            {/* Tab Navigation */}
            {chatId === null && (
              <div className="flex border-b border-neutral-200 dark:border-zinc-800 mb-4">
                {tabs.map((tab) => (
                  <button
                    key={tab.id}
                    onClick={() => setActiveTab(tab.id)}
                    className={`cursor-pointer flex items-center gap-2 px-4 py-2 text-sm font-medium transition-colors
                      ${
                        activeTab === tab.id
                          ? "text-blue-600 dark:text-blue-400 border-b-2 border-blue-600 dark:border-blue-400"
                          : "text-neutral-500 dark:text-zinc-400 hover:text-neutral-700 dark:hover:text-zinc-300"
                      }`}
                  >
                    <tab.icon className="size-4" />
                    {tab.label}
                  </button>
                ))}
              </div>
            )}

            {/* Tab Content */}
            <div className="flex-1 overflow-y-auto px-1">
              {activeTab === "general" && (
                <div className="space-y-6">
                  <div>
                    <label className="block text-sm font-medium text-neutral-700 dark:text-zinc-400">
                      System Prompt
                    </label>
                    <p className="text-xs text-neutral-500 dark:text-zinc-500 mb-2 mt-1">{promptDescription}</p>
                    {isLoading ? (
                      <div className="w-full h-32 bg-neutral-100 dark:bg-zinc-800 rounded-lg animate-pulse"></div>
                    ) : (
                      <textarea
                        rows={8}
                        className="w-full resize-none p-3 border border-neutral-300 dark:border-zinc-700 rounded-xl
                          shadow-sm text-sm bg-white dark:bg-zinc-950 text-black dark:text-zinc-100 placeholder-neutral-400
                          dark:placeholder-zinc-500 focus:outline-none focus:border-blue-500 focus:ring-2
                          focus:ring-blue-500 focus:ring-opacity-50 transition-all"
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
                        <label className="block text-sm font-medium text-neutral-700 dark:text-zinc-400">
                          Text-to-Speech Model
                        </label>
                        <p className="text-xs text-neutral-500 dark:text-zinc-500 mb-2 mt-1">
                          Select the model for generating audio.
                        </p>
                        <div className="space-y-2">
                          {ttsModels.map((model) => (
                            <label
                              key={model.id}
                              className="flex items-center p-3 border border-neutral-300 dark:border-zinc-700 rounded-xl
                                cursor-pointer hover:bg-neutral-50 dark:hover:bg-zinc-800"
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
                                <span className="text-sm font-medium text-neutral-900 dark:text-zinc-200">
                                  {model.name}
                                </span>
                                <span className="text-xs text-neutral-500 dark:text-zinc-500">{model.description}</span>
                              </span>
                            </label>
                          ))}
                        </div>
                      </div>
                      <div>
                        <label className="block text-sm font-medium text-neutral-700 dark:text-zinc-400">
                          Text-to-Speech Voice
                        </label>
                        <p className="text-xs text-neutral-500 dark:text-zinc-500 mb-2 mt-1">
                          Select the default voice for audio playback.
                        </p>
                        <div className="relative">
                          <button
                            ref={voiceButtonRef}
                            onClick={() => setIsVoiceMenuOpen(!isVoiceMenuOpen)}
                            disabled={isLoading}
                            className="w-full flex justify-between items-center p-3 border border-neutral-300
                              dark:border-zinc-700 rounded-xl shadow-sm text-sm bg-white dark:bg-zinc-950 text-black
                              dark:text-zinc-100 focus:outline-none focus:border-blue-500 focus:ring-2 focus:ring-blue-500
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
                </div>
              )}

              {activeTab === "providers" && chatId === null && (
                <div className="space-y-6">
                  <div>
                    <h3 className="text-sm font-medium text-neutral-700 dark:text-zinc-400 mb-1">
                      Custom OpenAI-compatible Provider
                    </h3>
                    <p className="text-xs text-neutral-500 dark:text-zinc-500 mb-4">
                      Configure a local or self-hosted OpenAI-compatible API (e.g., Llama.cpp, Ollama, vLLM).
                    </p>
                  </div>

                  <div>
                    <label className="block text-sm font-medium text-neutral-700 dark:text-zinc-400">
                      Base URL
                    </label>
                    <p className="text-xs text-neutral-500 dark:text-zinc-500 mb-2 mt-1">
                      The base URL of your OpenAI-compatible API endpoint.
                    </p>
                    {isLoading ? (
                      <div className="w-full h-11 bg-neutral-100 dark:bg-zinc-800 rounded-xl animate-pulse"></div>
                    ) : (
                      <input
                        type="url"
                        className="w-full p-3 border border-neutral-300 dark:border-zinc-700 rounded-xl
                          shadow-sm text-sm bg-white dark:bg-zinc-950 text-black dark:text-zinc-100 placeholder-neutral-400
                          dark:placeholder-zinc-500 focus:outline-none focus:border-blue-500 focus:ring-2
                          focus:ring-blue-500 focus:ring-opacity-50 transition-all"
                        value={customEndpoint}
                        onChange={(e) => setCustomEndpoint(e.target.value)}
                        placeholder="http://localhost:8080/v1"
                        disabled={isLoading}
                      />
                    )}
                  </div>

                  <div>
                    <label className="block text-sm font-medium text-neutral-700 dark:text-zinc-400">
                      API Key
                    </label>
                    <p className="text-xs text-neutral-500 dark:text-zinc-500 mb-2 mt-1">
                      {hasExistingKey
                        ? "An API key is already configured. Enter a new key to update it."
                        : "Optional: Enter an API key if your endpoint requires authentication."}
                    </p>
                    {isLoading ? (
                      <div className="w-full h-11 bg-neutral-100 dark:bg-zinc-800 rounded-xl animate-pulse"></div>
                    ) : (
                      <input
                        type="password"
                        className="w-full p-3 border border-neutral-300 dark:border-zinc-700 rounded-xl
                          shadow-sm text-sm bg-white dark:bg-zinc-950 text-black dark:text-zinc-100 placeholder-neutral-400
                          dark:placeholder-zinc-500 focus:outline-none focus:border-blue-500 focus:ring-2
                          focus:ring-blue-500 focus:ring-opacity-50 transition-all"
                        value={customApiKey}
                        onChange={(e) => setCustomApiKey(e.target.value)}
                        placeholder={hasExistingKey ? "Leave empty to keep existing key" : "Optional API key"}
                        disabled={isLoading}
                      />
                    )}
                  </div>

                  <div className="pt-2">
                    <button
                      type="button"
                      onClick={handleTestConnection}
                      disabled={isLoading || isTestingConnection || !customEndpoint.trim()}
                      className="flex items-center gap-2 cursor-pointer h-9 px-4 rounded-full text-sm font-medium
                        transition-colors bg-neutral-100 dark:bg-zinc-800 border border-neutral-300 dark:border-zinc-700
                        hover:bg-neutral-200 dark:hover:bg-zinc-700 text-neutral-700 dark:text-zinc-300
                        focus:outline-none disabled:opacity-50 disabled:cursor-not-allowed"
                    >
                      {isTestingConnection ? (
                        <>
                          <motion.div
                            animate={{ rotate: 360 }}
                            transition={{ duration: 1, repeat: Infinity, ease: "linear" }}
                          >
                            <ArrowPathIcon className="size-4" />
                          </motion.div>
                          Testing...
                        </>
                      ) : (
                        <>
                          <ServerIcon className="size-4" />
                          Test Connection & Fetch Models
                        </>
                      )}
                    </button>
                  </div>
                </div>
              )}
            </div>

            {/* Footer */}
            <div className="flex justify-end space-x-3 pt-4 border-t border-neutral-200 dark:border-zinc-800 mt-4">
              <button
                type="button"
                onClick={handleCancel}
                disabled={isLoading}
                className="cursor-pointer h-9 px-4 rounded-full text-sm font-medium transition-colors bg-white
                  dark:bg-zinc-900 border border-neutral-300 dark:border-zinc-800 hover:bg-neutral-100
                  dark:hover:bg-zinc-800 text-neutral-500 dark:text-zinc-300 focus:outline-none
                  disabled:opacity-50"
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
      )}
    </AnimatePresence>
  );
};

export default SettingsModal;
