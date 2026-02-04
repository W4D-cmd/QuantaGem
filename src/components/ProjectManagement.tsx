"use client";

import React, { useState, useEffect, ChangeEvent, useCallback, useRef } from "react";
import { ToastProps } from "./Toast";
import { ProjectFile } from "@/app/page";
import { ArrowUpTrayIcon, DocumentArrowDownIcon, XCircleIcon } from "@heroicons/react/24/outline";
import { showApiErrorToast } from "@/lib/errors";

interface ProjectManagementProps {
  projectId: number;
  getAuthHeaders: () => HeadersInit;
  onProjectUpdated: () => void;
  showToast: (message: string, type?: ToastProps["type"]) => void;
  openConfirmationModal: React.Dispatch<
    React.SetStateAction<{ isOpen: boolean; title: string; message: string; onConfirm: () => void }>
  >;
  onProjectSystemPromptUpdated: () => void;
}

const ProjectManagement: React.FC<ProjectManagementProps> = ({
  projectId,
  getAuthHeaders,
  onProjectUpdated,
  showToast,
  openConfirmationModal,
  onProjectSystemPromptUpdated,
}) => {
  const [projectTitle, setProjectTitle] = useState("");
  const [projectSystemPrompt, setProjectSystemPrompt] = useState("");
  const [initialProjectSystemPrompt, setInitialProjectSystemPrompt] = useState("");
  const [projectFiles, setProjectFiles] = useState<ProjectFile[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [isSaving, setIsSaving] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [uploadingFiles, setUploadingFiles] = useState<{ file: File; id: string; progress: number }[]>([]);
  const [isDraggingOver, setIsDraggingOver] = useState(false);
  const dragCounter = useRef(0);

  const fetchProjectDetails = useCallback(async () => {
    setIsLoading(true);
    try {
      const res = await fetch(`/api/projects/${projectId}`, {
        headers: getAuthHeaders(),
      });
      if (!res.ok) {
        await showApiErrorToast(res, showToast);
        return;
      }
      const data = await res.json();
      setProjectTitle(data.title);
      setProjectSystemPrompt(data.systemPrompt || "");
      setInitialProjectSystemPrompt(data.systemPrompt || "");
      setProjectFiles(data.files || []);
    } catch (err: unknown) {
      showToast(err instanceof Error ? err.message : String(err), "error");
    } finally {
      setIsLoading(false);
    }
  }, [projectId, getAuthHeaders, showToast]);

  useEffect(() => {
    if (projectId) {
      fetchProjectDetails();
    }
  }, [projectId, fetchProjectDetails]);

  const handleSystemPromptChange = (e: ChangeEvent<HTMLTextAreaElement>) => {
    setProjectSystemPrompt(e.target.value);
  };

  const handleSaveProjectSettings = async () => {
    setIsSaving(true);
    try {
      const res = await fetch(`/api/projects/${projectId}`, {
        method: "PATCH",
        headers: {
          "Content-Type": "application/json",
          ...getAuthHeaders(),
        },
        body: JSON.stringify({
          systemPrompt: projectSystemPrompt,
        }),
      });
      if (!res.ok) {
        await showApiErrorToast(res, showToast);
        return;
      }
      setInitialProjectSystemPrompt(projectSystemPrompt);
      onProjectUpdated();
      onProjectSystemPromptUpdated();
      showToast("Project settings saved successfully.", "success");
    } catch (err: unknown) {
      showToast(err instanceof Error ? err.message : String(err), "error");
    } finally {
      setIsSaving(false);
    }
  };

  const uploadFileWithProgress = (uploadingFile: { file: File; id: string; progress: number }) => {
    return new Promise<ProjectFile | null>((resolve) => {
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
            resolve(JSON.parse(xhr.responseText));
          } catch (e) {
            console.log(e);
            resolve(null);
          }
        } else {
          resolve(null);
        }
      };
      xhr.onerror = () => resolve(null);
      xhr.ontimeout = () => resolve(null);

      xhr.open("POST", `/api/projects/${projectId}/files`, true);
      const headers = getAuthHeaders();
      for (const key in headers) {
        if (Object.prototype.hasOwnProperty.call(headers, key)) {
          xhr.setRequestHeader(key, (headers as Record<string, string>)[key]);
        }
      }
      xhr.send(formData);
    });
  };

  const handleFileUploads = async (filesToUpload: File[]) => {
    if (filesToUpload.length === 0) return;

    const newUploadingFiles = filesToUpload.map((file) => ({
      file,
      id: `${file.name}-${file.lastModified}-${Math.random()}`,
      progress: 0,
    }));
    setUploadingFiles((prev) => [...prev, ...newUploadingFiles]);

    const results = await Promise.all(newUploadingFiles.map(uploadFileWithProgress));
    const successfulUploads = results.filter((result): result is ProjectFile => result !== null);

    setProjectFiles((prev) => [...prev, ...successfulUploads]);
    setUploadingFiles((prev) => prev.filter((uf) => !newUploadingFiles.some((nuf) => nuf.id === uf.id)));

    if (successfulUploads.length > 0) {
      showToast(`${successfulUploads.length} file(s) uploaded successfully.`, "success");
    }
    if (results.length > successfulUploads.length) {
      showToast(`${results.length - successfulUploads.length} file(s) failed to upload.`, "error");
    }
  };

  const handleFileChange = (event: ChangeEvent<HTMLInputElement>) => {
    if (!event.target.files || event.target.files.length === 0) return;
    const files = Array.from(event.target.files);
    event.target.value = "";
    handleFileUploads(files);
  };

  const confirmDeleteFile = (fileId: number, fileName: string) => {
    openConfirmationModal({
      isOpen: true,
      title: "Delete File",
      message: `Are you sure you want to delete "${fileName}"? This action cannot be undone.`,
      onConfirm: () => handleDeleteFile(fileId, fileName),
    });
  };

  const handleDeleteFile = async (fileId: number, fileName: string) => {
    setIsSaving(true);
    try {
      const res = await fetch(`/api/projects/${projectId}/files/${fileId}`, {
        method: "DELETE",
        headers: getAuthHeaders(),
      });
      if (!res.ok) {
        await showApiErrorToast(res, showToast);
        return;
      }
      setProjectFiles((prev) => prev.filter((file) => file.id !== fileId));
      showToast(`File "${fileName}" deleted successfully.`, "success");
    } catch (err: unknown) {
      showToast(err instanceof Error ? err.message : String(err), "error");
    } finally {
      setIsSaving(false);
    }
  };

  const handleDragEnter = (e: React.DragEvent<HTMLElement>) => {
    e.preventDefault();
    e.stopPropagation();
    dragCounter.current++;
    if (e.dataTransfer.items && e.dataTransfer.items.length > 0) {
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

    const files = Array.from(e.dataTransfer.files);
    if (files && files.length > 0) {
      handleFileUploads(files);
      e.dataTransfer.clearData();
    }
  };

  const hasSettingsChanged = projectSystemPrompt !== initialProjectSystemPrompt;

  if (isLoading) {
    return (
      <div className="flex-1 flex items-center justify-center">
        <div className="w-6 h-6 border-3 border-neutral-300 border-t-neutral-500 rounded-full animate-spin" />{" "}
      </div>
    );
  }

  if (!projectTitle) {
    return (
      <div className="flex-1 flex items-center justify-center text-red-500 dark:text-red-400 text-center p-4">
        Error loading project. Please try again later.
      </div>
    );
  }

  return (
    <div
      className="flex-1 overflow-y-auto p-4 max-w-[52rem] mx-auto relative"
      onDragEnter={handleDragEnter}
      onDragOver={handleDragOver}
      onDragLeave={handleDragLeave}
      onDrop={handleDrop}
    >
      {isDraggingOver && (
        <div
          className="pointer-events-none absolute inset-2 z-50 flex items-center justify-center rounded-2xl border-2
            border-dashed border-green-500 bg-green-100/50 dark:bg-green-900/50 backdrop-blur-sm"
        >
          <div className="flex flex-col items-center gap-2 text-green-600 dark:text-green-300">
            <DocumentArrowDownIcon className="size-8" />
            <p className="font-semibold">Drop files to upload to project</p>
          </div>
        </div>
      )}

      <h2 className="text-2xl font-bold mb-4 text-neutral-900 dark:text-zinc-100">{projectTitle}</h2>

      <div
        className="bg-white dark:bg-zinc-900 p-6 rounded-2xl shadow-lg border border-neutral-200
          dark:border-zinc-800 mb-6"
      >
        <h3 className="text-xl font-semibold mb-4 text-neutral-900 dark:text-zinc-100">Project System Prompt</h3>

        <div className="mb-4">
          <p className="text-xs text-neutral-500 dark:text-zinc-500 mb-2">
            Define the default behavior and persona for the AI in chats within this project. This will override the
            global system prompt. Individual chats can further override this.
          </p>
          <textarea
            id="project-system-prompt"
            rows={6}
            value={projectSystemPrompt}
            onChange={handleSystemPromptChange}
            className="w-full p-2 border border-neutral-300 dark:border-zinc-700 rounded-lg bg-neutral-50
              dark:bg-zinc-800 text-neutral-900 dark:text-zinc-100 resize-y focus:outline-none focus:border-blue-500
              focus:ring-2 focus:ring-blue-500 focus:ring-opacity-50 transition-all duration-300 ease-in-out"
            placeholder="e.g., You are an expert in software development and only respond with code examples."
            disabled={isSaving}
          />
        </div>
        <div className="flex justify-end">
          <button
            onClick={handleSaveProjectSettings}
            disabled={isSaving || !hasSettingsChanged}
            className="cursor-pointer px-6 py-2 rounded-full bg-black text-white text-sm font-medium
              hover:bg-neutral-700 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
          >
            {isSaving ? "Saving..." : "Save Prompt"}
          </button>
        </div>
      </div>

      <div
        className="bg-white dark:bg-zinc-900 p-6 rounded-2xl shadow-lg border border-neutral-200
          dark:border-zinc-800"
      >
        <h3 className="text-xl font-semibold mb-4 text-neutral-900 dark:text-zinc-100">Project Files</h3>

        {projectFiles.length === 0 && uploadingFiles.length === 0 && (
          <p className="text-neutral-500 dark:text-zinc-500 mb-4">No files uploaded for this project yet.</p>
        )}

        {projectFiles.length > 0 && (
          <ul className="space-y-2 mb-4">
            {projectFiles.map((file) => (
              <li
                key={file.id}
                className="flex items-center justify-between p-3 bg-neutral-100 dark:bg-zinc-800 rounded-lg border
                  border-neutral-200 dark:border-zinc-700"
              >
                <span className="text-sm text-neutral-800 dark:text-zinc-300 truncate pr-2">
                  {file.fileName} ({`${(file.size / 1024).toFixed(1)} KB`})
                </span>
                <button
                  onClick={() => confirmDeleteFile(file.id, file.fileName)}
                  disabled={isSaving}
                  className="p-1 rounded-full text-red-500 dark:text-red-400 hover:bg-red-100 dark:hover:bg-red-900/50
                    disabled:opacity-50 disabled:cursor-not-allowed"
                  title="Delete file"
                >
                  <XCircleIcon className="size-5" />
                </button>
              </li>
            ))}
          </ul>
        )}

        {uploadingFiles.length > 0 && (
          <div
            className="mb-4 p-3 bg-blue-50 dark:bg-blue-950 rounded-lg border border-blue-200 dark:border-blue-800
              text-blue-700 dark:text-blue-200"
          >
            <p className="font-semibold text-sm mb-1">Uploading...</p>
            <ul className="space-y-1 text-xs">
              {uploadingFiles.map((upload) => (
                <li key={upload.id} className="relative overflow-hidden rounded-full bg-blue-100 dark:bg-blue-900/50">
                  <div
                    className="absolute top-0 left-0 h-full bg-blue-200 dark:bg-blue-800 transition-all duration-150"
                    style={{ width: `${upload.progress}%` }}
                  ></div>
                  <div className="relative z-10 flex items-center gap-2 px-3 py-1.5">
                    <span className="truncate">{upload.file.name}</span>
                  </div>
                </li>
              ))}
            </ul>
          </div>
        )}

        <div className="flex justify-end">
          <input
            type="file"
            ref={fileInputRef}
            onChange={handleFileChange}
            multiple
            className="hidden"
            disabled={isSaving}
          />
          <button
            onClick={() => fileInputRef.current?.click()}
            disabled={isSaving || uploadingFiles.length > 0}
            className="cursor-pointer px-6 py-2 rounded-full bg-blue-600 dark:bg-blue-600 text-white text-sm font-medium
              hover:bg-blue-700 dark:hover:bg-blue-700 disabled:opacity-50 disabled:cursor-not-allowed transition-colors
              flex items-center gap-2"
          >
            <ArrowUpTrayIcon className="size-5" /> Upload New File
          </button>
        </div>
      </div>
    </div>
  );
};

export default ProjectManagement;
