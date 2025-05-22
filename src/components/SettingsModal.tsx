"use client";

import React, { useState, useEffect, ChangeEvent } from "react";
import Modal from "./Modal";
import Toast from "./Toast";

interface SettingsModalProps {
  isOpen: boolean;
  onClose: () => void;
}

const SettingsModal: React.FC<SettingsModalProps> = ({ isOpen, onClose }) => {
  const [systemPrompt, setSystemPrompt] = useState<string>("");
  const [initialSystemPrompt, setInitialSystemPrompt] = useState<string>("");
  const [isLoading, setIsLoading] = useState<boolean>(false);
  const [error, setError] = useState<string | null>(null);
  const [showToast, setShowToast] = useState<boolean>(false);

  useEffect(() => {
    if (isOpen) {
      setIsLoading(true);
      setError(null);
      fetch("/api/settings")
        .then(async (res) => {
          if (!res.ok) {
            const errData = await res.json().catch(() => ({
              error: `Failed to fetch settings: ${res.statusText}`,
            }));
            throw new Error(errData.error || "Failed to fetch settings");
          }
          return res.json();
        })
        .then((data) => {
          const prompt = data.system_prompt || "";
          setSystemPrompt(prompt);
          setInitialSystemPrompt(prompt);
        })
        .catch((err) => {
          setError(err.message);
          setShowToast(true);
        })
        .finally(() => {
          setIsLoading(false);
        });
    }
  }, [isOpen]);

  const handleInputChange = (event: ChangeEvent<HTMLTextAreaElement>) => {
    setSystemPrompt(event.target.value);
  };

  const handleSave = async () => {
    setIsLoading(true);
    setError(null);
    try {
      const response = await fetch("/api/settings", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ systemPrompt }),
      });
      if (!response.ok) {
        const errData = await response.json().catch(() => ({
          error: `Failed to save settings: ${response.statusText}`,
        }));
        throw new Error(errData.error || "Failed to save settings");
      }
      setInitialSystemPrompt(systemPrompt);
      onClose();
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
    setSystemPrompt(initialSystemPrompt);
    onClose();
  };

  const hasChanges = systemPrompt !== initialSystemPrompt;

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
      <Modal isOpen={isOpen} onClose={handleCancel} title="Settings" size="lg">
        <div className="space-y-6">
          <div>
            <label
              htmlFor="system-prompt"
              className="block text-sm font-medium"
            >
              System Prompt
            </label>
            <p className="text-xs text-primary mb-4 mt-1">
              Define the behavior and persona for the AI. This prompt will be
              sent as a system instruction with every request.
            </p>
            {isLoading && !systemPrompt && !initialSystemPrompt ? (
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
