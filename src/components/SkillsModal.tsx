"use client";

import React, { useState, useEffect, useCallback } from "react";
import Modal from "./Modal";
import { ToastProps } from "./Toast";
import { Plus, Pencil, Trash2, RefreshCw, BookOpen } from "lucide-react";
import { AnimatePresence, motion } from "motion/react";

interface Skill {
  id: number;
  name: string;
  content: string;
  createdAt: string;
  updatedAt: string;
  isActiveGlobally: boolean;
}

interface SkillsModalProps {
  isOpen: boolean;
  onClose: () => void;
  chatId: number | null;
  getAuthHeaders: () => HeadersInit;
  showToast: (message: string, type?: ToastProps["type"]) => void;
}

const SkillsModal: React.FC<SkillsModalProps> = ({
  isOpen,
  onClose,
  chatId,
  getAuthHeaders,
  showToast,
}) => {
  const mode = chatId !== null ? "chat" : "global";

  const [skills, setSkills] = useState<Skill[]>([]);
  const [selectedSkillId, setSelectedSkillId] = useState<number | null>(null);
  const [editName, setEditName] = useState("");
  const [editContent, setEditContent] = useState("");
  const [activeSkillIds, setActiveSkillIds] = useState<number[]>([]);
  const [skillOverrideEnabled, setSkillOverrideEnabled] = useState(false);
  const [isLoading, setIsLoading] = useState(false);
  const [isSaving, setIsSaving] = useState(false);
  const [isCreating, setIsCreating] = useState(false);
  const [deletingSkillId, setDeletingSkillId] = useState<number | null>(null);

  const selectedSkill = skills.find((s) => s.id === selectedSkillId) || null;

  const fetchSkills = useCallback(async () => {
    setIsLoading(true);
    try {
      const res = await fetch("/api/skills", { headers: getAuthHeaders() });
      if (!res.ok) throw new Error("Failed to fetch skills");
      const data = await res.json();
      setSkills(data.skills || []);
    } catch (err) {
      const msg = err instanceof Error ? err.message : "Failed to fetch skills";
      showToast(msg, "error");
    } finally {
      setIsLoading(false);
    }
  }, [getAuthHeaders, showToast]);

  const fetchActivations = useCallback(async () => {
    try {
      const scope = mode === "chat" ? "chat" : "global";
      let url = `/api/skills/activations?scope=${scope}`;
      if (mode === "chat" && chatId) {
        url += `&chat_session_id=${chatId}`;
      }
      const res = await fetch(url, { headers: getAuthHeaders() });
      if (!res.ok) throw new Error("Failed to fetch activations");
      const data = await res.json();
      setActiveSkillIds(data.skillIds || []);
    } catch (err) {
      const msg = err instanceof Error ? err.message : "Failed to fetch activations";
      showToast(msg, "error");
    }
  }, [mode, chatId, getAuthHeaders, showToast]);

  const fetchSkillOverride = useCallback(async () => {
    if (mode !== "chat" || !chatId) return;
    try {
      const res = await fetch(`/api/chats/${chatId}`, { headers: getAuthHeaders() });
      if (!res.ok) throw new Error("Failed to fetch chat");
      const data = await res.json();
      setSkillOverrideEnabled(data.skillOverrideEnabled ?? false);
    } catch {
      // Default to false if we can't fetch
      setSkillOverrideEnabled(false);
    }
  }, [mode, chatId, getAuthHeaders]);

  useEffect(() => {
    if (isOpen) {
      fetchSkills().then(() => {
        fetchActivations();
      });
      fetchSkillOverride();
    }
  }, [isOpen, fetchSkills, fetchActivations, fetchSkillOverride]);

  useEffect(() => {
    if (selectedSkill) {
      setEditName(selectedSkill.name);
      setEditContent(selectedSkill.content);
    } else {
      setEditName("");
      setEditContent("");
    }
  }, [selectedSkill]);

  const handleToggleActivation = async (skillId: number) => {
    const isActive = activeSkillIds.includes(skillId);
    const newIds = isActive ? activeSkillIds.filter((id) => id !== skillId) : [...activeSkillIds, skillId];

    setActiveSkillIds(newIds);

    try {
      const scope = mode === "chat" ? "chat" : "global";
      const body: { scope: string; chatSessionId?: number; skillIds: number[] } = {
        scope,
        skillIds: newIds,
      };
      if (mode === "chat" && chatId) {
        body.chatSessionId = chatId;
      }

      const res = await fetch("/api/skills/activations", {
        method: "PUT",
        headers: { "Content-Type": "application/json", ...getAuthHeaders() },
        body: JSON.stringify(body),
      });

      if (!res.ok) {
        const errData = await res.json().catch(() => ({ error: "Failed to update activations" }));
        throw new Error(errData.error || "Failed to update activations");
      }
    } catch (err) {
      const msg = err instanceof Error ? err.message : "Failed to update activations";
      showToast(msg, "error");
      setActiveSkillIds(activeSkillIds);
    }
  };

  const handleCreateSkill = async () => {
    setIsCreating(true);
    try {
      const res = await fetch("/api/skills", {
        method: "POST",
        headers: { "Content-Type": "application/json", ...getAuthHeaders() },
        body: JSON.stringify({ name: "New Skill", content: "" }),
      });

      if (!res.ok) {
        const errData = await res.json().catch(() => ({ error: "Failed to create skill" }));
        throw new Error(errData.error || "Failed to create skill");
      }

      const newSkill = await res.json();
      await fetchSkills();
      setSelectedSkillId(newSkill.id);
      showToast("Skill created", "success");
    } catch (err) {
      const msg = err instanceof Error ? err.message : "Failed to create skill";
      showToast(msg, "error");
    } finally {
      setIsCreating(false);
    }
  };

  const handleSaveSkill = async () => {
    if (!selectedSkillId) return;
    if (!editName.trim()) {
      showToast("Skill name cannot be empty", "error");
      return;
    }

    setIsSaving(true);
    try {
      const res = await fetch(`/api/skills/${selectedSkillId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json", ...getAuthHeaders() },
        body: JSON.stringify({ name: editName.trim(), content: editContent }),
      });

      if (!res.ok) {
        const errData = await res.json().catch(() => ({ error: "Failed to save skill" }));
        throw new Error(errData.error || "Failed to save skill");
      }

      await fetchSkills();
      showToast("Skill saved", "success");
    } catch (err) {
      const msg = err instanceof Error ? err.message : "Failed to save skill";
      showToast(msg, "error");
    } finally {
      setIsSaving(false);
    }
  };

  const handleDeleteSkill = async (skillId: number, skillName: string) => {
    setDeletingSkillId(skillId);
    try {
      const res = await fetch(`/api/skills/${skillId}`, {
        method: "DELETE",
        headers: getAuthHeaders(),
      });

      if (!res.ok) {
        const errData = await res.json().catch(() => ({ error: "Failed to delete skill" }));
        throw new Error(errData.error || "Failed to delete skill");
      }

      if (selectedSkillId === skillId) {
        setSelectedSkillId(null);
      }
      await fetchSkills();
      await fetchActivations();
      showToast(`Skill "${skillName}" deleted`, "success");
    } catch (err) {
      const msg = err instanceof Error ? err.message : "Failed to delete skill";
      showToast(msg, "error");
    } finally {
      setDeletingSkillId(null);
    }
  };

  const handleSkillOverrideToggle = async (enabled: boolean) => {
    if (!chatId) return;
    setSkillOverrideEnabled(enabled);

    try {
      const res = await fetch(`/api/chats/${chatId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json", ...getAuthHeaders() },
        body: JSON.stringify({ skillOverrideEnabled: enabled }),
      });

      if (!res.ok) {
        throw new Error("Failed to update skill override");
      }

      if (enabled) {
        await fetchActivations();
      }
    } catch {
      setSkillOverrideEnabled(!enabled);
      showToast("Failed to update skill override setting", "error");
    }
  };

  const hasNameChanged = selectedSkill ? editName.trim() !== selectedSkill.name : false;
  const hasContentChanged = selectedSkill ? editContent !== selectedSkill.content : false;
  const hasChanges = hasNameChanged || hasContentChanged;

  const modalTitle = mode === "chat" ? "Chat Skills" : "Skills";

  return (
    <AnimatePresence>
      {isOpen && (
        <Modal isOpen={isOpen} onClose={onClose} title={modalTitle} size="xl">
          <div className="flex flex-col h-full">
            {mode === "chat" && (
              <div className="mb-4 pb-4 border-b border-neutral-200 dark:border-zinc-800">
                <label className="flex items-center gap-2 cursor-pointer">
                  <input
                    type="checkbox"
                    className="size-4 rounded border-neutral-300 dark:border-zinc-600 text-blue-600 dark:text-blue-500
                      focus:ring-blue-500 focus:ring-opacity-50 bg-white dark:bg-zinc-950"
                    checked={skillOverrideEnabled}
                    onChange={(e) => handleSkillOverrideToggle(e.target.checked)}
                  />
                  <span className="text-sm text-neutral-700 dark:text-zinc-400">
                    Use custom skills for this chat
                  </span>
                </label>
                {!skillOverrideEnabled && (
                  <p className="text-xs text-neutral-500 dark:text-zinc-500 mt-1 ml-6">
                    When disabled, global skills will be used.
                  </p>
                )}
              </div>
            )}

            <div className="flex flex-1 min-h-0 gap-4">
              {/* Left panel: skill list */}
              <div className="w-56 flex-shrink-0 flex flex-col border-r border-neutral-200 dark:border-zinc-800 pr-3">
                <button
                  type="button"
                  onClick={handleCreateSkill}
                  disabled={isCreating}
                  className="flex items-center gap-1.5 cursor-pointer h-8 px-3 rounded-full text-xs font-medium
                    transition-colors bg-purple-50 dark:bg-purple-900/20 border border-purple-200 dark:border-purple-800
                    text-purple-700 dark:text-purple-400 hover:bg-purple-100 dark:hover:bg-purple-900/30
                    focus:outline-none disabled:opacity-50 mb-2"
                >
                  {isCreating ? (
                    <motion.div
                      animate={{ rotate: 360 }}
                      transition={{ duration: 1, repeat: Infinity, ease: "linear" }}
                    >
                      <RefreshCw className="size-3.5" />
                    </motion.div>
                  ) : (
                    <Plus className="size-3.5" />
                  )}
                  New Skill
                </button>

                <div className="flex-1 overflow-y-auto space-y-1 scrollbar-thin scrollbar-thumb-neutral-300 dark:scrollbar-thumb-zinc-700">
                  {isLoading ? (
                    <div className="space-y-2">
                      {[1, 2, 3].map((i) => (
                        <div key={i} className="h-8 bg-neutral-100 dark:bg-zinc-800 rounded-lg animate-pulse" />
                      ))}
                    </div>
                  ) : skills.length === 0 ? (
                    <p className="text-xs text-neutral-400 dark:text-zinc-500 italic">
                      No skills yet. Create one to get started.
                    </p>
                  ) : (
                    skills.map((skill) => (
                      <div
                        key={skill.id}
                        className={`flex items-center gap-2 p-2 rounded-lg cursor-pointer transition-colors text-sm
                          ${selectedSkillId === skill.id
                            ? "bg-blue-50 dark:bg-blue-900/20 text-blue-700 dark:text-blue-400"
                            : "hover:bg-neutral-100 dark:hover:bg-zinc-800 text-neutral-700 dark:text-zinc-300"
                          }`}
                        onClick={() => setSelectedSkillId(skill.id)}
                      >
                        <input
                          type="checkbox"
                          className="size-3.5 rounded border-neutral-300 dark:border-zinc-600 text-blue-600 dark:text-blue-500
                            focus:ring-blue-500 focus:ring-opacity-50 bg-white dark:bg-zinc-950 cursor-pointer"
                          checked={activeSkillIds.includes(skill.id)}
                          onChange={(e) => {
                            e.stopPropagation();
                            handleToggleActivation(skill.id);
                          }}
                          disabled={mode === "chat" && !skillOverrideEnabled}
                        />
                        <span className="truncate flex-1">{skill.name}</span>
                      </div>
                    ))
                  )}
                </div>
              </div>

              {/* Right panel: skill detail/editor */}
              <div className="flex-1 flex flex-col min-h-0">
                {selectedSkill ? (
                  <>
                    <div className="mb-3">
                      <label className="block text-sm font-medium text-neutral-700 dark:text-zinc-400 mb-1">
                        Name
                      </label>
                      <input
                        type="text"
                        className="w-full p-2.5 border border-neutral-300 dark:border-zinc-700 rounded-xl
                          shadow-sm text-sm bg-white dark:bg-zinc-950 text-black dark:text-zinc-100 placeholder-neutral-400
                          dark:placeholder-zinc-500 focus:outline-none focus:border-blue-500 focus:ring-2
                          focus:ring-blue-500 focus:ring-opacity-50 transition-all"
                        value={editName}
                        onChange={(e) => setEditName(e.target.value)}
                        placeholder="Skill name"
                      />
                    </div>
                    <div className="flex-1 min-h-0 flex flex-col">
                      <label className="block text-sm font-medium text-neutral-700 dark:text-zinc-400 mb-1">
                        Content
                      </label>
                      <textarea
                        className="flex-1 resize-none p-2.5 border border-neutral-300 dark:border-zinc-700 rounded-xl
                          shadow-sm text-sm bg-white dark:bg-zinc-950 text-black dark:text-zinc-100 placeholder-neutral-400
                          dark:placeholder-zinc-500 focus:outline-none focus:border-blue-500 focus:ring-2
                          focus:ring-blue-500 focus:ring-opacity-50 transition-all font-mono"
                        value={editContent}
                        onChange={(e) => setEditContent(e.target.value)}
                        placeholder="Skill content (markdown supported)"
                      />
                    </div>
                    <div className="flex items-center gap-2 pt-3">
                      <button
                        type="button"
                        onClick={handleSaveSkill}
                        disabled={isSaving || !editName.trim() || !hasChanges}
                        className="flex items-center gap-2 cursor-pointer h-9 px-4 rounded-full text-sm font-medium
                          transition-colors bg-black dark:bg-blue-600 text-white border border-transparent shadow-sm
                          hover:bg-neutral-600 dark:hover:bg-blue-700 focus:outline-none disabled:opacity-50 disabled:cursor-not-allowed"
                      >
                        {isSaving ? (
                          <>
                            <motion.div
                              animate={{ rotate: 360 }}
                              transition={{ duration: 1, repeat: Infinity, ease: "linear" }}
                            >
                              <RefreshCw className="size-4" />
                            </motion.div>
                            Saving...
                          </>
                        ) : (
                          "Save"
                        )}
                      </button>
                      <button
                        type="button"
                        onClick={() => handleDeleteSkill(selectedSkill.id, selectedSkill.name)}
                        disabled={deletingSkillId === selectedSkill.id}
                        className="flex items-center gap-2 cursor-pointer h-9 px-4 rounded-full text-sm font-medium
                          transition-colors bg-white dark:bg-zinc-900 border border-red-300 dark:border-red-800
                          text-red-600 dark:text-red-400 hover:bg-red-50 dark:hover:bg-red-900/20
                          focus:outline-none disabled:opacity-50"
                      >
                        {deletingSkillId === selectedSkill.id ? (
                          <motion.div
                            animate={{ rotate: 360 }}
                            transition={{ duration: 1, repeat: Infinity, ease: "linear" }}
                          >
                            <RefreshCw className="size-4" />
                          </motion.div>
                        ) : (
                          <Trash2 className="size-4" />
                        )}
                        Delete
                      </button>
                    </div>
                  </>
                ) : (
                  <div className="flex-1 flex items-center justify-center text-neutral-400 dark:text-zinc-500">
                    <div className="text-center">
                      <BookOpen className="size-12 mx-auto mb-2 opacity-30" />
                      <p className="text-sm">Select a skill to edit or create a new one</p>
                    </div>
                  </div>
                )}
              </div>
            </div>

            <div className="flex justify-end pt-4 border-t border-neutral-200 dark:border-zinc-800 mt-4">
              <button
                type="button"
                onClick={onClose}
                className="cursor-pointer h-9 px-4 rounded-full text-sm font-medium transition-colors bg-white
                  dark:bg-zinc-900 border border-neutral-300 dark:border-zinc-800 hover:bg-neutral-100
                  dark:hover:bg-zinc-800 text-neutral-500 dark:text-zinc-300 focus:outline-none"
              >
                Close
              </button>
            </div>
          </div>
        </Modal>
      )}
    </AnimatePresence>
  );
};

export default SkillsModal;