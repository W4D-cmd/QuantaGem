"use client";

import React, { useState, useEffect, ChangeEvent } from "react";
import Modal from "./Modal";
import { ToastProps } from "./Toast";

interface SettingsModalProps {
  isOpen: boolean;
  onClose: () => void;
  chatId: number | null;
  initialSystemPromptValue: string | null;
  onSettingsSaved: () => void;
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
  const [currentInitialSystemPrompt, setCurrentInitialSystemPrompt] = useState<string>("");
  const [isLoading, setIsLoading] = useState<boolean>(false);

  useEffect(() => {
    if (isOpen) {
      setIsLoading(true);
      if (chatId !== null) {
        if (initialSystemPromptValue !== null) {
          setSystemPrompt(initialSystemPromptValue);
          setCurrentInitialSystemPrompt(initialSystemPromptValue);
          setIsLoading(false);
        } else {
          fetch(`/api/chats/${chatId}`, { headers: getAuthHeaders() })
            .then(async (res) => {
              if (!res.ok) {
                const errData = await res.json().catch(() => ({
                  error: `Failed to fetch chat settings: ${res.statusText}`,
                }));
                throw new Error(errData.error || "Failed to fetch chat settings");
              }
              return res.json();
            })
            .then((data) => {
              const prompt = data.systemPrompt || "";
              setSystemPrompt(prompt);
              setCurrentInitialSystemPrompt(prompt);
            })
            .catch((err) => {
              showToast(err.message, "error");
            })
            .finally(() => {
              setIsLoading(false);
            });
        }
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
            const prompt = data.system_prompt || "";
            setSystemPrompt(prompt);
            setCurrentInitialSystemPrompt(prompt);
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

  const handleInputChange = (event: ChangeEvent<HTMLTextAreaElement>) => {
    setSystemPrompt(event.target.value);
  };

  const handleSave = async () => {
    setIsLoading(true);
    try {
      let response;
      if (chatId !== null) {
        response = await fetch(`/api/chats/${chatId}`, {
          method: "PATCH",
          headers: {
            "Content-Type": "application/json",
            ...getAuthHeaders(),
          },
          body: JSON.stringify({ systemPrompt }),
        });
      } else {
        response = await fetch("/api/settings", {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            ...getAuthHeaders(),
          },
          body: JSON.stringify({ systemPrompt }),
        });
      }

      if (!response.ok) {
        const errData = await response.json().catch(() => ({
          error: `Failed to save settings: ${response.statusText}`,
        }));
        throw new Error(errData.error || "Failed to save settings");
      }
      setCurrentInitialSystemPrompt(systemPrompt);
      onSettingsSaved();
    } catch (err: unknown) {
      const errorMessage = err instanceof Error ? err.message : "An unexpected error occurred.";
      showToast(errorMessage, "error");
    } finally {
      setIsLoading(false);
    }
  };

  const handleCancel = () => {
    setSystemPrompt(currentInitialSystemPrompt);
    onClose();
  };

  const hasChanges = systemPrompt !== currentInitialSystemPrompt;
  const modalTitle = chatId !== null ? "Chat Settings" : "Global Settings";
  const promptDescription =
    chatId !== null
      ? "Define the behavior and persona for the AI in this specific chat. If not set, the project or global system prompt will be used."
      : "Define the default behavior and persona for the AI in all new chats.";

  return (
    <Modal isOpen={isOpen} onClose={handleCancel} title={modalTitle} size="lg">
      <div className="space-y-6">
        <div>
          <label htmlFor="system-prompt" className="block text-sm font-medium text-neutral-700 dark:text-neutral-300">
            System Prompt
          </label>
          <p className="text-xs text-neutral-500 dark:text-neutral-400 mb-4 mt-1">{promptDescription}</p>
          {isLoading && !systemPrompt && !currentInitialSystemPrompt ? (
            <div
              className="w-full h-32 bg-neutral-100 dark:bg-neutral-800 rounded-lg animate-pulse transition-colors
                duration-300 ease-in-out"
            ></div>
          ) : (
            <textarea
              id="system-prompt"
              name="system-prompt"
              rows={8}
              className="w-full resize-none p-3 border border-neutral-300 dark:border-neutral-700 rounded-xl shadow-sm
                text-sm bg-white dark:bg-neutral-950 text-black dark:text-white placeholder-neutral-400
                dark:placeholder-neutral-500 focus:outline-none focus:border-blue-500 focus:ring-2 focus:ring-blue-500
                focus:ring-opacity-50 transition-all duration-300 ease-in-out"
              value={systemPrompt}
              onChange={handleInputChange}
              placeholder="e.g., You are a helpful assistant that speaks like a pirate."
              disabled={isLoading}
            />
          )}
        </div>

        <div className="flex justify-end space-x-3 pt-2">
          <button
            type="button"
            onClick={handleCancel}
            disabled={isLoading}
            className="cursor-pointer h-9 px-4 rounded-full text-sm font-medium transition-colors duration-300
              ease-in-out bg-white dark:bg-neutral-900 border border-neutral-300 dark:border-neutral-800
              hover:bg-neutral-100 dark:hover:bg-neutral-800 text-neutral-500 dark:text-neutral-300 focus:outline-none
              disabled:opacity-50"
          >
            Cancel
          </button>
          <button
            type="button"
            onClick={handleSave}
            disabled={isLoading || !hasChanges}
            className="cursor-pointer disabled:cursor-not-allowed h-9 px-4 rounded-full text-sm font-medium
              transition-colors duration-300 ease-in-out bg-black dark:bg-blue-600 text-white border border-transparent
              shadow-sm hover:bg-neutral-600 dark:hover:bg-blue-700 focus:outline-none disabled:opacity-50"
          >
            {isLoading ? "Saving..." : "Save"}
          </button>
        </div>
      </div>
    </Modal>
  );
};

export default SettingsModal;
