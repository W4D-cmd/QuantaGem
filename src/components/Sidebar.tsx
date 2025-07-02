import React, { useRef, useState } from "react";
import { ChatListItem, ProjectListItem } from "@/app/page";
import DropdownMenu from "@/components/DropdownMenu";
import Tooltip from "@/components/Tooltip";
import {
  ChevronDownIcon,
  ChevronRightIcon,
  Cog6ToothIcon,
  DocumentDuplicateIcon,
  EllipsisHorizontalIcon,
  FolderOpenIcon,
  FolderPlusIcon,
  PencilIcon,
  PencilSquareIcon,
  TrashIcon,
} from "@heroicons/react/24/outline";

interface SidebarProps {
  chats: ChatListItem[];
  projects: ProjectListItem[];
  activeChatId: number | null;
  activeProjectId: number | null;
  onNewChat: (projectId?: number | null) => void;
  onSelectChat: (chatId: number) => void;
  onRenameChat: (chatId: number, newTitle: string) => void;
  onDeleteChat: (chatId: number) => void;
  onDeleteAllGlobalChats: () => void;
  onOpenChatSettings: (chatId: number, initialPrompt: string) => void;
  onNewProject: () => void;
  onSelectProject: (projectId: number) => void;
  onRenameProject: (projectId: number, newTitle: string) => void;
  onDeleteProject: (projectId: number) => void;
  onDuplicateChat: (chatId: number) => void;
  userEmail: string | null;
  expandedProjects: Set<number>;
  onToggleProjectExpansion: React.Dispatch<React.SetStateAction<Set<number>>>;
}

