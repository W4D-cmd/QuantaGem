import React, {
  KeyboardEvent,
  memo,
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import { ChatListItem, ProjectListItem } from "@/app/page";
import DropdownMenu from "@/components/DropdownMenu";
import Tooltip from "@/components/Tooltip";
import {
  ChevronRight,
  Settings,
  Copy,
  MoreHorizontal,
  FolderOpen,
  FolderPlus,
  Pencil,
  SquarePen,
  Trash2,
  Bookmark,
  Pin,
  PinOff,
} from "lucide-react";
import { motion, AnimatePresence, Variants } from "motion/react";
import TruncatedTooltip from "./TruncatedTooltip";

interface SidebarProps {
  chats: ChatListItem[];
  projects: ProjectListItem[];
  activeChatId: number | null;
  activeProjectId: number | null;
  onNewChat: (projectId?: number | null) => void;
  onSelectChat: (chatId: number) => void;
  onPrefetchChat?: (chatId: number) => void;
  onRenameChat: (chatId: number, newTitle: string) => void;
  onDeleteChat: (chatId: number) => void;
  onDeleteAllGlobalChats: () => void;
  onOpenChatSettings: (chatId: number) => void;
  onNewProject: () => void;
  onSelectProject: (projectId: number) => void;
  onRenameProject: (projectId: number, newTitle: string) => void;
  onDeleteProject: (projectId: number) => void;
  onDuplicateChat: (chatId: number) => void;
  expandedProjects: Set<number>;
  onToggleProjectExpansion: React.Dispatch<React.SetStateAction<Set<number>>>;
  onMoveChat?: (chatId: number, targetProjectId: number | null) => void;
  onSaveAsSuggestion?: (chatId: number, title: string) => void;
  onPinChat?: (chatId: number) => void;
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
          className="w-full text-sm p-1 rounded-md bg-white dark:bg-zinc-950 border-2 border-blue-500
            focus:outline-none"
        />
      </div>
    );
  }

  return (
    <button
      onClick={onSelect}
      className={`cursor-pointer w-full text-sm text-left p-2 py-1 rounded-lg focus:outline-none text-neutral-900
        dark:text-zinc-50 transition-colors duration-200 ease-in-out flex items-center justify-between ${
          isActive
            ? "font-semibold bg-neutral-300 hover:bg-neutral-300 dark:bg-zinc-700 hover:dark:bg-zinc-700"
            : "hover:bg-neutral-200 dark:hover:bg-zinc-800"
        }`}
    >
      {children}
    </button>
  );
};

const animationVariants: {
  container: Variants;
  item: Variants;
  accordion: Variants;
} = {
  container: {
    hidden: { opacity: 0 },
    visible: { opacity: 1 },
  },
  item: {
    hidden: { opacity: 0, y: 10 },
    visible: { opacity: 1, y: 0, transition: { duration: 0.3, ease: "easeInOut" } },
    exit: { opacity: 0, x: -20, transition: { duration: 0.2, ease: "easeInOut" } },
  },
  accordion: {
    open: {
      opacity: 1,
      height: "auto",
      transition: { duration: 0.3, ease: "easeInOut" },
    },
    collapsed: {
      opacity: 0,
      height: 0,
      transition: { duration: 0.3, ease: "easeInOut" },
    },
  },
};

type ChatMenuAction = "rename" | "duplicate" | "settings" | "saveAsSuggestion" | "togglePin" | "delete";

interface ChatRowProps {
  chat: ChatListItem;
  isActive: boolean;
  isEditing: boolean;
  isMenuOpen: boolean;
  isDragging: boolean;
  canDrag: boolean;
  anchorRef: { current: HTMLElement | null };
  onSelect: (chatId: number) => void;
  onMenuToggle: (menuId: string, anchorEl: HTMLElement) => void;
  onMenuAction: (action: ChatMenuAction, chat: ChatListItem) => void;
  onCloseMenu: () => void;
  onSaveEdit: (chatId: number, newTitle: string) => void;
  onCancelEdit: () => void;
  onDragStart: (e: React.DragEvent<HTMLElement>, chatId: number) => void;
  onDragEnd: (e: React.DragEvent<HTMLElement>) => void;
  onPrefetch: (chatId: number) => void;
  onSaveAsSuggestion?: (chatId: number, title: string) => void;
  onPinChat?: (chatId: number) => void;
}

