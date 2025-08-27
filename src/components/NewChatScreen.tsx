"use client";

import React from "react";
import { ProjectListItem } from "@/app/page";
import { SparklesIcon, PencilSquareIcon, CodeBracketIcon, LanguageIcon } from "@heroicons/react/24/outline";
import { motion } from "framer-motion";

interface NewChatScreenProps {
  systemPrompt: string;
  onSystemPromptChange: (value: string) => void;
  projectId: number | null;
  projects: ProjectListItem[];
}

const promptSuggestions = [
  {
    icon: <PencilSquareIcon className="size-5" />,
    title: "Creative Writer",
    prompt:
      "You are a creative writer. Your goal is to write compelling, imaginative, and emotionally resonant stories.",
  },
  {
    icon: <CodeBracketIcon className="size-5" />,
    title: "Code Assistant",
    prompt:
      "You are an expert programmer. Provide only code snippets in your responses, without any additional explanations or markdown formatting.",
  },
  {
    icon: <LanguageIcon className="size-5" />,
    title: "Formal Translator",
    prompt: "You are a professional translator. Translate the user's text into formal German with perfect grammar.",
  },
];

const NewChatScreen: React.FC<NewChatScreenProps> = ({ systemPrompt, onSystemPromptChange, projectId, projects }) => {
  const projectName = projectId ? projects.find((p) => p.id === projectId)?.title : null;

  return (
    <div className="flex-1 flex flex-col items-center justify-center p-4">
      <motion.div
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.5, ease: "easeOut" }}
        className="w-full max-w-3xl"
      >
        <div
          className="bg-white dark:bg-neutral-900 border border-neutral-200 dark:border-neutral-800 rounded-2xl
            shadow-lg p-8 text-center"
        >
          <div
            className="mx-auto flex items-center justify-center size-16 rounded-full bg-blue-100 dark:bg-blue-900/50
              mb-6"
          >
            <SparklesIcon className="size-8 text-blue-600/80 dark:text-blue-400/90" />
          </div>

          <h1 className="text-3xl font-bold text-neutral-800 dark:text-neutral-200 mb-2">Start a new conversation</h1>
          {projectName ? (
            <p className="text-md text-neutral-500 dark:text-neutral-400 mb-8">
              For project: <span className="font-semibold">{projectName}</span>
            </p>
          ) : (
            <p className="text-md text-neutral-500 dark:text-neutral-400 mb-8">How can I help you today?</p>
          )}

          <div className="text-left w-full mb-8">
            <label
              htmlFor="new-chat-system-prompt"
              className="block text-sm font-medium text-neutral-700 dark:text-neutral-300 mb-2"
            >
              System Prompt (Optional)
            </label>
            <textarea
              id="new-chat-system-prompt"
              rows={3}
              value={systemPrompt}
              onChange={(e) => onSystemPromptChange(e.target.value)}
              className="w-full p-3 border border-neutral-300 dark:border-neutral-700 rounded-xl bg-neutral-50
                dark:bg-neutral-800/50 text-neutral-900 dark:text-white resize-none focus:outline-none
                focus:border-blue-500 focus:ring-2 focus:ring-blue-500 focus:ring-opacity-50 transition-all duration-300
                ease-in-out"
              placeholder="Define the AI's behavior for this chat..."
            />
          </div>

          <div className="grid grid-cols-1 md:grid-cols-3 gap-4 text-left">
            {promptSuggestions.map((suggestion) => (
              <button
                key={suggestion.title}
                onClick={() => onSystemPromptChange(suggestion.prompt)}
                className="cursor-pointer p-4 border border-neutral-200 dark:border-neutral-800 rounded-xl
                  hover:bg-neutral-100 dark:hover:bg-neutral-800/60 transition-colors duration-200 ease-in-out group"
              >
                <div className="flex items-center gap-3 mb-1">
                  {suggestion.icon}
                  <h4 className="font-semibold text-neutral-800 dark:text-neutral-200">{suggestion.title}</h4>
                </div>
                <p className="text-xs text-neutral-500 dark:text-neutral-400">{suggestion.prompt}</p>
              </button>
            ))}
          </div>
        </div>
      </motion.div>
    </div>
  );
};

export default NewChatScreen;
