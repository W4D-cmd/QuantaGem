"use client";

import React, {
  ChangeEvent,
  ClipboardEvent,
  FormEvent,
  forwardRef,
  KeyboardEvent,
  useEffect,
  useImperativeHandle,
  useRef,
  useState,
} from "react";
import Tooltip from "@/components/Tooltip";
import {
  ArrowPathIcon,
  CheckIcon,
  FolderOpenIcon,
  GlobeAltIcon as OutlineGlobeAltIcon,
  MicrophoneIcon,
  PaperClipIcon,
  XCircleIcon,
  XMarkIcon,
  SpeakerWaveIcon,
  SpeakerXMarkIcon,
} from "@heroicons/react/24/outline";
import { GlobeAltIcon as SolidGlobeAltIcon } from "@heroicons/react/24/solid";
import { Message, ProjectFile } from "@/app/page";
import { ArrowUpIcon } from "@heroicons/react/20/solid";
import { StopIcon } from "@heroicons/react/16/solid";
import DropdownMenu, { DropdownItem } from "./DropdownMenu";
import { ToastProps } from "./Toast";
import { useLiveSession } from "@/hooks/useLiveSession";
import { Content, Part } from "@google/genai";
import { liveModels, languageCodes, LiveModel } from "@/lib/live-models";
import { dialogVoices, standardVoices } from "@/lib/voices";
import LiveSessionButton from "./LiveSessionButton";
import { useAutoAnimate } from "@formkit/auto-animate/react";
import { motion, AnimatePresence } from "framer-motion";
import { OAIModel } from "@/lib/custom-models";

export interface UploadedFileInfo {
  objectName: string;
  fileName: string;
  mimeType: string;
  size: number;
  isProjectFile?: boolean;
}

interface ChatInputProps {
  onSendMessageAction: (inputText: string, files: UploadedFileInfo[], isSearchActive: boolean) => void;
  onCancelAction: () => void;
  isLoading: boolean;
  messages: Message[];
  isSearchActive: boolean;
  onToggleSearch: (isActive: boolean) => void;
  getAuthHeaders: () => HeadersInit;
  activeProjectId: number | null;
  showToast: (message: string, type?: ToastProps["type"]) => void;
  onLiveSessionStateChange: (isActive: boolean) => void;
  onLiveInterimText: (text: string) => void;
  onTurnComplete: (text: string, audioBlob: Blob | null) => void;
  onVideoStream: (stream: MediaStream | null) => void;
  selectedLiveModel: LiveModel;
  onLiveModelChange: (model: LiveModel) => void;
  selectedLanguage: string;
  onLanguageChange: (lang: string) => void;
  selectedVoice: string;
  onVoiceChange: (voice: string) => void;
  isAutoMuteEnabled: boolean;
  onAutoMuteToggle: (enabled: boolean) => void;
  liveMode: "audio" | "video";
  onLiveModeChange: (mode: "audio" | "video") => void;
  selectedModel: OAIModel | null;
}

export interface ChatInputHandle {
  focusInput: () => void;
  processAndUploadFiles: (files: File[]) => Promise<void>;
}

const SOURCE_CODE_EXTENSIONS = new Set([
  ".html",
  ".htm",
  ".css",
  ".scss",
  ".sass",
  ".less",
  ".js",
  ".mjs",
  ".cjs",
  ".ts",
  ".tsx",
  ".jsx",
  ".vue",
  ".py",
  ".rb",
  ".php",
  ".java",
  ".kt",
  ".kts",
  ".scala",
  ".go",
  ".rs",
  ".cs",
  ".fs",
  ".fsx",
  ".swift",
  ".c",
  ".cpp",
  ".h",
  ".hpp",
  ".m",
  ".mm",
  ".dart",
  ".lua",
  ".pl",
  ".pm",
  ".t",
  ".r",
  ".erl",
  ".hrl",
  ".ex",
  ".exs",
  ".sh",
  ".bash",
  ".zsh",
  ".ps1",
  ".bat",
  ".cmd",
  ".json",
  ".jsonc",
  ".xml",
  ".yaml",
  ".yml",
  ".toml",
  ".ini",
  ".cfg",
  ".conf",
  ".env",
  ".dockerfile",
  "Dockerfile",
  ".gitignore",
  ".gitattributes",
  ".sql",
  ".ddl",
  ".dml",
  ".md",
  ".markdown",
  ".rst",
  ".adoc",
  ".asciidoc",
  ".gradle",
  ".kts",
  ".groovy",
  ".tf",
  ".tfvars",
  ".hcl",
  ".sum",
  ".mod",
]);

