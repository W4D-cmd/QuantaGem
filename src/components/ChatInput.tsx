"use client";

import React, {
  useState,
  useRef,
  useEffect,
  FormEvent,
  KeyboardEvent,
  ChangeEvent,
  forwardRef,
  useImperativeHandle,
  ClipboardEvent,
} from "react";
import Tooltip from "@/components/Tooltip";
import { PaperClipIcon, XCircleIcon } from "@heroicons/react/24/outline";
import { ArrowUpCircleIcon, StopCircleIcon } from "@heroicons/react/24/solid";
import { GlobeAltIcon as OutlineGlobeAltIcon } from "@heroicons/react/24/outline";
import { GlobeAltIcon as SolidGlobeAltIcon } from "@heroicons/react/24/solid";

export interface UploadedFileInfo {
  objectName: string;
  fileName: string;
  mimeType: string;
  size: number;
}

interface ChatInputProps {
  onSendMessageAction: (inputText: string, files: UploadedFileInfo[], isSearchActive: boolean) => void;
  onCancelAction: () => void;
  isLoading: boolean;
  isSearchActive: boolean;
  onToggleSearch: (isActive: boolean) => void;
  getAuthHeaders: () => HeadersInit;
}

export interface ChatInputHandle {
  focusInput: () => void;
}

