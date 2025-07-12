"use client";

import Sidebar from "@/components/Sidebar";
import ChatArea, { ChatAreaHandle } from "@/components/ChatArea";
import ChatInput, { ChatInputHandle, UploadedFileInfo } from "@/components/ChatInput";
import React, { useCallback, useEffect, useRef, useState } from "react";
import ModelSelector from "@/components/ModelSelector";
import ToggleApiKeyButton from "@/components/ToggleApiKeyButton";
import { Model } from "@google/genai";
import Tooltip from "@/components/Tooltip";
import Toast, { ToastProps } from "@/components/Toast";
import DropdownMenu, { DropdownItem } from "@/components/DropdownMenu";
import SettingsModal from "@/components/SettingsModal";
import { useRouter } from "next/navigation";
import {
  ArrowDownIcon,
  ArrowRightStartOnRectangleIcon,
  Cog6ToothIcon,
  EllipsisVerticalIcon,
  PaperClipIcon,
  ChatBubbleLeftRightIcon,
} from "@heroicons/react/24/outline";
import ThemeToggleButton from "@/components/ThemeToggleButton";
import ProjectManagement from "@/components/ProjectManagement";
import { AppRouterInstance } from "next/dist/shared/lib/app-router-context.shared-runtime";
import ConfirmationModal from "@/components/ConfirmationModal";

const DEFAULT_MODEL_NAME = "models/gemini-2.5-flash";

export interface MessagePart {
  type: "text" | "file";
  text?: string;
  fileName?: string;
  mimeType?: string;
  objectName?: string;
  size?: number;
  isProjectFile?: boolean;
  projectFileId?: number;
}

export interface Message {
  id: number;
  position: number;
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
  updatedAt: string;
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

interface ConfirmationModalState {
  isOpen: boolean;
  title: string;
  message: string;
  onConfirm: () => void;
}

async function generateAndSetChatTitle(
  chatSessionId: number,
  userMessageContent: string,
  keySelection: "free" | "paid",
  getAuthHeaders: () => HeadersInit,
  router: AppRouterInstance,
  showToast: (message: string, type?: ToastProps["type"]) => void,
  fetchAllChats: () => Promise<void>,
) {
  try {
    const res = await fetch("/api/generate-chat-title", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        ...getAuthHeaders(),
      },
      body: JSON.stringify({ userMessageContent, keySelection }),
    });

    if (res.status === 401) {
      router.replace("/login");
      return;
    }
    if (!res.ok) {
      const errorData = await res.json();
      throw new Error(errorData.error || `Failed to generate title: ${res.statusText}`);
    }

    const { title } = await res.json();

    const patchRes = await fetch(`/api/chats/${chatSessionId}`, {
      method: "PATCH",
      headers: {
        "Content-Type": "application/json",
        ...getAuthHeaders(),
      },
      body: JSON.stringify({ title }),
    });

    if (patchRes.status === 401) {
      router.replace("/login");
      return;
    }
    if (!patchRes.ok) {
      const errorData = await res.json();
      throw new Error(errorData.error || `Failed to update chat title: ${patchRes.statusText}`);
    }

