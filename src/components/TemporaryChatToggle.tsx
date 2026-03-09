"use client";

import React from "react";
import Tooltip from "@/components/Tooltip";
import { ClockIcon } from "@heroicons/react/24/outline";

interface TemporaryChatToggleProps {
  isActive: boolean;
  onToggle: (isActive: boolean) => void;
}

export default function TemporaryChatToggle({ isActive, onToggle }: TemporaryChatToggleProps) {
  return (
    <Tooltip text={isActive ? "Temporary chat ON - messages won't be saved" : "Temporary chat OFF"}>
      <button
        onClick={() => onToggle(!isActive)}
        className={`cursor-pointer size-9 flex items-center justify-center rounded-full transition-all duration-300 ease-in-out
          ${isActive
            ? "bg-amber-100 dark:bg-amber-900/50 text-amber-600 dark:text-amber-400 hover:bg-amber-200 dark:hover:bg-amber-900"
            : "text-neutral-500 hover:bg-neutral-100 dark:hover:bg-zinc-900"
          }`}
        aria-label={isActive ? "Disable temporary chat" : "Enable temporary chat"}
        aria-pressed={isActive}
      >
        <ClockIcon className="size-5" />
      </button>
    </Tooltip>
  );
}