const ChatInput = forwardRef<ChatInputHandle, ChatInputProps>(
  ({ onSendMessageAction, onCancelAction, isLoading, isSearchActive, onToggleSearch, getAuthHeaders }, ref) => {
    const [input, setInput] = useState("");
    const textareaRef = useRef<HTMLTextAreaElement>(null);
    const fileInputRef = useRef<HTMLInputElement>(null);
    const [selectedFiles, setSelectedFiles] = useState<UploadedFileInfo[]>([]);
    const [uploadingFiles, setUploadingFiles] = useState<File[]>([]);

    useImperativeHandle(ref, () => ({
      focusInput: () => {
        textareaRef.current?.focus();
      },
    }));

    const processAndUploadFiles = async (filesToUpload: File[]) => {
      if (filesToUpload.length === 0) return;

      setUploadingFiles((prev) => [...prev, ...filesToUpload]);

      const uploadPromises = filesToUpload.map(async (file) => {
        const formData = new FormData();
        formData.append("file", file);
        try {
          const response = await fetch("/api/files/upload", {
            method: "POST",
            body: formData,
            headers: getAuthHeaders(),
          });
          if (!response.ok) {
            const errorData = await response.json();
            throw new Error(errorData.error || `Upload failed for ${file.name}`);
          }
          const result: UploadedFileInfo = await response.json();
          return result;
        } catch (error) {
          console.error("Upload error:", error);
          return null;
        }
      });

      const results = await Promise.all(uploadPromises);
      const successfulUploads = results.filter((result): result is UploadedFileInfo => result !== null);

      setSelectedFiles((prev) => [...prev, ...successfulUploads]);
      setUploadingFiles((prev) => prev.filter((f) => !filesToUpload.includes(f)));
    };

    useEffect(() => {
      const ta = textareaRef.current;
      if (!ta) return;
      ta.style.height = "auto";
      const newHeight = Math.min(ta.scrollHeight, 320);
      ta.style.height = `${newHeight}px`;
      ta.style.overflowY = ta.scrollHeight > 320 ? "auto" : "hidden";
    }, [input]);

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

    const submit = () => {
      if ((!input.trim() && selectedFiles.length === 0) || isLoading) return;
      onSendMessageAction(input, selectedFiles, isSearchActive);
      setInput("");
      setSelectedFiles([]);
    };

    const onKeyDown = (e: KeyboardEvent<HTMLTextAreaElement>) => {
      if (e.key === "Enter" && !e.shiftKey) {
        e.preventDefault();
        submit();
      }
    };

    const onSubmit = (e: FormEvent) => {
      e.preventDefault();
      submit();
    };

    return (
      <form onSubmit={onSubmit} className="p-4 pt-0 flex justify-center">
        <div className="w-full max-w-[52rem]">
          {selectedFiles.length > 0 && (
            <div
              className="mb-2 p-2 border border-neutral-100 dark:border-neutral-900 rounded-xl flex flex-wrap gap-2 transition-colors
                duration-300 ease-in-out"
            >
              {selectedFiles.map((file) => (
                <div
                  key={file.objectName}
                  className="bg-neutral-100 dark:bg-neutral-900 text-neutral-700 dark:text-neutral-400 px-3 py-1 rounded-full text-sm flex
                    items-center gap-2 transition-colors duration-300 ease-in-out"
                >
                  <span>{file.fileName}</span>
                  {!isLoading && (
                    <XCircleIcon
                      className="size-4 text-neutral-500 hover:text-red-500 dark:hover:text-red-400 cursor-pointer"
                      onClick={() => removeSelectedFile(file.objectName)}
                    />
                  )}
                </div>
              ))}
            </div>
          )}
          {uploadingFiles.length > 0 && (
            <div className="mb-2 p-2 text-sm text-neutral-500">
              Uploading {uploadingFiles.length} file(s)...
              {uploadingFiles.map((f) => (
                <div key={f.name} className="text-xs">
                  {f.name}
                </div>
              ))}
            </div>
          )}

          <div
            className="relative flex flex-col rounded-3xl border border-neutral-300 dark:border-neutral-900 overflow-hidden shadow-lg
              transition duration-300 ease-in-out focus-within:border-blue-500 focus-within:ring-2 focus-within:ring-blue-500
              focus-within:ring-opacity-50"
          >
            <div className="p-4 bg-white dark:bg-neutral-900 transition-colors duration-300 ease-in-out">
              <textarea
                ref={textareaRef}
                value={input}
                onChange={(e) => setInput(e.target.value)}
                onKeyDown={onKeyDown}
                onPaste={handlePaste}
                placeholder="Send a message..."
                rows={1}
                className="w-full resize-none border-none p-0 focus:outline-none bg-white dark:bg-neutral-900 transition-colors duration-300
                  ease-in-out placeholder-neutral-500 dark:placeholder-neutral-400"
                style={{
                  maxHeight: "320px",
                  overflowY: (textareaRef.current?.scrollHeight ?? 0) > 320 ? "auto" : "hidden",
                  scrollbarGutter: "stable",
                }}
                disabled={isLoading}
              />
            </div>

            <div
              className="border-t bg-white dark:bg-neutral-900 border-neutral-200 dark:border-neutral-800 p-2 ps-3 flex justify-between
                items-center transition-colors duration-300 ease-in-out"
            >
              <div className="flex items-center gap-2">
                <Tooltip text="Attach files">
                  <button
                    type="button"
                    onClick={() => fileInputRef.current?.click()}
                    disabled={isLoading}
                    className="cursor-pointer h-9 flex items-center justify-center px-2 rounded-full text-sm font-medium border transition-colors
                      duration-300 ease-in-out bg-white border-neutral-300 hover:bg-neutral-100 dark:bg-neutral-900 dark:border-neutral-800
                      dark:text-neutral-400 dark:hover:bg-neutral-700"
                  >
                    <PaperClipIcon className="size-5 text-neutral-500 dark:text-neutral-300 transition-colors duration-300 ease-in-out" />
                  </button>
                </Tooltip>
                <input
                  type="file"
                  ref={fileInputRef}
                  onChange={handleFileChange}
                  multiple
                  className="hidden"
                  disabled={isLoading}
                />
                <Tooltip text="Search the web">
                  <button
                    type="button"
                    onClick={() => onToggleSearch(!isSearchActive)}
                    className={` cursor-pointer h-9 flex items-center gap-2 px-4 rounded-full text-sm font-medium transition-colors duration-300
                      ease-in-out ${
                      isSearchActive
                          ? `bg-black text-white border hover:bg-neutral-600 dark:bg-white dark:text-neutral-900 dark:border-neutral-200
                            dark:hover:bg-neutral-400 dark:hover:border-neutral-400`
                          : `bg-white border border-neutral-300 hover:bg-neutral-100 text-neutral-500 dark:bg-neutral-900 dark:border-neutral-800
                            dark:text-neutral-300 dark:hover:bg-neutral-700`
                      } `}
                  >
                    {isSearchActive ? (
                      <SolidGlobeAltIcon className="size-5 text-white dark:text-neutral-900 transition-colors duration-300 ease-in-out" />
                    ) : (
                      <OutlineGlobeAltIcon className="size-5 text-neutral-500 dark:text-neutral-300 transition-colors duration-300 ease-in-out" />
                    )}
                    <span>Search</span>
                  </button>
                </Tooltip>
              </div>

              <button
                type={isLoading ? "button" : "submit"}
                onClick={isLoading ? onCancelAction : undefined}
                disabled={isLoading ? false : !input.trim() && selectedFiles.length === 0}
                className="size-10 cursor-pointer disabled:opacity-50 disabled:cursor-not-allowed rounded-full hover:text-neutral-400
                  transition-colors duration-300 ease-in-out"
              >
                {isLoading ? (
                  <StopCircleIcon className="transition-colors duration-300 ease-in-out" />
                ) : (
                  <ArrowUpCircleIcon className="transition-colors duration-300 ease-in-out" />
                )}
              </button>
            </div>
          </div>
        </div>
      </form>
    );
  },
);

ChatInput.displayName = "ChatInput";
export default ChatInput;
