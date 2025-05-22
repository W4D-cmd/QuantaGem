"use client";

import React, { useState, useEffect, ChangeEvent } from "react";
import Modal from "./Modal";
import Toast from "./Toast";

interface SettingsModalProps {
  isOpen: boolean;
  onClose: () => void;
  chatId: number | null;
  initialSystemPromptValue: string | null;
  onSettingsSaved: () => void;
}

const SettingsModal: React.FC<SettingsModalProps> = ({
  isOpen,
  onClose,
  chatId,
  initialSystemPromptValue,
  onSettingsSaved,
}) => {
  const [systemPrompt, setSystemPrompt] = useState<string>("");
  const [currentInitialSystemPrompt, setCurrentInitialSystemPrompt] =
    useState<string>("");
  const [isLoading, setIsLoading] = useState<boolean>(false);
  const [error, setError] = useState<string | null>(null);
  const [showToast, setShowToast] = useState<boolean>(false);

  useEffect(() => {
    if (isOpen) {
      setIsLoading(true);
      setError(null);
      if (chatId !== null) {
        if (initialSystemPromptValue !== null) {
          setSystemPrompt(initialSystemPromptValue);
          setCurrentInitialSystemPrompt(initialSystemPromptValue);
          setIsLoading(false);
        } else {
          fetch(`/api/chats/${chatId}`)
            .then(async (res) => {
              if (!res.ok) {
                const errData = await res.json().catch(() => ({
                  error: `Failed to fetch chat settings: ${res.statusText}`,
                }));
                throw new Error(
                  errData.error || "Failed to fetch chat settings",
                );
              }
              return res.json();
            })
            .then((data) => {
              const prompt = data.systemPrompt || "";
              setSystemPrompt(prompt);
              setCurrentInitialSystemPrompt(prompt);
            })
            .catch((err) => {
              setError(err.message);
              setShowToast(true);
            })
            .finally(() => {
              setIsLoading(false);
            });
        }
      } else {
        fetch("/api/settings")
          .then(async (res) => {
            if (!res.ok) {
              const errData = await res.json().catch(() => ({
                error: `Failed to fetch global settings: ${res.statusText}`,
              }));
              throw new Error(
                errData.error || "Failed to fetch global settings",
              );
            }
            return res.json();
          })
          .then((data) => {
            const prompt = data.system_prompt || "";
            setSystemPrompt(prompt);
            setCurrentInitialSystemPrompt(prompt);
          })
          .catch((err) => {
            setError(err.message);
            setShowToast(true);
          })
          .finally(() => {
            setIsLoading(false);
          });
      }
    }
  }, [isOpen, chatId, initialSystemPromptValue]);

  const handleInputChange = (event: ChangeEvent<HTMLTextAreaElement>) => {
    setSystemPrompt(event.target.value);
  };

  const handleSave = async () => {
    setIsLoading(true);
    setError(null);
    try {
      let response;
      if (chatId !== null) {
        response = await fetch(`/api/chats/${chatId}`, {
          method: "PATCH",
          headers: {
            "Content-Type": "application/json",
          },
          body: JSON.stringify({ systemPrompt }),
        });
      } else {
        response = await fetch("/api/settings", {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
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
      let errorMessage = "An unexpected error occurred.";
      if (err instanceof Error) {
        errorMessage = err.message;
      } else if (typeof err === "string") {
        errorMessage = err;
      }
      setError(errorMessage);
      setShowToast(true);
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
      ? "Define the behavior and persona for the AI in this specific chat. If not set, the global system prompt will be used."
      : "Define the default behavior and persona for the AI in all new chats.";

  return (
    <>
      {showToast && error && (
        <Toast
          message={error}
          onClose={() => {
            setShowToast(false);
            setError(null);
          }}
        />
      )}
      <Modal
        isOpen={isOpen}
        onClose={handleCancel}
        title={modalTitle}
        size="lg"
      >
        <div className="space-y-6">
          <div>
            <label
              htmlFor="system-prompt"
              className="block text-sm font-medium"
            >
              System Prompt
            </label>
            <p className="text-xs text-primary mb-4 mt-1">
              {promptDescription}
            </p>
            {isLoading && !systemPrompt && !currentInitialSystemPrompt ? (
              <div className="w-full h-32 bg-gray-100 rounded-lg animate-pulse"></div>
            ) : (
              <textarea
                id="system-prompt"
                name="system-prompt"
                rows={8}
                className="w-full resize-none p-3 border border-gray-300 rounded-xl shadow-sm
                           text-sm transition-shadow duration-200 ease-in-out
                           focus:outline-none focus:border-blue-500 focus:ring-2 focus:ring-blue-500 focus:ring-opacity-50"
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
              className="cursor-pointer h-9 px-4 rounded-full text-sm font-medium transition-colors duration-150
                         bg-white text-primary border border-gray-300 hover:bg-gray-100
                         focus:outline-none disabled:opacity-50"
            >
              Cancel
            </button>
            <button
              type="button"
              onClick={handleSave}
              disabled={isLoading || !hasChanges}
              className="cursor-pointer disabled:cursor-not-allowed h-9 px-4 rounded-full text-sm font-medium transition-colors duration-150
                         bg-black text-white border border-transparent shadow-sm hover:bg-[#5d5d5d]
                         focus:outline-none disabled:opacity-50 disabled:bg-[#5d5d5d]"
            >
              {isLoading ? "Saving..." : "Save"}
            </button>
          </div>
        </div>
      </Modal>
    </>
  );
};

export default SettingsModal;
