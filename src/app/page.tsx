"use client";

import Sidebar from "@/components/Sidebar";
import ChatArea, { ChatAreaHandle } from "@/components/ChatArea";
import ChatInput, { UploadedFileInfo } from "@/components/ChatInput";
import { useCallback, useEffect, useRef, useState } from "react";
import ModelSelector from "@/components/ModelSelector";
import ToggleApiKeyButton from "@/components/ToggleApiKeyButton";
import { Model } from "@google/genai";
import Tooltip from "@/components/Tooltip";
import Toast from "@/components/Toast";
import { ArrowDownIcon } from "@heroicons/react/24/solid";

const DEFAULT_MODEL_NAME = "models/gemini-2.5-flash-preview-04-17";

export interface MessagePart {
  type: "text" | "file";
  text?: string;
  fileName?: string;
  mimeType?: string;
  objectName?: string;
  size?: number;
}

export interface Message {
  role: "user" | "model";
  parts: MessagePart[];
}

export interface ChatListItem {
  id: number;
  title: string;
  lastModel: string;
}

function extractErrorMessage(err: unknown): string {
  return err instanceof Error ? err.message : String(err);
}

export default function Home() {
  const [messages, setMessages] = useState<Message[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [streamStarted, setStreamStarted] = useState(false);
  const [allChats, setAllChats] = useState<ChatListItem[]>([]);
  const [activeChatId, setActiveChatId] = useState<number | null>(null);
  const [controller, setController] = useState<AbortController | null>(null);
  const [models, setModels] = useState<Model[]>([]);
  const [selectedModel, setSelectedModel] = useState<Model | null>(null);
  const [keySelection, setKeySelection] = useState<"free" | "paid">("free");
  const [error, setError] = useState<string | null>(null);
  const [isAutoScrollActive, setIsAutoScrollActive] = useState(true);
  const chatAreaRef = useRef<ChatAreaHandle>(null);

  const handleAutoScrollChange = useCallback((isEnabled: boolean) => {
    setIsAutoScrollActive(isEnabled);
  }, []);

  const handleScrollToBottomClick = () => {
    chatAreaRef.current?.scrollToBottomAndEnableAutoscroll();
  };

  const handleModelChange = (model: Model) => {
    setSelectedModel(model);

    if (activeChatId !== null && messages.length > 0) {
      const modelName = model.name ?? "";
      setAllChats((prev) =>
        prev.map((c) =>
          c.id === activeChatId ? { ...c, lastModel: modelName } : c,
        ),
      );
      fetch(`/api/chats/${activeChatId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ lastModel: modelName }),
      }).catch((err) => setError(err.message));
    }
  };

  useEffect(() => {
    fetch(`/api/models?keySelection=${keySelection}`)
      .then((res) => res.json())
      .then((list: Model[]) => {
        setModels(list);
        if (list.length === 0) {
          setSelectedModel(null);
          return;
        }
        setSelectedModel((current) => {
          if (current) {
            const stillExists = list.find((m) => m.name === current.name);
            if (stillExists) return stillExists;
          }
          const defaultModel = list.find((m) => m.name === DEFAULT_MODEL_NAME);
          if (defaultModel) return defaultModel;
          return list[0] || null;
        });
      })
      .catch((err) => setError(err.message));
  }, [keySelection]);

  const handleRenameChat = async (chatId: number, newTitle: string) => {
    try {
      await fetch(`/api/chats/${chatId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ title: newTitle }),
      });
    } catch (err: unknown) {
      const message = extractErrorMessage(err);
      setError(message);
      return;
    }
    setAllChats((prev) =>
      prev.map((c) => (c.id === chatId ? { ...c, title: newTitle } : c)),
    );
  };

  const handleDeleteChat = async (chatId: number) => {
    try {
      await fetch(`/api/chats/${chatId}`, { method: "DELETE" });
    } catch (err: unknown) {
      const message = extractErrorMessage(err);
      setError(message);
      return;
    }

    setAllChats((prev) => prev.filter((c) => c.id !== chatId));
    if (activeChatId === chatId) {
      setActiveChatId(null);
      setMessages([]);
    }
  };

  useEffect(() => {
    fetch("/api/chats")
      .then((res) => res.json())
      .then((list: ChatListItem[]) => setAllChats(list))
      .catch((err) => setError(err.message));
  }, []);

  const handleNewChat = useCallback(() => {
    setActiveChatId(null);
    setMessages([]);
  }, []);

  const loadChat = useCallback(async (chatId: number) => {
    setIsLoading(true);
    try {
      const res = await fetch(`/api/chats/${chatId}`);
      const data: Message[] = await res.json();
      setMessages(data);
    } catch (err: unknown) {
      const message = extractErrorMessage(err);
      setError(message);
      return;
    } finally {
      setIsLoading(false);
    }
  }, []);

  const handleSelectChat = useCallback((chatId: number) => {
    setActiveChatId(chatId);
  }, []);

  useEffect(() => {
    if (activeChatId === null) return;
    const chat = allChats.find((c) => c.id === activeChatId);
    if (chat?.lastModel) {
      const mi = models.find((m) => m.name === chat.lastModel);
      if (mi) setSelectedModel(mi);
    }
  }, [activeChatId, allChats, models]);

  useEffect(() => {
    if (activeChatId === null) {
      setMessages([]);
      return;
    }

    const chat = allChats.find((c) => c.id === activeChatId);
    if (chat?.lastModel) {
      const modelForThisChat = models.find((m) => m.name === chat.lastModel);
      if (modelForThisChat && selectedModel?.name !== modelForThisChat.name) {
        setSelectedModel(modelForThisChat);
      }
    }

    setIsLoading(true);
    loadChat(activeChatId).finally(() => {
      setIsLoading(false);
    });
  }, [activeChatId, allChats, models, loadChat, selectedModel]);

  const handleCancel = () => {
    controller?.abort();
    setIsLoading(false);
  };

  const handleSendMessage = async (
    inputText: string,
    uploadedFiles: UploadedFileInfo[],
  ) => {
    if (!inputText.trim() && uploadedFiles.length === 0) return;
    if (!selectedModel) {
      setError(
        "No model selected or available. Please check model list or API key.",
      );
      return;
    }

    let sessionId = activeChatId;
    let isNew = false;
    if (!sessionId) {
      const res = await fetch("/api/chats", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ title: `Chat ${allChats.length + 1}` }),
      });
      const { id, title } = await res.json();
      const modelName = selectedModel.name ?? "";
      setAllChats((prev) => [...prev, { id, title, lastModel: modelName }]);
      sessionId = id;
      isNew = true;
    }

    const newUserMessageParts: MessagePart[] = [];
    if (inputText.trim()) {
      newUserMessageParts.push({ type: "text", text: inputText.trim() });
    }

    uploadedFiles.forEach((file) => {
      newUserMessageParts.push({
        type: "file",
        fileName: file.fileName,
        mimeType: file.mimeType,
        objectName: file.objectName,
        size: file.size,
      });
    });

    const newUserMessage: Message = {
      role: "user",
      parts: newUserMessageParts,
    };
    setMessages((prev) => [...prev, newUserMessage]);
    setIsLoading(true);
    setStreamStarted(false);

    const historyForAPI = messages.map((msg) => ({
      role: msg.role,
      parts: msg.parts,
    }));

    let modelMessageIndex = -1;
    const placeholderMessage: Message = {
      role: "model",
      parts: [{ type: "text", text: "" }],
    };
    setMessages((prev) => {
      modelMessageIndex = prev.length;
      return [...prev, placeholderMessage];
    });

    const ctrl = new AbortController();
    setController(ctrl);

    try {
      const res = await fetch("/api/chat", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          history: historyForAPI,
          messageParts: newUserMessageParts,
          chatSessionId: sessionId,
          model: selectedModel.name,
          keySelection,
        }),
        signal: ctrl.signal,
      });

      if (!res.ok || !res.body) {
        let errorData = {
          error: `API request failed with status ${res.status}`,
        };
        if (res.body) {
          try {
            errorData = await res.json();
          } catch {}
        }
        throw new Error(
          errorData.error || `API request failed with status ${res.status}`,
        );
      }

      const reader = res.body.pipeThrough(new TextDecoderStream()).getReader();
      let accumulatedResponse = "";
      while (true) {
        const { value, done } = await reader.read();
        if (done) break;
        if (!streamStarted) setStreamStarted(true);
        accumulatedResponse += value;
        setMessages((prev) =>
          prev.map((msg, idx) =>
            idx === modelMessageIndex
              ? { ...msg, parts: [{ type: "text", text: accumulatedResponse }] }
              : msg,
          ),
        );
      }
    } catch (error: unknown) {
      setMessages((prev) => prev.filter((_, idx) => idx !== modelMessageIndex));
      const msg =
        error instanceof DOMException && error.name === "AbortError"
          ? "Response cancelled."
          : error instanceof Error
            ? error.message
            : "An unexpected error occurred.";
      setError(msg);
    } finally {
      setIsLoading(false);
      setController(null);
      if (isNew) setActiveChatId(sessionId);
    }
  };

  const handleDeleteAllChats = async () => {
    try {
      await fetch("/api/chats", { method: "DELETE" });
    } catch (err: unknown) {
      const message = extractErrorMessage(err);
      setError(message);
      return;
    }

    setAllChats([]);
    setActiveChatId(null);
    setMessages([]);
  };

  return (
    <div className="flex h-screen overflow-hidden">
      {error && <Toast message={error} onClose={() => setError(null)} />}
      <Sidebar
        chats={allChats}
        activeChatId={activeChatId}
        onNewChat={handleNewChat}
        onSelectChat={handleSelectChat}
        onRenameChat={handleRenameChat}
        onDeleteChat={handleDeleteChat}
        onDeleteAllChats={handleDeleteAllChats}
      />
      <main className="flex-1 flex flex-col bg-background text-foreground relative">
        <div className="flex-none sticky top-0 z-10 px-4 py-2 border-b border-gray-100 flex items-center justify-between">
          <ModelSelector
            models={models}
            selected={selectedModel}
            onChangeAction={handleModelChange}
          />

          <Tooltip text="Switch between free and paid API key">
            <ToggleApiKeyButton
              selectedKey={keySelection}
              onToggleAction={() =>
                setKeySelection((prev) => (prev === "free" ? "paid" : "free"))
              }
            />
          </Tooltip>
        </div>

        <ChatArea
          ref={chatAreaRef}
          messages={messages}
          isLoading={isLoading}
          streamStarted={streamStarted}
          onAutoScrollChange={handleAutoScrollChange}
        />

        {/* pinned input */}
        <div className="flex-none p-4 bg-background">
          <div className="mx-auto max-w-[52rem]">
            {/* Floating Scroll to Bottom Button */}
            <div className="relative h-0">
              <div
                className={`absolute bottom-6 left-1/2 -translate-x-1/2 z-20 transition-opacity duration-300 ease-in-out ${isAutoScrollActive ? "opacity-0 pointer-events-none" : "opacity-100"} `}
              >
                <button
                  onClick={handleScrollToBottomClick}
                  className="cursor-pointer h-9 w-9 flex items-center justify-center rounded-full text-sm font-medium transition-colors duration-150 bg-white text-primary border border-gray-300 hover:bg-gray-100 shadow-lg"
                >
                  <ArrowDownIcon className="h-5 w-5" />
                </button>
              </div>
            </div>

            <ChatInput
              onSendMessageAction={handleSendMessage}
              onCancelAction={handleCancel}
              isLoading={isLoading}
            />
          </div>
        </div>
      </main>
    </div>
  );
}
