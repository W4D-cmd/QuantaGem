"use client";

import { useRef, useState, useEffect, memo } from "react";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import rehypeHighlight from "rehype-highlight";

export interface MessagePart {
  text: string;
}

export interface Message {
  role: "user" | "model";
  parts: MessagePart[];
}

interface ChatAreaProps {
  messages: Message[];
  isLoading: boolean;
  streamStarted: boolean;
}

export default memo(
  ChatAreaComponent,
  (prev, next) =>
    prev.messages === next.messages &&
    prev.isLoading === next.isLoading &&
    prev.streamStarted === next.streamStarted,
);

function ChatAreaComponent({
  messages,
  isLoading,
  streamStarted,
}: ChatAreaProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const [autoScrollEnabled, setAutoScrollEnabled] = useState(true);

  useEffect(() => {
    const el = containerRef.current;
    if (!el) return;

    const disableAuto = () => setAutoScrollEnabled(false);
    el.addEventListener("wheel", disableAuto, { passive: true });
    el.addEventListener("touchstart", disableAuto, { passive: true });

    const enableIfNearBottom = () => {
      const atBottom = el.scrollHeight - el.scrollTop - el.clientHeight < 20;
      if (atBottom) setAutoScrollEnabled(true);
    };
    el.addEventListener("scroll", enableIfNearBottom, { passive: true });

    return () => {
      el.removeEventListener("wheel", disableAuto);
      el.removeEventListener("touchstart", disableAuto);
      el.removeEventListener("scroll", enableIfNearBottom);
    };
  }, []);

  useEffect(() => {
    if (!isLoading || !autoScrollEnabled) return;
    const el = containerRef.current;
    if (el && autoScrollEnabled) {
      el.scrollTo({ top: el.scrollHeight, behavior: "smooth" });
    }
  }, [messages, autoScrollEnabled, isLoading]);

  return (
    <div ref={containerRef} className="flex-1 overflow-y-auto px-4 py-2">
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
            {msg.parts.map((part, j) => (
              <div key={j} className="prose max-w-none">
                <ReactMarkdown
                  remarkPlugins={[remarkGfm]}
                  rehypePlugins={[[rehypeHighlight, { detect: true }]]}
                >
                  {part.text}
                </ReactMarkdown>
              </div>
            ))}
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
