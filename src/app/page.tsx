"use client";

import Sidebar from "@/components/Sidebar";
import ChatArea, { ChatAreaHandle, AudioPlaybackState } from "@/components/ChatArea";
import ChatInput, { ChatInputHandle, UploadedFileInfo } from "@/components/ChatInput";
import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";
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
import { liveModels, LiveModel } from "@/lib/live-models";
import { dialogVoices, standardVoices } from "@/lib/voices";
import { motion, AnimatePresence } from "framer-motion";
import { ThinkingOption, getThinkingConfigForModel, getThinkingBudgetMap, getThinkingValueMap } from "@/lib/thinking";
import { showApiErrorToast } from "@/lib/errors";
import NewChatScreen from "@/components/NewChatScreen";

const DEFAULT_MODEL_NAME = "models/gemini-2.5-flash";
const TITLE_GENERATION_MAX_LENGTH = 30000;
const DEFAULT_TTS_MODEL = "gemini-2.5-flash-preview-tts";
const MAX_RETRIES = 5;

export interface MessagePart {
  type: "text" | "file" | "scraped_url";
  text?: string;
  fileName?: string;
  mimeType?: string;
  objectName?: string;
  size?: number;
  isProjectFile?: boolean;
  projectFileId?: number;
  url?: string;
}

