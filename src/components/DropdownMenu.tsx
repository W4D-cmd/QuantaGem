"use client";

import React, { ReactNode, useEffect, useLayoutEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { motion, AnimatePresence } from "framer-motion";

export interface DropdownItem {
  id?: string;
  icon?: ReactNode;
  label: string;
  onClick: (e: React.MouseEvent<HTMLButtonElement>) => void;
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
  const [isMounted, setIsMounted] = useState(false);

  useEffect(() => {
    setIsMounted(true);
  }, []);

  useLayoutEffect(() => {
    if (!open || !anchorRef.current || !menuRef.current) return;

    const anchorEl = anchorRef.current;
    const menuEl = menuRef.current;
    const anchorRect = anchorEl.getBoundingClientRect();

    menuEl.style.width = "auto";
    const contentW = menuEl.scrollWidth;
    setMenuWidth(contentW + extraWidthPx);

    const menuHeight = menuEl.offsetHeight;
    const viewportHeight = window.innerHeight;
    const menuMargin = 8;

    const spaceBelow = viewportHeight - anchorRect.bottom;
    const spaceAbove = anchorRect.top;

    let finalTop;
    if (spaceBelow < menuHeight + menuMargin && spaceAbove > menuHeight + menuMargin) {
      finalTop = anchorRect.top + window.scrollY - menuHeight - menuMargin;
    } else {
      finalTop = anchorRect.bottom + window.scrollY + menuMargin;
    }

    const finalLeft =
      position === "right"
        ? anchorRect.right + window.scrollX - (contentW + extraWidthPx)
        : anchorRect.left + window.scrollX;

    setCoords({ top: finalTop, left: finalLeft });

    const handleClickOutside = (e: MouseEvent) => {
      const t = e.target as Node;
      if (!menuEl.contains(t) && !anchorEl.contains(t)) {
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

  const menu = (
    <AnimatePresence>
      {open && (
        <motion.div
          ref={menuRef}
          initial={{ opacity: 0, scale: 0.95, y: -10 }}
          animate={{ opacity: 1, scale: 1, y: 0 }}
          exit={{ opacity: 0, scale: 0.95, y: -10 }}
          transition={{ duration: 0.15, ease: "easeOut" }}
          style={{
            position: "absolute",
            top: `${coords.top}px`,
            left: `${coords.left}px`,
            zIndex: 9999,
            ...(menuWidth != null ? { width: `${menuWidth}px` } : {}),
            transformOrigin: "top",
          }}
          className="border bg-white dark:bg-neutral-900 border-neutral-200 dark:border-neutral-800 rounded-2xl
            shadow-lg overflow-hidden transition-colors duration-300 ease-in-out"
        >
          <div className="max-h-60 overflow-y-auto p-2 space-y-1">
            {items.map((item) => (
              <button
                key={item.id ?? item.label}
                onClick={(e) => {
                  e.stopPropagation();
                  onCloseAction();
                  item.onClick(e);
                }}
                className={`cursor-pointer w-full flex items-center px-4 py-2 text-sm text-left hover:bg-neutral-100
                dark:hover:bg-neutral-800 rounded-lg transition-colors duration-300 ease-in-out ${item.className || ""}`}
              >
                {item.icon && <span className="mr-2">{item.icon}</span>}
                {item.label}
              </button>
            ))}
          </div>
        </motion.div>
      )}
    </AnimatePresence>
  );

  if (!isMounted) {
    return null;
  }

  return createPortal(menu, document.body);
}
