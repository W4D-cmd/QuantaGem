"use client";

import Sidebar from "@/components/Sidebar";
import ChatArea, { ChatAreaHandle } from "@/components/ChatArea";
import ChatInput, { ChatInputHandle, UploadedFileInfo } from "@/components/ChatInput";
import { useCallback, useEffect, useRef, useState } from "react";
import ModelSelector from "@/components/ModelSelector";
import ToggleApiKeyButton from "@/components/ToggleApiKeyButton";
import { Model } from "@google/genai";
import Tooltip from "@/components/Tooltip";
import Toast from "@/components/Toast";
import DropdownMenu, { DropdownItem } from "@/components/DropdownMenu";
import SettingsModal from "@/components/SettingsModal";
import { useRouter } from "next/navigation";
import {
  ArrowDownIcon,
  ArrowRightStartOnRectangleIcon,
  Cog6ToothIcon,
  EllipsisVerticalIcon,
} from "@heroicons/react/24/outline";
import ThemeToggleButton from "@/components/ThemeToggleButton";
import ProjectManagement from "@/components/ProjectManagement";

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
  projectId: number | null;
}

export interface ProjectListItem {
  id: number;
  title: string;
  systemPrompt: string;
  createdAt: string;
  updatedAt: string;
}

export interface ProjectFile {
  id: number;
  objectName: string;
  fileName: string;
  mimeType: string;
  size: number;
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
  const [editingPromptInitialValue, setEditingPromptInitialValue] = useState<string | null>(null);
  const [isThreeDotMenuOpen, setIsThreeDotMenuOpen] = useState(false);
  const [isSearchActive, setIsSearchActive] = useState(false);
  const [userEmail, setUserEmail] = useState<string | null>(null);
  const [allProjects, setAllProjects] = useState<ProjectListItem[]>([]);
  const [displayingProjectManagementId, setDisplayingProjectManagementId] = useState<number | null>(null);
  const [currentChatProjectId, setCurrentChatProjectId] = useState<number | null>(null);
  const [isNewChatJustCreated, setIsNewChatJustCreated] = useState(false);
  const [expandedProjects, setExpandedProjects] = useState<Set<number>>(new Set());
  const threeDotMenuButtonRef = useRef<HTMLButtonElement | null>(null);
  const chatAreaRef = useRef<ChatAreaHandle>(null);
  const chatInputRef = useRef<ChatInputHandle>(null);
  const prevActiveChatIdRef = useRef<number | null>(null);
  const prevDisplayingProjectManagementIdRef = useRef<number | null>(null);

  const getAuthHeaders = useCallback((): HeadersInit => {
    const token = localStorage.getItem("__session");
    return token ? { Authorization: `Bearer ${token}` } : {};
  }, []);

  const fetchAllProjects = useCallback(async () => {
    try {
      const res = await fetch("/api/projects", { headers: getAuthHeaders() });
      if (res.status === 401) {
        router.replace("/login");
        return;
      }
      if (!res.ok) throw new Error("Failed to fetch projects.");
      const list: ProjectListItem[] = await res.json();
      setAllProjects(list);
    } catch (err: unknown) {
      setError(extractErrorMessage(err));
    }
  }, [getAuthHeaders, router]);

