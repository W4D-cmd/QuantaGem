"use client";

import React, { useEffect, ReactNode, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { XMarkIcon } from "@heroicons/react/24/outline";
import { motion, AnimatePresence, Variants } from "framer-motion";

interface ModalProps {
  isOpen: boolean;
  onClose: () => void;
  title?: string;
  children: ReactNode;
  size?: "sm" | "md" | "lg" | "xl";
  hideCloseButton?: boolean;
}

const Modal: React.FC<ModalProps> = ({ isOpen, onClose, title, children, size = "md", hideCloseButton = false }) => {
  const modalRef = useRef<HTMLDivElement>(null);
  const [isMounted, setIsMounted] = useState(false);

  useEffect(() => {
    setIsMounted(true);
  }, []);

  useEffect(() => {
    const handleEsc = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        onClose();
      }
    };

    if (isOpen) {
      document.addEventListener("keydown", handleEsc);
      document.body.style.overflow = "hidden";
    }

    return () => {
      document.removeEventListener("keydown", handleEsc);
      document.body.style.overflow = "auto";
    };
  }, [isOpen, onClose]);

  useEffect(() => {
    if (isOpen && modalRef.current) {
      modalRef.current.focus();
    }
  }, [isOpen]);

  const sizeClasses = {
    sm: "max-w-sm",
    md: "max-w-md",
    lg: "max-w-lg",
    xl: "max-w-xl",
  };

  const backdropVariants: Variants = {
    visible: { opacity: 1 },
    hidden: { opacity: 0 },
  };

  const modalVariants: Variants = {
    hidden: {
      y: "50px",
      opacity: 0,
      scale: 0.95,
      transition: {
        duration: 0.2,
        ease: [0.42, 0, 1, 1],
      },
    },
    visible: {
      y: "0",
      opacity: 1,
      scale: 1,
      transition: {
        duration: 0.25,
        ease: [0, 0, 0.58, 1],
      },
    },
  };

  if (!isMounted) {
    return null;
  }

  return createPortal(
    <AnimatePresence>
      {isOpen && (
        <motion.div
          initial="hidden"
          animate="visible"
          exit="hidden"
          variants={backdropVariants}
          transition={{ duration: 0.2 }}
          className="fixed inset-0 z-[9990] flex items-center justify-center bg-black/30 backdrop-blur-sm p-4"
          role="dialog"
          aria-modal="true"
          aria-labelledby={title ? "modal-title" : undefined}
          onClick={onClose}
        >
          <motion.div
            ref={modalRef}
            variants={modalVariants}
            className={`focus:outline-none bg-white dark:bg-neutral-900 rounded-2xl shadow-xl flex flex-col
            overflow-hidden w-full ${sizeClasses[size]} transition-colors duration-300 ease-in-out`}
            onClick={(e) => e.stopPropagation()}
            tabIndex={-1}
            role="document"
          >
            {title && (
              <div className="flex items-center justify-between p-4 border-b border-neutral-200 dark:border-neutral-800">
                <h2 id="modal-title" className="text-lg font-semibold text-neutral-900 dark:text-white">
                  {title}
                </h2>
                {!hideCloseButton && (
                  <button
                    onClick={onClose}
                    className="cursor-pointer size-9 flex items-center justify-center px-2 rounded-full
                      transition-colors duration-300 ease-in-out text-neutral-500 dark:text-neutral-400
                      hover:bg-neutral-100 dark:hover:bg-neutral-800 focus:outline-none"
                    aria-label="Close modal"
                  >
                    <XMarkIcon className="size-5" />
                  </button>
                )}
              </div>
            )}
            {!title && !hideCloseButton && (
              <button
                onClick={onClose}
                className="cursor-pointer size-9 flex items-center justify-center px-2 rounded-full transition-colors
                  duration-300 ease-in-out text-neutral-500 dark:text-neutral-400 hover:bg-neutral-100
                  dark:hover:bg-neutral-800 focus:outline-none"
                aria-label="Close modal"
              >
                <XMarkIcon className="size-5" />
              </button>
            )}
            <div className="p-6 flex-grow overflow-y-auto">{children}</div>
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>,
    document.body,
  );
};

export default Modal;
