"use client";

import { useState, useRef, useEffect, FormEvent, KeyboardEvent } from "react";
import { ArrowUpCircleIcon, StopCircleIcon } from "@heroicons/react/24/solid";
import { GlobeAltIcon as GlobeOutlineIcon } from "@heroicons/react/24/outline";
import { GlobeAltIcon as GlobeSolidIcon } from "@heroicons/react/24/solid";
import Tooltip from "@/components/Tooltip";

interface ChatInputProps {
  onSendMessageAction: (input: string) => void;
  onCancelAction: () => void;
  isLoading: boolean;
}

export default function ChatInput({
  onSendMessageAction,
  onCancelAction,
  isLoading,
}: ChatInputProps) {
  const [input, setInput] = useState("");
  const [isSearchActive, setIsSearchActive] = useState(false);
  const textareaRef = useRef<HTMLTextAreaElement>(null);

  useEffect(() => {
    const ta = textareaRef.current;
    if (!ta) return;
    ta.style.height = "auto";
    const newHeight = Math.min(ta.scrollHeight, 320);
    ta.style.height = `${newHeight}px`;
    ta.style.overflowY = ta.scrollHeight > 320 ? "auto" : "hidden";
  }, [input]);

  const submit = () => {
    if (!input.trim() || isLoading) return;
    onSendMessageAction(input);
    setInput("");
  };

  const onKeyDown = (e: KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      submit();
    }
  };

  const onSubmit = (e: FormEvent) => {
    e.preventDefault();
    submit();
  };

  return (
    <form onSubmit={onSubmit} className="p-4 pt-0 flex justify-center">
      <div className="w-full max-w-[52rem]">
        <div
          className="
            relative
            flex flex-col
            rounded-3xl
            border border-gray-300
            overflow-hidden
            shadow-lg
            transition-shadow duration-200
            focus-within:border-blue-500
            focus-within:ring-2 focus-within:ring-blue-500 focus-within:ring-opacity-50
          "
        >
          {/* textarea area */}
          <div className="p-4">
            <textarea
              ref={textareaRef}
              value={input}
              onChange={(e) => setInput(e.target.value)}
              onKeyDown={onKeyDown}
              placeholder="Send a message..."
              rows={1}
              className="w-full resize-none border-none p-0 bg-background text-foreground focus:outline-none"
              style={{
                maxHeight: "320px",
                overflowY:
                  (textareaRef.current?.scrollHeight ?? 0) > 320
                    ? "auto"
                    : "hidden",
                scrollbarGutter: "stable",
              }}
              disabled={isLoading}
            />
          </div>

          {/* footer bar */}
          <div className="border-t border-gray-200 p-2 ps-3 flex justify-between items-center">
            <Tooltip text="Search the web">
              <button
                type="button"
                disabled
                onClick={() => setIsSearchActive((v) => !v)}
                className={`
                cursor-not-allowed h-9 flex items-center gap-2 px-4 rounded-full text-sm font-medium transition-colors duration-200
                ${
                  isSearchActive
                    ? "bg-[#171717] text-white border"
                    : "bg-white text-[#5d5d5d] border border-gray-300"
                }
              `}
              >
                {isSearchActive ? (
                  <GlobeSolidIcon className="h-5 w-5" />
                ) : (
                  <GlobeOutlineIcon className="h-5 w-5" />
                )}
                <span>Search</span>
              </button>
            </Tooltip>

            <button
              type={isLoading ? "button" : "submit"}
              onClick={isLoading ? onCancelAction : undefined}
              disabled={!input.trim() && !isLoading}
              className="cursor-pointer disabled:opacity-50 disabled:cursor-not-allowed rounded-full hover:text-[#5d5d5d] transition-colors duration-150"
            >
              {isLoading ? (
                <StopCircleIcon className="h-10 w-10" />
              ) : (
                <ArrowUpCircleIcon className="h-10 w-10" />
              )}
            </button>
          </div>
        </div>
      </div>
    </form>
  );
}