    await fetchAllChats();
  } catch (err: unknown) {
    showToast(extractErrorMessage(err), "error");
  }
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
  const [toast, setToast] = useState<Omit<ToastProps, "onClose"> | null>(null);
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
  const [totalTokens, setTotalTokens] = useState<number | null>(null);
  const [isCountingTokens, setIsCountingTokens] = useState(false);
  const [isDraggingOver, setIsDraggingOver] = useState(false);
  const [editingMessage, setEditingMessage] = useState<{ index: number; message: Message } | null>(null);
  const [confirmationModal, setConfirmationModal] = useState<ConfirmationModalState>({
    isOpen: false,
    title: "",
    message: "",
    onConfirm: () => {},
  });
  const [isLiveSessionActive, setIsLiveSessionActive] = useState(false);
  const [liveInterimText, setLiveInterimText] = useState("");

  const dragCounter = useRef(0);
  const threeDotMenuButtonRef = useRef<HTMLButtonElement | null>(null);
  const chatAreaRef = useRef<ChatAreaHandle>(null);
  const chatInputRef = useRef<ChatInputHandle>(null);
  const prevActiveChatIdRef = useRef<number | null>(null);
  const prevDisplayingProjectManagementIdRef = useRef<number | null>(null);

  const showToast = useCallback((message: string, type: ToastProps["type"] = "error") => {
    setToast({ message, type });
  }, []);

  const handleCloseToast = useCallback(() => {
    setToast(null);
  }, []);

  const getAuthHeaders = useCallback((): HeadersInit => {
    const token = localStorage.getItem("__session");
    return token ? { Authorization: `Bearer ${token}` } : {};
  }, []);

  const handleDragEnter = (e: React.DragEvent<HTMLElement>) => {
    e.preventDefault();
    e.stopPropagation();
    dragCounter.current++;
    if (displayingProjectManagementId === null && e.dataTransfer.items && e.dataTransfer.items.length > 0) {
      setIsDraggingOver(true);
    }
  };

  const handleDragLeave = (e: React.DragEvent<HTMLElement>) => {
    e.preventDefault();
    e.stopPropagation();
    dragCounter.current--;
    if (dragCounter.current === 0) {
      setIsDraggingOver(false);
    }
  };

  const handleDragOver = (e: React.DragEvent<HTMLElement>) => {
    e.preventDefault();
    e.stopPropagation();
  };

  const handleDrop = (e: React.DragEvent<HTMLElement>) => {
    e.preventDefault();
    e.stopPropagation();
    setIsDraggingOver(false);
    dragCounter.current = 0;

    if (displayingProjectManagementId !== null) {
      return;
    }

    const files = Array.from(e.dataTransfer.files);
    if (files && files.length > 0) {
      if (chatInputRef.current) {
        chatInputRef.current.processAndUploadFiles(files);
      }
      e.dataTransfer.clearData();
    }
  };

  const fetchTokenCount = useCallback(
    async (
      currentMessages: Message[],
      currentModel: Model | null,
      currentKeySelection: "free" | "paid",
      currentChatId: number | null,
    ) => {
      if (!currentModel || !currentChatId || currentMessages.length === 0) {
        setTotalTokens(0);
        return;
      }
      setIsCountingTokens(true);
      try {
        const res = await fetch("/api/count-tokens", {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            ...getAuthHeaders(),
          },
          body: JSON.stringify({
            history: currentMessages,
            model: currentModel.name,
            keySelection: currentKeySelection,
            chatSessionId: currentChatId,
          }),
        });

        if (!res.ok) {
          const errorData = await res.json().catch(() => ({}));
          throw new Error(errorData.error || "Failed to count tokens");
        }

        const { totalTokens } = await res.json();
        setTotalTokens(totalTokens);
      } catch (err) {
        console.error("Token count failed:", extractErrorMessage(err));
        setTotalTokens(null);
      } finally {
        setIsCountingTokens(false);
      }
    },
    [getAuthHeaders],
  );

  useEffect(() => {
    const previousIsLoading = sessionStorage.getItem("isLoading") === "true";
    if (previousIsLoading && !isLoading && activeChatId && messages.length > 0) {
      fetchTokenCount(messages, selectedModel, keySelection, activeChatId);
    }
    sessionStorage.setItem("isLoading", isLoading.toString());
  }, [isLoading, activeChatId, messages, selectedModel, keySelection, fetchTokenCount]);

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
      showToast(extractErrorMessage(err), "error");
    }
  }, [getAuthHeaders, router, showToast]);

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
        showToast(extractErrorMessage(err), "error");
        router.replace("/login");
      }
    };
    fetchUser();
  }, [router, getAuthHeaders, showToast]);

  useEffect(() => {
    const handleGlobalKeyDown = (event: KeyboardEvent) => {
      if (isLoading || displayingProjectManagementId !== null) return;
      if (editingMessage) return;

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

      if (event.key === "Escape" && editingMessage) {
        setEditingMessage(null);
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
  }, [isLoading, displayingProjectManagementId, editingMessage]);

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
      showToast(extractErrorMessage(err), "error");
    }
  }, [getAuthHeaders, router, showToast]);

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
      }).catch((err) => showToast(extractErrorMessage(err), "error"));
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
          .catch((err) => showToast(extractErrorMessage(err), "error"));
      }
      return newSelection;
    });
  }, [activeChatId, fetchAllChats, getAuthHeaders, showToast]);

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
        showToast(extractErrorMessage(err), "error");
        if (err.message.includes("Unauthorized")) {
        } else {
          setModels([]);
          setSelectedModel(null);
        }
      });
  }, [keySelection, getAuthHeaders, router, userEmail, showToast]);

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
      showToast("Chat renamed.", "success");
    } catch (err: unknown) {
      const message = extractErrorMessage(err);
      showToast(message, "error");
      return;
    }
    setAllChats((prev) => prev.map((c) => (c.id === chatId ? { ...c, title: newTitle } : c)));
  };

  const confirmDeleteChat = (chatId: number) => {
    setConfirmationModal({
      isOpen: true,
      title: "Delete Chat",
      message: "Are you sure you want to delete this chat? This action cannot be undone.",
      onConfirm: () => handleDeleteChat(chatId),
    });
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
      showToast(message, "error");
      return;
    }

    setAllChats((prev) => prev.filter((c) => c.id !== chatId));
    if (activeChatId === chatId) {
      setActiveChatId(null);
      setMessages([]);
      setEditingPromptInitialValue(null);
      setKeySelection("free");
      setTotalTokens(null);
    }
    showToast("Chat deleted.", "success");
  };

  const handleDuplicateChat = useCallback(
    async (chatId: number) => {
      try {
        const res = await fetch("/api/chats/duplicate", {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            ...getAuthHeaders(),
          },
          body: JSON.stringify({ chatId }),
        });
        if (res.status === 401) {
          router.replace("/login");
          return;
        }
        if (!res.ok) {
          const errorData = await res.json();
          throw new Error(errorData.error || `Failed to duplicate chat: ${res.statusText}`);
        }
        const newChat: ChatListItem = await res.json();
        await fetchAllChats();
        setActiveChatId(newChat.id);
        setDisplayingProjectManagementId(null);
        showToast("Chat duplicated successfully.", "success");
      } catch (err: unknown) {
        showToast(extractErrorMessage(err), "error");
      }
    },
    [getAuthHeaders, router, fetchAllChats, setActiveChatId, setDisplayingProjectManagementId, showToast],
  );

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
        showToast(extractErrorMessage(err), "error");
        return null;
      }
    },
    [getAuthHeaders, router, setAllChats, setActiveChatId, showToast, setIsNewChatJustCreated],
  );

  const handleNewChat = useCallback(
    async (projectId: number | null = null) => {
      setMessages([]);
      setEditingPromptInitialValue(null);
      setKeySelection("free");
      setCurrentChatProjectId(projectId);
      setTotalTokens(0);
      setEditingMessage(null);

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
          if (res.status === 404) {
            setActiveChatId(null);
            setMessages([]);
            setEditingPromptInitialValue(null);
            setKeySelection("free");
            setCurrentChatProjectId(null);
            setTotalTokens(null);
          }

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
        showToast(message, "error");
      } finally {
        setIsLoading(false);
      }
    },
    [
      getAuthHeaders,
      router,
      setActiveChatId,
      setMessages,
      setEditingPromptInitialValue,
      setKeySelection,
      setCurrentChatProjectId,
      showToast,
    ],
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
    setTotalTokens(null);
  }, []);

  const handleNewProject = useCallback(async () => {
    setActiveChatId(null);
    setMessages([]);
    setEditingPromptInitialValue(null);
    setKeySelection("free");
    setTotalTokens(null);
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
      showToast("New project created.", "success");
    } catch (err) {
      showToast(extractErrorMessage(err), "error");
    } finally {
      setIsLoading(false);
    }
  }, [allProjects, getAuthHeaders, router, showToast]);

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
      await fetchAllChats();
      showToast("Project renamed.", "success");
    } catch (err: unknown) {
      const message = extractErrorMessage(err);
      showToast(message, "error");
      return;
    }
    setAllProjects((prev) => prev.map((p) => (p.id === projectId ? { ...p, title: newTitle } : p)));
  };

  const confirmDeleteProject = (projectId: number) => {
    setConfirmationModal({
      isOpen: true,
      title: "Delete Project",
      message:
        "Are you sure you want to delete this project and all its chats and files? This action cannot be undone.",
      onConfirm: () => handleDeleteProject(projectId),
    });
  };

  const handleDeleteProject = async (projectId: number) => {
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
      showToast(message, "error");
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
      setTotalTokens(null);
    }
    showToast("Project deleted.", "success");
  };

  useEffect(() => {
    setEditingMessage(null);
    if (activeChatId === null && displayingProjectManagementId === null) {
      if (!isLoading) {
        setMessages([]);
        setEditingPromptInitialValue(null);
        setCurrentChatProjectId(null);
        setTotalTokens(0);
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
        setTotalTokens(null);
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

  const callChatApiAndStreamResponse = useCallback(
    async (
      userMessageParts: MessagePart[],
      historyForAPI: Message[],
      currentChatId: number,
      isSearchEnabled: boolean,
      isRegeneration = false,
    ) => {
      let modelMessageIndexForStream: number;
      setMessages((prev) => {
        const placeholderMessage: Message = {
          role: "model",
          parts: [{ type: "text", text: "" }],
          sources: [],
          id: Date.now(),
          position: (prev[prev.length - 1]?.position || 0) + 2,
        };
        modelMessageIndexForStream = prev.length;
        return [...prev, placeholderMessage];
      });

      chatAreaRef.current?.scrollToBottomAndEnableAutoscroll();
      setIsLoading(true);
      setStreamStarted(false);

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
            history: historyForAPI.map((msg) => ({ role: msg.role, parts: msg.parts })),
            messageParts: userMessageParts,
            chatSessionId: currentChatId,
            model: selectedModel?.name,
            keySelection,
            isSearchActive: isSearchEnabled,
            isRegeneration,
          }),
          signal: ctrl.signal,
        });

        if (res.status === 401) {
          router.replace("/login");
          return;
        }

        if (!res.ok || !res.body) {
          let errorData = { error: `API request failed with status ${res.status}` };
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
        let streamBuffer = "";
        const currentSources: Array<{ title: string; uri: string }> = [];
        let modelReturnedEmptyMessage = false;

        while (true) {
          const { value, done } = await reader.read();
          if (done) break;

          if (isFirstChunk) {
            setStreamStarted(true);
            isFirstChunk = false;
          }

          streamBuffer += value;
          const lines = streamBuffer.split("\n");
          streamBuffer = lines.pop() || "";

          if (lines.length === 0) continue;

          setMessages((prev) => {
            const updatedMessages = [...prev];
            const messageToUpdate = updatedMessages[modelMessageIndexForStream];

            if (!messageToUpdate) return prev;

            for (const line of lines) {
              if (line.trim() === "") continue;

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
                  showToast(parsedChunk.value, "error");
                }
              } catch (jsonError) {
                console.error("Failed to parse JSONL chunk:", jsonError, "Raw line:", line);
              }
            }
            messageToUpdate.parts = [{ type: "text", text: textAccumulator }];
            messageToUpdate.sources = [...currentSources];
            return updatedMessages;
          });
        }

        if (modelReturnedEmptyMessage) {
          setMessages((prev) => prev.filter((_, idx) => idx !== modelMessageIndexForStream));
        } else {
          loadChat(currentChatId);
        }
      } catch (error: unknown) {
        setMessages((prev) => prev.filter((_, idx) => idx !== modelMessageIndexForStream));
        const msg =
          error instanceof DOMException && error.name === "AbortError"
            ? "Response cancelled."
            : error instanceof Error
              ? error.message
              : "An unexpected error occurred.";
        showToast(msg, "error");
      } finally {
        setIsLoading(false);
        setController(null);
        fetchAllChats();
      }
    },
    [getAuthHeaders, selectedModel, keySelection, router, loadChat, fetchAllChats, showToast],
  );

  const handleSendMessage = async (inputText: string, uploadedFiles: UploadedFileInfo[], sendWithSearch: boolean) => {
    if (!inputText.trim() && uploadedFiles.length === 0) return;
    if (!selectedModel) {
      showToast("No model selected or available. Please check model list or API key.", "error");
      return;
    }

    let sessionId = activeChatId;
    let isFirstMessageForChatSession = false;

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
      isFirstMessageForChatSession = true;
    } else if (messages.length === 0) {
      isFirstMessageForChatSession = true;
    }

    const newUserMessageParts: MessagePart[] = [];
    if (inputText.trim()) {
      newUserMessageParts.push({ type: "text", text: inputText.trim() });
    }

    uploadedFiles.forEach((file) => {
      newUserMessageParts.push({ type: "file", ...file });
    });

    const historyForAPI = [...messages];

    const newUserMessage: Message = {
      role: "user",
      parts: newUserMessageParts,
      id: Date.now(),
      position: (historyForAPI[historyForAPI.length - 1]?.position || 0) + 1,
    };

    setMessages((prev) => [...prev, newUserMessage]);

    if (isFirstMessageForChatSession && inputText.trim()) {
      await generateAndSetChatTitle(
        sessionId,
        inputText.trim(),
        keySelection,
        getAuthHeaders,
        router,
        showToast,
        fetchAllChats,
      );
    }

    await callChatApiAndStreamResponse(newUserMessageParts, historyForAPI, sessionId, sendWithSearch);
  };

  const handleEditSave = async (index: number, newParts: MessagePart[]) => {
    if (!activeChatId || !messages[index] || isLoading) return;

    const messageToEdit = messages[index];
    if (messageToEdit.role !== "user") return;

    const originalPartsJSON = JSON.stringify(
      [...messageToEdit.parts].sort((a, b) => (a.text ?? a.fileName ?? "").localeCompare(b.text ?? b.fileName ?? "")),
    );
    const newPartsJSON = JSON.stringify(
      [...newParts].sort((a, b) => (a.text ?? a.fileName ?? "").localeCompare(b.text ?? b.fileName ?? "")),
    );

    if (originalPartsJSON === newPartsJSON) {
      setEditingMessage(null);
      return;
    }

    setIsLoading(true);
    setEditingMessage(null);

    try {
      const newUserMessageParts = newParts;

      const patchRes = await fetch(`/api/chats/${activeChatId}/messages`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json", ...getAuthHeaders() },
        body: JSON.stringify({
          messageId: messageToEdit.id,
          newParts: newUserMessageParts,
        }),
      });

      if (!patchRes.ok) {
        const errorData = await patchRes.json();
        throw new Error(errorData.error || "Failed to save edited message.");
      }

      const modelMessagePosition = messageToEdit.position + 1;
      const deleteRes = await fetch(`/api/chats/${activeChatId}/messages?fromPosition=${modelMessagePosition}`, {
        method: "DELETE",
        headers: getAuthHeaders(),
      });

      if (!deleteRes.ok) {
        const errorData = await deleteRes.json();
        throw new Error(errorData.error || "Failed to delete subsequent messages.");
      }

      const historyForAPI = messages.slice(0, index);

      const updatedUserMessage: Message = {
        ...messageToEdit,
        parts: newUserMessageParts,
      };
      setMessages([...historyForAPI, updatedUserMessage]);

      await callChatApiAndStreamResponse(newUserMessageParts, historyForAPI, activeChatId, isSearchActive, true);
    } catch (err: unknown) {
      showToast(extractErrorMessage(err), "error");
      loadChat(activeChatId);
    } finally {
      setIsLoading(false);
    }
  };

  const handleRegenerateResponse = async (modelMessageIndex: number) => {
    if (!activeChatId || isLoading) return;
    const userMessageIndex = modelMessageIndex - 1;
    if (userMessageIndex < 0 || messages[userMessageIndex].role !== "user") return;

    const userMessageToResend = messages[userMessageIndex];
    const modelMessageToReplace = messages[modelMessageIndex];

    setIsLoading(true);
    try {
      const deleteRes = await fetch(
        `/api/chats/${activeChatId}/messages?fromPosition=${modelMessageToReplace.position}`,
        {
          method: "DELETE",
          headers: getAuthHeaders(),
        },
      );

      if (!deleteRes.ok) {
        const errorData = await deleteRes.json();
        throw new Error(errorData.error || "Failed to delete message for regeneration.");
      }

      const historyForAPI = messages.slice(0, userMessageIndex);
      setMessages(messages.slice(0, userMessageIndex + 1));

      await callChatApiAndStreamResponse(userMessageToResend.parts, historyForAPI, activeChatId, isSearchActive, true);
    } catch (err: unknown) {
      showToast(extractErrorMessage(err), "error");
      loadChat(activeChatId);
    } finally {
      setIsLoading(false);
    }
  };

  const confirmDeleteAllGlobalChats = () => {
    setConfirmationModal({
      isOpen: true,
      title: "Delete All Global Chats",
      message: "Are you sure you want to delete ALL your global chats? This action cannot be undone.",
      onConfirm: handleDeleteAllGlobalChats,
    });
  };

  const handleDeleteAllGlobalChats = async () => {
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
      showToast(message, "error");
      return;
    }

    setAllChats((prev) => prev.filter((c) => c.projectId !== null));
    if (activeChatId !== null && allChats.find((c) => c.id === activeChatId)?.projectId === null) {
      setActiveChatId(null);
      setMessages([]);
      setEditingPromptInitialValue(null);
      setKeySelection("free");
      setTotalTokens(null);
    }
    showToast("All global chats deleted.", "success");
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
    showToast("Settings saved successfully.", "success");
  }, [activeChatId, fetchAllChats, fetchAllProjects, loadChat, showToast]);

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
      showToast(extractErrorMessage(err), "error");
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
      {toast && <Toast message={toast.message} type={toast.type} onClose={handleCloseToast} />}
      <ConfirmationModal
        {...confirmationModal}
        onClose={() => setConfirmationModal((prev) => ({ ...prev, isOpen: false }))}
      />
      <Sidebar
        chats={allChats}
        projects={allProjects}
        activeChatId={activeChatId}
        activeProjectId={displayingProjectManagementId}
        onNewChat={handleNewChat}
        onSelectChat={handleSelectChat}
        onRenameChat={handleRenameChat}
        onDeleteChat={confirmDeleteChat}
        onDeleteAllGlobalChats={confirmDeleteAllGlobalChats}
        onOpenChatSettings={openChatSettingsModal}
        onNewProject={handleNewProject}
        onSelectProject={handleSelectProject}
        onRenameProject={handleRenameProject}
        onDeleteProject={confirmDeleteProject}
        onDuplicateChat={handleDuplicateChat}
        userEmail={userEmail}
        expandedProjects={expandedProjects}
        onToggleProjectExpansion={setExpandedProjects}
      />
      <main
        className="flex-1 flex flex-col relative"
        onDragEnter={handleDragEnter}
        onDragOver={handleDragOver}
        onDragLeave={handleDragLeave}
        onDrop={handleDrop}
      >
        {isDraggingOver && !isLiveSessionActive && (
          <div
            className="pointer-events-none absolute inset-2 z-50 flex items-center justify-center rounded-2xl border-2
              border-dashed border-blue-500 bg-blue-100/50 dark:bg-blue-900/50 backdrop-blur-sm"
          >
            <div className="flex flex-col items-center gap-2 text-blue-600 dark:text-blue-300">
              <PaperClipIcon className="size-8" />
              <p className="font-semibold">Drop files to attach</p>
            </div>
          </div>
        )}
        <div
          className="flex-none sticky min-h-16 top-0 z-10 px-4 py-2 border-b border-neutral-100 dark:border-neutral-950
            transition-colors duration-300 ease-in-out flex items-center justify-between"
        >
          {displayingProjectManagementId === null && (
            <>
              <ModelSelector models={models} selected={selectedModel} onChangeAction={handleModelChange} />

              <div className="flex items-center ml-4">
                <Tooltip text="Switch between free and paid API key">
                  <ToggleApiKeyButton selectedKey={keySelection} onToggleAction={handleKeySelectionToggle} />
                </Tooltip>
              </div>
              <div className="flex items-center ml-4">
                <Tooltip text="Total tokens for this chat session">
                  <div className="flex items-center gap-2 text-sm text-neutral-500 dark:text-neutral-400">
                    <span>Tokens:</span>
                    {isCountingTokens ? (
                      <div
                        className="w-4 h-4 border-2 border-neutral-300 border-t-neutral-500 rounded-full animate-spin"
                      />
                    ) : totalTokens !== null ? (
                      <span>{totalTokens.toLocaleString()}</span>
                    ) : (
                      <span>N/A</span>
                    )}
                  </div>
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
                  className="cursor-pointer size-9 flex items-center justify-center rounded-full text-neutral-500
                    hover:bg-neutral-100 dark:hover:bg-neutral-900 transition-colors duration-300 ease-in-out"
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
            showToast={showToast}
            openConfirmationModal={setConfirmationModal}
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
              activeChatId={activeChatId}
              editingMessage={editingMessage}
              setEditingMessage={setEditingMessage}
              onEditSave={handleEditSave}
              onRegenerate={handleRegenerateResponse}
            />

            <div className="flex-none p-4">
              <div className="mx-auto max-w-[52rem] relative">
                {isLiveSessionActive && (
                  <div
                    className="absolute bottom-full mb-4 w-full bg-neutral-100/80 dark:bg-neutral-900/80
                      backdrop-blur-sm p-4 rounded-xl shadow-lg border border-neutral-200 dark:border-neutral-800 flex
                      items-center gap-3 transition-opacity duration-300"
                  >
                    <ChatBubbleLeftRightIcon
                      className="size-6 flex-shrink-0 text-blue-500 dark:text-blue-400 animate-pulse"
                    />
                    <p className="text-sm text-neutral-800 dark:text-neutral-200 flex-1 min-h-[1.25rem]">
                      {liveInterimText || "Listening..."}
                    </p>
                  </div>
                )}
                <div className="relative h-0">
                  <div
                    className={`absolute bottom-6 left-1/2 -translate-x-1/2 z-20 transition-opacity duration-300
                      ease-in-out ${isAutoScrollActive ? "opacity-0 pointer-events-none" : "opacity-100"} `}
                  >
                    <button
                      onClick={handleScrollToBottomClick}
                      className="cursor-pointer size-9 flex items-center justify-center rounded-full text-sm font-medium
                        transition-colors duration-300 ease-in-out bg-white border border-neutral-300
                        hover:bg-neutral-100 text-neutral-500 dark:bg-neutral-900 dark:border-neutral-800
                        dark:text-neutral-300 dark:hover:bg-neutral-700 shadow-lg"
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
                  messages={messages}
                  isSearchActive={isSearchActive}
                  onToggleSearch={setIsSearchActive}
                  getAuthHeaders={getAuthHeaders}
                  activeProjectId={currentChatProjectId}
                  showToast={showToast}
                  keySelection={keySelection}
                  onLiveSessionStateChange={setIsLiveSessionActive}
                  onLiveInterimText={setLiveInterimText}
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
        showToast={showToast}
      />
    </div>
  );
}
