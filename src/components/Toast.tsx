"use client";

import { useEffect, useRef, useState, FC, useCallback } from "react";
import { XMarkIcon } from "@heroicons/react/24/outline";

interface ToastProps {
  message: string;
  onClose: () => void;
}
const AUTO_DISMISS_MS = 6000;

const Toast: FC<ToastProps> = ({ message, onClose }) => {
  const [progress, setProgress] = useState(100);
  const [visible, setVisible] = useState(false);
  const timerRef = useRef<number | null>(null);
  const startTimeRef = useRef<number>(0);

  const clearTimer = useCallback(() => {
    if (timerRef.current !== null) {
      clearInterval(timerRef.current);
      timerRef.current = null;
    }
  }, []);

  const startTimer = useCallback(() => {
    clearTimer();
    startTimeRef.current = Date.now();
    setProgress(100);
    timerRef.current = window.setInterval(() => {
      const elapsed = Date.now() - startTimeRef.current;
      const pct = Math.max(100 - (elapsed / AUTO_DISMISS_MS) * 100, 0);
      setProgress(pct);
      if (pct <= 0) {
        clearTimer();
        setVisible(false);
        setTimeout(onClose, 300);
      }
    }, 50);
  }, [clearTimer, onClose]);

  useEffect(() => {
    startTimer();
    requestAnimationFrame(() => setVisible(true));
    return clearTimer;
  }, [startTimer, clearTimer]);

  return (
    <div
      className={`fixed top-4 left-1/2 transform -translate-x-1/2 z-50 w-[90%] max-w-md bg-red-500/70 border border-red-600/70
        backdrop-blur-sm text-white rounded-2xl shadow-lg overflow-hidden transition-opacity duration-300
        ${visible ? "opacity-100" : "opacity-0"}`}
      onMouseEnter={clearTimer}
      onMouseLeave={startTimer}
    >
      <div className="flex items-center justify-between px-4 py-3">
        <span className="text-sm">{message}</span>
        <button
          onClick={() => {
            clearTimer();
            setVisible(false);
            setTimeout(onClose, 300);
          }}
          className="cursor-pointer p-2 rounded-lg hover:bg-red-600/30 transition-colors"
        >
          <XMarkIcon className="size-5" />
        </button>
      </div>
      <div className="h-1 overflow-hidden">
        <div
          className="h-full bg-red-600/70 transition-[width] ease-linear duration-50"
          style={{ width: `${progress}%` }}
        />
      </div>
    </div>
  );
};

export default Toast;
