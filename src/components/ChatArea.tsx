"use client";

import "katex/dist/katex.min.css";

import React, {
  useRef,
  useState,
  useEffect,
  memo,
  forwardRef,
  useImperativeHandle,
} from "react";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import rehypeHighlight from "rehype-highlight";
import remarkMath from "remark-math";
import rehypeKatex from "rehype-katex";
import { MessagePart } from "@/app/page";

export interface Message {
  role: "user" | "model";
  parts: MessagePart[];
  sources?: Array<{ title: string; uri: string }>;
}

interface ChatAreaProps {
  messages: Message[];
  isLoading: boolean;
  streamStarted: boolean;
  onAutoScrollChange?: (isAutoScrollEnabled: boolean) => void;
}

export interface ChatAreaHandle {
  scrollToBottomAndEnableAutoscroll: () => void;
}

export default memo(
  forwardRef<ChatAreaHandle, ChatAreaProps>(ChatAreaComponent),
  (prev, next) =>
    prev.messages === next.messages &&
    prev.isLoading === next.isLoading &&
    prev.streamStarted === next.streamStarted &&
    prev.onAutoScrollChange === next.onAutoScrollChange,
);

function ChatAreaComponent(
  { messages, isLoading, streamStarted, onAutoScrollChange }: ChatAreaProps,
  ref: React.Ref<ChatAreaHandle>,
) {
  const containerRef = useRef<HTMLDivElement>(null);
  const [autoScrollEnabled, setAutoScrollEnabled] = useState(true);
  const justManuallyDisabledRef = useRef(false);
  const lastScrollTopRef = useRef(0);
  const scrollTimeoutRef = useRef<NodeJS.Timeout | null>(null);

  useImperativeHandle(ref, () => ({
    scrollToBottomAndEnableAutoscroll: () => {
      setAutoScrollEnabled(true);
      justManuallyDisabledRef.current = false;
      if (onAutoScrollChange) {
        onAutoScrollChange(true);
      }
      const el = containerRef.current;
      if (el) {
        el.scrollTo({
          top: el.scrollHeight,
          behavior: "smooth",
        });
        el.focus({ preventScroll: true });
      }
    },
  }));

  useEffect(() => {
    const el = containerRef.current;
    if (!el) return;

    lastScrollTopRef.current = el.scrollTop;

    const handleUserInitiatedScroll = (event: WheelEvent | TouchEvent) => {
      const currentEl = containerRef.current;
      if (!currentEl) return;

      const currentScrollTop = currentEl.scrollTop;
      const atBottomForUserScroll =
        currentEl.scrollHeight - currentScrollTop - currentEl.clientHeight < 1;

      let effectivelyScrollingUp: boolean;
      if (event.type === "wheel") {
        effectivelyScrollingUp = (event as WheelEvent).deltaY < 0;
      } else {
        effectivelyScrollingUp = currentScrollTop < lastScrollTopRef.current;
      }

      if (
        autoScrollEnabled &&
        (effectivelyScrollingUp || !atBottomForUserScroll)
      ) {
        currentEl.scrollTo({ top: currentEl.scrollTop, behavior: "auto" });
        setAutoScrollEnabled(false);
        justManuallyDisabledRef.current = true;
        if (onAutoScrollChange) {
          onAutoScrollChange(false);
        }
      }
      lastScrollTopRef.current = currentScrollTop;
    };

    const DEBOUNCE_DELAY = 150;

    const evaluateScrollPositionAndToggleAutoscroll = () => {
      const currentEl = containerRef.current;
      if (!currentEl) return;

      const generalAtBottomThreshold = 20;
      const isGenerallyAtBottom =
        currentEl.scrollHeight - currentEl.scrollTop - currentEl.clientHeight <
        generalAtBottomThreshold;

      const manualOverrideResetThreshold = 5;
      const isManuallyScrolledBackToBottom =
        currentEl.scrollHeight - currentEl.scrollTop - currentEl.clientHeight <
        manualOverrideResetThreshold;

      if (justManuallyDisabledRef.current) {
        if (isManuallyScrolledBackToBottom) {
          justManuallyDisabledRef.current = false;
          if (!autoScrollEnabled) {
            setAutoScrollEnabled(true);
            if (onAutoScrollChange) {
              onAutoScrollChange(true);
            }
          }
        }
        return;
      }

      if (isLoading) {
        if (isGenerallyAtBottom && !autoScrollEnabled) {
          setAutoScrollEnabled(true);
          if (onAutoScrollChange) {
            onAutoScrollChange(true);
          }
        }
      } else {
        if (isGenerallyAtBottom) {
          if (!autoScrollEnabled) {
            setAutoScrollEnabled(true);
            if (onAutoScrollChange) {
              onAutoScrollChange(true);
            }
          }
        } else {
          if (autoScrollEnabled) {
            setAutoScrollEnabled(false);
            if (onAutoScrollChange) {
              onAutoScrollChange(false);
            }
          }
        }
      }
    };

    const debouncedScrollHandler = () => {
      if (scrollTimeoutRef.current) {
        clearTimeout(scrollTimeoutRef.current);
      }
      scrollTimeoutRef.current = setTimeout(
        evaluateScrollPositionAndToggleAutoscroll,
        DEBOUNCE_DELAY,
      );
    };

    el.addEventListener("wheel", handleUserInitiatedScroll as EventListener, {
      passive: true,
    });
    el.addEventListener(
      "touchstart",
      handleUserInitiatedScroll as EventListener,
      {
        passive: true,
      },
    );
    el.addEventListener("scroll", debouncedScrollHandler, { passive: true });

    return () => {
      el.removeEventListener(
        "wheel",
        handleUserInitiatedScroll as EventListener,
      );
      el.removeEventListener(
        "touchstart",
        handleUserInitiatedScroll as EventListener,
      );
      el.removeEventListener("scroll", debouncedScrollHandler);
      if (scrollTimeoutRef.current) {
        clearTimeout(scrollTimeoutRef.current);
      }
    };
  }, [onAutoScrollChange, autoScrollEnabled, isLoading]);

  useEffect(() => {
    const el = containerRef.current;
    if (!el) return;

    if (justManuallyDisabledRef.current) {
      return;
    }

    if (isLoading && !streamStarted) {
      el.scrollTo({ top: el.scrollHeight, behavior: "auto" });
    } else if (isLoading && streamStarted && autoScrollEnabled) {
      el.scrollTo({ top: el.scrollHeight, behavior: "smooth" });
    }
  }, [messages, isLoading, streamStarted, autoScrollEnabled]);

  return (
    <div
      ref={containerRef}
      className="flex-1 overflow-y-auto px-4 py-2 focus:outline-none"
      tabIndex={-1}
    >
      <div className="mx-auto max-w-[52rem] p-4 space-y-4">
        {messages.map((msg, i) => (
          <div
            key={i}
            className={`p-4 rounded-3xl break-words overflow-hidden ${
              msg.role === "user"
                ? "max-w-xl bg-[#e9e9e980] text-white self-end ml-auto"
                : "w-full text-foreground self-start"
            }`}
          >
            {msg.parts.map((part, j) => {
              if (part.type === "text" && part.text) {
                return (
                  <div key={j} className="prose max-w-none prose-customtext">
                    <ReactMarkdown
                      remarkPlugins={[remarkMath, remarkGfm]}
                      rehypePlugins={[
                        rehypeKatex,
                        [rehypeHighlight, { detect: true }],
                      ]}
                    >
                      {part.text}
                    </ReactMarkdown>
                  </div>
                );
              } else if (
                part.type === "file" &&
                part.objectName &&
                part.mimeType &&
                part.fileName
              ) {
                const fileUrl = `/api/files/${part.objectName}`;
                if (part.mimeType.startsWith("image/")) {
                  return (
                    <div key={j} className="my-2">
                      <img
                        src={fileUrl}
                        alt={part.fileName}
                        className="max-w-full h-auto rounded-lg border border-gray-200"
                        style={{ maxHeight: "400px" }}
                      />
                    </div>
                  );
                } else {
                  return (
                    <div key={j} className="my-2">
                      <a
                        href={fileUrl}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="text-blue-600 hover:text-blue-800 underline break-all"
                      >
                        {part.fileName} ({part.mimeType},{" "}
                        {part.size ? `${(part.size / 1024).toFixed(1)} KB` : ""}
                        )
                      </a>
                    </div>
                  );
                }
              }
              return null;
            })}
            {msg.role === "model" && msg.sources && msg.sources.length > 0 && (
              <div className="mt-4 pt-3 border-t border-gray-200 text-xs text-gray-600">
                <p className="font-semibold mb-2">Sources:</p>
                <ul className="list-disc list-inside space-y-1">
                  {msg.sources.map((source, k) => (
                    <li key={k}>
                      <a
                        href={source.uri}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="text-blue-600 hover:text-blue-800 underline break-all"
                      >
                        {source.title || source.uri}
                      </a>
                    </li>
                  ))}
                </ul>
              </div>
            )}
          </div>
        ))}
        {isLoading && !streamStarted && (
          <div className="p-3 rounded-lg max-w-xl bg-transparent self-start mr-auto">
            <div className="w-6 h-6 border-3 border-gray-300 border-t-[#5d5d5d] rounded-full animate-spin" />
          </div>
        )}
      </div>
    </div>
  );
}
