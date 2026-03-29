"use client";

import React, { useState, useEffect } from "react";
import Modal from "./Modal";
import { ToastProps } from "./Toast";
import { Server, RefreshCw, Settings, ShieldCheck, Eye, EyeOff } from "lucide-react";
import { AnimatePresence, motion } from "framer-motion";

type SettingsTab = "general" | "providers" | "security";

interface SettingsModalProps {
  isOpen: boolean;
  onClose: () => void;
  chatId: number | null;
  initialSystemPromptValue: string | null;
  onSettingsSaved: (newSettings: { systemPrompt: string }) => void;
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

  // Provider settings
  const [customEndpoint, setCustomEndpoint] = useState<string>("");
  const [customApiKey, setCustomApiKey] = useState<string>("");
  const [hasExistingKey, setHasExistingKey] = useState<boolean>(false);
  const [isTestingConnection, setIsTestingConnection] = useState<boolean>(false);

  // Security settings
  const [currentPassword, setCurrentPassword] = useState<string>("");
  const [newPassword, setNewPassword] = useState<string>("");
  const [confirmPassword, setConfirmPassword] = useState<string>("");
  const [isChangingPassword, setIsChangingPassword] = useState<boolean>(false);
  const [showCurrentPassword, setShowCurrentPassword] = useState<boolean>(false);
  const [showNewPassword, setShowNewPassword] = useState<boolean>(false);
  const [showConfirmPassword, setShowConfirmPassword] = useState<boolean>(false);

  // UI state
  const [activeTab, setActiveTab] = useState<SettingsTab>("general");
  const [isLoading, setIsLoading] = useState<boolean>(false);

  const [initialSettings, setInitialSettings] = useState({
    systemPrompt: "",
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
              customEndpoint: data.custom_openai_endpoint || "",
            };
            setSystemPrompt(settings.systemPrompt);
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

  const handlePasswordChange = async (e: React.FormEvent) => {
    e.preventDefault();

    if (!currentPassword) {
      showToast("Current password is required", "error");
      return;
    }

    if (newPassword.length < 8) {
      showToast("New password must be at least 8 characters long", "error");
      return;
    }

    if (newPassword !== confirmPassword) {
      showToast("Passwords do not match", "error");
      return;
    }

    setIsChangingPassword(true);
    try {
      const response = await fetch("/api/auth/change-password", {
        method: "POST",
        headers: { "Content-Type": "application/json", ...getAuthHeaders() },
        body: JSON.stringify({ currentPassword, newPassword }),
      });

      const data = await response.json();

      if (!response.ok) {
        throw new Error(data.error || "Failed to change password");
      }

      showToast("Password updated successfully", "success");
      setCurrentPassword("");
      setNewPassword("");
      setConfirmPassword("");
    } catch (err: unknown) {
      const errorMessage = err instanceof Error ? err.message : "An unexpected error occurred.";
      showToast(errorMessage, "error");
    } finally {
      setIsChangingPassword(false);
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

      onSettingsSaved({
        systemPrompt,
      });
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
      setCustomEndpoint(initialSettings.customEndpoint);
      setCustomApiKey("");
    }
    onClose();
  };

  const hasGeneralChanges =
    systemPrompt !== initialSettings.systemPrompt;

  const hasProviderChanges =
    chatId === null &&
    (customEndpoint !== initialSettings.customEndpoint || customApiKey.trim() !== "");

  const hasSecurityChanges =
    chatId === null &&
    (currentPassword !== "" || newPassword !== "" || confirmPassword !== "");

  const hasChanges = activeTab !== "security" && (hasGeneralChanges || hasProviderChanges);

  const modalTitle = chatId !== null ? "Chat Settings" : "Settings";
  const promptDescription =
    chatId !== null
      ? "Define the behavior and persona for the AI in this specific chat. This overrides project or global settings."
      : "Define the default behavior and persona for the AI in all new chats.";

  const tabs = [
    { id: "general" as const, label: "General", icon: Settings },
    ...(chatId === null ? [
      { id: "providers" as const, label: "Providers", icon: Server },
      { id: "security" as const, label: "Security", icon: ShieldCheck }
    ] : []),
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
                </div>
              )}

