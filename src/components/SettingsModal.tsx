"use client";

import React, { useState, useEffect } from "react";
import Modal from "./Modal";
import { ToastProps } from "./Toast";
import { Server, RefreshCw, Settings, ShieldCheck, Eye, EyeOff, Plus, Pencil, Trash2, BookOpen } from "lucide-react";
import { AnimatePresence, motion } from "motion/react";
import { ManualCustomModel } from "@/lib/custom-models";

type SettingsTab = "general" | "providers" | "security";

interface SettingsModalProps {
  isOpen: boolean;
  onClose: () => void;
  chatId: number | null;
  initialSystemPromptValue: string | null;
  onSettingsSaved: (newSettings: { systemPrompt: string }) => void;
  getAuthHeaders: () => HeadersInit;
  showToast: (message: string, type?: ToastProps["type"]) => void;
  onManualModelsChanged?: () => void;
  onOpenSkillsModal?: () => void;
}

interface ModelFormState {
  modelId: string;
  displayName: string;
  apiType: "openai" | "anthropic";
  inputTokenLimit: number;
  outputTokenLimit: number;
  supportsReasoning: boolean;
  supportsVerbosity: boolean;
}

const defaultModelForm: ModelFormState = {
  modelId: "",
  displayName: "",
  apiType: "openai",
  inputTokenLimit: 128000,
  outputTokenLimit: 4096,
  supportsReasoning: false,
  supportsVerbosity: false,
};

