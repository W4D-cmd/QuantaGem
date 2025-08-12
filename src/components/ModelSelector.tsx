"use client";

import { useEffect, useLayoutEffect, useRef, useState } from "react";
import { Model } from "@google/genai";
import Tooltip from "@/components/Tooltip";
import { ArrowDownTrayIcon, ArrowUpTrayIcon, ChevronDownIcon } from "@heroicons/react/24/outline";
import { CheckCircleIcon } from "@heroicons/react/24/solid";
import { motion, AnimatePresence } from "framer-motion";

export interface Props {
  models: Model[];
  selected: Model | null;
  onChangeAction: (model: Model) => void;
}

export default function ModelSelector({ models, selected, onChangeAction }: Props) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);
  const listRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const onClickOutside = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) {
        setOpen(false);
      }
    };
    document.addEventListener("mousedown", onClickOutside);
    return () => document.removeEventListener("mousedown", onClickOutside);
  }, []);

  useLayoutEffect(() => {
    if (!open || !listRef.current) return;
    const sel = listRef.current.querySelector('[data-selected="true"]');
    sel?.scrollIntoView({ block: "center" });
  }, [open]);

  return (
    <div className="relative" ref={ref}>
      <button
        onClick={() => setOpen((v) => !v)}
        className="inline-flex items-center h-11 px-3 py-2 rounded-lg cursor-pointer hover:bg-neutral-100
          dark:hover:bg-neutral-900 text-neutral-600 dark:text-neutral-300 text-[18px] font-medium focus:outline-none
          transition-colors duration-300 ease-in-out"
        disabled={models.length === 0}
      >
        {selected ? (
          selected.displayName
        ) : (
          <div className="w-4 h-4 border-3 border-neutral-300 border-t-neutral-500 rounded-full animate-spin" />
        )}
        <motion.div
          className="ml-2 flex items-center justify-center"
          animate={{ rotate: open ? 180 : 0 }}
          transition={{ duration: 0.2 }}
        >
          <ChevronDownIcon
            className="size-3 stroke-3 text-neutral-400 dark:text-neutral-600 transition-colors duration-300
              ease-in-out"
          />
        </motion.div>
      </button>

      <AnimatePresence>
        {open && (
          <motion.div
            initial={{ opacity: 0, scale: 0.95, y: -10 }}
            animate={{ opacity: 1, scale: 1, y: 0 }}
            exit={{ opacity: 0, scale: 0.95, y: -10 }}
            transition={{ duration: 0.15, ease: "easeOut" }}
            style={{ transformOrigin: "top center" }}
            className="absolute left-0 top-full mt-2 min-w-md border bg-white dark:bg-neutral-900 border-neutral-200
              dark:border-neutral-800 transition-colors duration-300 ease-in-out rounded-2xl shadow-lg z-50
              overflow-hidden"
          >
            <div
              className="px-4 py-2 flex items-center justify-between text-neutral-500 dark:text-neutral-400
                transition-colors duration-300 ease-in-out"
            >
              <span>Model</span>
            </div>
            <div ref={listRef} className="max-h-96 overflow-y-auto p-2 space-y-1" style={{ scrollbarGutter: "stable" }}>
              {models.map((m) => (
                <Tooltip key={m.name} text={m.description ?? ""}>
                  <button
                    data-selected={m.name === selected?.name}
                    key={m.name}
                    onClick={() => {
                      onChangeAction(m);
                      setOpen(false);
                    }}
                    className="w-full flex items-center justify-between px-4 py-2 hover:bg-neutral-100
                      dark:hover:bg-neutral-800 rounded-lg transition-colors duration-300 ease-in-out cursor-pointer"
                  >
                    <div className="flex flex-col">
                      <span
                        className="font-medium text-neutral-600 dark:text-neutral-300 transition-colors duration-300
                          ease-in-out"
                      >
                        {m.displayName}
                      </span>
                      <div
                        className="text-xs text-neutral-500 dark:text-neutral-400 flex items-center gap-2 mt-1
                          transition-colors duration-300 ease-in-out"
                      >
                        <ArrowDownTrayIcon className="size-3 transition-colors duration-300 ease-in-out" />
                        {m.inputTokenLimit}
                        <ArrowUpTrayIcon className="size-3 transition-colors duration-300 ease-in-out" />
                        {m.outputTokenLimit}
                      </div>
                    </div>
                    {m.name === selected?.name && (
                      <CheckCircleIcon className="size-4 transition-colors duration-300 ease-in-out" />
                    )}
                  </button>
                </Tooltip>
              ))}
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
