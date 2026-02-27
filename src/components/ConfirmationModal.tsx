"use client";

import React from "react";
import Modal from "./Modal";
import { ExclamationTriangleIcon } from "@heroicons/react/24/outline";

interface ConfirmationModalProps {
  isOpen: boolean;
  onClose: () => void;
  onConfirm: () => void;
  title: string;
  message: React.ReactNode;
  confirmButtonText?: string;
  cancelButtonText?: string;
  confirmButtonClassName?: string;
}

const ConfirmationModal: React.FC<ConfirmationModalProps> = ({
  isOpen,
  onClose,
  onConfirm,
  title,
  message,
  confirmButtonText = "Confirm",
  cancelButtonText = "Cancel",
  confirmButtonClassName = "bg-red-600 hover:bg-red-700 dark:bg-red-600 dark:hover:bg-red-700",
}) => {
  return (
    <Modal isOpen={isOpen} onClose={onClose} size="sm" hideCloseButton>
      <div className="text-center">
        <div className="mx-auto flex h-12 w-12 items-center justify-center rounded-full bg-red-100 dark:bg-red-900/50">
          <ExclamationTriangleIcon className="h-6 w-6 text-red-600 dark:text-red-400" aria-hidden="true" />
        </div>
        <div className="mt-3 text-center sm:mt-5">
          <h3 className="text-lg font-semibold leading-6 text-neutral-900 dark:text-zinc-100" id="modal-title">
            {title}
          </h3>
          <div className="mt-2">
            <p className="text-sm text-neutral-500 dark:text-zinc-500">{message}</p>
          </div>
        </div>
      </div>
      <div className="mt-5 sm:mt-6 grid grid-cols-2 gap-3">
        <button
          type="button"
          className={`cursor-pointer w-full justify-center rounded-full border border-transparent px-4 py-2 text-sm
            font-medium text-white shadow-sm focus:outline-none focus:ring-2 focus:ring-offset-2
            focus:ring-offset-neutral-100 dark:focus:ring-offset-zinc-900 transition-all ${confirmButtonClassName}`}
          onClick={() => {
            onConfirm();
            onClose();
          }}
        >
          {confirmButtonText}
        </button>
        <button
          type="button"
          tabIndex={-1}
          className="cursor-pointer w-full justify-center rounded-full border border-neutral-300 dark:border-zinc-700
            px-4 py-2 text-sm font-medium text-neutral-700 dark:text-zinc-200 bg-white dark:bg-zinc-800
            hover:bg-neutral-50 dark:hover:bg-zinc-700 shadow-sm focus:outline-none
            transition-colors"
          onClick={onClose}
        >
          {cancelButtonText}
        </button>
      </div>
    </Modal>
  );
};

export default ConfirmationModal;