const ChatRow = memo(function ChatRow({
  chat,
  isActive,
  isEditing,
  isMenuOpen,
  isDragging,
  canDrag,
  anchorRef,
  onSelect,
  onMenuToggle,
  onMenuAction,
  onCloseMenu,
  onSaveEdit,
  onCancelEdit,
  onDragStart,
  onDragEnd,
  onPrefetch,
  onSaveAsSuggestion,
  onPinChat,
}: ChatRowProps) {
  const menuId = `chat-${chat.id}`;

  return (
    <motion.li variants={animationVariants.item} exit="exit" className="mb-0.5">
      <div
        className={`relative group ${isDragging ? "opacity-50" : ""} ${
          canDrag ? "cursor-grab active:cursor-grabbing" : ""
        }`}
        draggable={canDrag}
        onDragStart={(e) => onDragStart(e, chat.id)}
        onDragEnd={onDragEnd}
        onMouseEnter={() => onPrefetch(chat.id)}
      >
        <EditableItem
          item={chat}
          isActive={isActive}
          isEditing={isEditing}
          onSelect={() => onSelect(chat.id)}
          onStartEdit={() => onMenuAction("rename", chat)}
          onSaveEdit={(newTitle) => onSaveEdit(chat.id, newTitle)}
          onCancelEdit={onCancelEdit}
        >
          <div className="flex items-center gap-2 min-w-0">
            {chat.pinnedAt && <Pin className="size-4 flex-shrink-0 text-neutral-500 dark:text-zinc-500" />}
            <TruncatedTooltip title={chat.title}>{chat.title}</TruncatedTooltip>
          </div>
          <div
            className="relative inline-block opacity-0 group-hover:opacity-100 translate-x-2
              group-hover:translate-x-0 transition-all duration-200 ease-in-out"
          >
            <button
              onClick={(e: React.MouseEvent<HTMLButtonElement>) => {
                e.stopPropagation();
                onMenuToggle(menuId, e.currentTarget);
              }}
              className="cursor-pointer p-1 rounded-full text-neutral-500 dark:text-zinc-500"
            >
              <MoreHorizontal className="size-5" />
            </button>
            <DropdownMenu
              open={isMenuOpen}
              anchorRef={anchorRef}
              onCloseAction={onCloseMenu}
              position="left"
              items={[
                {
                  id: "rename",
                  icon: <Pencil className="size-4" />,
                  label: "Rename",
                  onClick: () => onMenuAction("rename", chat),
                },
                {
                  id: "duplicate",
                  icon: <Copy className="size-4" />,
                  label: "Duplicate",
                  onClick: () => onMenuAction("duplicate", chat),
                },
                {
                  id: "settings",
                  icon: <Settings className="size-4" />,
                  label: "Settings",
                  onClick: () => onMenuAction("settings", chat),
                },
                ...(onSaveAsSuggestion
                  ? [
                      {
                        id: "save-as-suggestion",
                        icon: <Bookmark className="size-4" />,
                        label: "Save as Suggestion",
                        onClick: () => onMenuAction("saveAsSuggestion", chat),
                      },
                    ]
                  : []),
                ...(onPinChat
                  ? [
                      {
                        id: "pin",
                        icon: chat.pinnedAt ? <PinOff className="size-4" /> : <Pin className="size-4" />,
                        label: chat.pinnedAt ? "Unpin" : "Pin",
                        onClick: () => onMenuAction("togglePin", chat),
                      },
                    ]
                  : []),
                {
                  id: "delete",
                  icon: <Trash2 className="size-4 text-red-500" />,
                  label: "Delete",
                  onClick: () => onMenuAction("delete", chat),
                  className: "text-red-500 hover:bg-red-100 dark:hover:bg-red-400/10",
                },
              ]}
            />
          </div>
        </EditableItem>
      </div>
    </motion.li>
  );
});

