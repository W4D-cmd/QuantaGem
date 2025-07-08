"use client";

import "katex/dist/katex.min.css";

import React, {
  forwardRef,
  memo,
  useEffect,
  useImperativeHandle,
  useRef,
  useState,
  useCallback,
  KeyboardEvent,
} from "react";
import ReactMarkdown, { Components } from "react-markdown";
import remarkGfm from "remark-gfm";
import rehypeHighlight from "rehype-highlight";
import remarkMath from "remark-math";
import rehypeKatex from "rehype-katex";
import { Message } from "@/app/page";
import { ClipboardDocumentListIcon, CheckIcon, PencilIcon, ArrowPathIcon } from "@heroicons/react/24/outline";
import Tooltip from "@/components/Tooltip";
import MessageSkeleton from "./MessageSkeleton";

type GetAuthHeaders = () => HeadersInit;

interface ChatAreaProps {
  messages: Message[];
  isLoading: boolean;
  streamStarted: boolean;
  onAutoScrollChange?: (isAutoScrollEnabled: boolean) => void;
  getAuthHeaders: GetAuthHeaders;
  activeChatId: number | null;
  editingMessage: { index: number; content: string } | null;
  setEditingMessage: React.Dispatch<React.SetStateAction<{ index: number; content: string } | null>>;
  onEditSave: (index: number, newContent: string) => void;
  onRegenerate: (index: number) => void;
}

export interface ChatAreaHandle {
  scrollToBottomAndEnableAutoscroll: () => void;
}

const ProtectedImage = memo(
  ({
    objectName,
    fileName,
    mimeType,
    getAuthHeaders,
  }: {
    objectName: string;
    fileName: string;
    mimeType: string;
    getAuthHeaders: () => HeadersInit;
  }) => {
    const [imageUrl, setImageUrl] = useState<string | null>(null);

    useEffect(() => {
      let objectUrl: string | null = null;
      const fetchImage = async () => {
        try {
          const res = await fetch(`/api/files/${objectName}`, {
            headers: getAuthHeaders(),
          });

          if (!res.ok) {
            console.error(`Failed to fetch image ${fileName}: ${res.statusText}`);
            setImageUrl("/image.png");
            return;
          }

          const blob = await res.blob();
          objectUrl = URL.createObjectURL(blob);
          setImageUrl(objectUrl);
        } catch (error) {
          console.error(`Error loading image ${fileName}:`, error);
          setImageUrl("/image.png");
        }
      };

      fetchImage();

      return () => {
        if (objectUrl) {
          URL.revokeObjectURL(objectUrl);
        }
      };
    }, [objectName, fileName, mimeType, getAuthHeaders]);

    if (!imageUrl) {
      return (
        <div
          className="max-w-full h-auto rounded-lg border border-neutral-200 bg-neutral-100 flex items-center justify-center"
          style={{ maxHeight: "400px", minHeight: "100px" }}
        >
          Loading Image...
        </div>
      );
    }

    return (
      <img
        src={imageUrl}
        alt={fileName}
        className="max-w-full h-auto rounded-lg border border-neutral-200"
        style={{ maxHeight: "400px" }}
      />
    );
  },
);

ProtectedImage.displayName = "ProtectedImage";

interface CodeBlockWithCopyProps {
  children: React.ReactNode;
  chatAreaContainerRef: React.RefObject<HTMLDivElement | null>;
  className?: string;
}

const CODE_BLOCK_PADDING_BOTTOM = 16;
const BUTTON_OFFSET_RIGHT = 8;
const BUTTON_INITIAL_TOP = 8;

