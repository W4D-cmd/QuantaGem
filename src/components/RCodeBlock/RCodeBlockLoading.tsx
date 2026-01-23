"use client";

import React from "react";
import { ArrowPathIcon } from "@heroicons/react/24/outline";

interface RCodeBlockLoadingProps {
  progress: number;
  message: string;
}

export const RCodeBlockLoading: React.FC<RCodeBlockLoadingProps> = ({ progress, message }) => {
  return (
    <div
      className="p-6 rounded-xl bg-neutral-100 dark:bg-neutral-900 border border-neutral-400/30
        dark:border-neutral-600/30"
    >
      <div className="flex items-center gap-2 mb-3 text-neutral-600 dark:text-neutral-400">
        <ArrowPathIcon className="size-5 animate-spin" />
        <span className="font-medium">{message || "Loading R Environment..."}</span>
      </div>

      {/* Progress bar */}
      <div className="w-full h-2 bg-neutral-200 dark:bg-neutral-800 rounded-full overflow-hidden">
        <div
          className="h-full bg-blue-500 dark:bg-blue-400 rounded-full transition-all duration-300 ease-out"
          style={{ width: `${progress}%` }}
        />
      </div>

      <div className="mt-2 text-xs text-neutral-500 dark:text-neutral-500">{progress > 0 ? `${progress}%` : ""}</div>
    </div>
  );
};
