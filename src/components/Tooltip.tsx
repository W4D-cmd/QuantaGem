"use client";

import React, { ReactNode, useState, useRef, useLayoutEffect, useEffect } from "react";
import { createPortal } from "react-dom";

interface TooltipProps {
  text: string;
  children: ReactNode;
  offset?: number;
}

export default function Tooltip({ text, children, offset = 8 }: TooltipProps) {
  const [visible, setVisible] = useState(false);
  const [fadeIn, setFadeIn] = useState(false);
  const [coords, setCoords] = useState({ top: 0, left: 0 });

  const triggerRef = useRef<HTMLSpanElement>(null);
  const tooltipRef = useRef<HTMLDivElement>(null);
  const showTimer = useRef<number | null>(null);

  useEffect(() => {
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
    setFadeIn(false);
  };

  useLayoutEffect(() => {
    if (!visible) return;
    const wrapper = triggerRef.current!;
    const tipEl = tooltipRef.current!;
    const anchor = (wrapper.firstElementChild as HTMLElement) || wrapper;
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
    requestAnimationFrame(() => setFadeIn(true));
  }, [visible, offset]);

  return (
    <>
      <span ref={triggerRef} onMouseEnter={show} onMouseLeave={hide} onClick={hide} className="contents">
        {children}
      </span>

      {visible &&
        text.trim() &&
        createPortal(
          <div
            ref={tooltipRef}
            style={{
              position: "absolute",
              top: coords.top,
              left: coords.left,
              zIndex: 9999,
              pointerEvents: "none",
            }}
            className={
              "transition-opacity duration-100 ease-in " +
              (fadeIn ? "opacity-100" : "opacity-0") +
              " bg-black dark:bg-white text-white dark:text-black text-xs rounded-lg py-1 px-2 whitespace-nowrap shadow-lg"
            }
          >
            {text}
          </div>,
          document.body,
        )}
    </>
  );
}
