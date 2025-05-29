"use client";

import React, { useEffect, ReactNode, useRef } from "react";
import { createPortal } from "react-dom";
import { XMarkIcon } from "@heroicons/react/24/outline";

interface ModalProps {
  isOpen: boolean;
  onClose: () => void;
  title?: string;
  children: ReactNode;
  size?: "sm" | "md" | "lg" | "xl";
  hideCloseButton?: boolean;
}

const Modal: React.FC<ModalProps> = ({
  isOpen,
  onClose,
  title,
  children,
  size = "md",
  hideCloseButton = false,
}) => {
  const modalRef = useRef<HTMLDivElement>(null);

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

  if (!isOpen) {
    return null;
  }

  const sizeClasses = {
    sm: "max-w-sm",
    md: "max-w-md",
    lg: "max-w-lg",
    xl: "max-w-xl",
  };

  return createPortal(
    <div
      className="fixed inset-0 z-[9990] flex items-center justify-center bg-black/30 backdrop-blur-sm p-4"
      role="dialog"
      aria-modal="true"
      aria-labelledby={title ? "modal-title" : undefined}
    >
      <div
        ref={modalRef}
        className={`focus:outline-none bg-white rounded-2xl shadow-xl flex flex-col overflow-hidden w-full ${sizeClasses[size]}`}
        onClick={(e) => e.stopPropagation()}
        tabIndex={-1}
        role="document"
      >
        {title && (
          <div className="flex items-center justify-between p-4 border-b border-gray-200">
            <h2 id="modal-title" className="text-lg font-semibold text-primary">
              {title}
            </h2>
            {!hideCloseButton && (
              <button
                onClick={onClose}
                className="cursor-pointer h-9 flex items-center justify-center px-2 rounded-full text-sm font-medium transition-colors duration-150 bg-white text-primary hover:bg-gray-100 focus:outline-none"
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
            className="cursor-pointer h-9 flex items-center justify-center px-2 rounded-full text-sm font-medium transition-colors duration-150 bg-white text-primary hover:bg-gray-100 focus:outline-none"
            aria-label="Close modal"
          >
            <XMarkIcon className="size-5" />
          </button>
        )}
        <div className="p-6 flex-grow overflow-y-auto">{children}</div>
      </div>
    </div>,
    document.body,
  );
};

export default Modal;