function Sidebar({
  chats,
  projects,
  activeChatId,
  activeProjectId,
  onNewChat,
  onSelectChat,
  onPrefetchChat,
  onRenameChat,
  onDeleteChat,
  onDeleteAllGlobalChats,
  onOpenChatSettings,
  onNewProject,
  onSelectProject,
  onRenameProject,
  onDeleteProject,
  onDuplicateChat,
  expandedProjects,
  onToggleProjectExpansion,
  onMoveChat,
  onSaveAsSuggestion,
  onPinChat,
}: SidebarProps) {
  const [openMenuId, setOpenMenuId] = useState<string | null>(null);
  const [editingItem, setEditingItem] = useState<{ type: "chat" | "project"; id: number } | null>(null);
  const menuAnchorRef = useRef<HTMLElement | null>(null);
  const [draggedChatId, setDraggedChatId] = useState<number | null>(null);
  const [dropTargetProjectId, setDropTargetProjectId] = useState<number | null | "global">(null);

  const scrollContainerRef = useRef<HTMLDivElement | null>(null);
  const mouseYRef = useRef<number>(0);
  const animationFrameRef = useRef<number | null>(null);

  // Auto-scroll animation loop when dragging
  useEffect(() => {
    if (draggedChatId === null) {
      if (animationFrameRef.current !== null) {
        cancelAnimationFrame(animationFrameRef.current);
        animationFrameRef.current = null;
      }
      return;
    }

    const EDGE_THRESHOLD = 150;
    const MAX_SCROLL_SPEED = 8;
    const MIN_SCROLL_SPEED = 1;

    const scrollLoop = () => {
      const container = scrollContainerRef.current;
      if (container && mouseYRef.current !== 0) {
        const rect = container.getBoundingClientRect();
        const mouseY = mouseYRef.current;

        const distanceFromTop = mouseY - rect.top;
        const distanceFromBottom = rect.bottom - mouseY;

        if (distanceFromTop >= 0 && distanceFromTop < EDGE_THRESHOLD) {
          const intensity = 1 - distanceFromTop / EDGE_THRESHOLD;
          const scrollSpeed = MIN_SCROLL_SPEED + intensity * (MAX_SCROLL_SPEED - MIN_SCROLL_SPEED);
          container.scrollTop -= scrollSpeed;
        } else if (distanceFromBottom >= 0 && distanceFromBottom < EDGE_THRESHOLD) {
          const intensity = 1 - distanceFromBottom / EDGE_THRESHOLD;
          const scrollSpeed = MIN_SCROLL_SPEED + intensity * (MAX_SCROLL_SPEED - MIN_SCROLL_SPEED);
          container.scrollTop += scrollSpeed;
        }
      }

      animationFrameRef.current = requestAnimationFrame(scrollLoop);
    };

    animationFrameRef.current = requestAnimationFrame(scrollLoop);

    return () => {
      if (animationFrameRef.current !== null) {
        cancelAnimationFrame(animationFrameRef.current);
        animationFrameRef.current = null;
      }
    };
  }, [draggedChatId]);

  const globalChats = useMemo(() => chats.filter((chat) => chat.projectId === null), [chats]);
  const pinnedGlobalChats = useMemo(
    () => globalChats.filter((chat) => chat.pinnedAt !== null),
    [globalChats],
  );
  const unpinnedGlobalChats = useMemo(
    () => globalChats.filter((chat) => chat.pinnedAt === null),
    [globalChats],
  );
  const groupedGlobalChats = useMemo(() => groupChatsByDate(unpinnedGlobalChats), [unpinnedGlobalChats]);

  const chatsByProjectId = useMemo(() => {
    const map = new Map<number, ChatListItem[]>();
    for (const chat of chats) {
      if (chat.projectId === null) continue;
      const existing = map.get(chat.projectId);
      if (existing) {
        existing.push(chat);
      } else {
        map.set(chat.projectId, [chat]);
      }
    }
    const byRecency = (a: ChatListItem, b: ChatListItem) => {
      if (a.pinnedAt && !b.pinnedAt) return -1;
      if (!a.pinnedAt && b.pinnedAt) return 1;
      return new Date(b.updatedAt).getTime() - new Date(a.updatedAt).getTime();
    };
    for (const list of map.values()) {
      list.sort(byRecency);
    }
    return map;
  }, [chats]);

  const handleChatDragStart = useCallback((e: React.DragEvent<HTMLElement>, chatId: number) => {
    setDraggedChatId(chatId);
    e.dataTransfer.effectAllowed = "move";
    e.dataTransfer.setData("text/plain", chatId.toString());
    const target = e.currentTarget as HTMLElement;
    setTimeout(() => {
      target.style.opacity = "0.5";
    }, 0);
  }, []);

  const handleChatDragEnd = useCallback((e: React.DragEvent<HTMLElement>) => {
    (e.currentTarget as HTMLElement).style.opacity = "1";
    setDraggedChatId(null);
    setDropTargetProjectId(null);
  }, []);

  const handleChatMenuToggle = useCallback((menuId: string, anchorEl: HTMLElement) => {
    menuAnchorRef.current = anchorEl;
    setOpenMenuId((prev) => (prev === menuId ? null : menuId));
  }, []);

  const handleChatMenuAction = useCallback(
    (action: ChatMenuAction, chat: ChatListItem) => {
      switch (action) {
        case "rename":
          setEditingItem({ type: "chat", id: chat.id });
          setOpenMenuId(null);
          break;
        case "duplicate":
          onDuplicateChat(chat.id);
          break;
        case "settings":
          onOpenChatSettings(chat.id);
          break;
        case "saveAsSuggestion":
          onSaveAsSuggestion?.(chat.id, chat.title);
          break;
        case "togglePin":
          onPinChat?.(chat.id);
          break;
        case "delete":
          onDeleteChat(chat.id);
          break;
      }
    },
    [onDuplicateChat, onOpenChatSettings, onSaveAsSuggestion, onPinChat, onDeleteChat],
  );

  const handleCloseChatMenu = useCallback(() => setOpenMenuId(null), []);

  const handleChatSaveEdit = useCallback(
    (chatId: number, newTitle: string) => {
      onRenameChat(chatId, newTitle);
      setEditingItem(null);
    },
    [onRenameChat],
  );

  const handleCancelEdit = useCallback(() => setEditingItem(null), []);

  const handleSelectChatRow = useCallback((chatId: number) => onSelectChat(chatId), [onSelectChat]);

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

  const handlePrefetchChat = useCallback(
    (chatId: number) => {
      onPrefetchChat?.(chatId);
    },
    [onPrefetchChat],
  );

  const handleDragOver = (e: React.DragEvent<HTMLElement>, targetProjectId: number | null | "global") => {
    e.preventDefault();
    e.stopPropagation();

    // Update mouse position for auto-scroll animation loop
    mouseYRef.current = e.clientY;

    if (draggedChatId === null) return;

    const draggedChat = chats.find((c) => c.id === draggedChatId);
    if (!draggedChat) return;

    const currentProjectId = draggedChat.projectId;
    const targetId = targetProjectId === "global" ? null : targetProjectId;

    if (currentProjectId === targetId) {
      e.dataTransfer.dropEffect = "none";
      return;
    }

    e.dataTransfer.dropEffect = "move";
    setDropTargetProjectId(targetProjectId);
  };

  const handleDragLeave = (e: React.DragEvent<HTMLElement>) => {
    e.preventDefault();
    const relatedTarget = e.relatedTarget as HTMLElement;
    if (!e.currentTarget.contains(relatedTarget)) {
      setDropTargetProjectId(null);
    }
  };

  const handleDrop = (e: React.DragEvent<HTMLElement>, targetProjectId: number | null) => {
    e.preventDefault();
    e.stopPropagation();
    setDropTargetProjectId(null);

    if (draggedChatId === null || !onMoveChat) return;

    const draggedChat = chats.find((c) => c.id === draggedChatId);
    if (!draggedChat) return;

    if (draggedChat.projectId === targetProjectId) return;

    onMoveChat(draggedChatId, targetProjectId);
    setDraggedChatId(null);
  };

  const handleStartEdit = (type: "chat" | "project", id: number) => {
    setEditingItem({ type, id });
    setOpenMenuId(null);
  };

  const handleSaveEdit = (type: "chat" | "project", id: number, newTitle: string) => {
    if (type === "chat") {
      onRenameChat(id, newTitle);
    } else {
      onRenameProject(id, newTitle);
    }
    handleCancelEdit();
  };

  const renderChatRow = (chat: ChatListItem) => (
    <ChatRow
      key={chat.id}
      chat={chat}
      isActive={chat.id === activeChatId}
      isEditing={editingItem?.type === "chat" && editingItem.id === chat.id}
      isMenuOpen={openMenuId === `chat-${chat.id}`}
      isDragging={draggedChatId === chat.id}
      canDrag={!editingItem && !!onMoveChat}
      anchorRef={menuAnchorRef}
      onSelect={handleSelectChatRow}
      onMenuToggle={handleChatMenuToggle}
      onMenuAction={handleChatMenuAction}
      onCloseMenu={handleCloseChatMenu}
      onSaveEdit={handleChatSaveEdit}
      onCancelEdit={handleCancelEdit}
      onDragStart={handleChatDragStart}
      onDragEnd={handleChatDragEnd}
      onPrefetch={handlePrefetchChat}
      onSaveAsSuggestion={onSaveAsSuggestion}
      onPinChat={onPinChat}
    />
  );

  return (
    <div
      className="w-70 h-full bg-neutral-100 dark:bg-zinc-900 pt-2 pb-4 pl-4 pr-1 overflow-y-hidden overflow-x-hidden
        flex flex-col transition-colors duration-300 ease-in-out border-r border-neutral-200 dark:border-zinc-800
        shadow-xl z-10"
    >
      <div className="flex-none mb-4">
        <div className="flex-none pr-2 flex items-center justify-between">
          <Tooltip text={"Delete all chats (no project chats)"}>
            <button
              onClick={onDeleteAllGlobalChats}
              className="cursor-pointer p-2 rounded-lg hover:bg-neutral-200 dark:hover:bg-zinc-800 transition-colors
                duration-300 ease-in-out"
            >
              <Trash2 className="size-6 text-neutral-500 dark:text-zinc-500" />
            </button>
          </Tooltip>

          <div className="flex space-x-2">
            <Tooltip text={"New project"}>
              <button
                onClick={onNewProject}
                className="cursor-pointer p-2 rounded-lg hover:bg-neutral-200 dark:hover:bg-zinc-800
                  transition-colors duration-300 ease-in-out"
              >
                <FolderPlus className="size-6 text-neutral-500 dark:text-zinc-500" />
              </button>
            </Tooltip>

            <Tooltip text={"New chat"}>
              <button
                onClick={() => onNewChat(null)}
                className="cursor-pointer p-2 rounded-lg hover:bg-neutral-200 dark:hover:bg-zinc-800
                  transition-colors duration-300 ease-in-out"
              >
                <SquarePen className="size-6 text-neutral-500 dark:text-zinc-500" />
              </button>
            </Tooltip>
          </div>
        </div>
      </div>

      <motion.div
        ref={scrollContainerRef}
        className="flex-grow overflow-y-auto pr-3"
        variants={animationVariants.container}
        initial="hidden"
        animate="visible"
      >
        <div
          onDragOver={(e) => handleDragOver(e, "global")}
          onDragLeave={handleDragLeave}
          onDrop={(e) => handleDrop(e, null)}
          className={`rounded-lg transition-colors duration-200 ${
            dropTargetProjectId === "global" && draggedChatId !== null
              ? "bg-blue-100/50 dark:bg-blue-900/30 ring-2 ring-blue-400 ring-inset"
              : ""
          }`}
        >
          <AnimatePresence>
            {pinnedGlobalChats.length > 0 && (
              <motion.div key="pinned" variants={animationVariants.item} className="mb-4">
                <h3 className="text-xs font-semibold text-neutral-500 dark:text-zinc-500 uppercase mb-2">
                  Pinned
                </h3>
                <ul>
                  <AnimatePresence>{pinnedGlobalChats.map(renderChatRow)}</AnimatePresence>
                </ul>
              </motion.div>
            )}
            {groupedGlobalChats.map((group) => (
              <motion.div key={group.label} variants={animationVariants.item} className="mb-4">
                <h3 className="text-xs font-semibold text-neutral-500 dark:text-zinc-500 uppercase mb-2">
                  {group.label}
                </h3>
                <ul>
                  <AnimatePresence>{group.chats.map(renderChatRow)}</AnimatePresence>
                </ul>
              </motion.div>
            ))}
          </AnimatePresence>
        </div>

        {projects.length > 0 && (
          <motion.div key="projects-section" variants={animationVariants.item} className="mb-4">
            <h3 className="text-xs font-semibold text-neutral-500 dark:text-zinc-500 uppercase mb-2">Projects</h3>
            <ul>
              <AnimatePresence>
                {projects.map((project) => (
                  <motion.li
                    key={project.id}
                    variants={animationVariants.item}
                    exit="exit"
                    className="mb-0.5"
                    onDragOver={(e) => handleDragOver(e, project.id)}
                    onDragLeave={handleDragLeave}
                    onDrop={(e) => handleDrop(e, project.id)}
                  >
                    <div
                      className={`flex items-center group rounded-lg transition-colors duration-200 ${
                        dropTargetProjectId === project.id && draggedChatId !== null
                          ? "bg-blue-100/50 dark:bg-blue-900/30 ring-2 ring-blue-400 ring-inset"
                          : ""
                      }`}
                    >
                      <motion.button
                        onClick={() => toggleProjectExpansion(project.id)}
                        className="cursor-pointer p-1 rounded-full text-neutral-500 dark:text-zinc-500"
                        animate={{ rotate: expandedProjects.has(project.id) ? 90 : 0 }}
                        transition={{ duration: 0.2 }}
                      >
                        <ChevronRight className="size-4 stroke-2" />
                      </motion.button>
                      <div className="flex-1 min-w-0">
                        <EditableItem
                          item={project}
                          isActive={project.id === activeProjectId}
                          isEditing={editingItem?.type === "project" && editingItem.id === project.id}
                          onSelect={() => onSelectProject(project.id)}
                          onStartEdit={() => handleStartEdit("project", project.id)}
                          onSaveEdit={(newTitle) => handleSaveEdit("project", project.id, newTitle)}
                          onCancelEdit={handleCancelEdit}
                        >
                          <div className="flex min-w-0 items-center gap-2">
                            <FolderOpen className="size-5 flex-shrink-0" />
                            <TruncatedTooltip title={project.title}>{project.title}</TruncatedTooltip>
                          </div>
                          <div
                            className="relative inline-block opacity-0 group-hover:opacity-100 translate-x-2
                              group-hover:translate-x-0 transition-all duration-200 ease-in-out"
                          >
                            <button
                              onClick={(e: React.MouseEvent<HTMLButtonElement>) => {
                                e.stopPropagation();
                                menuAnchorRef.current = e.currentTarget;
                                setOpenMenuId(openMenuId === `project-${project.id}` ? null : `project-${project.id}`);
                              }}
                              className="cursor-pointer p-1 rounded-full text-neutral-500 dark:text-zinc-500"
                            >
                              <MoreHorizontal className="size-5" />
                            </button>
                            <DropdownMenu
                              open={openMenuId === `project-${project.id}`}
                              anchorRef={menuAnchorRef}
                              onCloseAction={() => setOpenMenuId(null)}
                              position="left"
                              items={[
                                {
                                  id: "rename",
                                  icon: <Pencil className="size-4" />,
                                  label: "Rename Project",
                                  onClick: () => handleStartEdit("project", project.id),
                                },
                                {
                                  id: "new-chat",
                                  icon: <SquarePen className="size-4" />,
                                  label: "New Chat in Project",
                                  onClick: () => onNewChat(project.id),
                                },
                                {
                                  id: "delete",
                                  icon: <Trash2 className="size-4 text-red-500" />,
                                  label: "Delete Project",
                                  onClick: () => onDeleteProject(project.id),
                                  className: "text-red-500 hover:bg-red-100 dark:hover:bg-red-400/10",
                                },
                              ]}
                            />
                          </div>
                        </EditableItem>
                      </div>
                    </div>
                    <AnimatePresence initial={false}>
                      {expandedProjects.has(project.id) && (
                        <motion.div
                          key="content"
                          initial="collapsed"
                          animate="open"
                          exit="collapsed"
                          variants={animationVariants.accordion}
                          className="ms-6 border-l border-neutral-300 dark:border-zinc-700 mt-1 ps-2 overflow-hidden"
                        >
                          <ul>
                            <AnimatePresence>
                              {(() => {
                                const projectChats = chatsByProjectId.get(project.id) ?? [];
                                return projectChats.length > 0 ? (
                                  projectChats.map(renderChatRow)
                                ) : (
                                  <li className="text-neutral-500 dark:text-zinc-500 text-sm py-2 ps-2">
                                    No chats in this project.
                                  </li>
                                );
                              })()}
                            </AnimatePresence>
                          </ul>
                        </motion.div>
                      )}
                    </AnimatePresence>
                  </motion.li>
                ))}
              </AnimatePresence>
            </ul>
          </motion.div>
        )}
      </motion.div>
    </div>
  );
}

export default memo(Sidebar);