const CodeBlockWithCopy: React.FC<CodeBlockWithCopyProps> = ({ children, chatAreaContainerRef, className }) => {
  const [copied, setCopied] = useState(false);
  const preRef = useRef<HTMLPreElement>(null);
  const buttonRef = useRef<HTMLButtonElement>(null);
  const [buttonRelativeTop, setButtonRelativeTop] = useState(BUTTON_INITIAL_TOP);

  const handleCopy = useCallback(() => {
    if (preRef.current) {
      const codeElement = preRef.current.querySelector("code");
      if (codeElement) {
        const codeText = codeElement.textContent || "";
        navigator.clipboard
          .writeText(codeText)
          .then(() => {
            setCopied(true);
            setTimeout(() => setCopied(false), 2000);
          })
          .catch((err) => {
            console.error("Failed to copy text:", err);
          });
      }
    }
  }, []);

  const updateButtonPosition = useCallback(() => {
    const scrollParent = chatAreaContainerRef.current;
    const preElement = preRef.current;
    const buttonElement = buttonRef.current;

    if (!scrollParent || !preElement || !buttonElement) {
      setButtonRelativeTop(BUTTON_INITIAL_TOP);
      return;
    }

    const preRect = preElement.getBoundingClientRect();
    const scrollParentRect = scrollParent.getBoundingClientRect();
    const buttonHeight = buttonElement.offsetHeight;

    const preTopRelativeToScrollParentView = preRect.top - scrollParentRect.top;

    const stickyTop = Math.max(BUTTON_INITIAL_TOP, BUTTON_INITIAL_TOP - preTopRelativeToScrollParentView);

    const maxTopAllowed = preElement.clientHeight - buttonHeight - CODE_BLOCK_PADDING_BOTTOM;

    const finalTop = Math.min(stickyTop, maxTopAllowed);

    setButtonRelativeTop(finalTop);
  }, [chatAreaContainerRef]);

  useEffect(() => {
    const scrollParent = chatAreaContainerRef.current;
    if (!scrollParent) return;

    scrollParent.addEventListener("scroll", updateButtonPosition, { passive: true });
    window.addEventListener("resize", updateButtonPosition);

    updateButtonPosition();

    return () => {
      scrollParent.removeEventListener("scroll", updateButtonPosition);
      window.removeEventListener("resize", updateButtonPosition);
    };
  }, [updateButtonPosition, chatAreaContainerRef]);

  return (
    <div className="relative group">
      <pre ref={preRef} className={className}>
        {children}
      </pre>
      <Tooltip text={copied ? "Copied!" : "Copy code"}>
        <button
          ref={buttonRef}
          onClick={handleCopy}
          style={{ top: `${buttonRelativeTop}px`, right: `${BUTTON_OFFSET_RIGHT}px` }}
          className="cursor-pointer absolute p-1 rounded-md text-neutral-400 dark:text-neutral-500 hover:bg-neutral-200
            dark:hover:bg-neutral-700 opacity-0 group-hover:opacity-100 transition-opacity duration-200 z-10"
        >
          {copied ? <CheckIcon className="size-4 text-green-600" /> : <ClipboardDocumentListIcon className="size-4" />}
        </button>
      </Tooltip>
    </div>
  );
};

export default memo(
  forwardRef<ChatAreaHandle, ChatAreaProps>(ChatAreaComponent),
  (prev, next) =>
    prev.messages === next.messages &&
    prev.isLoading === next.isLoading &&
    prev.streamStarted === next.streamStarted &&
    prev.onAutoScrollChange === next.onAutoScrollChange &&
    prev.getAuthHeaders === next.getAuthHeaders &&
    prev.editingMessage === next.editingMessage,
);