              {activeTab === "security" && chatId === null && (
                <form onSubmit={handlePasswordChange} className="space-y-6">
                  <div>
                    <h3 className="text-sm font-medium text-neutral-700 dark:text-zinc-400 mb-1">
                      Change Password
                    </h3>
                    <p className="text-xs text-neutral-500 dark:text-zinc-500 mb-4">
                      Update your account password. Use at least 8 characters.
                    </p>
                  </div>

                  <div className="space-y-4">
                    <div className="relative">
                      <label className="block text-sm font-medium text-neutral-700 dark:text-zinc-400 mb-1">
                        Current Password
                      </label>
                      <div className="relative">
                        <input
                          type={showCurrentPassword ? "text" : "password"}
                          className="w-full p-3 pr-10 border border-neutral-300 dark:border-zinc-700 rounded-xl
                            shadow-sm text-sm bg-white dark:bg-zinc-950 text-black dark:text-zinc-100 placeholder-neutral-400
                            dark:placeholder-zinc-500 focus:outline-none focus:border-blue-500 focus:ring-2
                            focus:ring-blue-500 focus:ring-opacity-50 transition-all"
                          value={currentPassword}
                          onChange={(e) => setCurrentPassword(e.target.value)}
                          placeholder="••••••••"
                          disabled={isChangingPassword}
                        />
                        <button
                          type="button"
                          onClick={() => setShowCurrentPassword(!showCurrentPassword)}
                          className="absolute right-3 top-1/2 -translate-y-1/2 text-neutral-400 hover:text-neutral-600 dark:hover:text-zinc-300"
                        >
                          {showCurrentPassword ? <EyeOff className="size-4" /> : <Eye className="size-4" />}
                        </button>
                      </div>
                    </div>

                    <div className="relative">
                      <label className="block text-sm font-medium text-neutral-700 dark:text-zinc-400 mb-1">
                        New Password
                      </label>
                      <div className="relative">
                        <input
                          type={showNewPassword ? "text" : "password"}
                          className="w-full p-3 pr-10 border border-neutral-300 dark:border-zinc-700 rounded-xl
                            shadow-sm text-sm bg-white dark:bg-zinc-950 text-black dark:text-zinc-100 placeholder-neutral-400
                            dark:placeholder-zinc-500 focus:outline-none focus:border-blue-500 focus:ring-2
                            focus:ring-blue-500 focus:ring-opacity-50 transition-all"
                          value={newPassword}
                          onChange={(e) => setNewPassword(e.target.value)}
                          placeholder="Min. 8 characters"
                          disabled={isChangingPassword}
                        />
                        <button
                          type="button"
                          onClick={() => setShowNewPassword(!showNewPassword)}
                          className="absolute right-3 top-1/2 -translate-y-1/2 text-neutral-400 hover:text-neutral-600 dark:hover:text-zinc-300"
                        >
                          {showNewPassword ? <EyeOff className="size-4" /> : <Eye className="size-4" />}
                        </button>
                      </div>
                    </div>

                    <div className="relative">
                      <label className="block text-sm font-medium text-neutral-700 dark:text-zinc-400 mb-1">
                        Confirm New Password
                      </label>
                      <div className="relative">
                        <input
                          type={showConfirmPassword ? "text" : "password"}
                          className="w-full p-3 pr-10 border border-neutral-300 dark:border-zinc-700 rounded-xl
                            shadow-sm text-sm bg-white dark:bg-zinc-950 text-black dark:text-zinc-100 placeholder-neutral-400
                            dark:placeholder-zinc-500 focus:outline-none focus:border-blue-500 focus:ring-2
                            focus:ring-blue-500 focus:ring-opacity-50 transition-all"
                          value={confirmPassword}
                          onChange={(e) => setConfirmPassword(e.target.value)}
                          placeholder="Repeat new password"
                          disabled={isChangingPassword}
                        />
                        <button
                          type="button"
                          onClick={() => setShowConfirmPassword(!showConfirmPassword)}
                          className="absolute right-3 top-1/2 -translate-y-1/2 text-neutral-400 hover:text-neutral-600 dark:hover:text-zinc-300"
                        >
                          {showConfirmPassword ? <EyeOff className="size-4" /> : <Eye className="size-4" />}
                        </button>
                      </div>
                    </div>
                  </div>

                  <div className="pt-2">
                    <button
                      type="submit"
                      disabled={isChangingPassword || !currentPassword || !newPassword || !confirmPassword}
                      className="flex items-center gap-2 cursor-pointer h-9 px-4 rounded-full text-sm font-medium
                        transition-colors bg-black dark:bg-blue-600 text-white border border-transparent shadow-sm
                        hover:bg-neutral-600 dark:hover:bg-blue-700 focus:outline-none disabled:opacity-50"
                    >
                      {isChangingPassword ? (
                        <>
                          <motion.div
                            animate={{ rotate: 360 }}
                            transition={{ duration: 1, repeat: Infinity, ease: "linear" }}
                          >
                            <RefreshCw className="size-4" />
                          </motion.div>
                          Updating...
                        </>
                      ) : (
                        <>
                          <ShieldCheck className="size-4" />
                          Update Password
                        </>
                      )}
                    </button>
                  </div>
                </form>
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
                            <RefreshCw className="size-4" />
                          </motion.div>
                          Testing...
                        </>
                      ) : (
                        <>
                          <Server className="size-4" />
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
