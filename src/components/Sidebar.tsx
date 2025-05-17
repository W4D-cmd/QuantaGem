import { useRef, useState } from "react";
import { ChatListItem } from "@/app/page";
import {
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
}

export default function Sidebar({
  chats,
  activeChatId,
  onNewChat,
  onSelectChat,
  onRenameChat,
  onDeleteChat,
  onDeleteAllChats,
}: SidebarProps) {
  const [openMenuChatId, setOpenMenuChatId] = useState<number | null>(null);
  const menuButtonRefs = useRef<Record<string, HTMLButtonElement | null>>({});

  return (
    <div className="w-70 h-full bg-gray-100 p-4 pt-2 overflow-y-auto flex flex-col">
      <div className="flex justify-end mb-4 space-x-2">
        <Tooltip text={"Delete all chats"}>
          <button
            onClick={() => {
              if (confirm("Delete all chats?")) onDeleteAllChats();
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

      <div className="flex-grow overflow-y-auto">
        <ul>
          {chats.map((chat) => (
            <li key={chat.id} className="mb-0 relative group">
              <button
                onClick={() => onSelectChat(chat.id)}
                className={`cursor-pointer w-full text-sm text-left p-2 rounded-lg hover:bg-gray-200 transition-colors ${
                  chat.id === activeChatId
                    ? "bg-gray-300 font-semibold"
                    : "text-foreground"
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
                          if (confirm("Delete this chat?"))
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
