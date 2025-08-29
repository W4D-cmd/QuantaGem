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
  useMemo,
} from "react";
import ReactMarkdown, { Components } from "react-markdown";
import remarkGfm from "remark-gfm";
import rehypeHighlight from "rehype-highlight";
import remarkMath from "remark-math";
import rehypeKatex from "rehype-katex";
import rehypeRaw from "rehype-raw";
import { Message, MessagePart } from "@/app/page";
import {
  ClipboardDocumentListIcon,
  CheckIcon,
  PencilIcon,
  ArrowPathIcon,
  XCircleIcon,
  SpeakerWaveIcon,
  StopIcon,
} from "@heroicons/react/24/outline";
import { ChevronRightIcon } from "@heroicons/react/24/solid";
import Tooltip from "@/components/Tooltip";
import MessageSkeleton from "./MessageSkeleton";
import LazyMarkdownRenderer from "./LazyMarkdownRenderer";
import { motion, AnimatePresence } from "framer-motion";

type GetAuthHeaders = () => HeadersInit;

export interface AudioPlaybackState {
  messageId: number | null;
  status: "loading" | "playing" | "idle";
}

interface ChatAreaProps {
  messages: Message[];
  isLoading: boolean;
  isThinking: boolean;
  streamStarted: boolean;
  onAutoScrollChange?: (isAutoScrollEnabled: boolean) => void;
  getAuthHeaders: GetAuthHeaders;
  activeChatId: number | null;
  editingMessage: { index: number; message: Message } | null;
  setEditingMessage: React.Dispatch<React.SetStateAction<{ index: number; message: Message } | null>>;
  onEditSave: (index: number, newParts: MessagePart[]) => void;
  onRegenerate: (index: number) => void;
  onPlayAudio: (message: Message, selectedText?: string) => void;
  audioPlaybackState: AudioPlaybackState;
}

export interface ChatAreaHandle {
  scrollToBottomAndEnableAutoscroll: () => void;
}

const ThinkingLabel = memo(() => (
  <span className="flex items-center gap-1.5">
    Thinking
    <div
      className="size-3 border-2 border-neutral-300 dark:border-neutral-600 border-t-neutral-600
        dark:border-t-neutral-300 rounded-full animate-spin"
    ></div>
  </span>
));
ThinkingLabel.displayName = "ThinkingLabel";

