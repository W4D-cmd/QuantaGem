"use client";

import { useEffect, useRef, useState, FC, useCallback } from "react";
import { XMarkIcon, CheckCircleIcon, ExclamationTriangleIcon } from "@heroicons/react/24/outline";

export interface ToastProps {
  message: string;
  type?: "success" | "error";
  onClose: () => void;
}
const AUTO_DISMISS_MS = 6000;

const Toast: FC<ToastProps> = ({ message, type = "error", onClose }) => {
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

  const isSuccess = type === "success";
  const bgColor = isSuccess ? "bg-green-500/80" : "bg-red-500/70";
  const borderColor = isSuccess ? "border-green-600/80" : "border-red-600/70";
  const hoverBgColor = isSuccess ? "hover:bg-green-600/30" : "hover:bg-red-600/30";
  const progressBgColor = isSuccess ? "bg-green-600/70" : "bg-red-600/70";
  const Icon = isSuccess ? CheckCircleIcon : ExclamationTriangleIcon;

  return (
    <div
      className={`fixed top-4 left-1/2 transform -translate-x-1/2 z-[10000] w-[90%] max-w-md backdrop-blur-sm text-white
        rounded-2xl shadow-lg overflow-hidden transition-all duration-300
        ${visible ? "opacity-100 translate-y-0" : "opacity-0 -translate-y-4"} ${bgColor} ${borderColor} border`}
      onMouseEnter={clearTimer}
      onMouseLeave={startTimer}
      role="alert"
    >
      <div className="flex items-start justify-between px-4 py-3">
        <div className="flex items-center gap-3">
          <Icon className="size-6 flex-shrink-0" />
          <span className="text-sm flex-1 max-h-[160px] overflow-y-auto break-words">{message}</span>
        </div>
        <button
          onClick={() => {
            clearTimer();
            setVisible(false);
            setTimeout(onClose, 300);
          }}
          className={`cursor-pointer p-1.5 rounded-full ${hoverBgColor} transition-colors flex-none -mr-1 -mt-1`}
        >
          <XMarkIcon className="size-5" />
        </button>
      </div>
      <div className="h-1 overflow-hidden">
        <div
          className={`h-full ${progressBgColor} transition-[width] ease-linear duration-50`}
          style={{ width: `${progress}%` }}
        />
      </div>
    </div>
  );
};

export default Toast;
