"use client";

import React, { useState, useRef, ReactNode, useLayoutEffect } from "react";
import { ChevronRightIcon, CpuChipIcon, LanguageIcon, SpeakerWaveIcon } from "@heroicons/react/24/outline";
import { LiveModel } from "@/lib/live-models";
import { DialogVoice } from "@/lib/voices";
import Tooltip from "./Tooltip";

interface SubMenuProps {
  items: { id: string; label: string; secondaryLabel?: string; selected: boolean }[];
  onSelect: (id: string) => void;
  title: string;
  onMouseEnter: () => void;
}

const SubMenu: React.FC<SubMenuProps> = ({ items, onSelect, title, onMouseEnter }) => (
  <div
    onMouseEnter={onMouseEnter}
    className="w-72 bg-white dark:bg-neutral-900 border border-neutral-200 dark:border-neutral-800 rounded-2xl shadow-lg
      z-20"
  >
    <div className="p-2">
      <h4 className="px-3 py-1 text-xs font-semibold text-neutral-500 dark:text-neutral-400">{title}</h4>
      <div className="max-h-36 overflow-y-auto space-y-1 mt-1">
        {items.map((item) => (
          <Tooltip key={item.id} text={item.secondaryLabel || ""}>
            <button
              onClick={() => onSelect(item.id)}
              className={`w-full text-left px-3 py-1.5 text-sm rounded-lg flex justify-between items-center ${
                item.selected
                  ? "bg-blue-100 dark:bg-blue-900/50 text-blue-700 dark:text-blue-300 font-semibold"
                  : "hover:bg-neutral-100 dark:hover:bg-neutral-800"
              }`}
            >
              <span className="truncate">{item.label}</span>
              {item.secondaryLabel && (
                <span className="text-xs text-neutral-400 dark:text-neutral-500 ml-2 truncate">
                  {item.secondaryLabel}
                </span>
              )}
            </button>
          </Tooltip>
        ))}
      </div>
    </div>
  </div>
);

interface MainMenuItemProps {
  icon: ReactNode;
  label: string;
  value: string;
  onMouseEnter: () => void;
  disabled?: boolean;
  children?: ReactNode;
}

const MainMenuItem: React.FC<MainMenuItemProps> = ({ icon, label, value, onMouseEnter, disabled, children }) => {
  const itemRef = useRef<HTMLDivElement>(null);
  const [verticalOffset, setVerticalOffset] = useState(0);

  useLayoutEffect(() => {
    if (itemRef.current) {
      setVerticalOffset(-itemRef.current.offsetTop);
    }
  }, []);

  return (
    <div
      ref={itemRef}
      onMouseEnter={onMouseEnter}
      className={`relative flex items-center justify-between px-3 py-2 rounded-lg ${
        disabled ? "opacity-50 cursor-not-allowed" : "hover:bg-neutral-100 dark:hover:bg-neutral-800 cursor-pointer"
      }`}
    >
      <div className="flex items-center gap-3">
        {icon}
        <div className="flex flex-col">
          <span className="text-sm font-medium">{label}</span>
          <span className="text-xs text-neutral-500 dark:text-neutral-400 truncate max-w-40">{value}</span>
        </div>
      </div>
      {!disabled && <ChevronRightIcon className="size-4 text-neutral-400" />}
      {children && (
        <div className="absolute left-full ml-2" style={{ top: `${verticalOffset}px` }}>
          {children}
        </div>
      )}
    </div>
  );
};

interface ChatInputSettingsMenuProps {
  liveModels: LiveModel[];
  selectedLiveModel: LiveModel;
  onLiveModelChange: (model: LiveModel) => void;
  languages: string[];
  selectedLanguage: string;
  onLanguageChange: (lang: string) => void;
  dialogVoices: DialogVoice[];
  standardVoices: string[];
  selectedVoice: string;
  onVoiceChange: (voice: string) => void;
  disabled: boolean;
}

const ChatInputSettingsMenu: React.FC<ChatInputSettingsMenuProps> = ({
  liveModels,
  selectedLiveModel,
  onLiveModelChange,
  languages,
  selectedLanguage,
  onLanguageChange,
  dialogVoices,
  standardVoices,
  selectedVoice,
  onVoiceChange,
}) => {
  const [openSubMenu, setOpenSubMenu] = useState<"liveModel" | "language" | "voice" | null>(null);
  const leaveTimeoutRef = useRef<NodeJS.Timeout | null>(null);

  const handleMouseEnterItem = (subMenu: "liveModel" | "language" | "voice" | null) => {
    if (leaveTimeoutRef.current) {
      clearTimeout(leaveTimeoutRef.current);
    }
    setOpenSubMenu(subMenu);
  };

  const handleMouseLeaveMenu = () => {
    leaveTimeoutRef.current = setTimeout(() => {
      setOpenSubMenu(null);
    }, 150);
  };

  const isDialogModel = selectedLiveModel.configType === "dialog";
  const showLanguageMenu = selectedLiveModel.configType === "standard";

  const voiceItems = isDialogModel
    ? dialogVoices.map((v) => ({
        id: v.name,
        label: v.name,
        secondaryLabel: v.description,
        selected: v.name === selectedVoice,
      }))
    : standardVoices.map((v) => ({ id: v, label: v, selected: v === selectedVoice }));

  return (
    <div
      className="relative w-64 bg-white dark:bg-neutral-900 border border-neutral-200 dark:border-neutral-800
        rounded-2xl shadow-lg p-2"
      onMouseLeave={handleMouseLeaveMenu}
      onMouseEnter={() => handleMouseEnterItem(openSubMenu)}
    >
      <div className="space-y-1">
        <MainMenuItem
          icon={<CpuChipIcon className="size-5 text-blue-500" />}
          label="Live Model"
          value={selectedLiveModel.displayName}
          onMouseEnter={() => handleMouseEnterItem("liveModel")}
        >
          {openSubMenu === "liveModel" && (
            <SubMenu
              title="Live Model"
              items={liveModels.map((m) => ({
                id: m.name,
                label: m.displayName,
                selected: m.name === selectedLiveModel.name,
              }))}
              onSelect={(id) => {
                const newModel = liveModels.find((m) => m.name === id)!;
                onLiveModelChange(newModel);
              }}
              onMouseEnter={() => handleMouseEnterItem("liveModel")}
            />
          )}
        </MainMenuItem>
        <MainMenuItem
          icon={<LanguageIcon className="size-5" />}
          label="Language"
          value={selectedLanguage}
          onMouseEnter={() => handleMouseEnterItem("language")}
          disabled={!showLanguageMenu}
        >
          {openSubMenu === "language" && showLanguageMenu && (
            <SubMenu
              title="Language"
              items={languages.map((l) => ({ id: l, label: l, selected: l === selectedLanguage }))}
              onSelect={(id) => onLanguageChange(id)}
              onMouseEnter={() => handleMouseEnterItem("language")}
            />
          )}
        </MainMenuItem>
        <MainMenuItem
          icon={<SpeakerWaveIcon className="size-5" />}
          label="Voice"
          value={selectedVoice}
          onMouseEnter={() => handleMouseEnterItem("voice")}
        >
          {openSubMenu === "voice" && (
            <SubMenu
              title="Voice"
              items={voiceItems}
              onSelect={(id) => onVoiceChange(id)}
              onMouseEnter={() => handleMouseEnterItem("voice")}
            />
          )}
        </MainMenuItem>
      </div>
    </div>
  );
};

export default ChatInputSettingsMenu;