const ThinkingSummary: React.FC<{ summary: string; isStreaming: boolean }> = ({ summary, isStreaming }) => {
  const [isOpen, setIsOpen] = useState(false);

  const summaryHeader = useMemo(() => {
    return (
      <button
        onClick={() => setIsOpen((prev) => !prev)}
        className="w-full cursor-pointer list-none flex items-center gap-1 font-medium text-neutral-600
          dark:text-neutral-400 hover:text-neutral-900 dark:hover:text-neutral-200 transition-colors"
      >
        <motion.div animate={{ rotate: isOpen ? 90 : 0 }} transition={{ duration: 0.2 }}>
          <ChevronRightIcon className="size-4" />
        </motion.div>
        {isStreaming ? <ThinkingLabel /> : "Thoughts"}
      </button>
    );
  }, [isOpen, isStreaming]);

  return (
    <div className="mb-2 text-sm">
      {summaryHeader}
      <AnimatePresence initial={false}>
        {isOpen && (
          <motion.div
            key="content"
            initial="collapsed"
            animate="open"
            exit="collapsed"
            variants={{
              open: { opacity: 1, height: "auto" },
              collapsed: { opacity: 0, height: 0 },
            }}
            transition={{ duration: 0.3, ease: [0.04, 0.62, 0.23, 0.98] }}
            className="overflow-hidden"
          >
            <div
              className="mt-2 p-3 border border-neutral-200 dark:border-neutral-700 rounded-xl bg-neutral-50
                dark:bg-neutral-800/50 prose dark:prose-invert prose-neutral max-w-none prose-sm"
            >
              <ReactMarkdown
                remarkPlugins={[remarkMath, remarkGfm]}
                rehypePlugins={[rehypeRaw, rehypeKatex, [rehypeHighlight, { detect: true }]]}
              >
                {summary}
              </ReactMarkdown>
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
};

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
          className="max-w-full h-auto rounded-lg border border-neutral-200 bg-neutral-100 flex items-center
            justify-center"
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

const ProtectedAudio = memo(
  ({ objectName, getAuthHeaders }: { objectName: string; getAuthHeaders: () => HeadersInit }) => {
    const [audioUrl, setAudioUrl] = useState<string | null>(null);

    useEffect(() => {
      let objectUrl: string | null = null;
      const fetchAudio = async () => {
        try {
          const res = await fetch(`/api/files/${objectName}`, {
            headers: getAuthHeaders(),
          });
          if (!res.ok) {
            console.error(`Failed to fetch audio ${objectName}: ${res.statusText}`);
            return;
          }
          const blob = await res.blob();
          objectUrl = URL.createObjectURL(blob);
          setAudioUrl(objectUrl);
        } catch (error) {
          console.error(`Error loading audio ${objectName}:`, error);
        }
      };

      fetchAudio();

      return () => {
        if (objectUrl) {
          URL.revokeObjectURL(objectUrl);
        }
      };
    }, [objectName, getAuthHeaders]);

    if (!audioUrl) {
      return <div className="text-sm text-neutral-500">Loading audio...</div>;
    }

    return <audio controls src={audioUrl} className="w-full" />;
  },
);

ProtectedAudio.displayName = "ProtectedAudio";

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
            dark:hover:bg-neutral-700 opacity-0 group-hover:opacity-100 transition-all duration-200 z-10
            group-hover:scale-100 scale-95"
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
    prev.isThinking === next.isThinking &&
    prev.streamStarted === next.streamStarted &&
    prev.onAutoScrollChange === next.onAutoScrollChange &&
    prev.getAuthHeaders === next.getAuthHeaders &&
    prev.editingMessage === next.editingMessage &&
    prev.audioPlaybackState === next.audioPlaybackState,
);

function ChatAreaComponent(
  {
    messages,
    isLoading,
    isThinking,
    streamStarted,
    onAutoScrollChange,
    getAuthHeaders,
    activeChatId,
    editingMessage,
    setEditingMessage,
    onEditSave,
    onRegenerate,
    onPlayAudio,
    audioPlaybackState,
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
  const [editedFileParts, setEditedFileParts] = useState<MessagePart[]>([]);

  useEffect(() => {
    if (editingMessage) {
      const textPart = editingMessage.message.parts.find((p) => p.type === "text");
      const fileParts = editingMessage.message.parts.filter((p) => p.type === "file");
      setEditedText(textPart?.text || "");
      setEditedFileParts(fileParts);
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
    const el = containerRef.current;
    if (!el || !autoScrollEnabled || editingMessage) return;

    let animationFrameId: number;

    const smoothScrollStep = () => {
      if (!containerRef.current || !autoScrollEnabled) {
        cancelAnimationFrame(animationFrameId);
        return;
      }

      const currentScroll = el.scrollTop;
      const targetScroll = el.scrollHeight - el.clientHeight;
      const distance = targetScroll - currentScroll;

      if (distance < 1) {
        el.scrollTop = targetScroll;
        return;
      }

      const easingFactor = 0.15;
      const step = Math.max(1, distance * easingFactor);

      el.scrollTop += step;

      if (el.scrollTop < targetScroll) {
        animationFrameId = requestAnimationFrame(smoothScrollStep);
      }
    };

    animationFrameId = requestAnimationFrame(smoothScrollStep);

    return () => {
      cancelAnimationFrame(animationFrameId);
    };
  }, [messages, autoScrollEnabled, editingMessage]);

  useEffect(() => {
    if (editingMessage && editingTextareaRef.current) {
      const textarea = editingTextareaRef.current;
      textarea.style.height = "auto";
      textarea.style.height = `${textarea.scrollHeight}px`;
      textarea.focus();
      textarea.setSelectionRange(textarea.value.length, textarea.value.length);
    }
  }, [editingMessage, editedFileParts]);

  useEffect(() => {
    if (editingMessage && editingTextareaRef.current) {
      const textarea = editingTextareaRef.current;
      textarea.style.height = "auto";
      textarea.style.height = `${textarea.scrollHeight}px`;
    }
  }, [editedText, editingMessage]);

  const handleRemoveFilePart = (objectNameToRemove: string) => {
    setEditedFileParts((prev) => prev.filter((p) => p.objectName !== objectNameToRemove));
  };

  const handleSaveClick = (index: number) => {
    const finalParts: MessagePart[] = [...editedFileParts];
    if (editedText.trim()) {
      finalParts.push({ type: "text", text: editedText.trim() });
    }

    if (finalParts.length === 0) {
      return;
    }
    onEditSave(index, finalParts);
  };

  const handleEditKeyDown = (e: KeyboardEvent<HTMLTextAreaElement>, index: number) => {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      handleSaveClick(index);
    }
    if (e.key === "Escape") {
      setEditingMessage(null);
    }
  };

  const markdownComponents: Components = {
    pre: ({ className, children }) => (
      <CodeBlockWithCopy chatAreaContainerRef={containerRef} className={className}>
        {children}
      </CodeBlockWithCopy>
    ),
  };

  const getAudioButtonIcon = (messageId: number) => {
    if (audioPlaybackState.messageId === messageId) {
      if (audioPlaybackState.status === "loading") {
        return <ArrowPathIcon className="size-4 animate-spin" />;
      }
      if (audioPlaybackState.status === "playing") {
        return <StopIcon className="size-4 text-red-400" />;
      }
    }
    return <SpeakerWaveIcon className="size-4" />;
  };

  return (
    <div
      ref={containerRef}
      className="flex-1 overflow-y-auto px-4 py-2 focus:outline-none chat-scroll-gutter"
      tabIndex={-1}
    >
      <div className="mx-auto max-w-[52rem] p-4 space-y-4">
        {messages.map((msg, i) => {
          const isUserMessage = msg.role === "user";
          const isBeingEdited = editingMessage?.index === i;
          const hasText = msg.parts.some((p) => p.type === "text" && p.text && p.text.trim().length > 0);

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
                    {editedFileParts.length > 0 && (
                      <div className="flex flex-wrap gap-2 mb-3">
                        {editedFileParts.map((part) => (
                          <div
                            key={part.objectName}
                            className="bg-neutral-200 dark:bg-neutral-700 text-neutral-800 dark:text-neutral-200 px-3
                              py-1.5 rounded-full text-sm flex items-center gap-2"
                          >
                            <span>{part.fileName}</span>
                            <button
                              onClick={() => handleRemoveFilePart(part.objectName!)}
                              className="text-neutral-500 hover:text-red-500 dark:hover:text-red-400"
                            >
                              <XCircleIcon className="size-5" />
                            </button>
                          </div>
                        ))}
                      </div>
                    )}
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
                        onClick={() => handleSaveClick(i)}
                        disabled={!editedText.trim() && editedFileParts.length === 0}
                        className="cursor-pointer px-4 py-1.5 rounded-full text-sm font-medium transition-colors
                          bg-blue-600 text-white hover:bg-blue-700 disabled:opacity-50"
                      >
                        Save
                      </button>
                    </div>
                  </div>
                ) : (
                  <div className={`p-4 rounded-3xl ${isUserMessage ? "bg-neutral-100 dark:bg-neutral-800" : ""}`}>
                    {msg.role === "model" && msg.thoughtSummary && (
                      <motion.div
                        initial={{ opacity: 0, y: -10 }}
                        animate={{ opacity: 1, y: 0 }}
                        transition={{ duration: 0.3, ease: "easeOut" }}
                      >
                        <ThinkingSummary
                          summary={msg.thoughtSummary}
                          isStreaming={isThinking && i === messages.length - 1}
                        />
                      </motion.div>
                    )}
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
                              dark:prose-pre:border-neutral-600/30 prose-code:bg-neutral-200
                              dark:prose-code:bg-neutral-700 max-w-none transition-colors duration-300 ease-in-out
                              prose-code:before:content-none prose-code:after:content-none prose-code:py-0.5
                              prose-code:px-1"
                          >
                            {isUserMessage ? (
                              <LazyMarkdownRenderer content={part.text} components={markdownComponents} />
                            ) : (
                              <ReactMarkdown
                                remarkPlugins={[remarkMath, remarkGfm]}
                                rehypePlugins={[rehypeRaw, rehypeKatex, [rehypeHighlight, { detect: true }]]}
                                components={markdownComponents}
                              >
                                {part.text}
                              </ReactMarkdown>
                            )}
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
                        } else if (part.mimeType.startsWith("audio/")) {
                          return (
                            <div key={j} className="my-2">
                              <ProtectedAudio objectName={part.objectName} getAuthHeaders={getAuthHeaders} />
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
                                className="text-blue-600 hover:text-blue-800 dark:text-blue-400 dark:hover:text-blue-600
                                  break-all"
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
                        onClick={() => setEditingMessage({ index: i, message: msg })}
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
                  {hasText && (
                    <Tooltip
                      text={audioPlaybackState.messageId === msg.id ? audioPlaybackState.status : "Read message"}
                    >
                      <button
                        onClick={(e) => {
                          const messageContainer = (e.currentTarget as HTMLElement).closest(".group\\/message");
                          const selection = window.getSelection();
                          let textToPlay: string | undefined = undefined;

                          if (selection && selection.rangeCount > 0 && selection.toString().trim()) {
                            const range = selection.getRangeAt(0);
                            if (messageContainer && messageContainer.contains(range.commonAncestorContainer)) {
                              textToPlay = selection.toString();
                            }
                          }
                          onPlayAudio(msg, textToPlay);
                        }}
                        disabled={isLoading && audioPlaybackState.status !== "playing"}
                        className="cursor-pointer size-7 flex items-center justify-center rounded-full text-neutral-500
                          hover:bg-neutral-100 dark:hover:bg-neutral-800 transition-colors"
                      >
                        {getAudioButtonIcon(msg.id)}
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
