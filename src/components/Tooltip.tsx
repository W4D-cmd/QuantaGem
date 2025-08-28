"use client";

import React, { ReactNode, useState, useRef, useLayoutEffect, useEffect } from "react";
import { createPortal } from "react-dom";
import { motion, AnimatePresence } from "framer-motion";

interface TooltipProps {
  text: string;
  children: ReactNode;
  offset?: number;
}

export default function Tooltip({ text, children, offset = 8 }: TooltipProps) {
  const [visible, setVisible] = useState(false);
  const [coords, setCoords] = useState({ top: 0, left: 0 });
  const [isMounted, setIsMounted] = useState(false);

  const triggerRef = useRef<HTMLSpanElement>(null);
  const tooltipRef = useRef<HTMLDivElement>(null);
  const showTimer = useRef<number | null>(null);

  useEffect(() => {
    setIsMounted(true);
    return () => {
      if (showTimer.current !== null) {
        clearTimeout(showTimer.current);
      }
    };
  }, []);

  const show = () => {
    if (!text.trim()) return;

    showTimer.current = window.setTimeout(() => {
      setVisible(true);
    }, 250);
  };

  const hide = () => {
    if (showTimer.current !== null) {
      clearTimeout(showTimer.current);
      showTimer.current = null;
    }
    setVisible(false);
  };

  useLayoutEffect(() => {
    if (!visible || !triggerRef.current || !tooltipRef.current) return;

    const tipEl = tooltipRef.current;
    const anchor = (triggerRef.current.firstElementChild as HTMLElement) || triggerRef.current;
    const tipRect = tipEl.getBoundingClientRect();
    const trigRect = anchor.getBoundingClientRect();
    const minMargin = 8;

    let top = trigRect.bottom + window.scrollY + offset;
    let left = trigRect.left + window.scrollX + trigRect.width / 2 - tipRect.width / 2;

    const maxLeft = window.innerWidth - tipRect.width - minMargin;
    if (left < minMargin) left = minMargin;
    else if (left > maxLeft) left = maxLeft;

    if (top + tipRect.height + minMargin > window.innerHeight) {
      top = trigRect.top + window.scrollY - tipRect.height - offset;
    }

    setCoords({ top, left });
  }, [visible, offset]);

  return (
    <>
      <span ref={triggerRef} onMouseEnter={show} onMouseLeave={hide} onClick={hide} className="contents">
        {children}
      </span>

      {isMounted &&
        createPortal(
          <AnimatePresence>
            {visible && text.trim() && (
              <motion.div
                ref={tooltipRef}
                initial={{ opacity: 0, y: 5 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, y: 5 }}
                transition={{ duration: 0.15 }}
                style={{
                  position: "absolute",
                  top: coords.top,
                  left: coords.left,
                  zIndex: 9999,
                  pointerEvents: "none",
                }}
                className="max-w-md bg-black dark:bg-white text-white dark:text-black text-center text-xs rounded-lg
                  py-1.5 px-2.5 shadow-lg"
              >
                {text}
              </motion.div>
            )}
          </AnimatePresence>,
          document.body,
        )}
    </>
  );
}
