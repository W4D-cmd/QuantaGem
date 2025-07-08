import React, { KeyboardEvent, useEffect, useRef, useState } from "react";
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

const groupChatsByDate = (chats: ChatListItem[]) => {
  const groups: { [key: string]: ChatListItem[] } = {
    Today: [],
    Yesterday: [],
    "Previous 7 Days": [],
    "Previous 30 Days": [],
    Older: [],
  };

  const now = new Date();
  const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  const yesterday = new Date(today);
  yesterday.setDate(yesterday.getDate() - 1);
  const sevenDaysAgo = new Date(today);
  sevenDaysAgo.setDate(sevenDaysAgo.getDate() - 7);
  const thirtyDaysAgo = new Date(today);
  thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30);

  chats.forEach((chat) => {
    const chatDate = new Date(chat.updatedAt);
    const chatDay = new Date(chatDate.getFullYear(), chatDate.getMonth(), chatDate.getDate());

    if (chatDay.getTime() === today.getTime()) {
      groups.Today.push(chat);
    } else if (chatDay.getTime() === yesterday.getTime()) {
      groups.Yesterday.push(chat);
    } else if (chatDate >= sevenDaysAgo) {
      groups["Previous 7 Days"].push(chat);
    } else if (chatDate >= thirtyDaysAgo) {
      groups["Previous 30 Days"].push(chat);
    } else {
      groups.Older.push(chat);
    }
  });

  return Object.entries(groups)
    .map(([label, chats]) => ({ label, chats }))
    .filter((group) => group.chats.length > 0);
};

