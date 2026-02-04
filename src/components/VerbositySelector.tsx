"use client";

import React, { useRef, useState, useMemo } from "react";
import { CheckIcon, ChevronDownIcon, ChatBubbleBottomCenterTextIcon } from "@heroicons/react/24/outline";
import DropdownMenu, { DropdownItem } from "./DropdownMenu";
import Tooltip from "./Tooltip";
import { VerbosityOption } from "@/lib/thinking";

interface VerbositySelectorProps {
  verbosity: VerbosityOption;
  onVerbosityChange: (verbosity: VerbosityOption) => void;
  disabled?: boolean;
}

const VERBOSITY_OPTIONS: VerbosityOption[] = ["low", "medium", "high"];

const VERBOSITY_LABELS: Record<VerbosityOption, string> = {
  low: "Concise",
  medium: "Balanced",
  high: "Detailed",
};

const VERBOSITY_DESCRIPTIONS: Record<VerbosityOption, string> = {
  low: "Minimal, functional responses",
  medium: "Balanced detail (default)",
  high: "Comprehensive, verbose output",
};

export default function VerbositySelector({
  verbosity,
  onVerbosityChange,
  disabled = false,
}: VerbositySelectorProps) {
  const [isMenuOpen, setIsMenuOpen] = useState(false);
  const buttonRef = useRef<HTMLButtonElement>(null);

  const dropdownItems = useMemo((): DropdownItem[] => {
    return VERBOSITY_OPTIONS.map((option) => ({
      id: option,
      label: VERBOSITY_LABELS[option],
      onClick: () => onVerbosityChange(option),
      className: verbosity === option ? "font-semibold" : "",
      icon:
        verbosity === option ? (
          <CheckIcon className="size-4 text-blue-500" />
        ) : (
          <div className="size-4" />
        ),
      description: VERBOSITY_DESCRIPTIONS[option],
    }));
  }, [verbosity, onVerbosityChange]);

  return (
    <>
      <Tooltip text="Response Verbosity">
        <button
          ref={buttonRef}
          type="button"
          onClick={() => setIsMenuOpen((prev) => !prev)}
          disabled={disabled}
          className={`cursor-pointer h-9 flex items-center gap-2 px-4 rounded-full text-sm font-medium
            transition-colors duration-300 ease-in-out bg-white border border-neutral-300 hover:bg-neutral-100
            text-neutral-500 dark:bg-zinc-950 dark:border-zinc-900 dark:text-zinc-400
            dark:hover:bg-zinc-700 disabled:opacity-50`}
        >
          <ChatBubbleBottomCenterTextIcon className="size-5" />
          <span>{VERBOSITY_LABELS[verbosity]}</span>
          <ChevronDownIcon className="size-3" />
        </button>
      </Tooltip>
      <DropdownMenu
        open={isMenuOpen}
        onCloseAction={() => setIsMenuOpen(false)}
        anchorRef={buttonRef}
        items={dropdownItems}
        position="left"
      />
    </>
  );
}