const ChatInput = forwardRef<ChatInputHandle, ChatInputProps>(
  (
    {
      onSendMessageAction,
      onCancelAction,
      isLoading,
      messages,
      isSearchActive,
      onToggleSearch,
      getAuthHeaders,
      activeProjectId,
      showToast,
      onLiveSessionStateChange,
      onLiveInterimText,
      onTurnComplete,
      onVideoStream,
      selectedLiveModel,
      onLiveModelChange,
      selectedLanguage,
      onLanguageChange,
      selectedVoice,
      onVoiceChange,
      isAutoMuteEnabled,
      onAutoMuteToggle,
      liveMode,
      onLiveModeChange,
    },
    ref,
  ) => {
    const [input, setInput] = useState("");
    const textareaRef = useRef<HTMLTextAreaElement>(null);
    const fileInputRef = useRef<HTMLInputElement>(null);
    const attachButtonRef = useRef<HTMLButtonElement>(null);
    const [isAttachMenuOpen, setIsAttachMenuOpen] = useState(false);
    const [selectedFiles, setSelectedFiles] = useState<UploadedFileInfo[]>([]);
    const [uploadingFiles, setUploadingFiles] = useState<
      { file: File; id: string; progress: number; error?: string }[]
    >([]);
    const [showFileSuggestions, setShowFileSuggestions] = useState(false);
    const [projectFiles, setProjectFiles] = useState<ProjectFile[]>([]);
    const [filteredProjectFiles, setFilteredProjectFiles] = useState<ProjectFile[]>([]);
    const [highlightedSuggestionIndex, setHighlightedSuggestionIndex] = useState(-1);

    const [isRecording, setIsRecording] = useState(false);
    const [isTranscribing, setIsTranscribing] = useState(false);
    const mediaRecorderRef = useRef<MediaRecorder | null>(null);
    const audioChunksRef = useRef<Blob[]>([]);

    const [isScanning, setIsScanning] = useState(false);
    const [scanStatusMessage, setScanStatusMessage] = useState<string | null>(null);

    const [fileAnimationParent] = useAutoAnimate();

    const {
      isConnecting: isLiveConnecting,
      isSessionActive,
      startSession,
      stopSession,
    } = useLiveSession({
      getAuthHeaders,
      keySelection: "free",
      showToast,
      onStateChange: onLiveSessionStateChange,
      onInterimText: onLiveInterimText,
      onTurnComplete: onTurnComplete,
      onVideoStream: onVideoStream,
      isAutoMuteEnabled,
    });

    const handleStartLiveSession = (withVideo: boolean) => {
      const historyForLive: Content[] = messages.map((msg) => ({
        role: msg.role,
        parts: msg.parts.reduce<Part[]>((acc, part) => {
          if (part.type === "text" && part.text) {
            acc.push({ text: part.text });
          }
          return acc;
        }, []),
      }));
      startSession(historyForLive, selectedLiveModel, selectedLanguage, selectedVoice, { streamVideo: withVideo });
    };

    const uploadFileWithProgress = (uploadingFile: { file: File; id: string; progress: number }) => {
      return new Promise<UploadedFileInfo | null>((resolve) => {
        const xhr = new XMLHttpRequest();
        const formData = new FormData();
        formData.append("file", uploadingFile.file);

        xhr.upload.onprogress = (event) => {
          if (event.lengthComputable) {
            const percentComplete = (event.loaded / event.total) * 100;
            setUploadingFiles((prevFiles) =>
              prevFiles.map((f) => (f.id === uploadingFile.id ? { ...f, progress: percentComplete } : f)),
            );
          }
        };

        xhr.onload = () => {
          if (xhr.status >= 200 && xhr.status < 300) {
            try {
              const result: UploadedFileInfo = JSON.parse(xhr.responseText);
              resolve(result);
            } catch (e) {
              console.error("Error parsing upload response:", e);
              showToast(`Upload failed for ${uploadingFile.file.name}: Invalid server response`, "error");
              resolve(null);
            }
          } else {
            let errorMsg = `Upload failed: ${xhr.statusText}`;
            try {
              const errorData = JSON.parse(xhr.responseText);
              errorMsg = errorData.error || errorMsg;
            } catch {}
            showToast(errorMsg, "error");
            resolve(null);
          }
        };

        xhr.onerror = () => {
          showToast(`Upload failed for ${uploadingFile.file.name}: Network error`, "error");
          resolve(null);
        };

        const uploadEndpoint = "/api/files/upload";
        xhr.open("POST", uploadEndpoint, true);

        const headers = getAuthHeaders();
        for (const key in headers) {
          if (Object.prototype.hasOwnProperty.call(headers, key)) {
            xhr.setRequestHeader(key, (headers as Record<string, string>)[key]);
          }
        }

        xhr.send(formData);
      });
    };

    const processAndUploadFiles = async (filesToUpload: File[]) => {
      if (filesToUpload.length === 0) return;

      const newUploadingFiles = filesToUpload.map((file) => ({
        file,
        id: `${file.name}-${file.lastModified}-${Math.random()}`,
        progress: 0,
      }));
      setUploadingFiles((prev) => [...prev, ...newUploadingFiles]);

      const uploadPromises = newUploadingFiles.map(uploadFileWithProgress);

      const results = await Promise.all(uploadPromises);
      const successfulUploads = results.filter((result): result is UploadedFileInfo => result !== null);

      setUploadingFiles((prev) => prev.filter((uf) => !newUploadingFiles.some((nuf) => nuf.id === uf.id)));
      if (successfulUploads.length > 0) {
        showToast(
          `${successfulUploads.length} file${successfulUploads.length > 1 ? "s" : ""} uploaded successfully.`,
          "success",
        );
      }
      setSelectedFiles((prev) => [...prev, ...successfulUploads]);
    };

    useImperativeHandle(ref, () => ({
      focusInput: () => {
        textareaRef.current?.focus();
      },
      processAndUploadFiles: processAndUploadFiles,
    }));

    useEffect(() => {
      if (activeProjectId !== null) {
        const fetchProjectFiles = async () => {
          try {
            const res = await fetch(`/api/projects/${activeProjectId}/files`, {
              headers: getAuthHeaders(),
            });
            if (!res.ok) {
              const errorData = await res.json();
              throw new Error(errorData.error || `Failed to fetch project files.`);
            }
            const files: ProjectFile[] = await res.json();
            setProjectFiles(files);
          } catch (err: unknown) {
            showToast(err instanceof Error ? err.message : String(err), "error");
            setProjectFiles([]);
          }
        };
        fetchProjectFiles();
      } else {
        setProjectFiles([]);
      }
    }, [activeProjectId, getAuthHeaders, showToast]);

    const handleOpenSourceFolder = async () => {
      if (typeof window.showDirectoryPicker !== "function") {
        showToast("Your browser does not support opening folders. Please try a modern, Chrome-based browser.", "error");
        return;
      }

      try {
        const directoryHandle = await window.showDirectoryPicker();
        const filesToUpload: File[] = [];
        let fileCount = 0;

        setIsScanning(true);
        setScanStatusMessage("Scanning folder...");

        const processDirectory = async (handle: FileSystemDirectoryHandle, path: string) => {
          for await (const entry of handle.values()) {
            const entryPath = `${path}/${entry.name}`;
            if (entry.kind === "file") {
              const extension = `.${entry.name.split(".").pop()}`;
              if (SOURCE_CODE_EXTENSIONS.has(extension) || SOURCE_CODE_EXTENSIONS.has(entry.name)) {
                try {
                  const file = await entry.getFile();
                  filesToUpload.push(file);
                  fileCount++;
                  setScanStatusMessage(`Scanning... Found ${fileCount} source file(s)`);
                } catch (e) {
                  console.warn(`Could not read file: ${entryPath}`, e);
                }
              }
            } else if (entry.kind === "directory") {
              await processDirectory(entry, entryPath);
            }
          }
        };

        await processDirectory(directoryHandle, directoryHandle.name);

        setScanStatusMessage(`Found ${fileCount} source file(s). Preparing for upload...`);
        await processAndUploadFiles(filesToUpload);
        setScanStatusMessage(null);
      } catch (err) {
        if (err instanceof DOMException && err.name === "AbortError") {
          console.log("Folder picker was cancelled by the user.");
        } else {
          console.error("Error picking folder:", err);
          showToast("An error occurred while selecting the folder.", "error");
        }
      } finally {
        setIsScanning(false);
        if (scanStatusMessage) {
          setTimeout(() => setScanStatusMessage(null), 3000);
        }
      }
    };

    const attachDropdownItems: DropdownItem[] = [
      {
        id: "attach-files",
        label: "Attach files",
        icon: <PaperClipIcon className="size-4" />,
        onClick: () => fileInputRef.current?.click(),
      },
      {
        id: "open-folder",
        label: "Open source folder",
        icon: <FolderOpenIcon className="size-4" />,
        onClick: handleOpenSourceFolder,
      },
    ];

    useEffect(() => {
      const ta = textareaRef.current;
      if (!ta) return;
      ta.style.height = "auto";
      const newHeight = Math.min(ta.scrollHeight, 320);
      ta.style.height = `${newHeight}px`;
      ta.style.overflowY = ta.scrollHeight > 320 ? "auto" : "hidden";
    }, [input, selectedFiles]);

    const handleFileChange = async (event: ChangeEvent<HTMLInputElement>) => {
      if (!event.target.files) return;
      const files = Array.from(event.target.files);
      event.target.value = "";

      await processAndUploadFiles(files);
    };

    const handlePaste = async (event: ClipboardEvent<HTMLTextAreaElement>) => {
      const items = event.clipboardData?.items;
      if (!items) return;

      const pastedFiles: File[] = [];
      for (let i = 0; i < items.length; i++) {
        const item = items[i];
        if (item.kind === "file") {
          const file = item.getAsFile();
          if (file) {
            pastedFiles.push(file);
          }
        }
      }

      if (pastedFiles.length > 0) {
        event.preventDefault();
        await processAndUploadFiles(pastedFiles);
      }
    };

    const removeSelectedFile = (objectNameToRemove: string) => {
      setSelectedFiles((prev) => prev.filter((file) => file.objectName !== objectNameToRemove));
    };

    const handleInputChange = (e: ChangeEvent<HTMLTextAreaElement>) => {
      const value = e.target.value;
      setInput(value);

      if (activeProjectId !== null) {
        const hashIndex = value.lastIndexOf("#");
        if (hashIndex !== -1 && (hashIndex === 0 || value[hashIndex - 1] === " " || value[hashIndex - 1] === "\n")) {
          const searchText = value.substring(hashIndex + 1);
          const cleanedSearchText = searchText.replace(/\s/g, "").toLowerCase();

          const filtered = projectFiles
            .filter((file) => file.fileName.replace(/\s/g, "").toLowerCase().includes(cleanedSearchText))
            .sort((a, b) => a.fileName.localeCompare(b.fileName));

          const finalFilteredList: ProjectFile[] = [];

          if ("all".includes(cleanedSearchText) && projectFiles.length > 0) {
            const allFilesOption: ProjectFile = {
              id: -1,
              fileName: "All",
              mimeType: "action/add-all",
              size: projectFiles.length,
              objectName: "special-all-files-action",
            };
            finalFilteredList.push(allFilesOption);
          }

          finalFilteredList.push(...filtered);

          setFilteredProjectFiles(finalFilteredList);
          setShowFileSuggestions(finalFilteredList.length > 0);
          setHighlightedSuggestionIndex(finalFilteredList.length > 0 ? 0 : -1);
        } else {
          setShowFileSuggestions(false);
          setFilteredProjectFiles([]);
          setHighlightedSuggestionIndex(-1);
        }
      }
    };

    const selectFileSuggestion = (file: ProjectFile) => {
      const hashIndex = input.lastIndexOf("#");
      if (hashIndex === -1) {
        setShowFileSuggestions(false);
        return;
      }

      const prefix = input.substring(0, hashIndex);

      if (file.id === -1) {
        const currentlySelected = new Set(selectedFiles.map((f) => f.objectName));
        const filesToAdd = projectFiles
          .filter((pf) => !currentlySelected.has(pf.objectName))
          .map((pf) => ({
            objectName: pf.objectName,
            fileName: pf.fileName,
            mimeType: pf.mimeType,
            size: pf.size,
            isProjectFile: true,
            projectFileId: pf.id,
          }));

        if (filesToAdd.length > 0) {
          setSelectedFiles((prev) => [...prev, ...filesToAdd]);
        }
      } else {
        setSelectedFiles((prev) => {
          if (!prev.some((sf) => sf.objectName === file.objectName)) {
            const newFilePart = {
              objectName: file.objectName,
              fileName: file.fileName,
              mimeType: file.mimeType,
              size: file.size,
              isProjectFile: true,
              projectFileId: file.id,
            };
            return [...prev, newFilePart];
          }
          return prev;
        });
      }

      setInput(prefix);
      setShowFileSuggestions(false);
      setFilteredProjectFiles([]);
      setHighlightedSuggestionIndex(-1);
      textareaRef.current?.focus();
    };

    const onKeyDown = (e: KeyboardEvent<HTMLTextAreaElement>) => {
      if (e.key === "Enter" && !e.shiftKey) {
        e.preventDefault();
        if (showFileSuggestions && highlightedSuggestionIndex !== -1) {
          selectFileSuggestion(filteredProjectFiles[highlightedSuggestionIndex]);
        } else {
          submit();
        }
      } else if (showFileSuggestions && (e.key === "ArrowUp" || e.key === "ArrowDown")) {
        e.preventDefault();
        if (e.key === "ArrowUp") {
          setHighlightedSuggestionIndex((prev) => (prev <= 0 ? filteredProjectFiles.length - 1 : prev - 1));
        } else {
          setHighlightedSuggestionIndex((prev) => (prev >= filteredProjectFiles.length - 1 ? 0 : prev + 1));
        }
      }
    };

    const submit = () => {
      if (
        (!input.trim() && selectedFiles.length === 0) ||
        isLoading ||
        isRecording ||
        isTranscribing ||
        isScanning ||
        isSessionActive
      )
        return;
      onSendMessageAction(input, selectedFiles, isSearchActive);
      setInput("");
      setSelectedFiles([]);
      setShowFileSuggestions(false);
      setFilteredProjectFiles([]);
      setHighlightedSuggestionIndex(-1);
    };

    const onSubmit = (e: FormEvent) => {
      e.preventDefault();
      submit();
    };

    const startRecording = async () => {
      if (isLoading) return;
      try {
        const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
        mediaRecorderRef.current = new MediaRecorder(stream, { mimeType: "audio/webm" });
        audioChunksRef.current = [];

        mediaRecorderRef.current.ondataavailable = (event) => {
          if (event.data.size > 0) {
            audioChunksRef.current.push(event.data);
          }
        };

        mediaRecorderRef.current.onstop = async () => {
          setIsRecording(false);
          stream.getTracks().forEach((track) => track.stop());
          if (audioChunksRef.current.length > 0) {
            const audioBlob = new Blob(audioChunksRef.current, { type: "audio/webm" });
            await transcribeAudio(audioBlob);
          }
          audioChunksRef.current = [];
        };

        mediaRecorderRef.current.start();
        setIsRecording(true);
      } catch (err) {
        showToast(`Microphone access denied or error: ${err instanceof Error ? err.message : String(err)}`, "error");
        console.error("Error accessing microphone:", err);
      }
    };

    const cancelRecording = () => {
      if (mediaRecorderRef.current) {
        mediaRecorderRef.current.onstop = null;
        if (mediaRecorderRef.current.state === "recording") {
          mediaRecorderRef.current.stop();
        }
        mediaRecorderRef.current.stream.getTracks().forEach((track) => track.stop());
      }
      audioChunksRef.current = [];
      setIsRecording(false);
    };

    const submitRecordingForTranscription = () => {
      if (mediaRecorderRef.current && mediaRecorderRef.current.state === "recording") {
        mediaRecorderRef.current.stop();
      }
    };

    const transcribeAudio = async (audioBlob: Blob) => {
      setIsTranscribing(true);

      try {
        const formData = new FormData();
        formData.append("audio_file", audioBlob, "recording.webm");

        const response = await fetch("/api/stt/transcribe", {
          method: "POST",
          headers: {
            ...getAuthHeaders(),
          },
          body: formData,
        });

        if (!response.ok) {
          const errorData = await response.json();
          throw new Error(errorData.error || "Failed to transcribe audio.");
        }

        const transcription = await response.text();
        setInput((prev) => (prev ? prev + " " : "") + transcription);
        textareaRef.current?.focus();
      } catch (err) {
        showToast(`Transcription error: ${err instanceof Error ? err.message : String(err)}`, "error");
        setInput("");
        console.error("Error during transcription:", err);
      } finally {
        setIsTranscribing(false);
      }
    };

    const getMainButtonAction = () => {
      if (isLoading) return onCancelAction;
      if (isRecording) return submitRecordingForTranscription;
      return undefined;
    };

    return (
      <form onSubmit={onSubmit} className="p-4 pt-0 flex justify-center">
        <div className="w-full max-w-[52rem] relative">
          {showFileSuggestions && filteredProjectFiles.length > 0 && (
            <div
              className="absolute bottom-[100%] left-1/2 -translate-x-1/2 w-full max-w-[52rem] mb-2 bg-white
                dark:bg-neutral-800 border border-neutral-300 dark:border-neutral-700 rounded-lg shadow-lg
                overflow-hidden z-20"
            >
              <ul className="max-h-48 overflow-y-auto">
                {filteredProjectFiles.map((file, index) => {
                  const isAllOption = file.id === -1;
                  return (
                    <li
                      key={file.id}
                      className={`px-4 py-2 cursor-pointer text-sm flex justify-between items-center ${
                        index === highlightedSuggestionIndex
                          ? "bg-blue-100 dark:bg-blue-700 text-blue-900 dark:text-white"
                          : "hover:bg-neutral-100 dark:hover:bg-neutral-700 text-neutral-800 dark:text-neutral-200"
                      }`}
                      onClick={() => selectFileSuggestion(file)}
                    >
                      <span className={isAllOption ? "font-bold" : ""}>{isAllOption ? "#All" : file.fileName}</span>
                      <span className="text-xs text-neutral-500 dark:text-neutral-400 ml-2">
                        {isAllOption ? `Add all ${file.size} files` : `${(file.size / 1024).toFixed(1)} KB`}
                      </span>
                    </li>
                  );
                })}
              </ul>
            </div>
          )}
          <div ref={fileAnimationParent}>
            {(selectedFiles.length > 0 || uploadingFiles.length > 0) && !isSessionActive && (
              <div
                className="mb-2 p-2 border border-neutral-100 dark:border-neutral-900 rounded-xl flex flex-wrap gap-2
                  transition-colors duration-300 ease-in-out"
              >
                {selectedFiles.map((file) => (
                  <div
                    key={file.objectName}
                    className="bg-neutral-100 dark:bg-neutral-900 text-neutral-700 dark:text-neutral-400 px-3 py-1
                      rounded-full text-sm flex items-center gap-2 transition-colors duration-300 ease-in-out"
                  >
                    <span className={file.isProjectFile ? "font-semibold" : ""}>{file.fileName}</span>
                    {!isLoading && (
                      <XCircleIcon
                        className="size-4 text-neutral-500 hover:text-red-500 dark:hover:text-red-400 cursor-pointer"
                        onClick={() => removeSelectedFile(file.objectName)}
                      />
                    )}
                  </div>
                ))}
                {uploadingFiles.map((upload) => (
                  <div
                    key={upload.id}
                    className="relative overflow-hidden bg-blue-100 dark:bg-blue-900/50 rounded-full text-sm flex
                      items-center transition-colors duration-300 ease-in-out"
                  >
                    <div
                      className="absolute top-0 left-0 h-full bg-blue-200 dark:bg-blue-800 transition-all duration-150"
                      style={{ width: `${upload.progress}%` }}
                    ></div>
                    <div className="relative z-10 flex items-center gap-2 px-3 py-1 text-blue-700 dark:text-blue-300">
                      <ArrowPathIcon className="size-4 animate-spin" />
                      <span className="truncate max-w-xs">{upload.file.name}</span>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
          {scanStatusMessage && (
            <div className="mb-2 p-2 text-sm text-neutral-500 flex items-center gap-2">
              <ArrowPathIcon className="size-4 animate-spin" />
              <span>{scanStatusMessage}</span>
            </div>
          )}

          <div
            className={`relative flex flex-col rounded-3xl border dark:border-neutral-900 overflow-hidden shadow-lg
              transition duration-300 ease-in-out focus-within:ring-2 focus-within:ring-opacity-50 ${
                isSessionActive
                  ? "border-blue-500 focus-within:border-blue-500 focus-within:ring-blue-500"
                  : "border-neutral-300 focus-within:border-blue-500 focus-within:ring-blue-500"
              }`}
          >
            <div className="p-4 bg-white dark:bg-neutral-900 transition-colors duration-300 ease-in-out">
              <textarea
                ref={textareaRef}
                value={input}
                onChange={handleInputChange}
                onKeyDown={onKeyDown}
                onPaste={handlePaste}
                placeholder={isSessionActive ? "Live session is active..." : "Send a message..."}
                rows={1}
                className="w-full resize-none border-none p-0 focus:outline-none bg-white dark:bg-neutral-900
                  transition-colors duration-300 ease-in-out placeholder-neutral-500 dark:placeholder-neutral-400"
                style={{
                  maxHeight: "320px",
                  overflowY: (textareaRef.current?.scrollHeight ?? 0) > 320 ? "auto" : "hidden",
                  scrollbarGutter: "stable",
                }}
                disabled={
                  isLoading || isRecording || isTranscribing || isScanning || isSessionActive || isLiveConnecting
                }
              />
            </div>

            <div
              className="border-t bg-white dark:bg-neutral-900 border-neutral-200 dark:border-neutral-800 p-2 ps-3 flex
                justify-between items-center transition-colors duration-300 ease-in-out"
            >
              <div className="flex items-center gap-2 flex-wrap">
                <Tooltip text="Attach files or open folder">
                  <button
                    ref={attachButtonRef}
                    type="button"
                    onClick={() => setIsAttachMenuOpen((prev) => !prev)}
                    disabled={
                      isLoading ||
                      isRecording ||
                      isTranscribing ||
                      isScanning ||
                      uploadingFiles.length > 0 ||
                      isSessionActive
                    }
                    className="cursor-pointer size-9 flex items-center justify-center rounded-full text-sm font-medium
                      border transition-colors duration-300 ease-in-out bg-white border-neutral-300 hover:bg-neutral-100
                      dark:bg-neutral-900 dark:border-neutral-800 dark:text-neutral-400 dark:hover:bg-neutral-700
                      disabled:opacity-50"
                  >
                    <PaperClipIcon
                      className="size-5 text-neutral-500 dark:text-neutral-300 transition-colors duration-300
                        ease-in-out"
                    />
                  </button>
                </Tooltip>
                <DropdownMenu
                  open={isAttachMenuOpen}
                  onCloseAction={() => setIsAttachMenuOpen(false)}
                  anchorRef={attachButtonRef}
                  items={attachDropdownItems}
                  position="left"
                />
                <input
                  type="file"
                  ref={fileInputRef}
                  onChange={handleFileChange}
                  multiple
                  className="hidden"
                  disabled={isLoading || isRecording || isTranscribing || isScanning || isSessionActive}
                />
                <Tooltip text="Search the web">
                  <button
                    type="button"
                    onClick={() => onToggleSearch(!isSearchActive)}
                    disabled={isRecording || isTranscribing || isScanning || isSessionActive}
                    className={` cursor-pointer h-9 flex items-center gap-2 px-4 rounded-full text-sm font-medium
                      transition-colors duration-300 ease-in-out ${
                        isSearchActive
                          ? `bg-black text-white border hover:bg-neutral-600 dark:bg-white dark:text-neutral-900
                            dark:border-neutral-200 dark:hover:bg-neutral-400 dark:hover:border-neutral-400`
                          : `bg-white border border-neutral-300 hover:bg-neutral-100 text-neutral-500
                            dark:bg-neutral-950 dark:border-neutral-900 dark:text-neutral-300 dark:hover:bg-neutral-700`
                      } `}
                  >
                    {isSearchActive ? (
                      <SolidGlobeAltIcon
                        className="size-5 text-white dark:text-neutral-900 transition-colors duration-300 ease-in-out"
                      />
                    ) : (
                      <OutlineGlobeAltIcon
                        className="size-5 text-neutral-500 dark:text-neutral-300 transition-colors duration-300
                          ease-in-out"
                      />
                    )}
                    <span>Search</span>
                  </button>
                </Tooltip>
              </div>

              <div className="flex items-center gap-2">
                {isSessionActive && (
                  <div className="flex items-center gap-2">
                    <Tooltip text={isAutoMuteEnabled ? "Auto-mute is ON" : "Auto-mute is OFF"}>
                      <button
                        type="button"
                        onClick={() => onAutoMuteToggle(!isAutoMuteEnabled)}
                        className={`cursor-pointer w-12 h-7 flex items-center rounded-full p-1 transition-colors
                        duration-300 ${isAutoMuteEnabled ? "bg-blue-600" : "bg-neutral-300 dark:bg-neutral-700"}`}
                      >
                        <span
                          className={`bg-white size-5 rounded-full shadow-md transform transition-transform duration-300
                          ${isAutoMuteEnabled ? "translate-x-5" : "translate-x-0"}`}
                        />
                      </button>
                    </Tooltip>
                    <label className="text-sm text-neutral-600 dark:text-neutral-300 flex items-center gap-1.5">
                      {isAutoMuteEnabled ? (
                        <SpeakerWaveIcon className="size-5" />
                      ) : (
                        <SpeakerXMarkIcon className="size-5" />
                      )}
                      <span>Auto-Mute</span>
                    </label>
                  </div>
                )}

                <div className="flex h-9 items-center">
                  {!isLoading && !isTranscribing && !isScanning && (
                    <div className="flex items-center gap-2">
                      <LiveSessionButton
                        isSessionActive={isSessionActive}
                        isConnecting={isLiveConnecting}
                        liveMode={liveMode}
                        onLiveModeChange={onLiveModeChange}
                        onStartSession={handleStartLiveSession}
                        onStopSession={stopSession}
                        disabled={isLoading || isRecording || isTranscribing || isScanning}
                        liveModels={liveModels}
                        selectedLiveModel={selectedLiveModel}
                        onLiveModelChange={onLiveModelChange}
                        languages={languageCodes}
                        selectedLanguage={selectedLanguage}
                        onLanguageChange={onLanguageChange}
                        dialogVoices={dialogVoices}
                        standardVoices={standardVoices}
                        selectedVoice={selectedVoice}
                        onVoiceChange={onVoiceChange}
                      />
                      <Tooltip text={isRecording ? "Cancel recording" : "Dictate message"}>
                        <button
                          type="button"
                          onClick={isRecording ? cancelRecording : startRecording}
                          disabled={
                            isLoading || isTranscribing || uploadingFiles.length > 0 || isScanning || isSessionActive
                          }
                          className="cursor-pointer size-9 flex items-center justify-center rounded-full text-sm
                            font-medium border transition-colors duration-300 ease-in-out bg-white border-neutral-300
                            hover:bg-neutral-100 dark:bg-neutral-900 dark:border-neutral-800 dark:hover:bg-neutral-700
                            disabled:opacity-50"
                        >
                          {isRecording ? (
                            <XMarkIcon className="size-5 text-red-500" />
                          ) : (
                            <MicrophoneIcon className="size-5 text-neutral-500 dark:text-neutral-300" />
                          )}
                        </button>
                      </Tooltip>
                    </div>
                  )}
                </div>

                <button
                  type={isSessionActive || isLoading || isRecording || isTranscribing ? "button" : "submit"}
                  onClick={getMainButtonAction()}
                  disabled={
                    isLoading
                      ? false
                      : isTranscribing
                        ? true
                        : isRecording
                          ? false
                          : isScanning ||
                            uploadingFiles.length > 0 ||
                            isSessionActive ||
                            (!input.trim() && selectedFiles.length === 0)
                  }
                  className={`cursor-pointer disabled:opacity-50 disabled:cursor-not-allowed rounded-full flex
                    items-center justify-center transition-colors duration-300 ease-in-out ${
                      isRecording
                        ? `size-9 border bg-white border-neutral-300 hover:bg-neutral-100 dark:bg-neutral-900
                          dark:border-neutral-800 dark:hover:bg-neutral-700`
                        : `size-9 bg-black text-white hover:bg-neutral-600 dark:bg-white dark:text-black
                          dark:hover:bg-neutral-400`
                    }`}
                >
                  <AnimatePresence mode="wait">
                    {isLoading ? (
                      <motion.div
                        key="stop"
                        initial={{ opacity: 0, scale: 0.5 }}
                        animate={{ opacity: 1, scale: 1 }}
                        exit={{ opacity: 0, scale: 0.5 }}
                      >
                        <StopIcon className="size-5" />
                      </motion.div>
                    ) : isTranscribing || isScanning || isLiveConnecting ? (
                      <motion.div
                        key="loading"
                        initial={{ opacity: 0, scale: 0.5 }}
                        animate={{ opacity: 1, scale: 1 }}
                        exit={{ opacity: 0, scale: 0.5 }}
                      >
                        <ArrowPathIcon className="size-5 animate-spin" />
                      </motion.div>
                    ) : isRecording ? (
                      <motion.div
                        key="check"
                        initial={{ opacity: 0, scale: 0.5 }}
                        animate={{ opacity: 1, scale: 1 }}
                        exit={{ opacity: 0, scale: 0.5 }}
                      >
                        <CheckIcon className="size-5 text-green-500" />
                      </motion.div>
                    ) : (
                      <motion.div
                        key="send"
                        initial={{ opacity: 0, scale: 0.5 }}
                        animate={{ opacity: 1, scale: 1 }}
                        exit={{ opacity: 0, scale: 0.5 }}
                      >
                        <ArrowUpIcon className="size-5 stroke-2" />
                      </motion.div>
                    )}
                  </AnimatePresence>
                </button>
              </div>
            </div>
          </div>
        </div>
      </form>
    );
  },
);

ChatInput.displayName = "ChatInput";
export default ChatInput;
