"use client";

import React from "react";
import Tooltip from "@/components/Tooltip";
import { MessageCircleDashed } from "lucide-react";
import { CheckIcon } from "@heroicons/react/16/solid";

interface TemporaryChatToggleProps {
  isActive: boolean;
  onToggle: (isActive: boolean) => void;
}

export default function TemporaryChatToggle({ isActive, onToggle }: TemporaryChatToggleProps) {
  return (
    <Tooltip text={isActive ? "Temporary chat ON - messages won't be saved" : "Temporary chat OFF"}>
      <button
        onClick={() => onToggle(!isActive)}
        className={`cursor-pointer h-9 px-3 flex items-center justify-center rounded-full transition-all duration-300 ease-in-out
          ${isActive
            ? "bg-black dark:bg-white text-white dark:text-black hover:bg-neutral-900 dark:hover:bg-neutral-200 shadow-sm"
            : "text-neutral-500 hover:bg-neutral-100 dark:hover:bg-zinc-900"
          }`}
        aria-label={isActive ? "Disable temporary chat" : "Enable temporary chat"}
        aria-pressed={isActive}
      >
        <div className="relative flex items-center justify-center size-5 mr-2">
          <MessageCircleDashed className="size-5" />
          {isActive && (
            <div className="absolute inset-0 flex items-center justify-center pb-[2px]">
               <CheckIcon className="size-3.5" />
            </div>
          )}
        </div>
        <span className="text-sm font-medium">Temporary</span>
      </button>
    </Tooltip>
  );
}
