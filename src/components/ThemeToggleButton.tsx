"use client";

import React, { useRef, useState } from "react";
import { useTheme } from "@/components/ThemeProvider";
import Tooltip from "@/components/Tooltip";
import { SunIcon, MoonIcon, ComputerDesktopIcon } from "@heroicons/react/24/outline";
import DropdownMenu, { DropdownItem } from "./DropdownMenu";

export default function ThemeToggleButton() {
  const { theme, setTheme, resolvedTheme } = useTheme();
  const [isOpen, setIsOpen] = useState(false);
  const buttonRef = useRef<HTMLButtonElement>(null);

  const getIconForTheme = (t: "light" | "dark" | "system") => {
    if (t === "light") return <SunIcon className="size-5 transition-colors duration-300 ease-in-out" />;
    if (t === "dark") return <MoonIcon className="size-5 transition-colors duration-300 ease-in-out" />;
    return <ComputerDesktopIcon className="size-5 transition-colors duration-300 ease-in-out" />;
  };

  const getLabelForTheme = (t: "light" | "dark" | "system") => {
    if (t === "light") return "Light";
    if (t === "dark") return "Dark";
    return "System";
  };

  const dropdownItems: DropdownItem[] = [
    {
      id: "light",
      label: "Light",
      icon: <SunIcon className="size-4" />,
      onClick: () => setTheme("light"),
      className: resolvedTheme === "light" ? "font-semibold" : "",
    },
    {
      id: "dark",
      label: "Dark",
      icon: <MoonIcon className="size-4" />,
      onClick: () => setTheme("dark"),
      className: resolvedTheme === "dark" ? "font-semibold" : "",
    },
    {
      id: "system",
      label: "System",
      icon: <ComputerDesktopIcon className="size-4" />,
      onClick: () => setTheme("system"),
      className: theme === "system" ? "font-semibold" : "",
    },
  ];

  return (
    <div className="relative">
      <Tooltip text={`Current theme: ${getLabelForTheme(theme)}`}>
        <button
          ref={buttonRef}
          onClick={() => setIsOpen((prev) => !prev)}
          className="cursor-pointer size-9 flex items-center justify-center rounded-full text-neutral-500
            hover:bg-neutral-100 dark:hover:bg-neutral-900 transition-colors duration-300 ease-in-out"
          aria-label="Toggle theme"
        >
          {getIconForTheme(resolvedTheme)}
        </button>
      </Tooltip>

      <DropdownMenu
        anchorRef={buttonRef}
        open={isOpen}
        onCloseAction={() => setIsOpen(false)}
        items={dropdownItems}
        position="right"
        extraWidthPx={10}
      />
    </div>
  );
}