const EditableItem: React.FC<{
  item: { id: number; title: string };
  isActive: boolean;
  isEditing: boolean;
  onSelect: () => void;
  onStartEdit: () => void;
  onSaveEdit: (newTitle: string) => void;
  onCancelEdit: () => void;
  children: React.ReactNode;
}> = ({ item, isActive, isEditing, onSelect, onSaveEdit, onCancelEdit, children }) => {
  const [editText, setEditText] = useState(item.title);
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (isEditing) {
      setEditText(item.title);
      setTimeout(() => inputRef.current?.select(), 0);
    }
  }, [isEditing, item.title]);

  const handleSave = () => {
    if (editText.trim() && editText.trim() !== item.title) {
      onSaveEdit(editText.trim());
    }
    onCancelEdit();
  };

  const handleKeyDown = (e: KeyboardEvent<HTMLInputElement>) => {
    if (e.key === "Enter") {
      e.preventDefault();
      handleSave();
    } else if (e.key === "Escape") {
      e.preventDefault();
      onCancelEdit();
    }
  };

  if (isEditing) {
    return (
      <div className="p-2 w-full">
        <input
          ref={inputRef}
          type="text"
          value={editText}
          onChange={(e) => setEditText(e.target.value)}
          onKeyDown={handleKeyDown}
          onBlur={handleSave}
          className="w-full text-sm p-1 rounded-md bg-white dark:bg-neutral-950 border-2 border-blue-500 focus:outline-none"
        />
      </div>
    );
  }

  return (
    <button
      onClick={onSelect}
      className={`cursor-pointer w-full text-sm text-left p-2 py-1 rounded-lg focus:outline-none text-neutral-900
        dark:text-white transition-colors duration-300 ease-in-out flex items-center justify-between ${
          isActive
            ? "font-semibold bg-neutral-300 hover:bg-neutral-300 dark:bg-neutral-700 hover:dark:bg-neutral-700"
            : "hover:bg-neutral-200 dark:hover:bg-neutral-800"
        }`}
    >
      {children}
    </button>
  );
};

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
  const [openMenuId, setOpenMenuId] = useState<string | null>(null);
  const [editingItem, setEditingItem] = useState<{ type: "chat" | "project"; id: number } | null>(null);
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
  const groupedGlobalChats = groupChatsByDate(globalChats);

  const getChatsForProject = (projectId: number) =>
    chats
      .filter((chat) => chat.projectId === projectId)
      .sort((a, b) => new Date(b.updatedAt).getTime() - new Date(a.updatedAt).getTime());

  const handleStartEdit = (type: "chat" | "project", id: number) => {
    setEditingItem({ type, id });
    setOpenMenuId(null);
  };

  const handleCancelEdit = () => {
    setEditingItem(null);
  };

  const handleSaveEdit = (type: "chat" | "project", id: number, newTitle: string) => {
    if (type === "chat") {
      onRenameChat(id, newTitle);
    } else {
      onRenameProject(id, newTitle);
    }
    handleCancelEdit();
  };

  return (
    <div
      className="w-70 h-full bg-neutral-100 dark:bg-neutral-900 pt-2 pb-4 pl-4 pr-1 overflow-y-auto flex flex-col
        transition-colors duration-300 ease-in-out"
    >
      <div className="flex-none mb-4">
        <div className="flex-none pr-2 flex items-center justify-between">
          <Tooltip text={"Delete all chats (no project chats)"}>
            <button
              onClick={onDeleteAllGlobalChats}
              className="cursor-pointer p-2 rounded-lg hover:bg-neutral-200 dark:hover:bg-neutral-800 transition-colors
                duration-300 ease-in-out"
            >
              <TrashIcon
                className="size-6 text-neutral-500 dark:text-neutral-400 transition-colors duration-300 ease-in-out"
              />
            </button>
          </Tooltip>

          <div className="flex space-x-2">
            <Tooltip text={"New project"}>
              <button
                onClick={onNewProject}
                className="cursor-pointer p-2 rounded-lg hover:bg-neutral-200 dark:hover:bg-neutral-800
                  transition-colors duration-300 ease-in-out"
              >
                <FolderPlusIcon
                  className="size-6 text-neutral-500 dark:text-neutral-400 transition-colors duration-300 ease-in-out"
                />
              </button>
            </Tooltip>

            <Tooltip text={"New chat"}>
              <button
                onClick={() => onNewChat(null)}
                className="cursor-pointer p-2 rounded-lg hover:bg-neutral-200 dark:hover:bg-neutral-800
                  transition-colors duration-300 ease-in-out"
              >
                <PencilSquareIcon
                  className="size-6 text-neutral-500 dark:text-neutral-400 transition-colors duration-300 ease-in-out"
                />
              </button>
            </Tooltip>
          </div>
        </div>
      </div>

      <div className="flex-grow overflow-y-auto">
        {groupedGlobalChats.map((group) => (
          <div key={group.label} className="mb-4">
            <h3 className="text-xs font-semibold text-neutral-500 dark:text-neutral-400 uppercase mb-2 pr-3">
              {group.label}
            </h3>
            <ul>
              {group.chats.map((chat) => (
                <li key={chat.id} className="mb-0.5 relative group">
                  <EditableItem
                    item={chat}
                    isActive={chat.id === activeChatId}
                    isEditing={editingItem?.type === "chat" && editingItem.id === chat.id}
                    onSelect={() => onSelectChat(chat.id)}
                    onStartEdit={() => handleStartEdit("chat", chat.id)}
                    onSaveEdit={(newTitle) => handleSaveEdit("chat", chat.id, newTitle)}
                    onCancelEdit={handleCancelEdit}
                  >
                    <span className="truncate">{chat.title}</span>
                    <div className="relative inline-block opacity-0 group-hover:opacity-100 duration-150">
                      <button
                        ref={(el) => {
                          menuButtonRefs.current[`chat-${chat.id}`] = el;
                        }}
                        onClick={(e) => {
                          e.stopPropagation();
                          setOpenMenuId(openMenuId === `chat-${chat.id}` ? null : `chat-${chat.id}`);
                        }}
                        className="cursor-pointer p-1 rounded-full text-neutral-500 dark:text-neutral-400"
                      >
                        <EllipsisHorizontalIcon className="size-5" />
                      </button>

                      <DropdownMenu
                        open={openMenuId === `chat-${chat.id}`}
                        anchorRef={{ current: menuButtonRefs.current[`chat-${chat.id}`] }}
                        onCloseAction={() => setOpenMenuId(null)}
                        position="left"
                        items={[
                          {
                            id: "rename",
                            icon: <PencilIcon className="size-4" />,
                            label: "Rename",
                            onClick: () => handleStartEdit("chat", chat.id),
                          },
                          {
                            id: "duplicate",
                            icon: <DocumentDuplicateIcon className="size-4" />,
                            label: "Duplicate",
                            onClick: () => onDuplicateChat(chat.id),
                          },
                          {
                            id: "settings",
                            icon: <Cog6ToothIcon className="size-4" />,
                            label: "Settings",
                            onClick: () => onOpenChatSettings(chat.id, chat.systemPrompt),
                          },
                          {
                            id: "delete",
                            icon: <TrashIcon className="size-4 text-red-500 dark:text-red-400" />,
                            label: "Delete",
                            onClick: () => onDeleteChat(chat.id),
                            className: "text-red-500 dark:text-red-400 hover:bg-red-100 dark:hover:bg-red-400/10",
                          },
                        ]}
                      />
                    </div>
                  </EditableItem>
                </li>
              ))}
            </ul>
          </div>
        ))}

        {projects.length > 0 && (
          <div className="mb-4">
            <h3 className="text-xs font-semibold text-neutral-500 dark:text-neutral-400 uppercase mb-2 pr-3">
              Projects
            </h3>
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
                    <EditableItem
                      item={project}
                      isActive={project.id === activeProjectId}
                      isEditing={editingItem?.type === "project" && editingItem.id === project.id}
                      onSelect={() => onSelectProject(project.id)}
                      onStartEdit={() => handleStartEdit("project", project.id)}
                      onSaveEdit={(newTitle) => handleSaveEdit("project", project.id, newTitle)}
                      onCancelEdit={handleCancelEdit}
                    >
                      <span className="truncate flex items-center gap-2">
                        <FolderOpenIcon className="size-5" /> {project.title}
                      </span>
                      <div className="relative inline-block opacity-0 group-hover:opacity-100 duration-150">
                        <button
                          ref={(el) => {
                            menuButtonRefs.current[`project-${project.id}`] = el;
                          }}
                          onClick={(e) => {
                            e.stopPropagation();
                            setOpenMenuId(openMenuId === `project-${project.id}` ? null : `project-${project.id}`);
                          }}
                          className="cursor-pointer p-1 rounded-full text-neutral-500 dark:text-neutral-400"
                        >
                          <EllipsisHorizontalIcon className="size-5" />
                        </button>
                        <DropdownMenu
                          open={openMenuId === `project-${project.id}`}
                          anchorRef={{ current: menuButtonRefs.current[`project-${project.id}`] }}
                          onCloseAction={() => setOpenMenuId(null)}
                          position="left"
                          items={[
                            {
                              id: "rename",
                              icon: <PencilIcon className="size-4" />,
                              label: "Rename Project",
                              onClick: () => handleStartEdit("project", project.id),
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
                    </EditableItem>
                  </div>
                  {expandedProjects.has(project.id) && (
                    <ul className="ms-6 border-l border-neutral-300 dark:border-neutral-700 mt-1 ps-2">
                      {getChatsForProject(project.id).length > 0 ? (
                        getChatsForProject(project.id).map((chat) => (
                          <li key={chat.id} className="mb-0.5 relative group">
                            <EditableItem
                              item={chat}
                              isActive={chat.id === activeChatId}
                              isEditing={editingItem?.type === "chat" && editingItem.id === chat.id}
                              onSelect={() => onSelectChat(chat.id)}
                              onStartEdit={() => handleStartEdit("chat", chat.id)}
                              onSaveEdit={(newTitle) => handleSaveEdit("chat", chat.id, newTitle)}
                              onCancelEdit={handleCancelEdit}
                            >
                              <span className="truncate">{chat.title}</span>
                              <div className="relative inline-block opacity-0 group-hover:opacity-100 duration-150">
                                <button
                                  ref={(el) => {
                                    menuButtonRefs.current[`chat-${chat.id}`] = el;
                                  }}
                                  onClick={(e) => {
                                    e.stopPropagation();
                                    setOpenMenuId(openMenuId === `chat-${chat.id}` ? null : `chat-${chat.id}`);
                                  }}
                                  className="cursor-pointer p-1 rounded-full text-neutral-500 dark:text-neutral-400"
                                >
                                  <EllipsisHorizontalIcon className="size-5" />
                                </button>
                                <DropdownMenu
                                  open={openMenuId === `chat-${chat.id}`}
                                  anchorRef={{ current: menuButtonRefs.current[`chat-${chat.id}`] }}
                                  onCloseAction={() => setOpenMenuId(null)}
                                  position="left"
                                  items={[
                                    {
                                      id: "rename",
                                      icon: <PencilIcon className="size-4" />,
                                      label: "Rename",
                                      onClick: () => handleStartEdit("chat", chat.id),
                                    },
                                    {
                                      id: "duplicate",
                                      icon: <DocumentDuplicateIcon className="size-4" />,
                                      label: "Duplicate",
                                      onClick: () => onDuplicateChat(chat.id),
                                    },
                                    {
                                      id: "settings",
                                      icon: <Cog6ToothIcon className="size-4" />,
                                      label: "Settings",
                                      onClick: () => onOpenChatSettings(chat.id, chat.systemPrompt),
                                    },
                                    {
                                      id: "delete",
                                      icon: <TrashIcon className="size-4 text-red-500 dark:text-red-400" />,
                                      label: "Delete",
                                      onClick: () => onDeleteChat(chat.id),
                                      className:
                                        "text-red-500 dark:text-red-400 hover:bg-red-100 dark:hover:bg-red-400/10",
                                    },
                                  ]}
                                />
                              </div>
                            </EditableItem>
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
            className="mt-4 mb-0 text-center text-sm p-2 rounded-lg text-neutral-700 dark:text-neutral-200
              bg-neutral-200 dark:bg-neutral-800 transition-colors duration-300 ease-in-out"
          >
            Logged in as: <br />
            <span className="font-semibold">{userEmail}</span>
          </div>
        </div>
      )}
    </div>
  );
}
