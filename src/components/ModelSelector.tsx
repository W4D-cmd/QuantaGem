"use client";

import { useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";
import Tooltip from "@/components/Tooltip";
import { ArrowDownTrayIcon, ArrowUpTrayIcon, ChevronDownIcon, MagnifyingGlassIcon } from "@heroicons/react/24/outline";
import { CheckCircleIcon } from "@heroicons/react/24/solid";
import { motion, AnimatePresence } from "framer-motion";
import { OAIModel, customModels } from "@/lib/custom-models";

export interface Props {
  models: OAIModel[];
  selected: OAIModel | null;
  onChangeAction: (model: OAIModel) => void;
}

export default function ModelSelector({ models, selected, onChangeAction }: Props) {
  const [open, setOpen] = useState(false);
  const [showAll, setShowAll] = useState(false);
  const [searchQuery, setSearchQuery] = useState("");
  const ref = useRef<HTMLDivElement>(null);
  const listRef = useRef<HTMLDivElement>(null);
  const searchInputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    const onClickOutside = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) {
        setOpen(false);
      }
    };
    document.addEventListener("mousedown", onClickOutside);
    return () => document.removeEventListener("mousedown", onClickOutside);
  }, []);

  useEffect(() => {
    if (open) {
      setTimeout(() => searchInputRef.current?.focus(), 100);
    } else {
      setSearchQuery("");
    }
  }, [open]);

  useLayoutEffect(() => {
    if (!open || !listRef.current) return;
    const sel = listRef.current.querySelector('[data-selected="true"]');
    sel?.scrollIntoView({ block: "center" });
  }, [open]);

  const filteredAndSortedModels = useMemo(() => {
    if (!models || models.length === 0) {
      return [];
    }

    let baseModels: OAIModel[];

    if (showAll) {
      baseModels = [...models].sort((a, b) => a.name.localeCompare(b.name));
    } else {
      const availableModelMap = new Map(models.map((m) => [m.id, m]));
      baseModels = customModels.map((cm) => availableModelMap.get(cm.modelId)).filter((m): m is OAIModel => !!m);
    }

    const trimmedQuery = searchQuery.trim();
    if (!trimmedQuery) {
      return baseModels;
    }

    if (trimmedQuery.includes(" ")) {
      const searchKeywords = trimmedQuery
        .toLowerCase()
        .replace(/[-_]/g, " ")
        .split(" ")
        .filter((keyword) => keyword);

      return baseModels.filter((m) => {
        const searchableModelText = (m.name + " " + m.id).toLowerCase().replace(/[-_]/g, " ");
        return searchKeywords.every((keyword) => searchableModelText.includes(keyword));
      });
    } else {
      const lowerCaseQuery = trimmedQuery.toLowerCase();
      return baseModels.filter((m) => (m.name + " " + m.id).toLowerCase().includes(lowerCaseQuery));
    }
  }, [models, showAll, searchQuery]);

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
          selected.name
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
              overflow-hidden flex flex-col"
          >
            <div
              className="px-4 py-2 flex items-center justify-between text-neutral-500 dark:text-neutral-400
                transition-colors duration-300 ease-in-out flex-none"
            >
              <span className="font-semibold text-sm">Model</span>
              <label className="flex items-center cursor-pointer">
                <span className="mr-2 text-xs text-neutral-500 dark:text-neutral-400">Show all models</span>
                <div className="relative inline-flex items-center">
                  <input
                    type="checkbox"
                    className="sr-only peer"
                    checked={showAll}
                    onChange={() => setShowAll(!showAll)}
                  />
                  <div
                    className="w-9 h-5 bg-neutral-200 peer-focus:outline-none rounded-full peer dark:bg-neutral-700
                      peer-checked:after:translate-x-full peer-checked:after:border-white after:content-['']
                      after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-neutral-300
                      after:border after:rounded-full after:h-4 after:w-4 after:transition-all dark:border-neutral-600
                      peer-checked:bg-blue-600"
                  ></div>
                </div>
              </label>
            </div>
            <div className="p-2 border-t border-b border-neutral-200 dark:border-neutral-800 flex-none">
              <div className="relative">
                <MagnifyingGlassIcon className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 size-4
                  text-neutral-400" />
                <input
                  ref={searchInputRef}
                  type="text"
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  placeholder="Search models..."
                  className="w-full rounded-lg border border-neutral-200 bg-neutral-50 py-1.5 pl-9 pr-3 text-sm
                    dark:border-neutral-700 dark:bg-neutral-800 focus:outline-none focus:border-blue-500 focus:ring-2
                    focus:ring-blue-500 focus:ring-opacity-50 transition-all"
                />
              </div>
            </div>
            <div
              ref={listRef}
              className="flex-auto max-h-80 overflow-y-auto p-2 space-y-1"
              style={{ scrollbarGutter: "stable" }}
            >
              {filteredAndSortedModels.length > 0 ? (
                filteredAndSortedModels.map((m) => (
                  <Tooltip key={m.id} text={m.description ?? ""}>
                    <button
                      data-selected={m.id === selected?.id}
                      key={m.id}
                      onClick={() => {
                        onChangeAction(m);
                        setOpen(false);
                      }}
                      className="w-full flex items-start justify-between gap-4 px-4 py-2 hover:bg-neutral-100
                        dark:hover:bg-neutral-800 rounded-lg transition-colors duration-300 ease-in-out cursor-pointer
                        text-left"
                    >
                      <div className="flex flex-col min-w-0">
                        <span
                          className="font-medium text-neutral-600 dark:text-neutral-300 transition-colors duration-300
                            ease-in-out truncate"
                        >
                          {m.name}
                        </span>
                        <div
                          className="text-xs text-neutral-500 dark:text-neutral-400 flex items-center gap-2 mt-1
                            transition-colors duration-300 ease-in-out"
                        >
                          <ArrowDownTrayIcon className="size-3 transition-colors duration-300 ease-in-out" />
                          {m.context_length?.toLocaleString()}
                          {m.max_completion_tokens && (
                            <>
                              <ArrowUpTrayIcon className="size-3 transition-colors duration-300 ease-in-out ml-2" />
                              {m.max_completion_tokens.toLocaleString()}
                            </>
                          )}
                        </div>
                      </div>
                      <div className="w-4 h-4 flex-shrink-0 self-center">
                        {m.id === selected?.id && <CheckCircleIcon className="size-4" />}
                      </div>
                    </button>
                  </Tooltip>
                ))
              ) : (
                <div className="px-4 py-8 text-center text-sm text-neutral-500 dark:text-neutral-400">
                  No models found.
                </div>
              )}
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
