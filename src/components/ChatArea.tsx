"use client";

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
import { MessagePart } from "@/app/page";

export interface Message {
  role: "user" | "model";
  parts: MessagePart[];
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

  useImperativeHandle(ref, () => ({
    scrollToBottomAndEnableAutoscroll: () => {
      setAutoScrollEnabled(true);
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

    const handleScroll = (event: WheelEvent | TouchEvent) => {
      const currentScrollTop = el.scrollTop;
      const isScrollingUp = currentScrollTop < lastScrollTopRef.current;
      const atBottom = el.scrollHeight - currentScrollTop - el.clientHeight < 1;

      let effectivelyScrollingUp = isScrollingUp;
      if (event.type === "wheel") {
        effectivelyScrollingUp = (event as WheelEvent).deltaY < 0;
      }

      if (effectivelyScrollingUp || !atBottom) {
        if (autoScrollEnabled) {
          console.log("ChatArea: disableAuto triggered by scroll/touch");
          setAutoScrollEnabled(false);
          justManuallyDisabledRef.current = true;
          if (onAutoScrollChange) {
            onAutoScrollChange(false);
          }
          setTimeout(() => {
            justManuallyDisabledRef.current = false;
          }, 150);
        }
      }
      lastScrollTopRef.current = currentScrollTop;
    };

    el.addEventListener("wheel", handleScroll as EventListener, {
      passive: true,
    });
    el.addEventListener("touchstart", handleScroll as EventListener, {
      passive: true,
    });

    const enableIfNearBottom = () => {
      if (justManuallyDisabledRef.current) {
        return;
      }

      const el = containerRef.current;
      if (!el) return;

      const atBottom = el.scrollHeight - el.scrollTop - el.clientHeight < 20;

      if (atBottom) {
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
    };

    el.addEventListener("scroll", enableIfNearBottom, { passive: true });

    return () => {
      el.removeEventListener("wheel", handleScroll as EventListener);
      el.removeEventListener("touchstart", handleScroll as EventListener);
      el.removeEventListener("scroll", enableIfNearBottom);
    };
  }, [onAutoScrollChange, autoScrollEnabled]);

  useEffect(() => {
    const el = containerRef.current;
    if (!el) return;

    if (isLoading) {
      if (!streamStarted) {
        const shouldEnable = autoScrollEnabled;
        setAutoScrollEnabled(true);
        if (onAutoScrollChange && !shouldEnable) onAutoScrollChange(true);
        el.scrollTo({ top: el.scrollHeight, behavior: "auto" });
      } else if (autoScrollEnabled) {
        el.scrollTo({ top: el.scrollHeight, behavior: "smooth" });
      }
    }
  }, [
    messages,
    isLoading,
    streamStarted,
    autoScrollEnabled,
    onAutoScrollChange,
  ]);

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
                      remarkPlugins={[remarkGfm]}
                      rehypePlugins={[[rehypeHighlight, { detect: true }]]}
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
