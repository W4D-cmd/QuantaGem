import { useRef, useState } from "react";
import { ChatListItem } from "@/app/page";
import {
  Cog6ToothIcon,
  PencilIcon,
  PencilSquareIcon,
  TrashIcon,
} from "@heroicons/react/24/outline";
import DropdownMenu from "@/components/DropdownMenu";
import { EllipsisHorizontalIcon } from "@heroicons/react/20/solid";
import Tooltip from "@/components/Tooltip";

interface SidebarProps {
  chats: ChatListItem[];
  activeChatId: number | null;
  onNewChat: () => void;
  onSelectChat: (chatId: number) => void;
  onRenameChat: (chatId: number, newTitle: string) => void;
  onDeleteChat: (chatId: number) => void;
  onDeleteAllChats: () => void;
  onOpenChatSettings: (chatId: number, initialPrompt: string) => void;
  userEmail: string | null;
}

export default function Sidebar({
  chats,
  activeChatId,
  onNewChat,
  onSelectChat,
  onRenameChat,
  onDeleteChat,
  onDeleteAllChats,
  onOpenChatSettings,
  userEmail,
}: SidebarProps) {
  const [openMenuChatId, setOpenMenuChatId] = useState<number | null>(null);
  const menuButtonRefs = useRef<Record<string, HTMLButtonElement | null>>({});

  return (
    <div className="w-70 h-full bg-gray-100 p-4 pt-2 overflow-y-auto flex flex-col">
      <div className="flex-none mb-4">
        {userEmail && (
          <div className="mb-4 text-center text-sm text-gray-700 p-2 bg-gray-200 rounded-lg">
            Logged in as: <br />
            <span className="font-semibold">{userEmail}</span>
          </div>
        )}
        <div className="flex justify-end space-x-2">
          <Tooltip text={"Delete all chats"}>
            <button
              onClick={() => {
                if (
                  confirm(
                    "Are you sure you want to delete ALL your chats? This action cannot be undone.",
                  )
                )
                  onDeleteAllChats();
              }}
              className="cursor-pointer p-2 rounded-lg hover:bg-gray-200 transition-colors"
            >
              <TrashIcon className="h-6 w-6 text-primary" />
            </button>
          </Tooltip>

          <Tooltip text={"New chat"}>
            <button
              onClick={onNewChat}
              className="cursor-pointer p-2 rounded-lg hover:bg-gray-200 transition-colors"
            >
              <PencilSquareIcon className="h-6 w-6 text-primary" />
            </button>
          </Tooltip>
        </div>
      </div>

      <div className="flex-grow overflow-y-auto">
        <ul>
          {chats.map((chat) => (
            <li key={chat.id} className="mb-0 relative group">
              <button
                onClick={() => onSelectChat(chat.id)}
                className={`cursor-pointer w-full text-sm text-left p-2 rounded-lg hover:bg-gray-200 transition-colors focus:outline-none ${
                  chat.id === activeChatId
                    ? "bg-gray-300 font-semibold hover:bg-gray-300"
                    : "text-foreground hover:bg-gray-200"
                }`}
              >
                {chat.title}
              </button>

              <div className="absolute right-2 top-2">
                <div className="relative inline-block">
                  <button
                    ref={(el: HTMLButtonElement | null) => {
                      menuButtonRefs.current[chat.id] = el;
                    }}
                    onClick={(e) => {
                      e.stopPropagation();
                      setOpenMenuChatId(
                        openMenuChatId === chat.id ? null : chat.id,
                      );
                    }}
                    className="opacity-0 group-hover:opacity-100 cursor-pointer"
                  >
                    <EllipsisHorizontalIcon className="h-5 w-5 text-primary transition-colors hover:text-[#121212]" />
                  </button>

                  <DropdownMenu
                    open={openMenuChatId === chat.id}
                    anchorRef={{ current: menuButtonRefs.current[chat.id] }}
                    onCloseAction={() => setOpenMenuChatId(null)}
                    position="left"
                    items={[
                      {
                        id: "settings",
                        icon: <Cog6ToothIcon className="h-4 w-4" />,
                        label: "Settings",
                        onClick: () =>
                          onOpenChatSettings(chat.id, chat.systemPrompt),
                      },
                      {
                        id: "rename",
                        icon: <PencilIcon className="h-4 w-4" />,
                        label: "Rename",
                        onClick: () => {
                          const newTitle = prompt("New title", chat.title);
                          if (newTitle) onRenameChat(chat.id, newTitle);
                        },
                      },
                      {
                        id: "delete",
                        icon: <TrashIcon className="h-4 w-4 text-red-500" />,
                        label: "Delete",
                        onClick: () => {
                          if (
                            confirm(
                              "Are you sure you want to delete this chat?",
                            )
                          )
                            onDeleteChat(chat.id);
                        },
                        className: "text-red-500 hover:bg-red-100",
                      },
                    ]}
                  />
                </div>
              </div>
            </li>
          ))}
        </ul>
      </div>
    </div>
  );
}
