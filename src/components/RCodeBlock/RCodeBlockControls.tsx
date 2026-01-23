"use client";

import React, { useState, useRef, useEffect } from "react";
import {
  ArrowPathIcon,
  ArrowDownTrayIcon,
  ClipboardDocumentListIcon,
  CheckIcon,
} from "@heroicons/react/24/outline";
import Tooltip from "@/components/Tooltip";

export type ViewMode = "code" | "output";

interface RCodeBlockControlsProps {
  view: ViewMode;
  onViewChange: (view: ViewMode) => void;
  onRerun: () => void;
  onCopyCode: () => void;
  onDownloadSVG: () => void;
  onDownloadPNG: () => void;
  onDownloadPDF: () => void;
  hasOutput: boolean;
  isExecuting: boolean;
}

export const RCodeBlockControls: React.FC<RCodeBlockControlsProps> = ({
  view,
  onViewChange,
  onRerun,
  onCopyCode,
  onDownloadSVG,
  onDownloadPNG,
  onDownloadPDF,
  hasOutput,
  isExecuting,
}) => {
  const [copied, setCopied] = useState(false);
  const [dropdownOpen, setDropdownOpen] = useState(false);
  const dropdownRef = useRef<HTMLDivElement>(null);

  const handleCopy = () => {
    onCopyCode();
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  // Close dropdown when clicking outside
  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (dropdownRef.current && !dropdownRef.current.contains(event.target as Node)) {
        setDropdownOpen(false);
      }
    };

    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, []);

  return (
    <div
      className="flex items-center justify-between gap-2 px-3 py-2 bg-neutral-200/50 dark:bg-neutral-800/50
        border-b border-neutral-400/30 dark:border-neutral-600/30 rounded-t-xl"
    >
      {/* View Toggle */}
      <div className="flex items-center bg-neutral-300/50 dark:bg-neutral-700/50 rounded-lg p-0.5">
        <button
          onClick={() => onViewChange("code")}
          className={`cursor-pointer px-3 py-1 text-sm font-medium rounded-md transition-all ${
            view === "code"
              ? "bg-white dark:bg-neutral-600 text-neutral-900 dark:text-white shadow-sm"
              : "text-neutral-600 dark:text-neutral-400 hover:text-neutral-900 dark:hover:text-white"
          }`}
        >
          Code
        </button>
        <button
          onClick={() => onViewChange("output")}
          disabled={!hasOutput}
          className={`cursor-pointer px-3 py-1 text-sm font-medium rounded-md transition-all flex items-center gap-1
            ${
              view === "output"
                ? "bg-white dark:bg-neutral-600 text-neutral-900 dark:text-white shadow-sm"
                : "text-neutral-600 dark:text-neutral-400 hover:text-neutral-900 dark:hover:text-white"
            }
            ${!hasOutput ? "opacity-50 cursor-not-allowed" : ""}`}
        >
          Output
          {hasOutput && view === "output" && <CheckIcon className="size-3" />}
        </button>
      </div>

      {/* Action Buttons */}
      <div className="flex items-center gap-1">
        {/* Re-run Button */}
        <Tooltip text="Re-run code">
          <button
            onClick={onRerun}
            disabled={isExecuting}
            className={`cursor-pointer p-1.5 rounded-md text-neutral-500 dark:text-neutral-400
              hover:bg-neutral-300/50 dark:hover:bg-neutral-700/50 transition-colors
              ${isExecuting ? "animate-spin" : ""}`}
          >
            <ArrowPathIcon className="size-4" />
          </button>
        </Tooltip>

        {/* Download Dropdown */}
        {hasOutput && (
          <div className="relative" ref={dropdownRef}>
            <Tooltip text="Download">
              <button
                onClick={() => setDropdownOpen(!dropdownOpen)}
                className="cursor-pointer p-1.5 rounded-md text-neutral-500 dark:text-neutral-400
                  hover:bg-neutral-300/50 dark:hover:bg-neutral-700/50 transition-colors flex items-center gap-0.5"
              >
                <ArrowDownTrayIcon className="size-4" />
                <svg className="size-3" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
                </svg>
              </button>
            </Tooltip>

            {dropdownOpen && (
              <div
                className="absolute right-0 top-full mt-1 bg-white dark:bg-neutral-800 border border-neutral-200
                  dark:border-neutral-700 rounded-lg shadow-lg py-1 z-50 min-w-[100px]"
              >
                <button
                  onClick={() => {
                    onDownloadSVG();
                    setDropdownOpen(false);
                  }}
                  className="cursor-pointer w-full px-3 py-1.5 text-sm text-left text-neutral-700 dark:text-neutral-300
                    hover:bg-neutral-100 dark:hover:bg-neutral-700 transition-colors"
                >
                  SVG
                </button>
                <button
                  onClick={() => {
                    onDownloadPNG();
                    setDropdownOpen(false);
                  }}
                  className="cursor-pointer w-full px-3 py-1.5 text-sm text-left text-neutral-700 dark:text-neutral-300
                    hover:bg-neutral-100 dark:hover:bg-neutral-700 transition-colors"
                >
                  PNG
                </button>
                <button
                  onClick={() => {
                    onDownloadPDF();
                    setDropdownOpen(false);
                  }}
                  className="cursor-pointer w-full px-3 py-1.5 text-sm text-left text-neutral-700 dark:text-neutral-300
                    hover:bg-neutral-100 dark:hover:bg-neutral-700 transition-colors"
                >
                  PDF
                </button>
              </div>
            )}
          </div>
        )}

        {/* Copy Button */}
        <Tooltip text={copied ? "Copied!" : "Copy code"}>
          <button
            onClick={handleCopy}
            className="cursor-pointer p-1.5 rounded-md text-neutral-500 dark:text-neutral-400
              hover:bg-neutral-300/50 dark:hover:bg-neutral-700/50 transition-colors"
          >
            {copied ? <CheckIcon className="size-4 text-green-600" /> : <ClipboardDocumentListIcon className="size-4" />}
          </button>
        </Tooltip>
      </div>
    </div>
  );
};
