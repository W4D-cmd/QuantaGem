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
import {
  ArrowUpCircleIcon,
  StopCircleIcon,
  PaperClipIcon,
  XCircleIcon,
} from "@heroicons/react/24/solid";
import { GlobeAltIcon as GlobeOutlineIcon } from "@heroicons/react/24/outline";
import { GlobeAltIcon as GlobeSolidIcon } from "@heroicons/react/24/solid";
import Tooltip from "@/components/Tooltip";

export interface UploadedFileInfo {
  objectName: string;
  fileName: string;
  mimeType: string;
  size: number;
}

interface ChatInputProps {
  onSendMessageAction: (
    inputText: string,
    files: UploadedFileInfo[],
    isSearchActive: boolean,
  ) => void;
  onCancelAction: () => void;
  isLoading: boolean;
  isSearchActive: boolean;
  onToggleSearch: (isActive: boolean) => void;
}

export interface ChatInputHandle {
  focusInput: () => void;
}

const ChatInput = forwardRef<ChatInputHandle, ChatInputProps>(
  (
    {
      onSendMessageAction,
      onCancelAction,
      isLoading,
      isSearchActive,
      onToggleSearch,
    },
    ref,
  ) => {
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
          });
          if (!response.ok) {
            const errorData = await response.json();
            throw new Error(
              errorData.error || `Upload failed for ${file.name}`,
            );
          }
          const result: UploadedFileInfo = await response.json();
          return result;
        } catch (error) {
          console.error("Upload error:", error);
          return null;
        }
      });

      const results = await Promise.all(uploadPromises);
      const successfulUploads = results.filter(
        (result): result is UploadedFileInfo => result !== null,
      );

      setSelectedFiles((prev) => [...prev, ...successfulUploads]);
      setUploadingFiles((prev) =>
        prev.filter((f) => !filesToUpload.includes(f)),
      );
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
      setSelectedFiles((prev) =>
        prev.filter((file) => file.objectName !== objectNameToRemove),
      );
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
            <div className="mb-2 p-2 border border-gray-200 rounded-xl flex flex-wrap gap-2">
              {selectedFiles.map((file) => (
                <div
                  key={file.objectName}
                  className="bg-gray-100 text-gray-700 px-3 py-1 rounded-full text-sm flex items-center gap-2"
                >
                  <span>{file.fileName}</span>
                  {!isLoading && (
                    <XCircleIcon
                      className="h-4 w-4 text-gray-500 hover:text-red-500 cursor-pointer"
                      onClick={() => removeSelectedFile(file.objectName)}
                    />
                  )}
                </div>
              ))}
            </div>
          )}
          {uploadingFiles.length > 0 && (
            <div className="mb-2 p-2 text-sm text-gray-500">
              Uploading {uploadingFiles.length} file(s)...
              {uploadingFiles.map((f) => (
                <div key={f.name} className="text-xs">
                  {f.name}
                </div>
              ))}
            </div>
          )}

          <div
            className="
            relative
            flex flex-col
            rounded-3xl
            border border-gray-300
            overflow-hidden
            shadow-lg
            transition-shadow duration-200
            focus-within:border-blue-500
            focus-within:ring-2 focus-within:ring-blue-500 focus-within:ring-opacity-50
          "
          >
            <div className="p-4">
              <textarea
                ref={textareaRef}
                value={input}
                onChange={(e) => setInput(e.target.value)}
                onKeyDown={onKeyDown}
                onPaste={handlePaste}
                placeholder="Send a message..."
                rows={1}
                className="w-full resize-none border-none p-0 bg-background text-foreground focus:outline-none"
                style={{
                  maxHeight: "320px",
                  overflowY:
                    (textareaRef.current?.scrollHeight ?? 0) > 320
                      ? "auto"
                      : "hidden",
                  scrollbarGutter: "stable",
                }}
                disabled={isLoading}
              />
            </div>

            <div className="border-t border-gray-200 p-2 ps-3 flex justify-between items-center">
              <div className="flex items-center gap-2">
                <Tooltip text="Attach files">
                  <button
                    type="button"
                    onClick={() => fileInputRef.current?.click()}
                    disabled={isLoading}
                    className="cursor-pointer h-9 flex items-center justify-center px-2 rounded-full text-sm font-medium transition-colors duration-150 bg-white text-primary border border-gray-300 hover:bg-gray-100"
                  >
                    <PaperClipIcon className="h-5 w-5" />
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
                    className={`
                    cursor-pointer h-9 flex items-center gap-2 px-4 rounded-full text-sm font-medium transition-colors duration-150
                    ${
                      isSearchActive
                        ? "bg-[#171717] text-white border"
                        : "bg-white text-primary border border-gray-300 hover:bg-gray-100"
                    }
                  `}
                  >
                    {isSearchActive ? (
                      <GlobeSolidIcon className="h-5 w-5" />
                    ) : (
                      <GlobeOutlineIcon className="h-5 w-5" />
                    )}
                    <span>Search</span>
                  </button>
                </Tooltip>
              </div>

              <button
                type={isLoading ? "button" : "submit"}
                onClick={isLoading ? onCancelAction : undefined}
                disabled={
                  isLoading
                    ? false
                    : !input.trim() && selectedFiles.length === 0
                }
                className="cursor-pointer disabled:opacity-50 disabled:cursor-not-allowed rounded-full hover:text-[#5d5d5d] transition-colors duration-150"
              >
                {isLoading ? (
                  <StopCircleIcon className="h-10 w-10" />
                ) : (
                  <ArrowUpCircleIcon className="h-10 w-10" />
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