const SettingsModal: React.FC<SettingsModalProps> = ({
  isOpen,
  onClose,
  chatId,
  initialSystemPromptValue,
  onSettingsSaved,
  getAuthHeaders,
  showToast,
  onManualModelsChanged,
  onOpenSkillsModal,
}) => {
  // General settings
  const [systemPrompt, setSystemPrompt] = useState<string>("");

  // Provider settings
  const [customEndpoint, setCustomEndpoint] = useState<string>("");
  const [customApiKey, setCustomApiKey] = useState<string>("");
  const [hasExistingKey, setHasExistingKey] = useState<boolean>(false);
  const [isTestingConnection, setIsTestingConnection] = useState<boolean>(false);

  const [customAnthropicEndpoint, setCustomAnthropicEndpoint] = useState<string>("");
  const [customAnthropicApiKey, setCustomAnthropicApiKey] = useState<string>("");
  const [hasExistingAnthropicKey, setHasExistingAnthropicKey] = useState<boolean>(false);
  const [isTestingAnthropicConnection, setIsTestingAnthropicConnection] = useState<boolean>(false);

  // Manual custom models
  const [manualModels, setManualModels] = useState<ManualCustomModel[]>([]);
  const [isAddingModel, setIsAddingModel] = useState<"openai" | "anthropic" | null>(null);
  const [editingModelId, setEditingModelId] = useState<number | null>(null);
  const [modelForm, setModelForm] = useState<ModelFormState>({ ...defaultModelForm });
  const [isSavingModel, setIsSavingModel] = useState<boolean>(false);
  const [deletingModelId, setDeletingModelId] = useState<number | null>(null);

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
    customAnthropicEndpoint: "",
  });

  const fetchManualModels = async () => {
    try {
      const res = await fetch("/api/models/custom-models", { headers: getAuthHeaders() });
      if (!res.ok) return;
      const data = await res.json();
      if (data.models && Array.isArray(data.models)) {
        setManualModels(data.models);
      }
    } catch {
      // Silently fail, models will just be empty
    }
  };

  useEffect(() => {
    if (isOpen) {
      setIsLoading(true);
      setActiveTab("general");

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
              customAnthropicEndpoint: data.custom_anthropic_endpoint || "",
            };
            setSystemPrompt(settings.systemPrompt);
            setCustomEndpoint(settings.customEndpoint);
            setHasExistingKey(data.custom_openai_key_set || false);
            setCustomAnthropicEndpoint(settings.customAnthropicEndpoint);
            setHasExistingAnthropicKey(data.custom_anthropic_key_set || false);
            setInitialSettings(settings);
          })
          .catch((err) => {
            showToast(err.message, "error");
          })
          .finally(() => {
            setIsLoading(false);
          });

        fetchManualModels();
      }
    }
  }, [isOpen, chatId, initialSystemPromptValue, getAuthHeaders, showToast]);

  const resetModelForm = () => {
    setModelForm({ ...defaultModelForm });
    setIsAddingModel(null);
    setEditingModelId(null);
  };

  const handleAddModel = async () => {
    if (!modelForm.modelId.trim() || !modelForm.displayName.trim()) {
      showToast("Model ID and Display Name are required", "error");
      return;
    }

    setIsSavingModel(true);
    try {
      const response = await fetch("/api/models/custom-models", {
        method: "POST",
        headers: { "Content-Type": "application/json", ...getAuthHeaders() },
        body: JSON.stringify({
          modelId: modelForm.modelId.trim(),
          displayName: modelForm.displayName.trim(),
          apiType: modelForm.apiType,
          inputTokenLimit: modelForm.inputTokenLimit,
          outputTokenLimit: modelForm.outputTokenLimit,
          supportsReasoning: modelForm.supportsReasoning,
          supportsVerbosity: modelForm.supportsVerbosity,
        }),
      });

      if (!response.ok) {
        const errData = await response.json().catch(() => ({ error: "Failed to add model" }));
        throw new Error(errData.error || "Failed to add model");
      }

      await fetchManualModels();
      onManualModelsChanged?.();
      resetModelForm();
      showToast(`Model "${modelForm.displayName.trim()}" added successfully`, "success");
    } catch (err: unknown) {
      const errorMessage = err instanceof Error ? err.message : "Failed to add model";
      showToast(errorMessage, "error");
    } finally {
      setIsSavingModel(false);
    }
  };

  const handleUpdateModel = async () => {
    if (!editingModelId || !modelForm.modelId.trim() || !modelForm.displayName.trim()) {
      showToast("Model ID and Display Name are required", "error");
      return;
    }

    setIsSavingModel(true);
    try {
      const response = await fetch(`/api/models/custom-models/${editingModelId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json", ...getAuthHeaders() },
        body: JSON.stringify({
          modelId: modelForm.modelId.trim(),
          displayName: modelForm.displayName.trim(),
          apiType: modelForm.apiType,
          inputTokenLimit: modelForm.inputTokenLimit,
          outputTokenLimit: modelForm.outputTokenLimit,
          supportsReasoning: modelForm.supportsReasoning,
          supportsVerbosity: modelForm.supportsVerbosity,
        }),
      });

      if (!response.ok) {
        const errData = await response.json().catch(() => ({ error: "Failed to update model" }));
        throw new Error(errData.error || "Failed to update model");
      }

      await fetchManualModels();
      onManualModelsChanged?.();
      resetModelForm();
      showToast(`Model "${modelForm.displayName.trim()}" updated successfully`, "success");
    } catch (err: unknown) {
      const errorMessage = err instanceof Error ? err.message : "Failed to update model";
      showToast(errorMessage, "error");
    } finally {
      setIsSavingModel(false);
    }
  };

  const handleDeleteModel = async (modelId: number, displayName: string) => {
    setDeletingModelId(modelId);
    try {
      const response = await fetch(`/api/models/custom-models/${modelId}`, {
        method: "DELETE",
        headers: getAuthHeaders(),
      });

      if (!response.ok) {
        const errData = await response.json().catch(() => ({ error: "Failed to delete model" }));
        throw new Error(errData.error || "Failed to delete model");
      }

      setManualModels((prev) => prev.filter((m) => m.id !== modelId));
      onManualModelsChanged?.();
      showToast(`Model "${displayName}" removed`, "success");
    } catch (err: unknown) {
      const errorMessage = err instanceof Error ? err.message : "Failed to delete model";
      showToast(errorMessage, "error");
    } finally {
      setDeletingModelId(null);
    }
  };

  const startEditModel = (model: ManualCustomModel) => {
    setEditingModelId(model.id);
    setIsAddingModel(null);
    setModelForm({
      modelId: model.modelId,
      displayName: model.displayName,
      apiType: model.apiType,
      inputTokenLimit: model.inputTokenLimit,
      outputTokenLimit: model.outputTokenLimit,
      supportsReasoning: model.supportsReasoning,
      supportsVerbosity: model.supportsVerbosity,
    });
  };

  const startAddModel = (apiType: "openai" | "anthropic") => {
    setIsAddingModel(apiType);
    setEditingModelId(null);
    setModelForm({ ...defaultModelForm, apiType });
  };

  const handleTestConnection = async (apiType: "openai" | "anthropic") => {
    const endpoint = apiType === "openai" ? customEndpoint : customAnthropicEndpoint;
    const apiKey = apiType === "openai" ? customApiKey : customAnthropicApiKey;
    
    if (!endpoint.trim()) {
      showToast(`Please enter a valid ${apiType === "openai" ? "OpenAI" : "Anthropic"} endpoint URL`, "error");
      return;
    }

    if (apiType === "openai") {
      setIsTestingConnection(true);
    } else {
      setIsTestingAnthropicConnection(true);
    }
    
    try {
      const response = await fetch("/api/models/custom", {
        method: "POST",
        headers: { "Content-Type": "application/json", ...getAuthHeaders() },
        body: JSON.stringify({
          endpoint,
          apiKey: apiKey || undefined,
          apiType,
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
      if (apiType === "openai") {
        setIsTestingConnection(false);
      } else {
        setIsTestingAnthropicConnection(false);
      }
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
            customAnthropicEndpoint: customAnthropicEndpoint || null,
            customAnthropicKey: customAnthropicApiKey || null,
          }),
        });
      }

      if (!response.ok) {
        const errData = await response.json().catch(() => ({
          error: `Failed to save settings: ${response.statusText}`,
        }));
        throw new Error(errData.error || "Failed to save settings");
      }

      if (customApiKey) {
        setCustomApiKey("");
        setHasExistingKey(true);
      }
      if (customAnthropicApiKey) {
        setCustomAnthropicApiKey("");
        setHasExistingAnthropicKey(true);
      }

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
      setCustomAnthropicEndpoint(initialSettings.customAnthropicEndpoint);
      setCustomAnthropicApiKey("");
    }
    resetModelForm();
    onClose();
  };

  const hasGeneralChanges =
    systemPrompt !== initialSettings.systemPrompt;

  const hasProviderChanges =
    chatId === null &&
    (customEndpoint !== initialSettings.customEndpoint || 
     customApiKey.trim() !== "" ||
     customAnthropicEndpoint !== initialSettings.customAnthropicEndpoint || 
     customAnthropicApiKey.trim() !== "");

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

  const openaiManualModels = manualModels.filter((m) => m.apiType === "openai");
  const anthropicManualModels = manualModels.filter((m) => m.apiType === "anthropic");

  const renderModelForm = (apiType: "openai" | "anthropic") => {
    const isEditing = editingModelId !== null && modelForm.apiType === apiType;
    const isAdding = isAddingModel === apiType;

    if (!isEditing && !isAdding) return null;

    return (
      <motion.div
        initial={{ opacity: 0, height: 0 }}
        animate={{ opacity: 1, height: "auto" }}
        exit={{ opacity: 0, height: 0 }}
        transition={{ duration: 0.2 }}
        className="overflow-hidden"
      >
        <div className="mt-3 p-3 border border-neutral-200 dark:border-zinc-700 rounded-xl bg-neutral-50 dark:bg-zinc-900 space-y-3">
          <div>
            <label className="block text-sm font-medium text-neutral-700 dark:text-zinc-400 mb-1">
              Model ID <span className="text-red-500">*</span>
            </label>
            <input
              type="text"
              className="w-full p-3 border border-neutral-300 dark:border-zinc-700 rounded-xl
                shadow-sm text-sm bg-white dark:bg-zinc-950 text-black dark:text-zinc-100 placeholder-neutral-400
                dark:placeholder-zinc-500 focus:outline-none focus:border-blue-500 focus:ring-2
                focus:ring-blue-500 focus:ring-opacity-50 transition-all"
              value={modelForm.modelId}
              onChange={(e) => setModelForm((prev) => ({ ...prev, modelId: e.target.value }))}
              placeholder="e.g., llama-3.2-3b"
              disabled={isSavingModel}
            />
            <p className="text-xs text-neutral-500 dark:text-zinc-500 mt-1">
              The model identifier sent to the API endpoint.
            </p>
          </div>

          <div>
            <label className="block text-sm font-medium text-neutral-700 dark:text-zinc-400 mb-1">
              Display Name <span className="text-red-500">*</span>
            </label>
            <input
              type="text"
              className="w-full p-3 border border-neutral-300 dark:border-zinc-700 rounded-xl
                shadow-sm text-sm bg-white dark:bg-zinc-950 text-black dark:text-zinc-100 placeholder-neutral-400
                dark:placeholder-zinc-500 focus:outline-none focus:border-blue-500 focus:ring-2
                focus:ring-blue-500 focus:ring-opacity-50 transition-all"
              value={modelForm.displayName}
              onChange={(e) => setModelForm((prev) => ({ ...prev, displayName: e.target.value }))}
              placeholder="e.g., Llama 3.2 3B"
              disabled={isSavingModel}
            />
            <p className="text-xs text-neutral-500 dark:text-zinc-500 mt-1">
              The name shown in the model selector dropdown.
            </p>
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-sm font-medium text-neutral-700 dark:text-zinc-400 mb-1">
                Input Token Limit
              </label>
              <input
                type="number"
                className="w-full p-3 border border-neutral-300 dark:border-zinc-700 rounded-xl
                  shadow-sm text-sm bg-white dark:bg-zinc-950 text-black dark:text-zinc-100 placeholder-neutral-400
                  dark:placeholder-zinc-500 focus:outline-none focus:border-blue-500 focus:ring-2
                  focus:ring-blue-500 focus:ring-opacity-50 transition-all"
                value={modelForm.inputTokenLimit}
                onChange={(e) => setModelForm((prev) => ({ ...prev, inputTokenLimit: parseInt(e.target.value) || 128000 }))}
                disabled={isSavingModel}
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-neutral-700 dark:text-zinc-400 mb-1">
                Output Token Limit
              </label>
              <input
                type="number"
                className="w-full p-3 border border-neutral-300 dark:border-zinc-700 rounded-xl
                  shadow-sm text-sm bg-white dark:bg-zinc-950 text-black dark:text-zinc-100 placeholder-neutral-400
                  dark:placeholder-zinc-500 focus:outline-none focus:border-blue-500 focus:ring-2
                  focus:ring-blue-500 focus:ring-opacity-50 transition-all"
                value={modelForm.outputTokenLimit}
                onChange={(e) => setModelForm((prev) => ({ ...prev, outputTokenLimit: parseInt(e.target.value) || 4096 }))}
                disabled={isSavingModel}
              />
            </div>
          </div>

          <div className="flex items-center gap-6">
            <label className="flex items-center gap-2 cursor-pointer">
              <input
                type="checkbox"
                className="size-4 rounded border-neutral-300 dark:border-zinc-600 text-blue-600 dark:text-blue-500
                  focus:ring-blue-500 focus:ring-opacity-50 bg-white dark:bg-zinc-950"
                checked={modelForm.supportsReasoning}
                onChange={(e) => setModelForm((prev) => ({ ...prev, supportsReasoning: e.target.checked }))}
                disabled={isSavingModel}
              />
              <span className="text-sm text-neutral-700 dark:text-zinc-400">Reasoning</span>
            </label>
            <label className="flex items-center gap-2 cursor-pointer">
              <input
                type="checkbox"
                className="size-4 rounded border-neutral-300 dark:border-zinc-600 text-blue-600 dark:text-blue-500
                  focus:ring-blue-500 focus:ring-opacity-50 bg-white dark:bg-zinc-950"
                checked={modelForm.supportsVerbosity}
                onChange={(e) => setModelForm((prev) => ({ ...prev, supportsVerbosity: e.target.checked }))}
                disabled={isSavingModel}
              />
              <span className="text-sm text-neutral-700 dark:text-zinc-400">Verbosity</span>
            </label>
          </div>

          <div className="flex items-center gap-2 pt-1">
            <button
              type="button"
              onClick={isEditing ? handleUpdateModel : handleAddModel}
              disabled={isSavingModel || !modelForm.modelId.trim() || !modelForm.displayName.trim()}
              className="flex items-center gap-2 cursor-pointer h-9 px-4 rounded-full text-sm font-medium
                transition-colors bg-black dark:bg-blue-600 text-white border border-transparent shadow-sm
                hover:bg-neutral-600 dark:hover:bg-blue-700 focus:outline-none disabled:opacity-50 disabled:cursor-not-allowed"
            >
              {isSavingModel ? (
                <>
                  <motion.div
                    animate={{ rotate: 360 }}
                    transition={{ duration: 1, repeat: Infinity, ease: "linear" }}
                  >
                    <RefreshCw className="size-4" />
                  </motion.div>
                  Saving...
                </>
              ) : isEditing ? "Update Model" : "Add Model"}
            </button>
            <button
              type="button"
              onClick={resetModelForm}
              disabled={isSavingModel}
              className="cursor-pointer h-9 px-4 rounded-full text-sm font-medium transition-colors bg-white
                dark:bg-zinc-900 border border-neutral-300 dark:border-zinc-800 hover:bg-neutral-100
                dark:hover:bg-zinc-800 text-neutral-500 dark:text-zinc-300 focus:outline-none
                disabled:opacity-50"
            >
              Cancel
            </button>
          </div>
        </div>
      </motion.div>
    );
  };

  const renderManualModelsSection = (apiType: "openai" | "anthropic", models: ManualCustomModel[]) => {
    const providerLabel = apiType === "openai" ? "OpenAI" : "Anthropic";
    const modelsForType = manualModels.filter((m) => m.apiType === apiType);
    const isFormVisible = (isAddingModel === apiType) || (editingModelId !== null && modelForm.apiType === apiType);

    return (
      <div className="mt-4 pt-4 border-t border-neutral-200 dark:border-zinc-800">
        <div className="flex items-center justify-between mb-3">
          <div>
            <h4 className="text-sm font-medium text-neutral-700 dark:text-zinc-400">
              Manually Defined Models
            </h4>
            <p className="text-xs text-neutral-500 dark:text-zinc-500 mt-0.5">
              Add models that aren&apos;t auto-detected, or override settings for fetched models.
            </p>
          </div>
          {!isFormVisible && (
            <button
              type="button"
              onClick={() => startAddModel(apiType)}
              className="flex items-center gap-1.5 cursor-pointer h-8 px-3 rounded-full text-xs font-medium
                transition-colors bg-purple-50 dark:bg-purple-900/20 border border-purple-200 dark:border-purple-800
                text-purple-700 dark:text-purple-400 hover:bg-purple-100 dark:hover:bg-purple-900/30
                focus:outline-none"
            >
              <Plus className="size-3.5" />
              Add Model
            </button>
          )}
        </div>

        <AnimatePresence>
          {renderModelForm(apiType)}
        </AnimatePresence>

        {modelsForType.length > 0 ? (
          <div className="space-y-2 mt-3">
            {modelsForType.map((model) => (
              <div
                key={model.id}
                className="flex items-center justify-between p-3 border border-neutral-200 dark:border-zinc-800
                  rounded-xl bg-white dark:bg-zinc-950 hover:bg-neutral-50 dark:hover:bg-zinc-900 transition-colors"
              >
                <div className="flex flex-col min-w-0 flex-1">
                  <div className="flex items-center gap-2">
                    <span className="text-sm font-medium text-neutral-900 dark:text-zinc-100 truncate">
                      {model.displayName}
                    </span>
                    <span className="text-xs font-mono text-neutral-500 dark:text-zinc-500 truncate">
                      {model.modelId}
                    </span>
                  </div>
                  <div className="flex items-center gap-2 mt-1">
                    <span className="text-xs text-neutral-500 dark:text-zinc-500">
                      {(model.inputTokenLimit / 1000).toFixed(0)}K in / {(model.outputTokenLimit / 1000).toFixed(0)}K out
                    </span>
                    {model.supportsReasoning && (
                      <span className="text-[10px] px-1.5 py-0.5 rounded-full bg-blue-100 dark:bg-blue-900/30 text-blue-700 dark:text-blue-400 font-medium">
                        Reasoning
                      </span>
                    )}
                    {model.supportsVerbosity && (
                      <span className="text-[10px] px-1.5 py-0.5 rounded-full bg-green-100 dark:bg-green-900/30 text-green-700 dark:text-green-400 font-medium">
                        Verbosity
                      </span>
                    )}
                  </div>
                  {chatId !== null && (
                    <div className="pt-4 border-t border-neutral-200 dark:border-zinc-800">
                      <div className="flex items-center gap-2">
                        <button
                          type="button"
                          onClick={onOpenSkillsModal}
                          className="flex items-center gap-2 cursor-pointer h-9 px-4 rounded-full text-sm font-medium
                            transition-colors bg-white dark:bg-zinc-900 border border-neutral-300 dark:border-zinc-700
                            hover:bg-neutral-100 dark:hover:bg-zinc-800 text-neutral-700 dark:text-zinc-300
                            focus:outline-none"
                        >
                          <BookOpen className="size-4" />
                          Manage Skills
                        </button>
                      </div>
                      <p className="text-xs text-neutral-500 dark:text-zinc-500 mt-2">
                        Skills are additional instructions appended to the system prompt for this chat.
                      </p>
                    </div>
                  )}
                </div>
                <div className="flex items-center gap-1 ml-2 flex-shrink-0">
                  <button
                    type="button"
                    onClick={() => startEditModel(model)}
                    className="p-1.5 rounded-lg text-neutral-400 hover:text-neutral-600 dark:hover:text-zinc-300
                      hover:bg-neutral-100 dark:hover:bg-zinc-800 transition-colors cursor-pointer"
                    title="Edit model"
                  >
                    <Pencil className="size-3.5" />
                  </button>
                  <button
                    type="button"
                    onClick={() => handleDeleteModel(model.id, model.displayName)}
                    disabled={deletingModelId === model.id}
                    className="p-1.5 rounded-lg text-neutral-400 hover:text-red-600 dark:hover:text-red-400
                      hover:bg-red-50 dark:hover:bg-red-900/20 transition-colors cursor-pointer
                      disabled:opacity-50 disabled:cursor-not-allowed"
                    title="Delete model"
                  >
                    {deletingModelId === model.id ? (
                      <motion.div
                        animate={{ rotate: 360 }}
                        transition={{ duration: 1, repeat: Infinity, ease: "linear" }}
                      >
                        <RefreshCw className="size-3.5" />
                      </motion.div>
                    ) : (
                      <Trash2 className="size-3.5" />
                    )}
                  </button>
                </div>
              </div>
            ))}
          </div>
        ) : (
          !isFormVisible && (
            <p className="text-xs text-neutral-400 dark:text-zinc-500 italic mt-2">
              No manually defined models yet. Add one or fetch from the {providerLabel}-compatible provider above.
            </p>
          )
        )}
      </div>
    );
  };

  return (
    <AnimatePresence>
      {isOpen && (
        <Modal isOpen={isOpen} onClose={handleCancel} title={modalTitle} size="xl">
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
            <div className="flex-1 overflow-y-auto min-h-0 px-1 pr-2 scrollbar-thin scrollbar-thumb-neutral-300 dark:scrollbar-thumb-zinc-700">
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
                  {chatId !== null && (
                    <div className="pt-4 border-t border-neutral-200 dark:border-zinc-800">
                      <div className="flex items-center gap-2">
                        <button
                          type="button"
                          onClick={onOpenSkillsModal}
                          className="flex items-center gap-2 cursor-pointer h-9 px-4 rounded-full text-sm font-medium
                            transition-colors bg-white dark:bg-zinc-900 border border-neutral-300 dark:border-zinc-700
                            hover:bg-neutral-100 dark:hover:bg-zinc-800 text-neutral-700 dark:text-zinc-300
                            focus:outline-none"
                        >
                          <BookOpen className="size-4" />
                          Manage Skills
                        </button>
                      </div>
                      <p className="text-xs text-neutral-500 dark:text-zinc-500 mt-2">
                        Skills are additional instructions appended to the system prompt for this chat.
                      </p>
                    </div>
                  )}
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

                  <div className="pt-2 border-b border-neutral-200 dark:border-zinc-800 pb-6">
                    <button
                      type="button"
                      onClick={() => handleTestConnection("openai")}
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
                          Test OpenAI Connection & Fetch Models
                        </>
                      )}
                    </button>
                  </div>

                  {renderManualModelsSection("openai", openaiManualModels)}

                  <div>
                    <h3 className="text-sm font-medium text-neutral-700 dark:text-zinc-400 mb-1">
                      Custom Anthropic-compatible Provider
                    </h3>
                    <p className="text-xs text-neutral-500 dark:text-zinc-500 mb-4">
                      Configure a local or self-hosted Anthropic-compatible API.
                    </p>
                  </div>

                  <div>
                    <label className="block text-sm font-medium text-neutral-700 dark:text-zinc-400">
                      Base URL
                    </label>
                    <p className="text-xs text-neutral-500 dark:text-zinc-500 mb-2 mt-1">
                      The base URL of your Anthropic-compatible API endpoint.
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
                        value={customAnthropicEndpoint}
                        onChange={(e) => setCustomAnthropicEndpoint(e.target.value)}
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
                      {hasExistingAnthropicKey
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
                        value={customAnthropicApiKey}
                        onChange={(e) => setCustomAnthropicApiKey(e.target.value)}
                        placeholder={hasExistingAnthropicKey ? "Leave empty to keep existing key" : "Optional API key"}
                        disabled={isLoading}
                      />
                    )}
                  </div>

                  <div className="pt-2 border-b border-neutral-200 dark:border-zinc-800 pb-6">
                    <button
                      type="button"
                      onClick={() => handleTestConnection("anthropic")}
                      disabled={isLoading || isTestingAnthropicConnection || !customAnthropicEndpoint.trim()}
                      className="flex items-center gap-2 cursor-pointer h-9 px-4 rounded-full text-sm font-medium
                        transition-colors bg-neutral-100 dark:bg-zinc-800 border border-neutral-300 dark:border-zinc-700
                        hover:bg-neutral-200 dark:hover:bg-zinc-700 text-neutral-700 dark:text-zinc-300
                        focus:outline-none disabled:opacity-50 disabled:cursor-not-allowed"
                    >
                      {isTestingAnthropicConnection ? (
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
                          Test Anthropic Connection & Fetch Models
                        </>
                      )}
                    </button>
                  </div>

                  {renderManualModelsSection("anthropic", anthropicManualModels)}
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