  useEffect(() => {
    const fetchUser = async () => {
      try {
        const res = await fetch("/api/user", { headers: getAuthHeaders() });
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
  }, [router, getAuthHeaders]);

  useEffect(() => {
    const handleGlobalKeyDown = (event: KeyboardEvent) => {
      if (isLoading || displayingProjectManagementId !== null) return;

      const activeElement = document.activeElement as HTMLElement;
      if (activeElement) {
        const tagName = activeElement.tagName;
        if (tagName === "INPUT" || tagName === "TEXTAREA" || activeElement.isContentEditable) {
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
  }, [isLoading, displayingProjectManagementId]);

  const handleAutoScrollChange = useCallback((isEnabled: boolean) => {
    setIsAutoScrollActive(isEnabled);
  }, []);

  const fetchAllChats = useCallback(async () => {
    try {
      const res = await fetch("/api/chats", { headers: getAuthHeaders() });
      if (res.status === 401) {
        router.replace("/login");
        return;
      }
      if (!res.ok) throw new Error("Failed to fetch chats.");
      const list: ChatListItem[] = await res.json();
      setAllChats(list);
    } catch (err: unknown) {
      setError(extractErrorMessage(err));
    }
  }, [getAuthHeaders, router]);

  useEffect(() => {
    if (userEmail) {
      fetchAllChats();
      fetchAllProjects();
    }
  }, [fetchAllChats, fetchAllProjects, userEmail]);

  const handleScrollToBottomClick = () => {
    chatAreaRef.current?.scrollToBottomAndEnableAutoscroll();
  };

  const handleModelChange = (model: Model) => {
    setSelectedModel(model);

    if (activeChatId !== null && messages.length > 0) {
      const modelName = model.name ?? "";
      setAllChats((prev) => prev.map((c) => (c.id === activeChatId ? { ...c, lastModel: modelName } : c)));
      fetch(`/api/chats/${activeChatId}`, {
        method: "PATCH",
        headers: {
          "Content-Type": "application/json",
          ...getAuthHeaders(),
        },
        body: JSON.stringify({ lastModel: modelName }),
      }).catch((err) => setError(extractErrorMessage(err)));
    }
  };

  const handleKeySelectionToggle = useCallback(() => {
    setKeySelection((prev) => {
      const newSelection = prev === "free" ? "paid" : "free";

      if (activeChatId !== null) {
        setAllChats((prevChats) =>
          prevChats.map((c) => (c.id === activeChatId ? { ...c, keySelection: newSelection } : c)),
        );
        fetch(`/api/chats/${activeChatId}`, {
          method: "PATCH",
          headers: {
            "Content-Type": "application/json",
            ...getAuthHeaders(),
          },
          body: JSON.stringify({ keySelection: newSelection }),
        })
          .then(() => fetchAllChats())
          .catch((err) => setError(extractErrorMessage(err)));
      }
      return newSelection;
    });
  }, [activeChatId, fetchAllChats, getAuthHeaders]);

  useEffect(() => {
    if (!userEmail) return;

    fetch(`/api/models?keySelection=${keySelection}`, {
      headers: getAuthHeaders(),
    })
      .then(async (res) => {
        if (res.status === 401) {
          router.replace("/login");
          throw new Error("Unauthorized to fetch models.");
        }
        if (!res.ok) {
          const errorData = await res.json().catch(() => ({
            error: `Failed to fetch models: HTTP ${res.status}`,
          }));
          throw new Error(errorData.error || `Failed to fetch models: HTTP ${res.status}`);
        }
        return res.json();
      })
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
      .catch((err) => {
        setError(extractErrorMessage(err));
        if (err.message.includes("Unauthorized")) {
        } else {
          setModels([]);
          setSelectedModel(null);
        }
      });
  }, [keySelection, getAuthHeaders, router, userEmail]);

  const handleRenameChat = async (chatId: number, newTitle: string) => {
    try {
      const res = await fetch(`/api/chats/${chatId}`, {
        method: "PATCH",
        headers: {
          "Content-Type": "application/json",
          ...getAuthHeaders(),
        },
        body: JSON.stringify({ title: newTitle }),
      });
      if (res.status === 401) {
        router.replace("/login");
        return;
      }
      if (!res.ok) {
        const errorData = await res.json();
        throw new Error(errorData.error || `Failed to rename chat: ${res.statusText}`);
      }
      await fetchAllChats();
    } catch (err: unknown) {
      const message = extractErrorMessage(err);
      setError(message);
      return;
    }
    setAllChats((prev) => prev.map((c) => (c.id === chatId ? { ...c, title: newTitle } : c)));
  };

  const handleDeleteChat = async (chatId: number) => {
    try {
      const res = await fetch(`/api/chats/${chatId}`, {
        method: "DELETE",
        headers: getAuthHeaders(),
      });
      if (res.status === 401) {
        router.replace("/login");
        return;
      }
      if (!res.ok) {
        const errorData = await res.json();
        throw new Error(errorData.error || `Failed to delete chat: ${res.statusText}`);
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

  const createChat = useCallback(
    async (title: string, keySelection: "free" | "paid", projectId: number | null) => {
      try {
        const res = await fetch("/api/chats", {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            ...getAuthHeaders(),
          },
          body: JSON.stringify({
            title: title,
            keySelection,
            projectId,
          }),
        });
        if (res.status === 401) {
          router.replace("/login");
          return null;
        }
        if (!res.ok) {
          const errorData = await res.json();
          throw new Error(errorData.error || `Failed to create new chat session: ${res.statusText}`);
        }
        const newChat: ChatListItem = await res.json();
        setAllChats((prev) => [newChat, ...prev]);
        setActiveChatId(newChat.id);
        setIsNewChatJustCreated(true);
        return newChat.id;
      } catch (err) {
        setError(extractErrorMessage(err));
        return null;
      }
    },
    [getAuthHeaders, router, setAllChats, setActiveChatId, setError, setIsNewChatJustCreated],
  );

  const handleNewChat = useCallback(
    async (projectId: number | null = null) => {
      setMessages([]);
      setEditingPromptInitialValue(null);
      setKeySelection("free");
      setCurrentChatProjectId(projectId);

      if (projectId !== null) {
        const newTitle = `Chat ${allChats.filter((chat) => chat.projectId === projectId).length + 1}`;
        const newChatId = await createChat(newTitle, keySelection, projectId);

        if (newChatId) {
          setActiveChatId(newChatId);
          setDisplayingProjectManagementId(null);

          setExpandedProjects((prev: Set<number>) => {
            const newSet = new Set(prev);
            newSet.add(projectId);
            return newSet;
          });
        } else {
          setActiveChatId(null);
          setDisplayingProjectManagementId(projectId);
        }
      } else {
        setActiveChatId(null);
        setDisplayingProjectManagementId(null);
      }
    },
    [allChats, keySelection, createChat],
  );

  const loadChat = useCallback(
    async (chatId: number) => {
      setIsLoading(true);
      try {
        const res = await fetch(`/api/chats/${chatId}`, {
          headers: getAuthHeaders(),
        });
        if (res.status === 401) {
          router.replace("/login");
          return;
        }
        if (!res.ok) {
          const errorData = await res.json();
          throw new Error(errorData.error || `Failed to load chat: ${res.statusText}`);
        }
        const data: {
          messages: Message[];
          systemPrompt: string;
          keySelection: "free" | "paid";
          projectId: number | null;
        } = await res.json();
        setMessages(data.messages);
        setEditingPromptInitialValue(data.systemPrompt);
        setKeySelection(data.keySelection);
        setCurrentChatProjectId(data.projectId);
      } catch (err: unknown) {
        const message = extractErrorMessage(err);
        setError(message);
      } finally {
        setIsLoading(false);
      }
    },
    [getAuthHeaders, router],
  );

  const handleSelectChat = useCallback((chatId: number) => {
    setActiveChatId(chatId);
    setDisplayingProjectManagementId(null);
  }, []);

  const handleSelectProject = useCallback((projectId: number) => {
    setActiveChatId(null);
    setDisplayingProjectManagementId(projectId);
    setCurrentChatProjectId(null);
    setMessages([]);
    setEditingPromptInitialValue(null);
    setKeySelection("free");
  }, []);

  const handleNewProject = useCallback(async () => {
    setActiveChatId(null);
    setMessages([]);
    setEditingPromptInitialValue(null);
    setKeySelection("free");
    setIsLoading(true);
    try {
      const existingProjectCount = allProjects.length;
      const res = await fetch("/api/projects", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          ...getAuthHeaders(),
        },
        body: JSON.stringify({ title: `Project ${existingProjectCount + 1}` }),
      });
      if (res.status === 401) {
        router.replace("/login");
        return;
      }
      if (!res.ok) {
        const errorData = await res.json();
        throw new Error(errorData.error || `Failed to create new project: ${res.statusText}`);
      }
      const newProject: ProjectListItem = await res.json();
      setAllProjects((prev) => [newProject, ...prev]);
      setDisplayingProjectManagementId(newProject.id);
      setCurrentChatProjectId(null);
    } catch (err) {
      setError(extractErrorMessage(err));
    } finally {
      setIsLoading(false);
    }
  }, [allProjects, getAuthHeaders, router]);

  const handleRenameProject = async (projectId: number, newTitle: string) => {
    try {
      const res = await fetch(`/api/projects/${projectId}`, {
        method: "PATCH",
        headers: {
          "Content-Type": "application/json",
          ...getAuthHeaders(),
        },
        body: JSON.stringify({ title: newTitle }),
      });
      if (res.status === 401) {
        router.replace("/login");
        return;
      }
      if (!res.ok) {
        const errorData = await res.json();
        throw new Error(errorData.error || `Failed to rename project: ${res.statusText}`);
      }
      await fetchAllProjects();
    } catch (err: unknown) {
      const message = extractErrorMessage(err);
      setError(message);
      return;
    }
    setAllProjects((prev) => prev.map((p) => (p.id === projectId ? { ...p, title: newTitle } : p)));
  };

  const handleDeleteProject = async (projectId: number) => {
    if (
      !confirm(
        "Are you sure you want to delete this project and all its chats and files? This action cannot be undone.",
      )
    ) {
      return;
    }
    try {
      const res = await fetch(`/api/projects/${projectId}`, {
        method: "DELETE",
        headers: getAuthHeaders(),
      });
      if (res.status === 401) {
        router.replace("/login");
        return;
      }
      if (!res.ok) {
        const errorData = await res.json();
        throw new Error(errorData.error || `Failed to delete project: ${res.statusText}`);
      }
    } catch (err: unknown) {
      const message = extractErrorMessage(err);
      setError(message);
      return;
    }

    setAllProjects((prev) => prev.filter((p) => p.id !== projectId));
    setAllChats((prev) => prev.filter((c) => c.projectId !== projectId));
    if (displayingProjectManagementId === projectId) {
      setDisplayingProjectManagementId(null);
      setActiveChatId(null);
      setCurrentChatProjectId(null);
      setMessages([]);
      setEditingPromptInitialValue(null);
      setKeySelection("free");
    }
  };

  useEffect(() => {
    if (activeChatId === null && displayingProjectManagementId === null) {
      if (!isLoading) {
        setMessages([]);
        setEditingPromptInitialValue(null);
        setCurrentChatProjectId(null);
      }
      prevActiveChatIdRef.current = null;
      prevDisplayingProjectManagementIdRef.current = null;
      setIsNewChatJustCreated(false);
      return;
    }

    if (activeChatId !== null) {
      if (activeChatId !== prevActiveChatIdRef.current) {
        const chat = allChats.find((c) => c.id === activeChatId);

        if (chat?.lastModel) {
          const modelForThisChat = models.find((m) => m.name === chat.lastModel);
          if (modelForThisChat && selectedModel?.name !== modelForThisChat.name) {
            setSelectedModel(modelForThisChat);
          }
        } else if (chat && !chat.lastModel) {
          if (!selectedModel && models.length > 0) {
            const defaultModel = models.find((m) => m.name === DEFAULT_MODEL_NAME) || models[0];
            if (defaultModel) setSelectedModel(defaultModel);
          }
        }
        if (chat?.keySelection) {
          setKeySelection(chat.keySelection);
        } else {
          setKeySelection("free");
        }

        if (!(isNewChatJustCreated && chat?.projectId === null)) {
          setIsLoading(true);
          loadChat(activeChatId).finally(() => {
            setIsLoading(false);
            if (isNewChatJustCreated) {
              setIsNewChatJustCreated(false);
            }
          });
        } else if (isNewChatJustCreated && chat?.projectId === null) {
          setIsNewChatJustCreated(false);
        }
      }
      prevActiveChatIdRef.current = activeChatId;
      prevDisplayingProjectManagementIdRef.current = null;
    } else if (displayingProjectManagementId !== null) {
      if (displayingProjectManagementId !== prevDisplayingProjectManagementIdRef.current) {
        setCurrentChatProjectId(null);
        setMessages([]);
        setEditingPromptInitialValue(null);
        setKeySelection("free");
        setIsNewChatJustCreated(false);
      }
      prevDisplayingProjectManagementIdRef.current = displayingProjectManagementId;
      prevActiveChatIdRef.current = null;
    }
  }, [
    activeChatId,
    displayingProjectManagementId,
    allChats,
    models,
    selectedModel,
    loadChat,
    isLoading,
    isNewChatJustCreated,
  ]);

  const handleCancel = () => {
    controller?.abort();
    setIsLoading(false);
  };

  const handleSendMessage = async (inputText: string, uploadedFiles: UploadedFileInfo[], sendWithSearch: boolean) => {
    if (!inputText.trim() && uploadedFiles.length === 0) return;
    if (!selectedModel) {
      setError("No model selected or available. Please check model list or API key.");
      return;
    }

    let sessionId = activeChatId;
    if (!sessionId) {
      const newChatTitle = `Chat ${
        currentChatProjectId
          ? allChats.filter((c) => c.projectId === currentChatProjectId).length + 1
          : allChats.filter((c) => c.projectId === null).length + 1
      }`;
      const newId = await createChat(newChatTitle, keySelection, currentChatProjectId);
      if (!newId) {
        setIsLoading(false);
        return;
      }
      sessionId = newId;
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

    let modelMessageIndexForStream: number;

    setMessages((prev) => {
      const newMessages = [...prev, newUserMessage];
      const placeholderMessage: Message = {
        role: "model",
        parts: [{ type: "text", text: "" }],
        sources: [],
      };
      modelMessageIndexForStream = newMessages.length;
      return [...newMessages, placeholderMessage];
    });

    setIsLoading(true);
    setStreamStarted(false);

    const historyForAPI = messages.map((msg) => ({
      role: msg.role,
      parts: msg.parts,
    }));

    const ctrl = new AbortController();
    setController(ctrl);

    try {
      const res = await fetch("/api/chat", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          ...getAuthHeaders(),
        },
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

      if (res.status === 401) {
        router.replace("/login");
        return;
      }

      if (!res.ok || !res.body) {
        let errorData = {
          error: `API request failed with status ${res.status}`,
        };
        if (res.body) {
          try {
            errorData = await res.json();
          } catch {}
        }
        throw new Error(errorData.error || `API request failed with status ${res.status}`);
      }

      const reader = res.body.pipeThrough(new TextDecoderStream()).getReader();
      let isFirstChunk = true;
      let textAccumulator = "";
      const currentSources: Array<{ title: string; uri: string }> = [];
      let modelReturnedEmptyMessage = false;

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
          const messageToUpdate = updatedMessages[modelMessageIndexForStream];

          if (!messageToUpdate) {
            console.error(
              "Attempted to update undefined message at index:",
              modelMessageIndexForStream,
              "Current messages state:",
              prev,
            );
            return prev;
          }

          for (const line of lines) {
            try {
              const parsedChunk = JSON.parse(line);
              if (parsedChunk.type === "text") {
                textAccumulator += parsedChunk.value;
              } else if (parsedChunk.type === "grounding") {
                if (parsedChunk.sources && Array.isArray(parsedChunk.sources)) {
                  parsedChunk.sources.forEach((s: { title: string; uri: string }) => {
                    const exists = currentSources.some((existing) => existing.uri === s.uri);
                    if (!exists) {
                      currentSources.push(s);
                    }
                  });
                }
              } else if (parsedChunk.type === "error" && parsedChunk.value) {
                modelReturnedEmptyMessage = true;
                setError(parsedChunk.value);
              }
            } catch (jsonError) {
              console.error("Failed to parse JSONL chunk:", jsonError, "Raw line:", line);
              textAccumulator += line;
            }
          }

          messageToUpdate.parts = [{ type: "text", text: textAccumulator }];
          messageToUpdate.sources = [...currentSources];

          return updatedMessages;
        });
      }

      if (modelReturnedEmptyMessage) {
        setMessages((prev) => prev.filter((_, idx) => idx !== modelMessageIndexForStream));
      }
    } catch (error: unknown) {
      setMessages((prev) => prev.filter((_, idx) => idx !== modelMessageIndexForStream));
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
      await fetchAllChats();
    }
  };

  const handleDeleteAllGlobalChats = async () => {
    if (!confirm("Are you sure you want to delete ALL your global chats? This action cannot be undone.")) {
      return;
    }

    try {
      const res = await fetch("/api/chats", {
        method: "DELETE",
        headers: getAuthHeaders(),
      });
      if (res.status === 401) {
        router.replace("/login");
        return;
      }
      if (!res.ok) {
        const errorData = await res.json();
        throw new Error(errorData.error || `Failed to delete all chats: ${res.statusText}`);
      }
    } catch (err: unknown) {
      const message = extractErrorMessage(err);
      setError(message);
      return;
    }

    setAllChats((prev) => prev.filter((c) => c.projectId !== null));
    if (activeChatId !== null && allChats.find((c) => c.id === activeChatId)?.projectId === null) {
      setActiveChatId(null);
      setMessages([]);
      setEditingPromptInitialValue(null);
      setKeySelection("free");
    }
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
    await fetchAllProjects();
    if (activeChatId !== null) {
      await loadChat(activeChatId);
    }
    closeSettingsModal();
  }, [activeChatId, fetchAllChats, fetchAllProjects, loadChat]);

  const toggleThreeDotMenu = () => {
    setIsThreeDotMenuOpen((prev) => !prev);
  };

  const handleLogout = async () => {
    try {
      const res = await fetch("/api/auth/logout", { method: "POST" });
      if (!res.ok) {
        throw new Error("Logout failed.");
      }
      localStorage.removeItem("__session");
      router.push("/login");
    } catch (err: unknown) {
      setError(extractErrorMessage(err));
    }
  };

  const threeDotMenuItems: DropdownItem[] = [
    {
      id: "settings",
      label: "Settings",
      icon: <Cog6ToothIcon className="size-4" />,
      onClick: openGlobalSettingsModal,
    },
    {
      id: "logout",
      label: "Logout",
      icon: <ArrowRightStartOnRectangleIcon className="size-4 text-red-500 dark:text-red-400" />,
      onClick: handleLogout,
      className: "text-red-500 dark:text-red-400 hover:bg-red-100 dark:hover:bg-red-400/10",
    },
  ];

  return (
    <div className="flex h-screen overflow-hidden">
      {error && <Toast message={error} onClose={() => setError(null)} />}
      <Sidebar
        chats={allChats}
        projects={allProjects}
        activeChatId={activeChatId}
        activeProjectId={displayingProjectManagementId}
        onNewChat={handleNewChat}
        onSelectChat={handleSelectChat}
        onRenameChat={handleRenameChat}
        onDeleteChat={handleDeleteChat}
        onDeleteAllGlobalChats={handleDeleteAllGlobalChats}
        onOpenChatSettings={openChatSettingsModal}
        onNewProject={handleNewProject}
        onSelectProject={handleSelectProject}
        onRenameProject={handleRenameProject}
        onDeleteProject={handleDeleteProject}
        userEmail={userEmail}
        expandedProjects={expandedProjects}
        onToggleProjectExpansion={setExpandedProjects}
      />
      <main className="flex-1 flex flex-col relative">
        <div
          className="flex-none sticky min-h-16 top-0 z-10 px-4 py-2 border-b border-neutral-100 dark:border-neutral-950 transition-colors
            duration-300 ease-in-out flex items-center justify-between"
        >
          {displayingProjectManagementId === null && (
            <>
              <ModelSelector models={models} selected={selectedModel} onChangeAction={handleModelChange} />

              <div className="flex items-center ml-4">
                <Tooltip text="Switch between free and paid API key">
                  <ToggleApiKeyButton selectedKey={keySelection} onToggleAction={handleKeySelectionToggle} />
                </Tooltip>
              </div>
            </>
          )}
          <div className="flex items-center ml-auto">
            <div className="relative ms-2">
              <ThemeToggleButton />
            </div>
            <div className="relative ms-2">
              <Tooltip text="More options">
                <button
                  ref={threeDotMenuButtonRef}
                  onClick={toggleThreeDotMenu}
                  className="cursor-pointer size-9 flex items-center justify-center rounded-full text-neutral-500 hover:bg-neutral-100
                    dark:hover:bg-neutral-900 transition-colors duration-300 ease-in-out"
                  aria-label="More options"
                >
                  <EllipsisVerticalIcon className="size-5" />
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

        {displayingProjectManagementId !== null ? (
          <ProjectManagement
            projectId={displayingProjectManagementId}
            getAuthHeaders={getAuthHeaders}
            onProjectUpdated={fetchAllProjects}
            onProjectFileAction={setError}
            onProjectSystemPromptUpdated={async () => {
              await fetchAllProjects();
              if (activeChatId) {
                await loadChat(activeChatId);
              }
            }}
          />
        ) : (
          <>
            <ChatArea
              ref={chatAreaRef}
              messages={messages}
              isLoading={isLoading}
              streamStarted={streamStarted}
              onAutoScrollChange={handleAutoScrollChange}
              getAuthHeaders={getAuthHeaders}
            />

            <div className="flex-none p-4">
              <div className="mx-auto max-w-[52rem]">
                <div className="relative h-0">
                  <div
                    className={`absolute bottom-6 left-1/2 -translate-x-1/2 z-20 transition-opacity duration-300 ease-in-out
                      ${isAutoScrollActive ? "opacity-0 pointer-events-none" : "opacity-100"} `}
                  >
                    <button
                      onClick={handleScrollToBottomClick}
                      className="cursor-pointer size-9 flex items-center justify-center rounded-full text-sm font-medium transition-colors duration-300
                        ease-in-out bg-white border border-neutral-300 hover:bg-neutral-100 text-neutral-500 dark:bg-neutral-900
                        dark:border-neutral-800 dark:text-neutral-300 dark:hover:bg-neutral-700 shadow-lg"
                    >
                      <ArrowDownIcon className="size-5" />
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
                  getAuthHeaders={getAuthHeaders}
                  activeProjectId={currentChatProjectId}
                  onError={(msg) => setError(msg)}
                />
              </div>
            </div>
          </>
        )}
      </main>

      <SettingsModal
        isOpen={isSettingsModalOpen}
        onClose={closeSettingsModal}
        chatId={editingChatId}
        initialSystemPromptValue={editingPromptInitialValue}
        onSettingsSaved={handleSettingsSaved}
        getAuthHeaders={getAuthHeaders}
      />
    </div>
  );
}