function ChatAreaComponent(
  {
    messages,
    isLoading,
    streamStarted,
    onAutoScrollChange,
    getAuthHeaders,
    activeChatId,
    editingMessage,
    setEditingMessage,
    onEditSave,
    onRegenerate,
  }: ChatAreaProps,
  ref: React.Ref<ChatAreaHandle>,
) {
  const containerRef = useRef<HTMLDivElement>(null);
  const previousActiveChatIdRef = useRef<number | null>(null);
  const scrolledOnLoadRef = useRef(false);
  const [autoScrollEnabled, setAutoScrollEnabled] = useState(true);
  const justManuallyDisabledRef = useRef(false);
  const lastScrollTopRef = useRef(0);
  const scrollTimeoutRef = useRef<NodeJS.Timeout | null>(null);
  const [copiedMessageId, setCopiedMessageId] = useState<number | null>(null);
  const editingTextareaRef = useRef<HTMLTextAreaElement>(null);
  const [editedText, setEditedText] = useState("");

  useEffect(() => {
    if (editingMessage) {
      setEditedText(editingMessage.content);
    }
  }, [editingMessage]);

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

  const handleCopyMessage = (msg: Message) => {
    const textToCopy = msg.parts
      .filter((p) => p.type === "text" && p.text)
      .map((p) => p.text)
      .join("\n\n");
    navigator.clipboard.writeText(textToCopy).then(() => {
      setCopiedMessageId(msg.id);
      setTimeout(() => setCopiedMessageId(null), 2000);
    });
  };

  useEffect(() => {
    const el = containerRef.current;
    if (!el) return;

    lastScrollTopRef.current = el.scrollTop;

    const handleUserInitiatedScroll = (event: WheelEvent | TouchEvent) => {
      const currentEl = containerRef.current;
      if (!currentEl) return;

      if (currentEl.scrollHeight <= currentEl.clientHeight) {
        return;
      }

      const currentScrollTop = currentEl.scrollTop;
      const atBottomForUserScroll = currentEl.scrollHeight - currentScrollTop - currentEl.clientHeight < 1;

      let effectivelyScrollingUp: boolean;
      if (event.type === "wheel") {
        effectivelyScrollingUp = (event as WheelEvent).deltaY < 0;
      } else {
        effectivelyScrollingUp = currentScrollTop < lastScrollTopRef.current;
      }

      if (autoScrollEnabled && (effectivelyScrollingUp || !atBottomForUserScroll)) {
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
      if (scrollTimeoutRef.current) {
        clearTimeout(scrollTimeoutRef.current);
      }
      scrollTimeoutRef.current = setTimeout(() => {
        const currentEl = containerRef.current;
        if (!currentEl) return;

        const generalAtBottomThreshold = 20;
        const isGenerallyAtBottom =
          currentEl.scrollHeight - currentEl.scrollTop - currentEl.clientHeight < generalAtBottomThreshold;

        const manualOverrideResetThreshold = 5;
        const isManuallyScrolledBackToBottom =
          currentEl.scrollHeight - currentEl.scrollTop - currentEl.clientHeight < manualOverrideResetThreshold;

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
      }, DEBOUNCE_DELAY);
    };

    el.addEventListener("wheel", handleUserInitiatedScroll as EventListener, {
      passive: true,
    });
    el.addEventListener("touchstart", handleUserInitiatedScroll as EventListener, {
      passive: true,
    });
    el.addEventListener("scroll", evaluateScrollPositionAndToggleAutoscroll, { passive: true });

    return () => {
      el.removeEventListener("wheel", handleUserInitiatedScroll as EventListener);
      el.removeEventListener("touchstart", handleUserInitiatedScroll as EventListener);
      el.removeEventListener("scroll", evaluateScrollPositionAndToggleAutoscroll);
      if (scrollTimeoutRef.current) {
        clearTimeout(scrollTimeoutRef.current);
      }
    };
  }, [onAutoScrollChange, autoScrollEnabled, isLoading]);

  useEffect(() => {
    const el = containerRef.current;
    if (!el) return;

    if (activeChatId !== previousActiveChatIdRef.current) {
      scrolledOnLoadRef.current = false;
    }

    if (
      (!isLoading && messages.length > 0 && !scrolledOnLoadRef.current) ||
      (activeChatId === null && messages.length === 0 && !scrolledOnLoadRef.current)
    ) {
      el.scrollTo({ top: el.scrollHeight, behavior: "auto" });
      setAutoScrollEnabled(true);
      justManuallyDisabledRef.current = false;
      if (onAutoScrollChange) {
        onAutoScrollChange(true);
      }
      scrolledOnLoadRef.current = true;
    }

    previousActiveChatIdRef.current = activeChatId;
  }, [activeChatId, isLoading, messages.length, onAutoScrollChange]);

  useEffect(() => {
    if (autoScrollEnabled && containerRef.current && !editingMessage) {
      containerRef.current.scrollTo({
        top: containerRef.current.scrollHeight,
        behavior: "smooth",
      });
    }
  }, [messages, autoScrollEnabled, editingMessage]);

  useEffect(() => {
    if (editingMessage && editingTextareaRef.current) {
      const textarea = editingTextareaRef.current;
      textarea.style.height = "auto";
      textarea.style.height = `${textarea.scrollHeight}px`;
      textarea.focus();
      textarea.setSelectionRange(textarea.value.length, textarea.value.length);
    }
  }, [editingMessage]);

  useEffect(() => {
    if (editingMessage && editingTextareaRef.current) {
      const textarea = editingTextareaRef.current;
      textarea.style.height = "auto";
      textarea.style.height = `${textarea.scrollHeight}px`;
    }
  }, [editedText, editingMessage]);

  const markdownComponents: Components = {
    pre: ({ className, children }) => (
      <CodeBlockWithCopy chatAreaContainerRef={containerRef} className={className}>
        {children}
      </CodeBlockWithCopy>
    ),
  };

  const handleEditKeyDown = (e: KeyboardEvent<HTMLTextAreaElement>, index: number) => {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      onEditSave(index, editedText);
    }
    if (e.key === "Escape") {
      setEditingMessage(null);
    }
  };

  return (
    <div ref={containerRef} className="flex-1 overflow-y-auto px-4 py-2 focus:outline-none" tabIndex={-1}>
      <div className="mx-auto max-w-[52rem] p-4 space-y-4">
        {messages.map((msg, i) => {
          const isUserMessage = msg.role === "user";
          const isBeingEdited = editingMessage?.index === i;
          const textContent = msg.parts.find((p) => p.type === "text")?.text || "";

          return (
            <div
              key={msg.id}
              className={`group/message relative flex flex-col ${
                isUserMessage && !isBeingEdited ? "items-end" : "items-start"
              }`}
            >
              <div
                className={`break-words overflow-hidden ${
                  isBeingEdited ? "w-full" : isUserMessage ? "max-w-xl" : "w-full"
                }`}
              >
                {isBeingEdited ? (
                  <div className="p-4 rounded-3xl bg-white dark:bg-neutral-800 border-2 border-blue-500">
                    <textarea
                      ref={editingTextareaRef}
                      value={editedText}
                      onChange={(e) => setEditedText(e.target.value)}
                      onKeyDown={(e) => handleEditKeyDown(e, i)}
                      rows={4}
                      className="w-full resize-none border-none p-0 focus:outline-none bg-transparent max-h-96"
                    />
                    <div className="flex justify-end gap-2 mt-2">
                      <button
                        onClick={() => setEditingMessage(null)}
                        className="cursor-pointer px-4 py-1.5 rounded-full text-sm font-medium transition-colors
                          bg-neutral-200 hover:bg-neutral-300 dark:bg-neutral-700 dark:hover:bg-neutral-600"
                      >
                        Cancel
                      </button>
                      <button
                        onClick={() => onEditSave(i, editedText)}
                        className="cursor-pointer px-4 py-1.5 rounded-full text-sm font-medium transition-colors
                          bg-blue-600 text-white hover:bg-blue-700"
                      >
                        Save
                      </button>
                    </div>
                  </div>
                ) : (
                  <div className={`p-4 rounded-3xl ${isUserMessage ? "bg-neutral-100 dark:bg-neutral-800" : ""}`}>
                    {msg.parts.map((part, j) => {
                      if (part.type === "text" && part.text) {
                        return (
                          <div
                            key={j}
                            className="prose dark:prose-invert prose-neutral prose-code:font-normal
                              prose-code:text-black dark:prose-code:text-white prose-li:text-neutral-950
                              dark:prose-li:text-neutral-50 prose-p:text-neutral-950 dark:prose-p:text-neutral-50
                              prose-headings:text-black dark:prose-headings:text-white prose-pre:rounded-xl
                              prose-code:rounded prose-pre:border prose-pre:bg-neutral-100
                              prose-pre:border-neutral-400/30 dark:prose-pre:bg-neutral-900
                              dark:prose-pre:border-neutral-600/30 prose-code:bg-neutral-200 dark:prose-code:bg-neutral-700
                              max-w-none transition-colors duration-300 ease-in-out prose-code:before:content-none
                              prose-code:after:content-none prose-code:py-0.5 prose-code:px-1"
                          >
                            <ReactMarkdown
                              remarkPlugins={[remarkMath, remarkGfm]}
                              rehypePlugins={[rehypeKatex, [rehypeHighlight, { detect: true }]]}
                              components={markdownComponents}
                            >
                              {part.text}
                            </ReactMarkdown>
                          </div>
                        );
                      } else if (part.type === "file" && part.objectName && part.mimeType && part.fileName) {
                        if (part.mimeType.startsWith("image/")) {
                          return (
                            <div key={j} className="my-2">
                              <ProtectedImage
                                objectName={part.objectName}
                                fileName={part.fileName}
                                mimeType={part.mimeType}
                                getAuthHeaders={getAuthHeaders}
                              />
                            </div>
                          );
                        } else {
                          const fileUrl = `/api/files/${part.objectName}`;
                          return (
                            <div key={j} className="my-2">
                              <a
                                href={fileUrl}
                                target="_blank"
                                rel="noopener noreferrer"
                                className="text-blue-600 hover:text-blue-800 dark:text-blue-400 dark:hover:text-blue-600 break-all"
                              >
                                {part.fileName} ({part.size ? `${(part.size / 1024).toFixed(1)} KB` : ""})
                              </a>
                            </div>
                          );
                        }
                      }
                      return null;
                    })}
                    {msg.role === "model" && msg.sources && msg.sources.length > 0 && (
                      <div
                        className="mt-4 pt-3 border-t border-neutral-200 dark:border-neutral-800 text-xs
                          text-neutral-600"
                      >
                        <p className="font-semibold mb-2">Sources:</p>
                        <ul className="list-disc list-inside space-y-1">
                          {msg.sources.map((source, k) => (
                            <li key={k}>
                              <a
                                href={source.uri}
                                target="_blank"
                                rel="noopener noreferrer"
                                className="text-blue-600 hover:text-blue-800 dark:text-blue-400 dark:hover:text-blue-600
                                  break-all"
                              >
                                {source.title || source.uri}
                              </a>
                            </li>
                          ))}
                        </ul>
                      </div>
                    )}
                  </div>
                )}
              </div>

              {!isBeingEdited && !(isLoading && !streamStarted && i === messages.length - 1) && (
                <div
                  className="flex-shrink-0 flex items-center justify-center gap-1 opacity-0
                    group-hover/message:opacity-100 transition-opacity duration-200 h-8 mt-1"
                >
                  <Tooltip text={copiedMessageId === msg.id ? "Copied!" : "Copy"}>
                    <button
                      onClick={() => handleCopyMessage(msg)}
                      disabled={isLoading}
                      className="cursor-pointer size-7 flex items-center justify-center rounded-full text-neutral-500
                        hover:bg-neutral-100 dark:hover:bg-neutral-800 transition-colors"
                    >
                      {copiedMessageId === msg.id ? (
                        <CheckIcon className="size-4 text-green-500" />
                      ) : (
                        <ClipboardDocumentListIcon className="size-4" />
                      )}
                    </button>
                  </Tooltip>
                  {isUserMessage && (
                    <Tooltip text="Edit">
                      <button
                        onClick={() => setEditingMessage({ index: i, content: textContent })}
                        disabled={isLoading}
                        className="cursor-pointer size-7 flex items-center justify-center rounded-full text-neutral-500
                          hover:bg-neutral-100 dark:hover:bg-neutral-800 transition-colors"
                      >
                        <PencilIcon className="size-4" />
                      </button>
                    </Tooltip>
                  )}
                  {!isUserMessage && i > 0 && (
                    <Tooltip text="Regenerate">
                      <button
                        onClick={() => onRegenerate(i)}
                        disabled={isLoading}
                        className="cursor-pointer size-7 flex items-center justify-center rounded-full text-neutral-500
                          hover:bg-neutral-100 dark:hover:bg-neutral-800 transition-colors"
                      >
                        <ArrowPathIcon className="size-4" />
                      </button>
                    </Tooltip>
                  )}
                </div>
              )}
            </div>
          );
        })}
        {isLoading && !streamStarted && !editingMessage && <MessageSkeleton />}
      </div>
    </div>
  );
}
