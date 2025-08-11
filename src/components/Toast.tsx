"use client";

import { FC, useCallback, useEffect, useRef } from "react";
import { XMarkIcon, CheckCircleIcon, ExclamationTriangleIcon } from "@heroicons/react/24/outline";
import { motion, useAnimation } from "framer-motion";

export interface ToastProps {
  message: string;
  type?: "success" | "error";
  onClose: () => void;
}
const AUTO_DISMISS_MS = 6000;

const Toast: FC<ToastProps> = ({ message, type = "error", onClose }) => {
  const controls = useAnimation();
  const progressControls = useAnimation();
  const timerRef = useRef<NodeJS.Timeout | null>(null);
  const remainingTimeRef = useRef(AUTO_DISMISS_MS);
  const animationStartTimeRef = useRef(0);

  const handleClose = useCallback(() => {
    controls.start("hidden").then(onClose);
  }, [controls, onClose]);

  useEffect(() => {
    controls.start("visible");
    animationStartTimeRef.current = Date.now();
    remainingTimeRef.current = AUTO_DISMISS_MS;

    progressControls.start({
      width: "0%",
      transition: { duration: AUTO_DISMISS_MS / 1000, ease: "linear" },
    });

    timerRef.current = setTimeout(handleClose, AUTO_DISMISS_MS);

    return () => {
      if (timerRef.current) {
        clearTimeout(timerRef.current);
      }
    };
  }, [message, controls, progressControls, handleClose]);

  const handlePause = useCallback(() => {
    if (timerRef.current) {
      clearTimeout(timerRef.current);
    }
    progressControls.stop();
    const elapsedTime = Date.now() - animationStartTimeRef.current;
    remainingTimeRef.current = remainingTimeRef.current - elapsedTime;
  }, [progressControls]);

  const handleResume = useCallback(() => {
    animationStartTimeRef.current = Date.now();
    const remaining = remainingTimeRef.current;

    if (remaining > 0) {
      progressControls.start({
        width: "0%",
        transition: { duration: remaining / 1000, ease: "linear" },
      });
      timerRef.current = setTimeout(handleClose, remaining);
    } else {
      handleClose();
    }
  }, [progressControls, handleClose]);

  const isSuccess = type === "success";
  const bgColor = isSuccess ? "bg-green-500/80" : "bg-red-500/70";
  const borderColor = isSuccess ? "border-green-600/80" : "border-red-600/70";
  const hoverBgColor = isSuccess ? "hover:bg-green-600/30" : "hover:bg-red-600/30";
  const progressBgColor = isSuccess ? "bg-green-600/70" : "bg-red-600/70";
  const Icon = isSuccess ? CheckCircleIcon : ExclamationTriangleIcon;

  return (
    <motion.div
      initial="hidden"
      animate={controls}
      exit="hidden"
      variants={{
        hidden: { opacity: 0, y: -20, scale: 0.95 },
        visible: {
          opacity: 1,
          y: 0,
          scale: 1,
          transition: { type: "spring", stiffness: 400, damping: 25 },
        },
      }}
      className={`fixed top-4 left-1/2 -translate-x-1/2 z-[10000] w-[90%] max-w-md backdrop-blur-sm text-white
        rounded-2xl shadow-lg overflow-hidden ${bgColor} ${borderColor} border`}
      onMouseEnter={handlePause}
      onMouseLeave={handleResume}
      role="alert"
    >
      <div className="flex items-start justify-between px-4 py-3">
        <div className="flex items-center gap-3">
          <Icon className="size-6 flex-shrink-0" />
          <span className="text-sm flex-1 max-h-[160px] overflow-y-auto break-words">{message}</span>
        </div>
        <button
          onClick={handleClose}
          className={`cursor-pointer p-1.5 rounded-full ${hoverBgColor} transition-colors flex-none -mr-1 -mt-1`}
        >
          <XMarkIcon className="size-5" />
        </button>
      </div>
      <div className={"h-1 w-full bg-black/20 overflow-hidden"}>
        <motion.div className={`h-full ${progressBgColor}`} initial={{ width: "100%" }} animate={progressControls} />
      </div>
    </motion.div>
  );
};

export default Toast;
