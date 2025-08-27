"use client";

import React from "react";
import { ProjectListItem } from "@/app/page";

interface NewChatScreenProps {
  systemPrompt: string;
  onSystemPromptChange: (value: string) => void;
  projectId: number | null;
  projects: ProjectListItem[];
}

const NewChatScreen: React.FC<NewChatScreenProps> = ({ systemPrompt, onSystemPromptChange, projectId, projects }) => {
  const projectName = projectId ? projects.find((p) => p.id === projectId)?.title : null;

  return (
    <div className="flex-1 flex flex-col items-center justify-center text-center p-4">
      <div className="max-w-2xl w-full">
        <h1 className="text-3xl font-bold text-neutral-800 dark:text-neutral-200 mb-2">New Chat</h1>
        {projectName && (
          <p className="text-md text-neutral-500 dark:text-neutral-400 mb-8">
            For project: <span className="font-semibold">{projectName}</span>
          </p>
        )}

        <div className="text-left w-full">
          <label
            htmlFor="new-chat-system-prompt"
            className="block text-sm font-medium text-neutral-700 dark:text-neutral-300 mb-2"
          >
            System Prompt (Optional)
          </label>
          <textarea
            id="new-chat-system-prompt"
            rows={4}
            value={systemPrompt}
            onChange={(e) => onSystemPromptChange(e.target.value)}
            className="w-full p-3 border border-neutral-300 dark:border-neutral-700 rounded-xl bg-white
              dark:bg-neutral-900 text-neutral-900 dark:text-white resize-y focus:outline-none focus:border-blue-500
              focus:ring-2 focus:ring-blue-500 focus:ring-opacity-50 transition-all duration-300 ease-in-out"
            placeholder="Define the AI's behavior for this chat..."
          />
          <p className="text-xs text-neutral-500 dark:text-neutral-400 mt-2">
            This prompt will only be used for this chat session. It overrides any project or global settings.
          </p>
        </div>
      </div>
    </div>
  );
};

export default NewChatScreen;
