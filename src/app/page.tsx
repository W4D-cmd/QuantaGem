"use client";

import Sidebar from "@/components/Sidebar";
import ChatArea, { ChatAreaHandle } from "@/components/ChatArea";
import ChatInput, {
  ChatInputHandle,
  UploadedFileInfo,
} from "@/components/ChatInput";
import { useCallback, useEffect, useRef, useState } from "react";
import ModelSelector from "@/components/ModelSelector";
import ToggleApiKeyButton from "@/components/ToggleApiKeyButton";
import { Model } from "@google/genai";
import Tooltip from "@/components/Tooltip";
import Toast from "@/components/Toast";
import DropdownMenu, { DropdownItem } from "@/components/DropdownMenu";
import SettingsModal from "@/components/SettingsModal";
import {
  ArrowDownIcon,
  Cog6ToothIcon,
  ArrowRightStartOnRectangleIcon,
} from "@heroicons/react/24/outline";
import { EllipsisVerticalIcon } from "@heroicons/react/20/solid";
import { useRouter } from "next/navigation";

const DEFAULT_MODEL_NAME = "models/gemini-2.5-flash-preview-05-20";

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
  sources?: Array<{ title: string; uri: string }>;
}

export interface ChatListItem {
  id: number;
  title: string;
  lastModel: string;
  systemPrompt: string;
  keySelection: "free" | "paid";
}

function extractErrorMessage(err: unknown): string {
  return err instanceof Error ? err.message : String(err);
}

