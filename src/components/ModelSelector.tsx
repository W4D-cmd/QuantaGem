"use client";

import { useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";
import { Model } from "@google/genai";
import Tooltip from "@/components/Tooltip";
import { ArrowDownTrayIcon, ArrowUpTrayIcon, ChevronDownIcon } from "@heroicons/react/24/outline";
import { CheckCircleIcon } from "@heroicons/react/24/solid";
import { motion, AnimatePresence } from "framer-motion";
import { customModels, ModelProvider, getProviderForModel } from "@/lib/custom-models";

export interface Props {
  models: Model[];
  selected: Model | null;
  onChangeAction: (model: Model) => void;
}

interface ModelWithProvider extends Model {
  provider: ModelProvider;
}

interface GroupedModels {
  gemini: ModelWithProvider[];
  openai: ModelWithProvider[];
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

  const groupedModels = useMemo((): GroupedModels => {
    if (!models || models.length === 0) {
      return { gemini: [], openai: [] };
    }
    const availableModelMap = new Map(models.map((m) => [m.name, m]));
    const modelsWithProvider: ModelWithProvider[] = customModels
      .map((cm) => {
        const model = availableModelMap.get(cm.modelId);
        if (!model) return null;
        return { ...model, provider: cm.provider };
      })
      .filter((m): m is ModelWithProvider => !!m);

    return {
      gemini: modelsWithProvider.filter((m) => m.provider === "gemini"),
      openai: modelsWithProvider.filter((m) => m.provider === "openai"),
    };
  }, [models]);

  const selectedProvider = selected?.name ? getProviderForModel(selected.name) : undefined;

  const renderModelButton = (m: ModelWithProvider) => (
    <Tooltip key={m.name} text={m.description ?? ""}>
      <button
        data-selected={m.name === selected?.name}
        onClick={() => {
          onChangeAction(m);
          setOpen(false);
        }}
        className="w-full flex items-start justify-between gap-4 px-4 py-2 hover:bg-neutral-100
          dark:hover:bg-neutral-800 rounded-lg transition-colors duration-300 ease-in-out cursor-pointer"
      >
        <div className="flex flex-col text-left">
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
            {m.inputTokenLimit?.toLocaleString()}
            <ArrowUpTrayIcon className="size-3 transition-colors duration-300 ease-in-out" />
            {m.outputTokenLimit?.toLocaleString()}
          </div>
        </div>
        <div className="w-4 h-4 flex-shrink-0 self-center">
          {m.name === selected?.name && <CheckCircleIcon className="size-4" />}
        </div>
      </button>
    </Tooltip>
  );

  const providerLabel = selectedProvider === "openai" ? "OpenAI" : "Google";

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
          <span className="flex items-center gap-2">
            <span
              className={`text-xs px-1.5 py-0.5 rounded font-medium ${
                selectedProvider === "openai"
                  ? "bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-400"
                  : "bg-blue-100 text-blue-700 dark:bg-blue-900/30 dark:text-blue-400"
              }`}
            >
              {providerLabel}
            </span>
            {selected.displayName}
          </span>
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
              <span className="font-semibold text-sm">Model</span>
            </div>
            <div ref={listRef} className="flex-auto h-96 overflow-y-auto p-2 space-y-1">
              {groupedModels.gemini.length > 0 && (
                <>
                  <div className="px-4 py-1.5 text-xs font-semibold text-blue-600 dark:text-blue-400 uppercase tracking-wider flex items-center gap-2">
                    <span className="w-2 h-2 rounded-full bg-blue-500" />
                    Google Gemini
                  </div>
                  {groupedModels.gemini.map(renderModelButton)}
                </>
              )}
              {groupedModels.openai.length > 0 && (
                <>
                  <div className="px-4 py-1.5 mt-2 text-xs font-semibold text-green-600 dark:text-green-400 uppercase tracking-wider flex items-center gap-2">
                    <span className="w-2 h-2 rounded-full bg-green-500" />
                    OpenAI
                  </div>
                  {groupedModels.openai.map(renderModelButton)}
                </>
              )}
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