export default function Sidebar({
  chats,
  projects,
  activeChatId,
  activeProjectId,
  onNewChat,
  onSelectChat,
  onRenameChat,
  onDeleteChat,
  onDeleteAllGlobalChats,
  onOpenChatSettings,
  onNewProject,
  onSelectProject,
  onRenameProject,
  onDeleteProject,
  onDuplicateChat,
  userEmail,
  expandedProjects,
  onToggleProjectExpansion,
}: SidebarProps) {
  const [openMenuChatId, setOpenMenuChatId] = useState<number | null>(null);
  const [openMenuProjectId, setOpenMenuProjectId] = useState<number | null>(null);
  const menuButtonRefs = useRef<Record<string, HTMLButtonElement | null>>({});

  const toggleProjectExpansion = (projectId: number) => {
    onToggleProjectExpansion((prev: Set<number>) => {
      const newSet = new Set(prev);
      if (newSet.has(projectId)) {
        newSet.delete(projectId);
      } else {
        newSet.add(projectId);
      }
      return newSet;
    });
  };

  const globalChats = chats.filter((chat) => chat.projectId === null);
  const getChatsForProject = (projectId: number) =>
    chats.filter((chat) => chat.projectId === projectId).sort((a, b) => b.id - a.id);

  return (
    <div
      className="w-70 h-full bg-neutral-100 dark:bg-neutral-900 pt-2 pb-4 pl-4 pr-1 overflow-y-auto flex flex-col transition-colors
        duration-300 ease-in-out"
    >
      <div className="flex-none mb-4">
        <div className="flex-none pr-2 flex items-center justify-between">
          <Tooltip text={"Delete all chats (no project chats)"}>
            <button
              onClick={onDeleteAllGlobalChats}
              className="cursor-pointer p-2 rounded-lg hover:bg-neutral-200 dark:hover:bg-neutral-800 transition-colors duration-300 ease-in-out"
            >
              <TrashIcon className="size-6 text-neutral-500 dark:text-neutral-400 transition-colors duration-300 ease-in-out" />
            </button>
          </Tooltip>

          <div className="flex space-x-2">
            <Tooltip text={"New project"}>
              <button
                onClick={onNewProject}
                className="cursor-pointer p-2 rounded-lg hover:bg-neutral-200 dark:hover:bg-neutral-800 transition-colors duration-300 ease-in-out"
              >
                <FolderPlusIcon className="size-6 text-neutral-500 dark:text-neutral-400 transition-colors duration-300 ease-in-out" />
              </button>
            </Tooltip>

            <Tooltip text={"New chat"}>
              <button
                onClick={() => onNewChat(null)}
                className="cursor-pointer p-2 rounded-lg hover:bg-neutral-200 dark:hover:bg-neutral-800 transition-colors duration-300 ease-in-out"
              >
                <PencilSquareIcon className="size-6 text-neutral-500 dark:text-neutral-400 transition-colors duration-300 ease-in-out" />
              </button>
            </Tooltip>
          </div>
        </div>
      </div>

      <div className="flex-grow overflow-y-auto">
        {globalChats.length > 0 && (
          <div className="mb-4">
            <h3 className="text-xs font-semibold text-neutral-500 dark:text-neutral-400 uppercase mb-2">Chats</h3>
            <ul>
              {globalChats.map((chat) => (
                <li key={chat.id} className="mb-0.5 relative group">
                  <button
                    onClick={() => onSelectChat(chat.id)}
                    className={`cursor-pointer w-full text-sm text-left p-2 py-1 rounded-lg focus:outline-none text-neutral-900 dark:text-white
                    transition-colors duration-300 ease-in-out flex items-center justify-between ${
                    chat.id === activeChatId
                        ? "font-semibold bg-neutral-300 hover:bg-neutral-300 dark:bg-neutral-700 hover:dark:bg-neutral-700"
                        : "hover:bg-neutral-200 dark:hover:bg-neutral-800"
                    }`}
                  >
                    <span className="truncate">{chat.title}</span>
                    <div className="relative inline-block opacity-0 group-hover:opacity-100 duration-150">
                      <button
                        ref={(el: HTMLButtonElement | null) => {
                          menuButtonRefs.current[`chat-${chat.id}`] = el;
                        }}
                        onClick={(e) => {
                          e.stopPropagation();
                          setOpenMenuChatId(openMenuChatId === chat.id ? null : chat.id);
                          setOpenMenuProjectId(null);
                        }}
                        className="cursor-pointer p-1 rounded-full text-neutral-500 dark:text-neutral-400"
                      >
                        <EllipsisHorizontalIcon className="size-5" />
                      </button>

                      <DropdownMenu
                        open={openMenuChatId === chat.id}
                        anchorRef={{ current: menuButtonRefs.current[`chat-${chat.id}`] }}
                        onCloseAction={() => setOpenMenuChatId(null)}
                        position="left"
                        items={[
                          {
                            id: "settings",
                            icon: <Cog6ToothIcon className="size-4" />,
                            label: "Settings",
                            onClick: () => onOpenChatSettings(chat.id, chat.systemPrompt),
                          },
                          {
                            id: "duplicate",
                            icon: <DocumentDuplicateIcon className="size-4" />,
                            label: "Duplicate",
                            onClick: () => {
                              onDuplicateChat(chat.id);
                            },
                          },
                          {
                            id: "rename",
                            icon: <PencilIcon className="size-4" />,
                            label: "Rename",
                            onClick: () => {
                              const newTitle = prompt("New title", chat.title);
                              if (newTitle) onRenameChat(chat.id, newTitle);
                            },
                          },
                          {
                            id: "delete",
                            icon: <TrashIcon className="size-4 text-red-500 dark:text-red-400" />,
                            label: "Delete",
                            onClick: () => {
                              if (confirm("Are you sure you want to delete this chat?")) onDeleteChat(chat.id);
                            },
                            className: "text-red-500 dark:text-red-400 hover:bg-red-100 dark:hover:bg-red-400/10",
                          },
                        ]}
                      />
                    </div>
                  </button>
                </li>
              ))}
            </ul>
          </div>
        )}

        {projects.length > 0 && (
          <div className="mb-4">
            <h3 className="text-xs font-semibold text-neutral-500 dark:text-neutral-400 uppercase mb-2">Projects</h3>
            <ul>
              {projects.map((project) => (
                <li key={project.id} className="mb-0.5">
                  <div className="flex items-center group">
                    <button
                      onClick={() => toggleProjectExpansion(project.id)}
                      className="cursor-pointer p-1 rounded-full text-neutral-500 dark:text-neutral-400"
                    >
                      {expandedProjects.has(project.id) ? (
                        <ChevronDownIcon className="size-4 stroke-2" />
                      ) : (
                        <ChevronRightIcon className="size-4 stroke-2" />
                      )}
                    </button>
                    <button
                      onClick={() => onSelectProject(project.id)}
                      className={`cursor-pointer flex-1 text-sm text-left p-2 rounded-lg focus:outline-none text-neutral-900 dark:text-white +
                      transition-colors duration-300 ease-in-out flex items-center justify-between ${
                      project.id === activeProjectId
                          ? "font-semibold bg-neutral-300 hover:bg-neutral-300 dark:bg-neutral-700 hover:dark:bg-neutral-700"
                          : "hover:bg-neutral-200 dark:hover:bg-neutral-800"
                      }`}
                    >
                      <span className="truncate flex items-center gap-2">
                        <FolderOpenIcon className="size-5" /> {project.title}
                      </span>
                      <div className="relative inline-block opacity-0 group-hover:opacity-100 duration-150">
                        <button
                          ref={(el: HTMLButtonElement | null) => {
                            menuButtonRefs.current[`project-${project.id}`] = el;
                          }}
                          onClick={(e) => {
                            e.stopPropagation();
                            setOpenMenuProjectId(openMenuProjectId === project.id ? null : project.id);
                            setOpenMenuChatId(null);
                          }}
                          className="cursor-pointer p-1 rounded-full text-neutral-500 dark:text-neutral-400"
                        >
                          <EllipsisHorizontalIcon className="size-5" />
                        </button>
                        <DropdownMenu
                          open={openMenuProjectId === project.id}
                          anchorRef={{ current: menuButtonRefs.current[`project-${project.id}`] }}
                          onCloseAction={() => setOpenMenuProjectId(null)}
                          position="left"
                          items={[
                            {
                              id: "rename",
                              icon: <PencilIcon className="size-4" />,
                              label: "Rename Project",
                              onClick: () => {
                                const newTitle = prompt("New project title", project.title);
                                if (newTitle) onRenameProject(project.id, newTitle);
                              },
                            },
                            {
                              id: "new-chat",
                              icon: <PencilSquareIcon className="size-4" />,
                              label: "New Chat in Project",
                              onClick: () => onNewChat(project.id),
                            },
                            {
                              id: "delete",
                              icon: <TrashIcon className="size-4 text-red-500 dark:text-red-400" />,
                              label: "Delete Project",
                              onClick: () => onDeleteProject(project.id),
                              className: "text-red-500 dark:text-red-400 hover:bg-red-100 dark:hover:bg-red-400/10",
                            },
                          ]}
                        />
                      </div>
                    </button>
                  </div>
                  {expandedProjects.has(project.id) && (
                    <ul className="ms-6 border-l border-neutral-300 dark:border-neutral-700 mt-1 ps-2">
                      {getChatsForProject(project.id).length > 0 ? (
                        getChatsForProject(project.id).map((chat) => (
                          <li key={chat.id} className="mb-0.5 relative group">
                            <button
                              onClick={() => onSelectChat(chat.id)}
                              className={`cursor-pointer w-full text-sm text-left p-2 py-1 rounded-lg focus:outline-none text-neutral-900 dark:text-white +
                                transition-colors duration-300 ease-in-out flex items-center justify-between ${
                                chat.id === activeChatId
                                    ? "font-semibold bg-neutral-300 hover:bg-neutral-300 dark:bg-neutral-700 hover:dark:bg-neutral-700"
                                    : "hover:bg-neutral-200 dark:hover:bg-neutral-800"
                                }`}
                            >
                              <span className="truncate">{chat.title}</span>
                              <div className="relative inline-block opacity-0 group-hover:opacity-100 duration-150">
                                <button
                                  ref={(el: HTMLButtonElement | null) => {
                                    menuButtonRefs.current[`chat-${chat.id}`] = el;
                                  }}
                                  onClick={(e) => {
                                    e.stopPropagation();
                                    setOpenMenuChatId(openMenuChatId === chat.id ? null : chat.id);
                                    setOpenMenuProjectId(null);
                                  }}
                                  className="cursor-pointer p-1 rounded-full text-neutral-500 dark:text-neutral-400"
                                >
                                  <EllipsisHorizontalIcon className="size-5" />
                                </button>
                                <DropdownMenu
                                  open={openMenuChatId === chat.id}
                                  anchorRef={{ current: menuButtonRefs.current[`chat-${chat.id}`] }}
                                  onCloseAction={() => setOpenMenuChatId(null)}
                                  position="left"
                                  items={[
                                    {
                                      id: "settings",
                                      icon: <Cog6ToothIcon className="size-4" />,
                                      label: "Settings",
                                      onClick: () => onOpenChatSettings(chat.id, chat.systemPrompt),
                                    },
                                    {
                                      id: "duplicate",
                                      icon: <PencilSquareIcon className="size-4" />,
                                      label: "Duplicate",
                                      onClick: () => {
                                        onDuplicateChat(chat.id);
                                      },
                                    },
                                    {
                                      id: "rename",
                                      icon: <PencilIcon className="size-4" />,
                                      label: "Rename",
                                      onClick: () => {
                                        const newTitle = prompt("New title", chat.title);
                                        if (newTitle) onRenameChat(chat.id, newTitle);
                                      },
                                    },
                                    {
                                      id: "delete",
                                      icon: <TrashIcon className="size-4 text-red-500 dark:text-red-400" />,
                                      label: "Delete",
                                      onClick: () => {
                                        if (confirm("Are you sure you want to delete this chat?"))
                                          onDeleteChat(chat.id);
                                      },
                                      className:
                                        "text-red-500 dark:text-red-400 hover:bg-red-100 dark:hover:bg-red-400/10",
                                    },
                                  ]}
                                />
                              </div>
                            </button>
                          </li>
                        ))
                      ) : (
                        <li className="text-neutral-500 dark:text-neutral-400 text-sm py-2 ps-2">
                          No chats in this project.
                        </li>
                      )}
                    </ul>
                  )}
                </li>
              ))}
            </ul>
          </div>
        )}
      </div>

      {userEmail && (
        <div className="pr-3">
          <div
            className="mt-4 mb-0 text-center text-sm p-2 rounded-lg text-neutral-700 dark:text-neutral-200 bg-neutral-200 dark:bg-neutral-800
              transition-colors duration-300 ease-in-out"
          >
            Logged in as: <br />
            <span className="font-semibold">{userEmail}</span>
          </div>
        </div>
      )}
    </div>
  );
}
