"use client";

import React, {
  ReactNode,
  useEffect,
  useLayoutEffect,
  useRef,
  useState,
} from "react";
import { createPortal } from "react-dom";

export interface DropdownItem {
  id?: string;
  icon?: ReactNode;
  label: string;
  onClick: () => void;
  className?: string;
}

interface Props {
  open: boolean;
  onCloseAction: () => void;
  items: DropdownItem[];
  position?: "left" | "right";
  anchorRef: { current: HTMLElement | null };
  extraWidthPx?: number;
}

export default function DropdownMenu({
  open,
  onCloseAction,
  items,
  position = "left",
  anchorRef,
  extraWidthPx = 24,
}: Props) {
  const menuRef = useRef<HTMLDivElement>(null);
  const [coords, setCoords] = useState({ top: 0, left: 0 });
  const [menuWidth, setMenuWidth] = useState<number | null>(null);

  useLayoutEffect(() => {
    if (!open || !anchorRef.current || !menuRef.current) return;

    const rect = anchorRef.current.getBoundingClientRect();
    const menuEl = menuRef.current;

    menuEl.style.width = "auto";
    const contentW = menuEl.scrollWidth;
    setMenuWidth(contentW + extraWidthPx);

    const top = rect.bottom + window.scrollY;
    const left =
      position === "right"
        ? rect.right + window.scrollX - (contentW + extraWidthPx)
        : rect.left + window.scrollX;

    setCoords({ top, left });

    const handleClickOutside = (e: MouseEvent) => {
      const t = e.target as Node;
      if (!menuEl.contains(t) && !anchorRef.current!.contains(t)) {
        onCloseAction();
      }
    };

    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, [open, onCloseAction, anchorRef, position, extraWidthPx, items]);

  useEffect(() => {
    if (!open) {
      setMenuWidth(null);
    }
  }, [open]);

  useEffect(() => {
    if (!open) return;
    const handleResize = () => {
      if (!menuRef.current) return;
      const menuEl = menuRef.current;
      menuEl.style.width = "auto";
      const contentW = menuEl.scrollWidth;
      setMenuWidth(contentW + extraWidthPx);
    };
    window.addEventListener("resize", handleResize);
    return () => window.removeEventListener("resize", handleResize);
  }, [open, extraWidthPx]);

  if (!open) return null;

  const menu = (
    <div
      ref={menuRef}
      style={{
        position: "absolute",
        top: `${coords.top}px`,
        left: `${coords.left}px`,
        zIndex: 9999,
        ...(menuWidth != null ? { width: `${menuWidth}px` } : {}),
      }}
      className="bg-white border border-gray-200 rounded-2xl shadow-lg overflow-hidden"
    >
      <div className="max-h-60 overflow-y-auto p-2 space-y-1">
        {items.map((item) => (
          <button
            key={item.id ?? item.label}
            onClick={() => {
              onCloseAction();
              item.onClick();
            }}
            className={`cursor-pointer w-full flex items-center px-4 py-2 text-sm text-left hover:bg-gray-100 rounded-lg transition-colors ${item.className || ""}`}
          >
            {item.icon && <span className="mr-2">{item.icon}</span>}
            {item.label}
          </button>
        ))}
      </div>
    </div>
  );

  return createPortal(menu, document.body);
}