export default function Home() {
  const router = useRouter();
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
  const [isSettingsModalOpen, setIsSettingsModalOpen] = useState(false);
  const [editingChatId, setEditingChatId] = useState<number | null>(null);
  const [editingPromptInitialValue, setEditingPromptInitialValue] = useState<
    string | null
  >(null);
  const [isThreeDotMenuOpen, setIsThreeDotMenuOpen] = useState(false);
  const [isSearchActive, setIsSearchActive] = useState(false);
  const [userEmail, setUserEmail] = useState<string | null>(null);
  const threeDotMenuButtonRef = useRef<HTMLButtonElement | null>(null);
  const chatAreaRef = useRef<ChatAreaHandle>(null);
  const chatInputRef = useRef<ChatInputHandle>(null);
  const prevActiveChatIdRef = useRef<number | null>(null);

  useEffect(() => {
    const fetchUser = async () => {
      try {
        const res = await fetch("/api/user");
        if (res.status === 401) {
          router.replace("/login");
          return;
        }
        if (!res.ok) {
          throw new Error("Failed to fetch user information.");
        }
        const data = await res.json();
        setUserEmail(data.email);
      } catch (err: unknown) {
        setError(extractErrorMessage(err));
        router.replace("/login");
      }
    };
    fetchUser();
  }, [router]);

  useEffect(() => {
    const handleGlobalKeyDown = (event: KeyboardEvent) => {
      if (isLoading) return;

      const activeElement = document.activeElement as HTMLElement;
      if (activeElement) {
        const tagName = activeElement.tagName;
        if (
          tagName === "INPUT" ||
          tagName === "TEXTAREA" ||
          activeElement.isContentEditable
        ) {
          return;
        }
      }

      if (event.metaKey || event.ctrlKey || event.altKey) {
        return;
      }

      if (event.key.length === 1) {
        chatInputRef.current?.focusInput();
      }
    };

    document.addEventListener("keydown", handleGlobalKeyDown);
    return () => {
      document.removeEventListener("keydown", handleGlobalKeyDown);
    };
  }, [isLoading]);

  const handleAutoScrollChange = useCallback((isEnabled: boolean) => {
    setIsAutoScrollActive(isEnabled);
  }, []);

  const fetchAllChats = useCallback(async () => {
    try {
      const res = await fetch("/api/chats");
      if (!res.ok) throw new Error("Failed to fetch chats.");
      const list: ChatListItem[] = await res.json();
      setAllChats(list);
    } catch (err: unknown) {
      setError(extractErrorMessage(err));
    }
  }, []);

  useEffect(() => {
    if (userEmail) {
      fetchAllChats();
    }
  }, [fetchAllChats, userEmail]);

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
      }).catch((err) => setError(extractErrorMessage(err)));
    }
  };

  const handleKeySelectionToggle = useCallback(() => {
    setKeySelection((prev) => {
      const newSelection = prev === "free" ? "paid" : "free";

      if (activeChatId !== null) {
        setAllChats((prevChats) =>
          prevChats.map((c) =>
            c.id === activeChatId ? { ...c, keySelection: newSelection } : c,
          ),
        );
        fetch(`/api/chats/${activeChatId}`, {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ keySelection: newSelection }),
        })
          .then(() => fetchAllChats())
          .catch((err) => setError(extractErrorMessage(err)));
      }
      return newSelection;
    });
  }, [activeChatId, fetchAllChats]);

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
      .catch((err) => setError(extractErrorMessage(err)));
  }, [keySelection]);

  const handleRenameChat = async (chatId: number, newTitle: string) => {
    try {
      const res = await fetch(`/api/chats/${chatId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ title: newTitle }),
      });
      if (!res.ok) {
        const errorData = await res.json();
        throw new Error(
          errorData.error || `Failed to rename chat: ${res.statusText}`,
        );
      }
      await fetchAllChats();
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
      const res = await fetch(`/api/chats/${chatId}`, { method: "DELETE" });
      if (!res.ok) {
        const errorData = await res.json();
        throw new Error(
          errorData.error || `Failed to delete chat: ${res.statusText}`,
        );
      }
    } catch (err: unknown) {
      const message = extractErrorMessage(err);
      setError(message);
      return;
    }

    setAllChats((prev) => prev.filter((c) => c.id !== chatId));
    if (activeChatId === chatId) {
      setActiveChatId(null);
      setMessages([]);
      setEditingPromptInitialValue(null);
      setKeySelection("free");
    }
  };

  const handleNewChat = useCallback(() => {
    setActiveChatId(null);
    setMessages([]);
    setEditingPromptInitialValue(null);
    setKeySelection("free");
  }, []);

  const loadChat = useCallback(async (chatId: number) => {
    setIsLoading(true);
    try {
      const res = await fetch(`/api/chats/${chatId}`);
      if (!res.ok) {
        const errorData = await res.json();
        throw new Error(
          errorData.error || `Failed to load chat: ${res.statusText}`,
        );
      }
      const data: {
        messages: Message[];
        systemPrompt: string;
        keySelection: "free" | "paid";
      } = await res.json();
      setMessages(data.messages);
      setEditingPromptInitialValue(data.systemPrompt);
      setKeySelection(data.keySelection);
    } catch (err: unknown) {
      const message = extractErrorMessage(err);
      setError(message);
    } finally {
      setIsLoading(false);
    }
  }, []);

  const handleSelectChat = useCallback((chatId: number) => {
    setActiveChatId(chatId);
  }, []);

  useEffect(() => {
    if (activeChatId === null) {
      if (!isLoading) {
        setMessages([]);
        setEditingPromptInitialValue(null);
      }

      const currentSelectedModelStillValid = models.find(
        (m) => m.name === selectedModel?.name,
      );
      if (!currentSelectedModelStillValid && models.length > 0) {
        const defaultModel =
          models.find((m) => m.name === DEFAULT_MODEL_NAME) || models[0];
        if (defaultModel && selectedModel?.name !== defaultModel.name) {
          setSelectedModel(defaultModel);
        }
      }
      prevActiveChatIdRef.current = null;
      return;
    }

    const chat = allChats.find((c) => c.id === activeChatId);

    if (chat?.lastModel) {
      const modelForThisChat = models.find((m) => m.name === chat.lastModel);
      if (modelForThisChat && selectedModel?.name !== modelForThisChat.name) {
        setSelectedModel(modelForThisChat);
      }
    } else if (chat && !chat.lastModel) {
      if (!selectedModel && models.length > 0) {
        const defaultModel =
          models.find((m) => m.name === DEFAULT_MODEL_NAME) || models[0];
        if (defaultModel) {
          setSelectedModel(defaultModel);
        }
      }
    }

    if (chat?.keySelection) {
      setKeySelection(chat.keySelection);
    } else {
      setKeySelection("free");
    }

    if (activeChatId !== prevActiveChatIdRef.current) {
      setIsLoading(true);
      loadChat(activeChatId).finally(() => {
        setIsLoading(false);
      });
    }

    prevActiveChatIdRef.current = activeChatId;
  }, [activeChatId, allChats, models, selectedModel, loadChat, isLoading]);

  const handleCancel = () => {
    controller?.abort();
    setIsLoading(false);
  };

  const handleSendMessage = async (
    inputText: string,
    uploadedFiles: UploadedFileInfo[],
    sendWithSearch: boolean,
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
      try {
        const res = await fetch("/api/chats", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            title: `Chat ${allChats.length + 1}`,
            keySelection,
          }),
        });
        if (!res.ok) {
          const errorData = await res.json();
          throw new Error(
            errorData.error ||
              `Failed to create new chat session: ${res.statusText}`,
          );
        }
        const { id } = await res.json();
        sessionId = id;
        isNew = true;
      } catch (err) {
        setError(extractErrorMessage(err));
        setIsLoading(false);
        return;
      }
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
      sources: [],
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
          isSearchActive: sendWithSearch,
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
      let isFirstChunk = true;
      let textAccumulator = "";
      const currentSources: Array<{ title: string; uri: string }> = [];

      while (true) {
        const { value, done } = await reader.read();
        if (done) break;

        if (isFirstChunk) {
          setStreamStarted(true);
          isFirstChunk = false;
        }

        const lines = value.split("\n").filter((line) => line.trim() !== "");

        setMessages((prev) => {
          const updatedMessages = [...prev];
          const messageToUpdate = updatedMessages[modelMessageIndex];

          for (const line of lines) {
            try {
              const parsedChunk = JSON.parse(line);
              if (parsedChunk.type === "text") {
                textAccumulator += parsedChunk.value;
              } else if (parsedChunk.type === "grounding") {
                if (parsedChunk.sources && Array.isArray(parsedChunk.sources)) {
                  parsedChunk.sources.forEach(
                    (s: { title: string; uri: string }) => {
                      const exists = currentSources.some(
                        (existing) => existing.uri === s.uri,
                      );
                      if (!exists) {
                        currentSources.push(s);
                      }
                    },
                  );
                }
              }
            } catch (jsonError) {
              console.error(
                "Failed to parse JSONL chunk:",
                jsonError,
                "Raw line:",
                line,
              );
              textAccumulator += line;
            }
          }

          messageToUpdate.parts = [{ type: "text", text: textAccumulator }];
          messageToUpdate.sources = [...currentSources];

          return updatedMessages;
        });
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
      await fetchAllChats();
    }
  };

  const handleDeleteAllChats = async () => {
    try {
      const res = await fetch("/api/chats", { method: "DELETE" });
      if (!res.ok) {
        const errorData = await res.json();
        throw new Error(
          errorData.error || `Failed to delete all chats: ${res.statusText}`,
        );
      }
    } catch (err: unknown) {
      const message = extractErrorMessage(err);
      setError(message);
      return;
    }

    setAllChats([]);
    setActiveChatId(null);
    setMessages([]);
    setEditingPromptInitialValue(null);
    setKeySelection("free");
  };

  const openGlobalSettingsModal = () => {
    setEditingChatId(null);
    setIsSettingsModalOpen(true);
    setIsThreeDotMenuOpen(false);
  };

  const openChatSettingsModal = (chatId: number, initialPrompt: string) => {
    setEditingChatId(chatId);
    setEditingPromptInitialValue(initialPrompt);
    setIsSettingsModalOpen(true);
  };

  const closeSettingsModal = () => {
    setIsSettingsModalOpen(false);
    setEditingChatId(null);
    setEditingPromptInitialValue(null);
  };

  const handleSettingsSaved = useCallback(async () => {
    await fetchAllChats();
    if (activeChatId !== null) {
      await loadChat(activeChatId);
    }
    closeSettingsModal();
  }, [activeChatId, fetchAllChats, loadChat]);

  const toggleThreeDotMenu = () => {
    setIsThreeDotMenuOpen((prev) => !prev);
  };

  const handleLogout = async () => {
    try {
      const res = await fetch("/api/auth/logout", { method: "POST" });
      if (!res.ok) {
        throw new Error("Logout failed.");
      }
      router.push("/login");
    } catch (err: unknown) {
      setError(extractErrorMessage(err));
    }
  };

  const threeDotMenuItems: DropdownItem[] = [
    {
      id: "settings",
      label: "Settings",
      icon: <Cog6ToothIcon className="h-4 w-4" />,
      onClick: openGlobalSettingsModal,
    },
    {
      id: "logout",
      label: "Logout",
      icon: <ArrowRightStartOnRectangleIcon className="h-4 w-4 text-red-500" />,
      onClick: handleLogout,
      className: "text-red-500 hover:bg-red-100",
    },
  ];

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
        onOpenChatSettings={openChatSettingsModal}
        userEmail={userEmail}
      />
      <main className="flex-1 flex flex-col bg-background text-foreground relative">
        <div className="flex-none sticky top-0 z-10 px-4 py-2 border-b border-gray-100 flex items-center justify-between">
          <ModelSelector
            models={models}
            selected={selectedModel}
            onChangeAction={handleModelChange}
          />

          <div className="flex items-center">
            <Tooltip text="Switch between free and paid API key">
              <ToggleApiKeyButton
                selectedKey={keySelection}
                onToggleAction={handleKeySelectionToggle}
              />
            </Tooltip>

            <div className="relative ms-2">
              <Tooltip text="More options">
                <button
                  ref={threeDotMenuButtonRef}
                  onClick={toggleThreeDotMenu}
                  className="cursor-pointer h-9 flex items-center justify-center px-2 rounded-full text-sm font-medium transition-colors duration-150 bg-white text-primary hover:bg-gray-100"
                  aria-label="More options"
                >
                  <EllipsisVerticalIcon className="h-5 w-5" />
                </button>
              </Tooltip>

              <DropdownMenu
                anchorRef={threeDotMenuButtonRef}
                open={isThreeDotMenuOpen}
                onCloseAction={() => setIsThreeDotMenuOpen(false)}
                items={threeDotMenuItems}
                position="right"
                extraWidthPx={10}
              />
            </div>
          </div>
        </div>

        <ChatArea
          ref={chatAreaRef}
          messages={messages}
          isLoading={isLoading}
          streamStarted={streamStarted}
          onAutoScrollChange={handleAutoScrollChange}
        />

        <div className="flex-none p-4 bg-background">
          <div className="mx-auto max-w-[52rem]">
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
              ref={chatInputRef}
              onSendMessageAction={handleSendMessage}
              onCancelAction={handleCancel}
              isLoading={isLoading}
              isSearchActive={isSearchActive}
              onToggleSearch={setIsSearchActive}
            />
          </div>
        </div>
      </main>

      <SettingsModal
        isOpen={isSettingsModalOpen}
        onClose={closeSettingsModal}
        chatId={editingChatId}
        initialSystemPromptValue={editingPromptInitialValue}
        onSettingsSaved={handleSettingsSaved}
      />
    </div>
  );
}