export interface Message {
  id: number;
  position: number;
  role: "user" | "model";
  parts: MessagePart[];
  thoughtSummary?: string;
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
  thinkingBudget: number;
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

function createWavHeader(dataLength: number): ArrayBuffer {
  const sampleRate = 24000;
  const numChannels = 1;
  const bitsPerSample = 16;
  const byteRate = (sampleRate * numChannels * bitsPerSample) / 8;
  const blockAlign = (numChannels * bitsPerSample) / 8;
  const buffer = new ArrayBuffer(44);
  const view = new DataView(buffer);

  const writeString = (offset: number, str: string) => {
    for (let i = 0; i < str.length; i++) {
      view.setUint8(offset + i, str.charCodeAt(i));
    }
  };

  writeString(0, "RIFF");
  view.setUint32(4, 36 + dataLength, true);
  writeString(8, "WAVE");
  writeString(12, "fmt ");
  view.setUint32(16, 16, true);
  view.setUint16(20, 1, true);
  view.setUint16(22, numChannels, true);
  view.setUint32(24, sampleRate, true);
  view.setUint32(28, byteRate, true);
  view.setUint16(32, blockAlign, true);
  view.setUint16(34, bitsPerSample, true);
  writeString(36, "data");
  view.setUint32(40, dataLength, true);

  return buffer;
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
    const truncatedContent =
      userMessageContent.length > TITLE_GENERATION_MAX_LENGTH
        ? userMessageContent.substring(0, TITLE_GENERATION_MAX_LENGTH)
        : userMessageContent;

    const res = await fetch("/api/generate-chat-title", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        ...getAuthHeaders(),
      },
      body: JSON.stringify({ userMessageContent: truncatedContent, keySelection }),
    });

    if (res.status === 401) {
      router.replace("/login");
      return;
    }
    if (!res.ok) {
      await showApiErrorToast(res, showToast);
      return;
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
      await showApiErrorToast(patchRes, showToast);
      return;
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
  const [isThinking, setIsThinking] = useState(false);
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
  const [localVideoStream, setLocalVideoStream] = useState<MediaStream | null>(null);
  const [thinkingOption, setThinkingOption] = useState<ThinkingOption>("dynamic");
  const [newChatSystemPrompt, setNewChatSystemPrompt] = useState<string>("");

  const [selectedLiveModel, setSelectedLiveModel] = useState<LiveModel>(liveModels[0]);
  const [selectedLanguage, setSelectedLanguage] = useState<string>("de-DE");
  const [selectedVoice, setSelectedVoice] = useState<string>("Sulafat");
  const [isAutoMuteEnabled, setIsAutoMuteEnabled] = useState(true);
  const [liveMode, setLiveMode] = useState<"audio" | "video">("audio");

  const [ttsVoice, setTtsVoice] = useState<string>("Sulafat");
  const [ttsModel, setTtsModel] = useState<string>(DEFAULT_TTS_MODEL);
  const [audioPlaybackState, setAudioPlaybackState] = useState<AudioPlaybackState>({
    messageId: null,
    status: "idle",
  });
  const audioContextRef = useRef<AudioContext | null>(null);
  const audioSourceRef = useRef<AudioBufferSourceNode | null>(null);
  const dragCounter = useRef(0);
  const threeDotMenuButtonRef = useRef<HTMLButtonElement | null>(null);
  const chatAreaRef = useRef<ChatAreaHandle>(null);
  const chatInputRef = useRef<ChatInputHandle>(null);
  const prevActiveChatIdRef = useRef<number | null>(null);
  const prevDisplayingProjectManagementIdRef = useRef<number | null>(null);

  const isThinkingSupported = useMemo(() => !!getThinkingConfigForModel(selectedModel?.name), [selectedModel]);

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
          await showApiErrorToast(res, showToast);
          setTotalTokens(null);
          return;
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
    [getAuthHeaders, showToast],
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
      if (!res.ok) {
        await showApiErrorToast(res, showToast);
        return;
      }
      const list: ProjectListItem[] = await res.json();
      setAllProjects(list);
    } catch (err: unknown) {
      showToast(extractErrorMessage(err), "error");
    }
  }, [getAuthHeaders, router, showToast]);

  useEffect(() => {
    if (!audioContextRef.current) {
      audioContextRef.current = new (window.AudioContext || window.webkitAudioContext)();
    }

    const fetchUserSettings = async () => {
      try {
        const res = await fetch("/api/settings", { headers: getAuthHeaders() });
        if (res.ok) {
          const settings = await res.json();
          setTtsVoice(settings.tts_voice || "Sulafat");
          setTtsModel(settings.tts_model || DEFAULT_TTS_MODEL);
        }
      } catch (err) {
        console.error("Could not fetch user settings for TTS.");
      }
    };

    fetchUserSettings();
  }, [getAuthHeaders]);

  useEffect(() => {
    const fetchUser = async () => {
      try {
        const res = await fetch("/api/user", { headers: getAuthHeaders() });
        if (res.status === 401) {
          router.replace("/login");
          return;
        }
        if (!res.ok) {
          await showApiErrorToast(res, showToast);
          router.replace("/login");
          return;
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
      if (!res.ok) {
        await showApiErrorToast(res, showToast);
        return;
      }
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
    const newModelConfig = getThinkingConfigForModel(model.name);
    if (thinkingOption === "off" && !newModelConfig?.canBeOff) {
      setThinkingOption("dynamic");
    }

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

  const handleThinkingOptionChange = useCallback(
    (option: ThinkingOption) => {
      setThinkingOption(option);
      if (activeChatId !== null) {
        const budgetMap = getThinkingBudgetMap(selectedModel?.name);
        const budgetValue = budgetMap ? budgetMap[option] : -1;

        fetch(`/api/chats/${activeChatId}`, {
          method: "PATCH",
          headers: {
            "Content-Type": "application/json",
            ...getAuthHeaders(),
          },
          body: JSON.stringify({ thinkingBudget: budgetValue }),
        })
          .then(() => fetchAllChats())
          .catch((err) => showToast(extractErrorMessage(err), "error"));
      }
    },
    [activeChatId, getAuthHeaders, showToast, fetchAllChats, selectedModel],
  );

  const handleLiveModelChange = (model: LiveModel) => {
    setSelectedLiveModel(model);
    if (model.configType === "dialog") {
      if (!dialogVoices.some((v) => v.name === selectedVoice)) {
        setSelectedVoice(dialogVoices[0].name);
      }
    } else {
      if (!standardVoices.includes(selectedVoice)) {
        setSelectedVoice(standardVoices[0]);
      }
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
          return;
        }
        if (!res.ok) {
          await showApiErrorToast(res, showToast);
          return [];
        }
        return res.json();
      })
      .then((list: Model[] | undefined) => {
        if (!list) return;

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
        if (err.message.includes("Unauthorized")) {
          return;
        }
        showToast(extractErrorMessage(err), "error");
        setModels([]);
        setSelectedModel(null);
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
        await showApiErrorToast(res, showToast);
        return;
      }
      await fetchAllChats();
      showToast("Chat renamed.", "success");
    } catch (err: unknown) {
      showToast(extractErrorMessage(err), "error");
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
        await showApiErrorToast(res, showToast);
        return;
      }
    } catch (err: unknown) {
      showToast(extractErrorMessage(err), "error");
      return;
    }

    setAllChats((prev) => prev.filter((c) => c.id !== chatId));
    if (activeChatId === chatId) {
      setActiveChatId(null);
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
          await showApiErrorToast(res, showToast);
          return;
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

  const handleNewChat = useCallback(async (projectId: number | null = null) => {
    setActiveChatId(null);
    setEditingMessage(null);
    setMessages([]);
    setCurrentChatProjectId(projectId);
    setDisplayingProjectManagementId(null);
    setTotalTokens(0);
    setThinkingOption("dynamic");
    setNewChatSystemPrompt("");
    if (projectId) {
      setExpandedProjects((prev: Set<number>) => {
        const newSet = new Set(prev);
        newSet.add(projectId);
        return newSet;
      });
    }
  }, []);

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
            setThinkingOption("dynamic");
          }
          await showApiErrorToast(res, showToast);
          return;
        }
        const data: {
          messages: Message[];
          systemPrompt: string;
          keySelection: "free" | "paid";
          projectId: number | null;
          thinkingBudget: number;
          lastModel: string;
        } = await res.json();

        const modelValueMap = getThinkingValueMap(data.lastModel);
        setMessages(data.messages);
        setEditingPromptInitialValue(data.systemPrompt);
        setKeySelection(data.keySelection);
        setCurrentChatProjectId(data.projectId);
        setThinkingOption(modelValueMap?.[data.thinkingBudget] || "dynamic");
      } catch (err: unknown) {
        showToast(extractErrorMessage(err), "error");
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
    setThinkingOption("dynamic");
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
        await showApiErrorToast(res, showToast);
        return;
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
        await showApiErrorToast(res, showToast);
        return;
      }
      await fetchAllChats();
      showToast("Project renamed.", "success");
    } catch (err: unknown) {
      showToast(extractErrorMessage(err), "error");
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
        await showApiErrorToast(res, showToast);
        return;
      }
    } catch (err: unknown) {
      showToast(extractErrorMessage(err), "error");
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
        setTotalTokens(0);
        setThinkingOption("dynamic");
      }
      prevActiveChatIdRef.current = null;
      prevDisplayingProjectManagementIdRef.current = null;
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
        const modelValueMap = getThinkingValueMap(chat?.lastModel);
        if (chat?.thinkingBudget !== undefined && modelValueMap) {
          setThinkingOption(modelValueMap[chat.thinkingBudget] || "dynamic");
        } else {
          setThinkingOption("dynamic");
        }

        setIsLoading(true);
        loadChat(activeChatId).finally(() => {
          setIsLoading(false);
        });
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
        setThinkingOption("dynamic");
      }
      prevDisplayingProjectManagementIdRef.current = displayingProjectManagementId;
      prevActiveChatIdRef.current = null;
    }
  }, [activeChatId, displayingProjectManagementId, allChats, models, selectedModel, loadChat, isLoading]);

  const handleCancel = () => {
    controller?.abort();
    setIsLoading(false);
  };

  const callChatApiAndStreamResponse = useCallback(
    async (
      userMessageParts: MessagePart[],
      historyForAPI: Message[],
      currentChatId: number | null,
      isSearchEnabled: boolean,
      currentThinkingOption: ThinkingOption,
      isRegeneration = false,
      placeholderIdToUpdate?: number,
      systemPromptForNewChat?: string,
    ): Promise<{
      parts: MessagePart[];
      thoughtSummary: string;
      sources: Array<{ title: string; uri: string }>;
    } | null> => {
      if (placeholderIdToUpdate) {
        messages.findIndex((m) => m.id === placeholderIdToUpdate);
      }

      setStreamStarted(false);
      setIsThinking(true);

      const ctrl = new AbortController();
      setController(ctrl);

      const performFetch = async () => {
        const budgetMap = getThinkingBudgetMap(selectedModel?.name);
        const budgetValue = budgetMap ? budgetMap[currentThinkingOption] : -1;

        return fetch("/api/chat", {
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
            thinkingBudget: budgetValue,
            isRegeneration,
            systemPrompt: systemPromptForNewChat,
          }),
          signal: ctrl.signal,
        });
      };

      const processSuccessfulResponse = async (res: Response) => {
        if (!res.body) {
          showToast("Received an empty response from the server.", "error");
          return null;
        }

        const reader = res.body.pipeThrough(new TextDecoderStream()).getReader();
        let isFirstChunk = true;
        let textAccumulator = "";
        let thoughtSummaryAccumulator = "";
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

          for (const line of lines) {
            if (line.trim() === "") continue;
            try {
              const parsedChunk = JSON.parse(line);
              if (parsedChunk.type === "text") {
                setIsThinking(false);
                textAccumulator += parsedChunk.value;
              } else if (parsedChunk.type === "thought") {
                thoughtSummaryAccumulator += parsedChunk.value;
              } else if (parsedChunk.type === "grounding" && parsedChunk.sources) {
                parsedChunk.sources.forEach((s: { title: string; uri: string }) => {
                  if (!currentSources.some((existing) => existing.uri === s.uri)) currentSources.push(s);
                });
              } else if (parsedChunk.type === "error") {
                modelReturnedEmptyMessage = true;
              }
            } catch (jsonError) {
              console.error("Failed to parse JSONL chunk:", jsonError, "Raw line:", line);
            }
          }
          if (placeholderIdToUpdate) {
            setMessages((prev) =>
              prev.map((msg) =>
                msg.id === placeholderIdToUpdate
                  ? {
                      ...msg,
                      parts: [{ type: "text", text: textAccumulator }],
                      sources: [...currentSources],
                      thoughtSummary: thoughtSummaryAccumulator,
                    }
                  : msg,
              ),
            );
          }
        }

        if ((modelReturnedEmptyMessage || textAccumulator.trim() === "") && !ctrl.signal.aborted) {
          return null;
        }

        const resultParts: MessagePart[] = [{ type: "text", text: textAccumulator }];

        return {
          parts: resultParts,
          thoughtSummary: thoughtSummaryAccumulator,
          sources: currentSources,
        };
      };

      try {
        const res = await performFetch();

        if (!res.ok) {
          await showApiErrorToast(res, showToast);
          const isClientError = res.status >= 400 && res.status < 500;
          if (isClientError) {
            return null;
          }
        } else {
          const result = await processSuccessfulResponse(res);
          if (result) {
            return result;
          }
        }

        for (let attempt = 1; attempt < MAX_RETRIES; attempt++) {
          if (ctrl.signal.aborted) {
            showToast("Response cancelled.", "error");
            return null;
          }

          const backoffDelay = Math.pow(2, attempt) * 400 + Math.random() * 200;
          await new Promise((resolve) => setTimeout(resolve, backoffDelay));

          if (ctrl.signal.aborted) {
            showToast("Response cancelled during retry delay.", "error");
            return null;
          }

          showToast(`Response incomplete, trying again... (Attempt ${attempt + 1} of ${MAX_RETRIES})`, "error");

          if (placeholderIdToUpdate) {
            setMessages((prev) =>
              prev.map((msg) =>
                msg.id === placeholderIdToUpdate
                  ? { ...msg, parts: [{ type: "text", text: "" }], sources: [], thoughtSummary: "" }
                  : msg,
              ),
            );
          }

          const retryRes = await performFetch();

          if (!retryRes.ok) {
            await showApiErrorToast(retryRes, showToast);
            const isClientError = retryRes.status >= 400 && retryRes.status < 500;
            if (isClientError) {
              return null;
            }
            continue;
          }

          const result = await processSuccessfulResponse(retryRes);
          if (result) {
            return result;
          }
        }

        if (!ctrl.signal.aborted) {
          showToast(
            `Response could not be received after ${MAX_RETRIES} attempts. Please adjust your request.`,
            "error",
          );
        }
        return null;
      } catch (error: unknown) {
        if (!(error instanceof DOMException && error.name === "AbortError")) {
          showToast(error instanceof Error ? error.message : "An unexpected error occurred.", "error");
        }
        return null;
      } finally {
        setIsThinking(false);
        setController(null);
      }
    },
    [
      getAuthHeaders,
      selectedModel,
      keySelection,
      showToast,
      setStreamStarted,
      setIsThinking,
      setController,
      setMessages,
    ],
  );

  const handleSendMessage = async (inputText: string, uploadedFiles: UploadedFileInfo[], sendWithSearch: boolean) => {
    if (!inputText.trim() && uploadedFiles.length === 0) return;
    if (!selectedModel) {
      showToast("No model selected or available. Please check model list or API key.", "error");
      return;
    }
    const isNewChat = activeChatId === null;

    const newUserMessageParts: MessagePart[] = [];
    if (inputText.trim()) {
      newUserMessageParts.push({ type: "text", text: inputText.trim() });
    }
    uploadedFiles.forEach((file) => newUserMessageParts.push({ type: "file", ...file }));

    const tempUserMessageId = Date.now();
    const newUserMessage: Message = {
      role: "user",
      parts: newUserMessageParts,
      id: tempUserMessageId,
      position: (messages[messages.length - 1]?.position || 0) + 1,
    };
    const tempModelMessageId = tempUserMessageId + 1;
    const placeholderMessage: Message = {
      role: "model",
      parts: [{ type: "text", text: "" }],
      sources: [],
      thoughtSummary: "",
      id: tempModelMessageId,
      position: newUserMessage.position + 1,
    };

    const previousMessages = [...messages];
    setMessages((prevMessages) => [...prevMessages, newUserMessage, placeholderMessage]);
    setIsLoading(true);

    const modelResponse = await callChatApiAndStreamResponse(
      newUserMessageParts,
      previousMessages,
      activeChatId,
      sendWithSearch,
      thinkingOption,
      false,
      placeholderMessage.id,
      isNewChat ? newChatSystemPrompt : undefined,
    );

    if (modelResponse) {
      try {
        const budgetMap = getThinkingBudgetMap(selectedModel?.name);
        const budgetValue = budgetMap ? budgetMap[thinkingOption] : -1;

        const persistRes = await fetch("/api/chats/persist-turn", {
          method: "POST",
          headers: { "Content-Type": "application/json", ...getAuthHeaders() },
          body: JSON.stringify({
            chatSessionId: activeChatId,
            userMessageParts: newUserMessageParts,
            modelMessageParts: modelResponse.parts,
            modelThoughtSummary: modelResponse.thoughtSummary || null,
            modelSources: modelResponse.sources,
            keySelection,
            modelName: selectedModel.name,
            projectId: currentChatProjectId,
            thinkingBudget: budgetValue,
            systemPrompt: isNewChat ? newChatSystemPrompt : undefined,
          }),
        });

        if (!persistRes.ok) {
          await showApiErrorToast(persistRes, showToast);
          throw new Error("Failed to save conversation to the database.");
        }

        const { newChatId, userMessage: savedUserMessage, modelMessage: savedModelMessage } = await persistRes.json();
        await fetchAllChats();
        setActiveChatId(newChatId);

        setMessages((prev) =>
          prev.map((msg) => {
            if (msg.id === tempUserMessageId) return savedUserMessage;
            if (msg.id === tempModelMessageId) return savedModelMessage;
            return msg;
          }),
        );

        if (isNewChat && inputText.trim()) {
          generateAndSetChatTitle(newChatId, inputText, keySelection, getAuthHeaders, router, showToast, fetchAllChats);
        }
      } catch (err) {
        showToast(extractErrorMessage(err), "error");
        setMessages(previousMessages);
      }
    } else {
      try {
        const budgetMap = getThinkingBudgetMap(selectedModel?.name);
        const budgetValue = budgetMap ? budgetMap[thinkingOption] : -1;

        const persistUserMsgRes = await fetch("/api/chats/persist-user-message", {
          method: "POST",
          headers: { "Content-Type": "application/json", ...getAuthHeaders() },
          body: JSON.stringify({
            chatSessionId: activeChatId,
            userMessageParts: newUserMessageParts,
            keySelection,
            modelName: selectedModel.name,
            projectId: currentChatProjectId,
            thinkingBudget: budgetValue,
            systemPrompt: isNewChat ? newChatSystemPrompt : undefined,
          }),
        });

        if (!persistUserMsgRes.ok) {
          await showApiErrorToast(persistUserMsgRes, showToast);
          setMessages(previousMessages);
          return;
        }

        const { newChatId, userMessage: savedUserMessage } = await persistUserMsgRes.json();
        await fetchAllChats();
        setActiveChatId(newChatId);
        setMessages((prev) =>
          prev.map((msg) => {
            if (msg.id === tempUserMessageId) return savedUserMessage;
            if (msg.id === tempModelMessageId) return { ...msg, id: 0 };
            return msg;
          }),
        );
        setMessages((prev) => prev.filter((msg) => msg.id !== 0));

        if (isNewChat && inputText.trim()) {
          generateAndSetChatTitle(newChatId, inputText, keySelection, getAuthHeaders, router, showToast, fetchAllChats);
        }
      } catch (err) {
        setMessages(previousMessages);
        showToast(extractErrorMessage(err), "error");
      }
    }
    setIsLoading(false);
  };

  const handleLiveSessionTurnComplete = async (text: string, audioBlob: Blob | null) => {
    if (!text.trim() && !audioBlob) return;

    const newParts: MessagePart[] = [];
    if (text.trim()) {
      newParts.push({ type: "text", text: text.trim() });
    }

    if (audioBlob) {
      try {
        const formData = new FormData();
        formData.append("file", audioBlob, "live-session-audio.wav");
        const res = await fetch("/api/files/upload", {
          method: "POST",
          headers: getAuthHeaders(),
          body: formData,
        });
        if (!res.ok) {
          throw new Error("Failed to upload live audio.");
        }
        const audioInfo: UploadedFileInfo = await res.json();
        newParts.push({
          type: "file",
          fileName: "Live Audio Response",
          mimeType: audioInfo.mimeType,
          objectName: audioInfo.objectName,
          size: audioInfo.size,
        });
      } catch (err) {
        showToast(extractErrorMessage(err), "error");
      }
    }

    if (newParts.length > 0) {
      setMessages((prevMessages) => {
        const lastMessage = prevMessages[prevMessages.length - 1];
        const newModelMessage: Message = {
          role: "model",
          parts: newParts,
          id: Date.now(),
          position: (lastMessage?.position || 0) + 1,
        };
        return [...prevMessages, newModelMessage];
      });
    }
  };

  const handleEditSave = async (index: number, newParts: MessagePart[]) => {
    if (!activeChatId || !messages[index] || isLoading) return;

    const messageToEdit = messages[index];
    if (messageToEdit.role !== "user") return;

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
        await showApiErrorToast(patchRes, showToast);
        throw new Error("Failed to save edited message.");
      }

      const modelMessagePosition = messageToEdit.position + 1;
      const deleteRes = await fetch(`/api/chats/${activeChatId}/messages?fromPosition=${modelMessagePosition}`, {
        method: "DELETE",
        headers: getAuthHeaders(),
      });

      if (!deleteRes.ok) {
        await showApiErrorToast(deleteRes, showToast);
        throw new Error("Failed to delete subsequent messages.");
      }

      const historyForAPI = messages.slice(0, index);

      const updatedUserMessage: Message = {
        ...messageToEdit,
        parts: newUserMessageParts,
      };

      const placeholderMessage: Message = {
        role: "model",
        parts: [{ type: "text", text: "" }],
        sources: [],
        thoughtSummary: "",
        id: Date.now() + 1,
        position: updatedUserMessage.position + 1,
      };

      setMessages([...historyForAPI, updatedUserMessage, placeholderMessage]);

      const modelResponse = await callChatApiAndStreamResponse(
        newUserMessageParts,
        historyForAPI,
        activeChatId,
        isSearchActive,
        thinkingOption,
        true,
        placeholderMessage.id,
      );

      if (modelResponse) {
        const persistRes = await fetch(`/api/chats/${activeChatId}/append-model-message`, {
          method: "POST",
          headers: { "Content-Type": "application/json", ...getAuthHeaders() },
          body: JSON.stringify({
            modelMessageParts: modelResponse.parts,
            modelThoughtSummary: modelResponse.thoughtSummary || null,
            modelSources: modelResponse.sources,
          }),
        });

        if (!persistRes.ok) {
          await showApiErrorToast(persistRes, showToast);
          throw new Error("Failed to save model response after edit.");
        }
      }

      await loadChat(activeChatId);
    } catch (err: unknown) {
      if (err instanceof Error && !err.message.startsWith("Failed to")) {
        showToast(extractErrorMessage(err), "error");
      }
      await loadChat(activeChatId);
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
        await showApiErrorToast(deleteRes, showToast);
        throw new Error("Failed to delete message for regeneration.");
      }

      const historyForAPI = messages.slice(0, userMessageIndex + 1);
      const currentMessages = messages.slice(0, modelMessageIndex);

      const placeholderMessage: Message = {
        role: "model",
        parts: [{ type: "text", text: "" }],
        sources: [],
        thoughtSummary: "",
        id: Date.now() + 1,
        position: userMessageToResend.position + 1,
      };

      setMessages([...currentMessages, placeholderMessage]);

      const modelResponse = await callChatApiAndStreamResponse(
        userMessageToResend.parts,
        historyForAPI,
        activeChatId,
        isSearchActive,
        thinkingOption,
        true,
        placeholderMessage.id,
      );

      if (modelResponse) {
        const persistRes = await fetch(`/api/chats/${activeChatId}/append-model-message`, {
          method: "POST",
          headers: { "Content-Type": "application/json", ...getAuthHeaders() },
          body: JSON.stringify({
            modelMessageParts: modelResponse.parts,
            modelThoughtSummary: modelResponse.thoughtSummary || null,
            modelSources: modelResponse.sources,
          }),
        });

        if (!persistRes.ok) {
          await showApiErrorToast(persistRes, showToast);
          throw new Error("Failed to save regenerated model response.");
        }
      }
      await loadChat(activeChatId);
    } catch (err: unknown) {
      if (err instanceof Error && !err.message.startsWith("Failed to")) {
        showToast(extractErrorMessage(err), "error");
      }
      await loadChat(activeChatId);
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
        await showApiErrorToast(res, showToast);
        return;
      }
    } catch (err: unknown) {
      showToast(extractErrorMessage(err), "error");
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

  const handlePlayAudio = useCallback(
    async (message: Message, selectedText?: string) => {
      if (audioSourceRef.current) {
        audioSourceRef.current.stop();
        audioSourceRef.current.disconnect();
        audioSourceRef.current = null;
      }

      if (audioPlaybackState.messageId === message.id && audioPlaybackState.status === "playing") {
        setAudioPlaybackState({ messageId: null, status: "idle" });
        return;
      }

      setAudioPlaybackState({ messageId: message.id, status: "loading" });

      try {
        const textToPlay =
          selectedText?.trim() ||
          message.parts
            .filter((p) => p.type === "text" && p.text)
            .map((p) => p.text)
            .join("\n\n");

        if (!textToPlay.trim()) {
          throw new Error("No text content to play.");
        }

        const res = await fetch("/api/tts", {
          method: "POST",
          headers: { "Content-Type": "application/json", ...getAuthHeaders() },
          body: JSON.stringify({ text: textToPlay, voice: ttsVoice, keySelection, model: ttsModel }),
        });

        if (!res.ok) {
          await showApiErrorToast(res, showToast);
          return;
        }

        const { audioContent } = await res.json();
        const binaryString = atob(audioContent);
        const len = binaryString.length;
        const bytes = new Uint8Array(len);
        for (let i = 0; i < len; i++) {
          bytes[i] = binaryString.charCodeAt(i);
        }

        const pcmData = bytes.buffer;
        const wavHeader = createWavHeader(pcmData.byteLength);
        const wavBlob = new Blob([wavHeader, pcmData], { type: "audio/wav" });
        const wavArrayBuffer = await wavBlob.arrayBuffer();

        if (!audioContextRef.current) {
          audioContextRef.current = new (window.AudioContext || window.webkitAudioContext)();
        }
        await audioContextRef.current.resume();

        const audioBuffer = await audioContextRef.current.decodeAudioData(wavArrayBuffer);
        const source = audioContextRef.current.createBufferSource();
        source.buffer = audioBuffer;
        source.connect(audioContextRef.current.destination);
        source.start(0);

        audioSourceRef.current = source;
        setAudioPlaybackState({ messageId: message.id, status: "playing" });

        source.onended = () => {
          if (audioSourceRef.current === source) {
            setAudioPlaybackState({ messageId: null, status: "idle" });
            audioSourceRef.current = null;
          }
        };
      } catch (err: unknown) {
        showToast(extractErrorMessage(err), "error");
        setAudioPlaybackState({ messageId: null, status: "idle" });
      }
    },
    [audioPlaybackState, getAuthHeaders, keySelection, showToast, ttsVoice, ttsModel],
  );

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

  const handleSettingsSaved = useCallback(
    async (newSettings?: { ttsVoice: string; ttsModel: string }) => {
      if (newSettings?.ttsVoice) {
        setTtsVoice(newSettings.ttsVoice);
      }
      if (newSettings?.ttsModel) {
        setTtsModel(newSettings.ttsModel);
      }
      await fetchAllChats();
      await fetchAllProjects();
      if (activeChatId !== null) {
        await loadChat(activeChatId);
      }
      closeSettingsModal();
      showToast("Settings saved successfully.", "success");
    },
    [activeChatId, fetchAllChats, fetchAllProjects, loadChat, showToast],
  );

  const toggleThreeDotMenu = () => {
    setIsThreeDotMenuOpen((prev) => !prev);
  };

  const handleLogout = async () => {
    try {
      const res = await fetch("/api/auth/logout", { method: "POST" });
      if (!res.ok) {
        await showApiErrorToast(res, showToast);
        return;
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

  const menuHeader = userEmail ? (
    <div className="px-4 py-3 text-sm text-neutral-700 dark:text-neutral-200">
      <p className="text-xs text-neutral-500 dark:text-neutral-400">Logged in as</p>
      <p className="font-semibold truncate">{userEmail}</p>
    </div>
  ) : null;

  return (
    <div className="flex h-screen overflow-hidden">
      <AnimatePresence>{toast && <Toast {...toast} onClose={handleCloseToast} />}</AnimatePresence>
      <AnimatePresence>
        {confirmationModal.isOpen && (
          <ConfirmationModal
            {...confirmationModal}
            onClose={() => setConfirmationModal((prev) => ({ ...prev, isOpen: false }))}
          />
        )}
      </AnimatePresence>
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
        <AnimatePresence>
          {isDraggingOver && !isLiveSessionActive && (
            <motion.div
              initial={{ opacity: 0, scale: 0.95 }}
              animate={{ opacity: 1, scale: 1 }}
              exit={{ opacity: 0, scale: 0.95 }}
              transition={{ duration: 0.2 }}
              className="pointer-events-none absolute inset-2 z-50 flex items-center justify-center rounded-2xl border-2
                border-dashed border-blue-500 bg-blue-100/50 dark:bg-blue-900/50 backdrop-blur-sm"
            >
              <div className="flex flex-col items-center gap-2 text-blue-600 dark:text-blue-300">
                <PaperClipIcon className="size-8" />
                <p className="font-semibold">Drop files to attach</p>
              </div>
            </motion.div>
          )}
        </AnimatePresence>
        <div
          className="flex-none sticky min-h-16 top-0 z-10 px-4 py-2 border-b border-neutral-100 dark:border-neutral-950
            transition-colors duration-300 ease-in-out flex items-center justify-between"
        >
          {displayingProjectManagementId === null ? (
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
          ) : (
            <div />
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
                header={menuHeader}
              />
            </div>
          </div>
        </div>
        <div className="flex-1 flex flex-col overflow-hidden">
          <AnimatePresence mode="wait">
            {displayingProjectManagementId !== null ? (
              <motion.div
                key={`project-${displayingProjectManagementId}`}
                initial={{ opacity: 0, y: 10 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, y: -10 }}
                transition={{ duration: 0.2 }}
                className="flex-1 flex flex-col overflow-hidden"
              >
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
              </motion.div>
            ) : (
              <motion.div
                key="chat-area"
                initial={{ opacity: 0, y: 10 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, y: -10 }}
                transition={{ duration: 0.2 }}
                className="flex-1 flex flex-col overflow-hidden"
              >
                {messages.length > 0 ? (
                  <ChatArea
                    ref={chatAreaRef}
                    messages={messages}
                    isLoading={isLoading}
                    isThinking={isThinking}
                    streamStarted={streamStarted}
                    onAutoScrollChange={handleAutoScrollChange}
                    getAuthHeaders={getAuthHeaders}
                    activeChatId={activeChatId}
                    editingMessage={editingMessage}
                    setEditingMessage={setEditingMessage}
                    onEditSave={handleEditSave}
                    onRegenerate={handleRegenerateResponse}
                    onPlayAudio={handlePlayAudio}
                    audioPlaybackState={audioPlaybackState}
                  />
                ) : (
                  <NewChatScreen
                    systemPrompt={newChatSystemPrompt}
                    onSystemPromptChange={setNewChatSystemPrompt}
                    projectId={currentChatProjectId}
                    projects={allProjects}
                  />
                )}

                <div className="flex-none p-4">
                  <div className="mx-auto max-w-[52rem] relative">
                    <AnimatePresence>
                      {isLiveSessionActive && (
                        <motion.div
                          initial={{ opacity: 0, y: 10 }}
                          animate={{ opacity: 1, y: 0 }}
                          exit={{ opacity: 0, y: 10 }}
                          transition={{ duration: 0.3 }}
                          className="absolute bottom-full mb-4 w-full bg-neutral-100/80 dark:bg-neutral-900/80
                            backdrop-blur-sm p-4 rounded-xl shadow-lg border border-neutral-200 dark:border-neutral-800
                            flex items-center gap-3"
                        >
                          <ChatBubbleLeftRightIcon
                            className="size-6 flex-shrink-0 text-red-500 dark:text-red-400 animate-pulse"
                          />
                          <p className="text-sm text-neutral-800 dark:text-neutral-200 flex-1 min-h-[1.25rem]">
                            {liveInterimText || "Listening..."}
                          </p>
                        </motion.div>
                      )}
                    </AnimatePresence>
                    <div className="relative h-0">
                      <AnimatePresence>
                        {!isAutoScrollActive && (
                          <motion.div
                            initial={{ opacity: 0, y: 10 }}
                            animate={{ opacity: 1, y: 0 }}
                            exit={{ opacity: 0, y: 10 }}
                            transition={{ duration: 0.2 }}
                            className="absolute bottom-6 left-1/2 -translate-x-1/2 z-20"
                          >
                            <button
                              onClick={handleScrollToBottomClick}
                              className="cursor-pointer size-9 flex items-center justify-center rounded-full text-sm
                                font-medium transition-colors duration-300 ease-in-out bg-white border
                                border-neutral-300 hover:bg-neutral-100 text-neutral-500 dark:bg-neutral-900
                                dark:border-neutral-800 dark:text-neutral-300 dark:hover:bg-neutral-700 shadow-lg"
                            >
                              <ArrowDownIcon className="size-5" />
                            </button>
                          </motion.div>
                        )}
                      </AnimatePresence>
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
                      onTurnComplete={handleLiveSessionTurnComplete}
                      onVideoStream={setLocalVideoStream}
                      selectedLiveModel={selectedLiveModel}
                      onLiveModelChange={handleLiveModelChange}
                      selectedLanguage={selectedLanguage}
                      onLanguageChange={setSelectedLanguage}
                      selectedVoice={selectedVoice}
                      onVoiceChange={setSelectedVoice}
                      isAutoMuteEnabled={isAutoMuteEnabled}
                      onAutoMuteToggle={setIsAutoMuteEnabled}
                      liveMode={liveMode}
                      onLiveModeChange={setLiveMode}
                      thinkingOption={thinkingOption}
                      onThinkingOptionChange={handleThinkingOptionChange}
                      selectedModel={selectedModel}
                    />
                  </div>
                </div>
              </motion.div>
            )}
          </AnimatePresence>
        </div>
      </main>
      <AnimatePresence>
        {localVideoStream && (
          <motion.div
            initial={{ opacity: 0, scale: 0.8, x: 50 }}
            animate={{ opacity: 1, scale: 1, x: 0 }}
            exit={{ opacity: 0, scale: 0.8, x: 50 }}
            className="fixed bottom-24 right-4 w-48 h-auto bg-black border-2 border-red-500 rounded-lg shadow-2xl z-50
              animate-pulse"
          >
            <video
              ref={(el) => {
                if (el) el.srcObject = localVideoStream;
              }}
              autoPlay
              muted
              className="w-full h-full rounded-lg"
            />
            <div className="absolute inset-0 flex items-center justify-center bg-black/50 text-white text-xs font-bold">
              SCREEN SHARING
            </div>
          </motion.div>
        )}
      </AnimatePresence>
      <AnimatePresence>
        {isSettingsModalOpen && (
          <SettingsModal
            isOpen={isSettingsModalOpen}
            onClose={closeSettingsModal}
            chatId={editingChatId}
            initialSystemPromptValue={editingPromptInitialValue}
            onSettingsSaved={handleSettingsSaved}
            getAuthHeaders={getAuthHeaders}
            showToast={showToast}
          />
        )}
      </AnimatePresence>
    </div>
  );
}
