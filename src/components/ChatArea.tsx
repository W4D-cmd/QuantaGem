"use client";

import { useRef, useState, useEffect, memo } from "react";
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
    const el = containerRef.current;
    if (!el) return;

    if (isLoading) {
      if (!streamStarted) {
        setAutoScrollEnabled(true);
        el.scrollTo({ top: el.scrollHeight, behavior: "auto" });
      } else if (autoScrollEnabled) {
        el.scrollTo({ top: el.scrollHeight, behavior: "smooth" });
      }
    }
  }, [messages, isLoading, streamStarted, autoScrollEnabled]);

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
