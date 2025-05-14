"use client";

import { useEffect, useLayoutEffect, useRef, useState } from "react";
import { CheckCircleIcon, ChevronDownIcon } from "@heroicons/react/20/solid";
import {
  ArrowDownTrayIcon,
  ArrowUpTrayIcon,
} from "@heroicons/react/24/outline";
import { Model } from "@google/genai";
import Tooltip from "@/components/Tooltip";

export interface Props {
  models: Model[];
  selected: Model | null;
  onChangeAction: (model: Model) => void;
}

export default function ModelSelector({
  models,
  selected,
  onChangeAction,
}: Props) {
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
        className="inline-flex items-center h-11 px-3 py-2 rounded-lg cursor-pointer hover:bg-gray-100 transition-colors text-[#5d5d5d] text-[18px] font-medium"
        disabled={models.length === 0}
      >
        {selected ? (
          selected.displayName
        ) : (
          <div className="w-4 h-4 border-3 border-gray-300 border-t-[#5d5d5d] rounded-full animate-spin" />
        )}
        <ChevronDownIcon className="h-5 w-5 ml-2 text-gray-400" />
      </button>

      {open && (
        <div className="absolute left-0 top-full mt-2 min-w-md bg-white border border-gray-200 rounded-2xl shadow-lg z-50 overflow-hidden">
          <div className="px-4 py-2 flex items-center justify-between text-gray-500">
            <span>Model</span>
          </div>
          <div
            ref={listRef}
            className="max-h-96 overflow-y-auto p-2 space-y-1"
            style={{ scrollbarGutter: "stable" }}
          >
            {models.map((m) => (
              <Tooltip key={m.name} text={m.description ?? ""}>
                <button
                  data-selected={m.name === selected?.name}
                  key={m.name}
                  onClick={() => {
                    onChangeAction(m);
                    setOpen(false);
                  }}
                  className="w-full flex items-center justify-between px-4 py-2 hover:bg-gray-100 rounded-lg transition-colors cursor-pointer"
                >
                  <div className="flex flex-col">
                    <span className="font-medium text-[#5d5d5d]">
                      {m.displayName}
                    </span>
                    <div className="text-xs text-gray-500 flex items-center gap-2 mt-1">
                      <ArrowDownTrayIcon className="h-3 w-3" />
                      {m.inputTokenLimit}
                      <ArrowUpTrayIcon className="h-3 w-3" />
                      {m.outputTokenLimit}
                    </div>
                  </div>
                  {m.name === selected?.name && (
                    <CheckCircleIcon className="h-4 w-4" />
                  )}
                </button>
              </Tooltip>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
