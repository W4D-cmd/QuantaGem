"use client";

import React, { useEffect, useLayoutEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import {
  ChatBubbleLeftRightIcon,
  CheckIcon,
  ChevronRightIcon,
  ChevronUpIcon,
  Cog8ToothIcon,
  StopIcon,
  VideoCameraIcon,
} from "@heroicons/react/24/outline";
import Tooltip from "./Tooltip";
import ChatInputSettingsMenu from "./ChatInputSettingsMenu";
import { LiveModel } from "@/lib/live-models";
import { DialogVoice } from "@/lib/voices";

interface LiveSessionButtonProps {
  isSessionActive: boolean;
  isConnecting: boolean;
  liveMode: "audio" | "video";
  onLiveModeChange: (mode: "audio" | "video") => void;
  onStartSession: (withVideo: boolean) => void;
  onStopSession: () => void;
  disabled: boolean;
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
}

const LiveSessionButton: React.FC<LiveSessionButtonProps> = ({
  isSessionActive,
  isConnecting,
  liveMode,
  onLiveModeChange,
  onStartSession,
  onStopSession,
  disabled,
  ...settingsProps
}) => {
  const [isDropdownOpen, setIsDropdownOpen] = useState(false);
  const [isSettingsOpen, setIsSettingsOpen] = useState(false);
  const [dropdownCoords, setDropdownCoords] = useState({ top: 0, left: 0 });
  const [settingsCoords, setSettingsCoords] = useState({ top: 0, left: 0 });

  const buttonRef = useRef<HTMLDivElement>(null);
  const dropdownRef = useRef<HTMLDivElement>(null);
  const settingsMenuItemRef = useRef<HTMLDivElement>(null);
  const settingsMenuRef = useRef<HTMLDivElement>(null);
  const leaveTimeoutRef = useRef<NodeJS.Timeout | null>(null);

  const handleMouseEnter = () => {
    if (leaveTimeoutRef.current) {
      clearTimeout(leaveTimeoutRef.current);
    }
  };

  const handleMouseLeave = () => {
    leaveTimeoutRef.current = setTimeout(() => {
      setIsDropdownOpen(false);
      setIsSettingsOpen(false);
    }, 200);
  };

  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      const target = event.target as Node;
      if (
        buttonRef.current &&
        !buttonRef.current.contains(target) &&
        (!dropdownRef.current || !dropdownRef.current.contains(target)) &&
        (!settingsMenuRef.current || !settingsMenuRef.current.contains(target))
      ) {
        setIsDropdownOpen(false);
        setIsSettingsOpen(false);
      }
    };
    document.addEventListener("mousedown", handleClickOutside);
    return () => {
      document.removeEventListener("mousedown", handleClickOutside);
      if (leaveTimeoutRef.current) {
        clearTimeout(leaveTimeoutRef.current);
      }
    };
  }, []);

  useLayoutEffect(() => {
    if (isDropdownOpen && buttonRef.current && dropdownRef.current) {
      const btnRect = buttonRef.current.getBoundingClientRect();
      const menuHeight = dropdownRef.current.offsetHeight;
      const menuWidth = dropdownRef.current.offsetWidth;
      setDropdownCoords({
        top: btnRect.top - menuHeight - 8,
        left: btnRect.right - menuWidth,
      });
    }
  }, [isDropdownOpen]);

  useLayoutEffect(() => {
    if (isSettingsOpen && settingsMenuItemRef.current && settingsMenuRef.current) {
      const itemRect = settingsMenuItemRef.current.getBoundingClientRect();
      setSettingsCoords({
        top: dropdownCoords.top,
        left: itemRect.right + 8,
      });
    }
  }, [isSettingsOpen, dropdownCoords.top]);

  const handleModeSelect = (mode: "audio" | "video") => {
    onLiveModeChange(mode);
    onStartSession(mode === "video");
    setIsDropdownOpen(false);
  };

  const handlePrimaryAction = () => {
    onStartSession(liveMode === "video");
  };

  if (isSessionActive || isConnecting) {
    return (
      <Tooltip text={isConnecting ? "Connecting..." : "Stop Live Session"}>
        <button
          type="button"
          onClick={onStopSession}
          className={`cursor-pointer size-9 flex items-center justify-center rounded-full text-sm font-medium border
            transition-colors duration-300 ease-in-out bg-white border-red-500 hover:bg-red-100 dark:bg-neutral-900
            dark:border-red-500 dark:hover:bg-red-900/50 animate-pulse`}
        >
          {isConnecting ? (
            <div className="w-4 h-4 border-2 border-neutral-300 border-t-red-500 rounded-full animate-spin" />
          ) : (
            <StopIcon className="size-5 text-red-500" />
          )}
        </button>
      </Tooltip>
    );
  }

  const DropdownContent = () => (
    <div
      ref={dropdownRef}
      style={{ position: "absolute", top: `${dropdownCoords.top}px`, left: `${dropdownCoords.left}px` }}
      className="w-64 bg-white dark:bg-neutral-900 border border-neutral-200 dark:border-neutral-800 rounded-2xl
        shadow-lg p-2 z-50"
      onMouseEnter={handleMouseEnter}
      onMouseLeave={handleMouseLeave}
    >
      <div className="space-y-1">
        <button
          onClick={() => handleModeSelect("audio")}
          className="w-full text-left px-3 py-2 text-sm rounded-lg flex justify-between items-center
            hover:bg-neutral-100 dark:hover:bg-neutral-800"
        >
          <div className="flex items-center gap-3">
            <ChatBubbleLeftRightIcon className="size-5" />
            <span>Live Chat (Audio Only)</span>
          </div>
          {liveMode === "audio" && <CheckIcon className="size-5 text-blue-500" />}
        </button>
        <button
          onClick={() => handleModeSelect("video")}
          className="w-full text-left px-3 py-2 text-sm rounded-lg flex justify-between items-center
            hover:bg-neutral-100 dark:hover:bg-neutral-800"
        >
          <div className="flex items-center gap-3">
            <VideoCameraIcon className="size-5" />
            <span>Live Chat + Screen</span>
          </div>
          {liveMode === "video" && <CheckIcon className="size-5 text-blue-500" />}
        </button>
        <div className="border-t border-neutral-200 dark:border-neutral-700 my-1 !mx-2"></div>
        <div
          ref={settingsMenuItemRef}
          onMouseEnter={() => setIsSettingsOpen(true)}
          className="w-full text-left px-3 py-2 text-sm rounded-lg flex justify-between items-center
            hover:bg-neutral-100 dark:hover:bg-neutral-800 cursor-pointer"
        >
          <div className="flex items-center gap-3">
            <Cog8ToothIcon className="size-5" />
            <span>Settings</span>
          </div>
          <ChevronRightIcon className="size-4" />
        </div>
      </div>
    </div>
  );

  const SettingsContent = () => (
    <div
      ref={settingsMenuRef}
      style={{ position: "absolute", top: `${settingsCoords.top}px`, left: `${settingsCoords.left}px` }}
      className="z-[60]"
      onMouseEnter={handleMouseEnter}
      onMouseLeave={handleMouseLeave}
    >
      <ChatInputSettingsMenu {...settingsProps} disabled={false} />
    </div>
  );

  const primaryActionIcon =
    liveMode === "video" ? (
      <VideoCameraIcon className="size-5 text-neutral-500 dark:text-neutral-300" />
    ) : (
      <ChatBubbleLeftRightIcon className="size-5 text-neutral-500 dark:text-neutral-300" />
    );

  const primaryActionTooltip = liveMode === "video" ? "Start Live Chat + Screen" : "Start Live Chat (Audio Only)";

  return (
    <div ref={buttonRef} className="relative flex items-center">
      <div
        className="flex items-center rounded-full border bg-white border-neutral-300 dark:bg-neutral-900
          dark:border-neutral-800"
      >
        <Tooltip text={primaryActionTooltip}>
          <button
            type="button"
            onClick={handlePrimaryAction}
            disabled={disabled}
            className="cursor-pointer h-9 pl-3 pr-2 flex items-center justify-center rounded-l-full hover:bg-neutral-100
              dark:hover:bg-neutral-700 disabled:opacity-50 transition-colors"
          >
            {primaryActionIcon}
          </button>
        </Tooltip>
        <div className="w-px h-5 bg-neutral-300 dark:bg-neutral-700"></div>
        <Tooltip text="More options">
          <button
            type="button"
            onClick={() => setIsDropdownOpen((prev) => !prev)}
            disabled={disabled}
            className="cursor-pointer h-9 px-2 flex items-center justify-center rounded-r-full hover:bg-neutral-100
              dark:hover:bg-neutral-700 disabled:opacity-50 transition-colors"
          >
            <ChevronUpIcon className="size-4 text-neutral-500 dark:text-neutral-300" />
          </button>
        </Tooltip>
      </div>
      {isDropdownOpen && createPortal(<DropdownContent />, document.body)}
      {isSettingsOpen && createPortal(<SettingsContent />, document.body)}
    </div>
  );
};

export default LiveSessionButton;
