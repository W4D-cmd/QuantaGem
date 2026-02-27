"use client";

import React, { useEffect, useState, useRef } from "react";
import { ProjectListItem } from "@/app/page";
import { SparklesIcon, PlusIcon, TrashIcon, ArrowsUpDownIcon } from "@heroicons/react/24/outline";
import { motion, AnimatePresence, Reorder } from "framer-motion";
import AddSuggestionModal, { getIconComponent } from "./AddSuggestionModal";
import ConfirmationModal from "./ConfirmationModal";

export interface UserSuggestion {
  id: number;
  title: string;
  prompt: string;
  icon: string;
  sort_order: number;
}

interface NewChatScreenProps {
  systemPrompt: string;
  onSystemPromptChange: (value: string) => void;
  projectId: number | null;
  projects: ProjectListItem[];
  getAuthHeaders: () => HeadersInit;
  suggestionsVersion?: number;
}

const LONG_PRESS_DURATION = 500;
const WOBBLE_DURATION = 0.3;

const NewChatScreen: React.FC<NewChatScreenProps> = ({
  systemPrompt,
  onSystemPromptChange,
  projectId,
  projects,
  getAuthHeaders,
  suggestionsVersion = 0,
}) => {
  const projectName = projectId ? projects.find((p) => p.id === projectId)?.title : null;
  const [suggestions, setSuggestions] = useState<UserSuggestion[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [isAddModalOpen, setIsAddModalOpen] = useState(false);
  const [isDeleteModalOpen, setIsDeleteModalOpen] = useState(false);
  const [suggestionToDelete, setSuggestionToDelete] = useState<UserSuggestion | null>(null);
  const [isEditMode, setIsEditMode] = useState(false);
  const [draggedId, setDraggedId] = useState<number | null>(null);
  const longPressTimerRef = useRef<NodeJS.Timeout | null>(null);
  const isSavingRef = useRef(false);

  useEffect(() => {
    fetchSuggestions();
  }, [suggestionsVersion]);

  const fetchSuggestions = async () => {
    setIsLoading(true);
    try {
      const response = await fetch("/api/suggestions", {
        headers: getAuthHeaders(),
      });
      if (response.ok) {
        const data: UserSuggestion[] = await response.json();
        setSuggestions(data);
      }
    } catch (error) {
      console.error("Failed to fetch suggestions:", error);
    } finally {
      setIsLoading(false);
    }
  };

  const handleAddSuggestion = async (title: string, prompt: string, icon: string) => {
    try {
      const response = await fetch("/api/suggestions", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          ...getAuthHeaders(),
        },
        body: JSON.stringify({ title, prompt, icon }),
      });
      if (response.ok) {
        const newSuggestion: UserSuggestion = await response.json();
        setSuggestions((prev) => [...prev, newSuggestion]);
      }
    } catch (error) {
      console.error("Failed to add suggestion:", error);
    }
  };

  const handleDeleteSuggestion = async () => {
    if (!suggestionToDelete) return;
    try {
      const response = await fetch("/api/suggestions", {
        method: "DELETE",
        headers: {
          "Content-Type": "application/json",
          ...getAuthHeaders(),
        },
        body: JSON.stringify({ id: suggestionToDelete.id }),
      });
      if (response.ok) {
        setSuggestions((prev) => prev.filter((s) => s.id !== suggestionToDelete.id));
      }
    } catch (error) {
      console.error("Failed to delete suggestion:", error);
    } finally {
      setSuggestionToDelete(null);
    }
  };

  const saveOrderToDb = async (orderedIds: number[]) => {
    if (isSavingRef.current) return;
    isSavingRef.current = true;
    try {
      await fetch("/api/suggestions", {
        method: "PATCH",
        headers: {
          "Content-Type": "application/json",
          ...getAuthHeaders(),
        },
        body: JSON.stringify({ orderedIds }),
      });
    } catch (error) {
      console.error("Failed to save order:", error);
    } finally {
      isSavingRef.current = false;
    }
  };

  const handleReorder = (newOrder: UserSuggestion[]) => {
    setSuggestions(newOrder);
    const orderedIds = newOrder.map((s) => s.id);
    saveOrderToDb(orderedIds);
  };

  const openDeleteConfirm = (suggestion: UserSuggestion, e: React.MouseEvent) => {
    e.stopPropagation();
    setSuggestionToDelete(suggestion);
    setIsDeleteModalOpen(true);
  };

  const startLongPress = () => {
    if (isEditMode) return;
    longPressTimerRef.current = setTimeout(() => {
      setIsEditMode(true);
    }, LONG_PRESS_DURATION);
  };

  const cancelLongPress = () => {
    if (longPressTimerRef.current) {
      clearTimeout(longPressTimerRef.current);
      longPressTimerRef.current = null;
    }
  };

  const handleSuggestionClick = (suggestion: UserSuggestion) => {
    if (isEditMode) return;
    onSystemPromptChange(suggestion.prompt);
  };

  const exitEditMode = () => {
    setIsEditMode(false);
    setDraggedId(null);
  };

  return (
    <>
      <div className="w-full min-h-full flex flex-col items-center justify-center p-4 pb-40">
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.5, ease: "easeOut" }}
          className="w-full max-w-3xl"
        >
          <div
            className="bg-white dark:bg-zinc-900 border border-neutral-200 dark:border-zinc-800 rounded-2xl
            shadow-lg p-8 text-center"
          >
            <div
              className="mx-auto flex items-center justify-center size-16 rounded-full bg-blue-100 dark:bg-blue-900/50
              mb-6"
            >
              <SparklesIcon className="size-8 text-blue-600/80 dark:text-blue-400/90" />
            </div>

            <h1 className="text-3xl font-bold text-neutral-800 dark:text-zinc-300 mb-2">Start a new conversation</h1>
            {projectName ? (
              <p className="text-md text-neutral-500 dark:text-zinc-500 mb-8">
                For project: <span className="font-semibold">{projectName}</span>
              </p>
            ) : (
              <p className="text-md text-neutral-500 dark:text-zinc-500 mb-8">How can I help you today?</p>
            )}

            <div className="text-left w-full mb-8">
              <label
                htmlFor="new-chat-system-prompt"
                className="block text-sm font-medium text-neutral-700 dark:text-zinc-400 mb-2"
              >
                System Prompt (Optional)
              </label>
              <textarea
                id="new-chat-system-prompt"
                rows={3}
                value={systemPrompt}
                onChange={(e) => onSystemPromptChange(e.target.value)}
                className="w-full p-3 border border-neutral-300 dark:border-zinc-700 rounded-xl bg-neutral-50
                dark:bg-zinc-800/50 text-neutral-900 dark:text-zinc-100 resize-none focus:outline-none
                focus:border-blue-500 focus:ring-2 focus:ring-blue-500 focus:ring-opacity-50 transition-all duration-300
                ease-in-out"
                placeholder="Define the AI's behavior for this chat..."
              />
            </div>

            <div className="flex items-center justify-between mb-3">
              <span className="text-sm font-medium text-neutral-700 dark:text-zinc-400">Suggestions</span>
              <AnimatePresence>
                {isEditMode && (
                  <motion.button
                    initial={{ opacity: 0, scale: 0.8 }}
                    animate={{ opacity: 1, scale: 1 }}
                    exit={{ opacity: 0, scale: 0.8 }}
                    onClick={exitEditMode}
                    className="text-sm text-blue-600 dark:text-blue-400 hover:text-blue-700 dark:hover:text-blue-300
                    font-medium cursor-pointer"
                  >
                    Done
                  </motion.button>
                )}
              </AnimatePresence>
            </div>

            <Reorder.Group
              axis="xy"
              values={suggestions}
              onReorder={handleReorder}
              as="div"
              className="grid grid-cols-1 md:grid-cols-3 gap-4 text-left"
            >
              {isLoading ? (
                <div className="col-span-full text-center text-neutral-500 dark:text-zinc-500 py-4">
                  Loading suggestions...
                </div>
              ) : (
                <>
                  <AnimatePresence>
                    {suggestions.map((suggestion) => (
                      <Reorder.Item
                        key={suggestion.id}
                        value={suggestion}
                        as="div"
                        onDragStart={() => setDraggedId(suggestion.id)}
                        onDragEnd={() => setDraggedId(null)}
                        className="contents"
                      >
                        <motion.div
                          animate={
                            isEditMode
                              ? {
                                  rotate: draggedId === suggestion.id ? 0 : [0, -1.5, 1.5, -1.5, 1.5, 0],
                                  scale: draggedId === suggestion.id ? 1.08 : 1.02,
                                }
                              : { rotate: 0, scale: 1 }
                          }
                          transition={
                            isEditMode && draggedId !== suggestion.id
                              ? { duration: WOBBLE_DURATION, repeat: Infinity, repeatDelay: Math.random() * 0.5 }
                              : { duration: 0.2 }
                          }
                          onMouseDown={startLongPress}
                          onMouseUp={cancelLongPress}
                          onMouseLeave={cancelLongPress}
                          onTouchStart={startLongPress}
                          onTouchEnd={cancelLongPress}
                          onClick={() => handleSuggestionClick(suggestion)}
                          className={`cursor-pointer p-4 border rounded-xl transition-colors duration-200 ease-in-out
                          group relative select-none ${
                            isEditMode
                              ? "border-blue-400 dark:border-blue-600 bg-blue-50/50 dark:bg-blue-900/20"
                              : "border-neutral-200 dark:border-zinc-800 hover:bg-neutral-100 dark:hover:bg-zinc-800/60"
                          } ${draggedId === suggestion.id ? "z-50 shadow-2xl" : ""}`}
                        >
                          {isEditMode && (
                            <motion.div
                              initial={{ opacity: 0, scale: 0.5 }}
                              animate={{ opacity: 1, scale: 1 }}
                              className="absolute -top-2 -left-2 size-6 rounded-full bg-blue-500 dark:bg-blue-600
                              flex items-center justify-center shadow-md"
                            >
                              <ArrowsUpDownIcon className="size-3.5 text-white" />
                            </motion.div>
                          )}
                          <button
                            onClick={(e) => openDeleteConfirm(suggestion, e)}
                            className={`cursor-pointer absolute top-2 right-2 p-1 rounded-lg
                            bg-neutral-200 dark:bg-zinc-700 hover:bg-red-100 dark:hover:bg-red-900/30
                            text-neutral-500 dark:text-zinc-400 hover:text-red-600 dark:hover:text-red-400
                            transition-all ${isEditMode ? "opacity-100" : "opacity-0 group-hover:opacity-100"}`}
                            title="Delete suggestion"
                          >
                            <TrashIcon className="size-4" />
                          </button>
                          <div className="flex items-center gap-3 mb-1">
                            {getIconComponent(suggestion.icon)}
                            <h4 className="font-semibold text-neutral-800 dark:text-zinc-300">{suggestion.title}</h4>
                          </div>
                          <p className="text-xs text-neutral-500 dark:text-zinc-500 line-clamp-3">
                            {suggestion.prompt}
                          </p>
                        </motion.div>
                      </Reorder.Item>
                    ))}
                  </AnimatePresence>
                  <motion.button
                    layout
                    onClick={() => setIsAddModalOpen(true)}
                    className="cursor-pointer p-4 border-2 border-dashed border-neutral-300 dark:border-zinc-700
                  rounded-xl hover:border-blue-500 dark:hover:border-blue-500 hover:bg-blue-50/50
                  dark:hover:bg-blue-900/20 transition-all duration-200 ease-in-out flex flex-col items-center
                  justify-center min-h-[120px]"
                  >
                    <PlusIcon className="size-8 text-neutral-400 dark:text-zinc-500 mb-2" />
                    <span className="text-sm text-neutral-500 dark:text-zinc-500">Add Suggestion</span>
                  </motion.button>
                </>
              )}
            </Reorder.Group>
          </div>
        </motion.div>
      </div>

      <AddSuggestionModal
        isOpen={isAddModalOpen}
        onClose={() => setIsAddModalOpen(false)}
        onSave={handleAddSuggestion}
        mode="add"
      />

      <ConfirmationModal
        isOpen={isDeleteModalOpen}
        onClose={() => {
          setIsDeleteModalOpen(false);
          setSuggestionToDelete(null);
        }}
        onConfirm={handleDeleteSuggestion}
        title="Delete Suggestion"
        message={
          <span>
            Are you sure you want to delete <strong>{suggestionToDelete?.title}</strong>? This action cannot be undone.
          </span>
        }
        confirmButtonText="Delete"
        cancelButtonText="Cancel"
      />
    </>
  );
};

export default NewChatScreen;
