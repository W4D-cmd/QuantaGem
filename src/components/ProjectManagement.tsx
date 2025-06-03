"use client";

import React, { useState, useEffect, ChangeEvent, useCallback, useRef } from "react";
import Toast from "./Toast";
import { ProjectFile } from "@/app/page";
import { ArrowUpTrayIcon, XCircleIcon } from "@heroicons/react/24/outline";

interface ProjectManagementProps {
  projectId: number;
  getAuthHeaders: () => HeadersInit;
  onProjectUpdated: () => void;
  onProjectFileAction: (message: string) => void;
  onProjectSystemPromptUpdated: () => void;
}

const ProjectManagement: React.FC<ProjectManagementProps> = ({
  projectId,
  getAuthHeaders,
  onProjectUpdated,
  onProjectFileAction,
  onProjectSystemPromptUpdated,
}) => {
  const [projectTitle, setProjectTitle] = useState("");
  const [projectSystemPrompt, setProjectSystemPrompt] = useState("");
  const [initialProjectSystemPrompt, setInitialProjectSystemPrompt] = useState("");
  const [projectFiles, setProjectFiles] = useState<ProjectFile[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [isSaving, setIsSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [uploadingFiles, setUploadingFiles] = useState<File[]>([]);

  const fetchProjectDetails = useCallback(async () => {
    setIsLoading(true);
    setError(null);
    try {
      const res = await fetch(`/api/projects/${projectId}`, {
        headers: getAuthHeaders(),
      });
      if (!res.ok) {
        const errorData = await res.json().catch(() => ({}));
        throw new Error(errorData.error || `Failed to fetch project details: ${res.statusText}`);
      }
      const data = await res.json();
      setProjectTitle(data.title);
      setProjectSystemPrompt(data.systemPrompt || "");
      setInitialProjectSystemPrompt(data.systemPrompt || "");
      setProjectFiles(data.files || []);
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setIsLoading(false);
    }
  }, [projectId, getAuthHeaders]);

  useEffect(() => {
    if (projectId) {
      fetchProjectDetails();
    }
  }, [projectId, fetchProjectDetails]);

  const handleTitleChange = (e: ChangeEvent<HTMLInputElement>) => {
    setProjectTitle(e.target.value);
  };

  const handleSystemPromptChange = (e: ChangeEvent<HTMLTextAreaElement>) => {
    setProjectSystemPrompt(e.target.value);
  };

  const handleSaveProjectSettings = async () => {
    setIsSaving(true);
    setError(null);
    try {
      const res = await fetch(`/api/projects/${projectId}`, {
        method: "PATCH",
        headers: {
          "Content-Type": "application/json",
          ...getAuthHeaders(),
        },
        body: JSON.stringify({
          title: projectTitle,
          systemPrompt: projectSystemPrompt,
        }),
      });
      if (!res.ok) {
        const errorData = await res.json().catch(() => ({}));
        throw new Error(errorData.error || `Failed to save project settings: ${res.statusText}`);
      }
      setInitialProjectSystemPrompt(projectSystemPrompt);
      onProjectUpdated();
      onProjectSystemPromptUpdated();
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setIsSaving(false);
    }
  };

  const handleFileChange = async (event: ChangeEvent<HTMLInputElement>) => {
    if (!event.target.files || event.target.files.length === 0) return;

    const filesToUpload = Array.from(event.target.files);
    event.target.value = "";

    setUploadingFiles((prev) => [...prev, ...filesToUpload]);

    const uploadPromises = filesToUpload.map(async (file) => {
      const formData = new FormData();
      formData.append("file", file);
      try {
        const response = await fetch(`/api/projects/${projectId}/files`, {
          method: "POST",
          body: formData,
          headers: getAuthHeaders(),
        });
        if (!response.ok) {
          const errorData = await response.json();
          throw new Error(errorData.error || `Upload failed for ${file.name}`);
        }
        const result: ProjectFile = await response.json();
        return result;
      } catch (error) {
        console.error("Upload error:", error);
        onProjectFileAction(`Failed to upload ${file.name}: ${error instanceof Error ? error.message : String(error)}`);
        return null;
      }
    });

    const results = await Promise.all(uploadPromises);
    const successfulUploads = results.filter((result): result is ProjectFile => result !== null);

    setProjectFiles((prev) => [...prev, ...successfulUploads]);
    setUploadingFiles((prev) => prev.filter((f) => !filesToUpload.includes(f)));
    onProjectFileAction("Files uploaded successfully.");
  };

  const handleDeleteFile = async (fileId: number, fileName: string) => {
    if (!confirm(`Are you sure you want to delete "${fileName}"? This action cannot be undone.`)) {
      return;
    }
    setIsSaving(true);
    setError(null);
    try {
      const res = await fetch(`/api/projects/${projectId}/files/${fileId}`, {
        method: "DELETE",
        headers: getAuthHeaders(),
      });
      if (!res.ok) {
        const errorData = await res.json().catch(() => ({}));
        throw new Error(errorData.error || `Failed to delete file: ${res.statusText}`);
      }
      setProjectFiles((prev) => prev.filter((file) => file.id !== fileId));
      onProjectFileAction(`File "${fileName}" deleted successfully.`);
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setIsSaving(false);
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

  if (error && !projectTitle) {
    return (
      <div className="flex-1 flex items-center justify-center text-red-500 dark:text-red-400 text-center p-4">
        Error loading project: {error}. Please try again later.
      </div>
    );
  }

  return (
    <div className="flex-1 overflow-y-auto p-4 max-w-[52rem] mx-auto">
      {error && <Toast message={error} onClose={() => setError(null)} />}

      <h2 className="text-2xl font-bold mb-4 text-neutral-900 dark:text-white">Project Settings</h2>

      <div className="bg-white dark:bg-neutral-900 p-6 rounded-2xl shadow-lg border border-neutral-200 dark:border-neutral-800 mb-6">
        <h3 className="text-xl font-semibold mb-4 text-neutral-900 dark:text-white">Project Information</h3>
        <div className="mb-4">
          <label
            htmlFor="project-title"
            className="block text-sm font-medium text-neutral-700 dark:text-neutral-300 mb-1"
          >
            Project Title
          </label>
          <input
            id="project-title"
            type="text"
            value={projectTitle}
            onChange={handleTitleChange}
            className="w-full p-2 border border-neutral-300 dark:border-neutral-700 rounded-lg bg-neutral-50 dark:bg-neutral-800
              text-neutral-900 dark:text-white"
            disabled={isSaving}
          />
        </div>
        <div className="mb-4">
          <label
            htmlFor="project-system-prompt"
            className="block text-sm font-medium text-neutral-700 dark:text-neutral-300 mb-1"
          >
            Project System Prompt
          </label>
          <p className="text-xs text-neutral-500 dark:text-neutral-400 mb-2">
            Define the default behavior and persona for the AI in chats within this project. This will override the
            global system prompt. Individual chats can further override this.
          </p>
          <textarea
            id="project-system-prompt"
            rows={6}
            value={projectSystemPrompt}
            onChange={handleSystemPromptChange}
            className="w-full p-2 border border-neutral-300 dark:border-neutral-700 rounded-lg bg-neutral-50 dark:bg-neutral-800
              text-neutral-900 dark:text-white resize-y"
            placeholder="e.g., You are an expert in software development and only respond with code examples."
            disabled={isSaving}
          />
        </div>
        <div className="flex justify-end">
          <button
            onClick={handleSaveProjectSettings}
            disabled={isSaving || !hasSettingsChanged}
            className="px-6 py-2 rounded-full bg-black text-white text-sm font-medium hover:bg-neutral-700 disabled:opacity-50
              disabled:cursor-not-allowed transition-colors"
          >
            {isSaving ? "Saving..." : "Save Settings"}
          </button>
        </div>
      </div>

      <div className="bg-white dark:bg-neutral-900 p-6 rounded-2xl shadow-lg border border-neutral-200 dark:border-neutral-800">
        <h3 className="text-xl font-semibold mb-4 text-neutral-900 dark:text-white">Project Files</h3>

        {projectFiles.length === 0 && uploadingFiles.length === 0 && (
          <p className="text-neutral-500 dark:text-neutral-400 mb-4">No files uploaded for this project yet.</p>
        )}

        {projectFiles.length > 0 && (
          <ul className="space-y-2 mb-4">
            {projectFiles.map((file) => (
              <li
                key={file.id}
                className="flex items-center justify-between p-3 bg-neutral-100 dark:bg-neutral-800 rounded-lg border border-neutral-200
                  dark:border-neutral-700"
              >
                <span className="text-sm text-neutral-800 dark:text-neutral-200 truncate pr-2">
                  {file.fileName} ({`${(file.size / 1024).toFixed(1)} KB`})
                </span>
                <button
                  onClick={() => handleDeleteFile(file.id, file.fileName)}
                  disabled={isSaving}
                  className="p-1 rounded-full text-red-500 hover:bg-red-100 dark:hover:bg-red-900/50 disabled:opacity-50 disabled:cursor-not-allowed"
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
            className="mb-4 p-3 bg-blue-50 dark:bg-blue-950 rounded-lg border border-blue-200 dark:border-blue-800 text-blue-700
              dark:text-blue-200"
          >
            <p className="font-semibold text-sm mb-1">Uploading...</p>
            <ul className="list-disc list-inside text-xs">
              {uploadingFiles.map((f, index) => (
                <li key={f.name + index}>{f.name}</li>
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
            disabled={isSaving}
            className="px-6 py-2 rounded-full bg-blue-600 text-white text-sm font-medium hover:bg-blue-700 disabled:opacity-50
              disabled:cursor-not-allowed transition-colors flex items-center gap-2"
          >
            <ArrowUpTrayIcon className="size-5" /> Upload New File
          </button>
        </div>
      </div>
    </div>
  );
};

export default ProjectManagement;
