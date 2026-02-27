"use client";

import React, { useState } from "react";
import Modal from "./Modal";
import {
  AcademicCapIcon,
  BeakerIcon,
  BookOpenIcon,
  BriefcaseIcon,
  BugAntIcon,
  CalculatorIcon,
  ChatBubbleLeftRightIcon,
  CodeBracketIcon,
  Cog6ToothIcon,
  DocumentTextIcon,
  GlobeAltIcon,
  LanguageIcon,
  LightBulbIcon,
  PaintBrushIcon,
  PencilSquareIcon,
  RocketLaunchIcon,
  ScaleIcon,
  SparklesIcon,
  WrenchScrewdriverIcon,
} from "@heroicons/react/24/outline";

export const AVAILABLE_ICONS = [
  { name: "SparklesIcon", component: <SparklesIcon className="size-5" /> },
  { name: "PencilSquareIcon", component: <PencilSquareIcon className="size-5" /> },
  { name: "CodeBracketIcon", component: <CodeBracketIcon className="size-5" /> },
  { name: "BeakerIcon", component: <BeakerIcon className="size-5" /> },
  { name: "BookOpenIcon", component: <BookOpenIcon className="size-5" /> },
  { name: "BriefcaseIcon", component: <BriefcaseIcon className="size-5" /> },
  { name: "ChatBubbleLeftRightIcon", component: <ChatBubbleLeftRightIcon className="size-5" /> },
  { name: "Cog6ToothIcon", component: <Cog6ToothIcon className="size-5" /> },
  { name: "DocumentTextIcon", component: <DocumentTextIcon className="size-5" /> },
  { name: "GlobeAltIcon", component: <GlobeAltIcon className="size-5" /> },
  { name: "LanguageIcon", component: <LanguageIcon className="size-5" /> },
  { name: "LightBulbIcon", component: <LightBulbIcon className="size-5" /> },
  { name: "PaintBrushIcon", component: <PaintBrushIcon className="size-5" /> },
  { name: "RocketLaunchIcon", component: <RocketLaunchIcon className="size-5" /> },
  { name: "ScaleIcon", component: <ScaleIcon className="size-5" /> },
] as const;

export type IconName = (typeof AVAILABLE_ICONS)[number]["name"];

export function getIconComponent(iconName: string): React.ReactNode {
  const icon = AVAILABLE_ICONS.find((i) => i.name === iconName);
  return icon ? icon.component : <SparklesIcon className="size-5" />;
}

interface AddSuggestionModalProps {
  isOpen: boolean;
  onClose: () => void;
  onSave: (title: string, prompt: string, icon: string) => void;
  initialTitle?: string;
  initialPrompt?: string;
  initialIcon?: string;
  mode?: "add" | "edit";
}

const AddSuggestionModal: React.FC<AddSuggestionModalProps> = ({
  isOpen,
  onClose,
  onSave,
  initialTitle = "",
  initialPrompt = "",
  initialIcon = "SparklesIcon",
  mode = "add",
}) => {
  const [title, setTitle] = useState(initialTitle);
  const [prompt, setPrompt] = useState(initialPrompt);
  const [selectedIcon, setSelectedIcon] = useState(initialIcon);
  const [error, setError] = useState<string | null>(null);

  React.useEffect(() => {
    if (isOpen) {
      setTitle(initialTitle);
      setPrompt(initialPrompt);
      setSelectedIcon(initialIcon);
      setError(null);
    }
  }, [isOpen, initialTitle, initialPrompt, initialIcon]);

  const handleSave = () => {
    if (!title.trim()) {
      setError("Title is required");
      return;
    }
    if (!prompt.trim()) {
      setError("Prompt is required");
      return;
    }
    onSave(title.trim(), prompt.trim(), selectedIcon);
    onClose();
  };

  return (
    <Modal
      isOpen={isOpen}
      onClose={onClose}
      title={mode === "add" ? "Add Suggestion" : "Edit Suggestion"}
      size="lg"
    >
      <div className="space-y-4">
        {error && (
          <div className="p-3 bg-red-100 dark:bg-red-900/30 border border-red-300 dark:border-red-700 rounded-lg text-red-700 dark:text-red-400 text-sm">
            {error}
          </div>
        )}

        <div>
          <label
            htmlFor="suggestion-title"
            className="block text-sm font-medium text-neutral-700 dark:text-zinc-300 mb-1"
          >
            Title
          </label>
          <input
            id="suggestion-title"
            type="text"
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            className="w-full p-3 border border-neutral-300 dark:border-zinc-700 rounded-xl bg-white dark:bg-zinc-800
              text-neutral-900 dark:text-zinc-100 focus:outline-none focus:border-blue-500 focus:ring-2
              focus:ring-blue-500 focus:ring-opacity-50 transition-all"
            placeholder="e.g., Code Reviewer"
          />
        </div>

        <div>
          <label
            htmlFor="suggestion-prompt"
            className="block text-sm font-medium text-neutral-700 dark:text-zinc-300 mb-1"
          >
            System Prompt
          </label>
          <textarea
            id="suggestion-prompt"
            rows={5}
            value={prompt}
            onChange={(e) => setPrompt(e.target.value)}
            className="w-full p-3 border border-neutral-300 dark:border-zinc-700 rounded-xl bg-white dark:bg-zinc-800
              text-neutral-900 dark:text-zinc-100 resize-none focus:outline-none focus:border-blue-500 focus:ring-2
              focus:ring-blue-500 focus:ring-opacity-50 transition-all"
            placeholder="Define the AI's behavior..."
          />
        </div>

        <div>
          <label className="block text-sm font-medium text-neutral-700 dark:text-zinc-300 mb-2">Icon</label>
          <div className="grid grid-cols-5 gap-2">
            {AVAILABLE_ICONS.map((icon) => (
              <button
                key={icon.name}
                type="button"
                onClick={() => setSelectedIcon(icon.name)}
                className={`cursor-pointer p-3 rounded-xl border transition-all flex items-center justify-center ${
                  selectedIcon === icon.name
                    ? "border-blue-500 bg-blue-50 dark:bg-blue-900/30 ring-2 ring-blue-500"
                    : "border-neutral-300 dark:border-zinc-700 hover:bg-neutral-100 dark:hover:bg-zinc-800"
                }`}
              >
                {icon.component}
              </button>
            ))}
          </div>
        </div>

        <div className="flex justify-end gap-3 pt-4">
          <button
            type="button"
            onClick={onClose}
            className="cursor-pointer h-9 px-4 rounded-full text-sm font-medium transition-colors bg-white
              dark:bg-zinc-900 border border-neutral-300 dark:border-zinc-800 hover:bg-neutral-100
              dark:hover:bg-zinc-800 text-neutral-500 dark:text-zinc-300 focus:outline-none"
          >
            Cancel
          </button>
          <button
            type="button"
            onClick={handleSave}
            className="cursor-pointer h-9 px-4 rounded-full text-sm font-medium transition-colors bg-black
              dark:bg-blue-600 text-white border border-transparent shadow-sm hover:bg-neutral-600
              dark:hover:bg-blue-700 focus:outline-none"
          >
            {mode === "add" ? "Add" : "Save"}
          </button>
        </div>
      </div>
    </Modal>
  );
};

export default AddSuggestionModal;
