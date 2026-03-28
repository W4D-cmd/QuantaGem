"use client";

import React, { useState, useEffect } from "react";
import Modal from "./Modal";
import { GenerationParameters } from "@/lib/generation-styles";

interface CustomStyleModalProps {
  isOpen: boolean;
  onClose: () => void;
  onSave: (params: GenerationParameters) => void;
  initialParams: GenerationParameters;
}

export default function CustomStyleModal({
  isOpen,
  onClose,
  onSave,
  initialParams,
}: CustomStyleModalProps) {
  const [temperature, setTemperature] = useState<number>(initialParams.temperature ?? 1.0);
  const [topP, setTopP] = useState<number>(initialParams.topP ?? 0.95);
  const [topK, setTopK] = useState<number>(initialParams.topK ?? 40);
  const [isArbitrary, setIsArbitrary] = useState<boolean>(false);

  useEffect(() => {
    if (isOpen) {
      setTemperature(initialParams.temperature ?? 1.0);
      setTopP(initialParams.topP ?? 0.95);
      setTopK(initialParams.topK ?? 40);
    }
  }, [isOpen, initialParams]);

  const handleSave = () => {
    onSave({
      temperature,
      topP,
      topK,
    });
    onClose();
  };

  return (
    <Modal isOpen={isOpen} onClose={onClose} title="Custom Sampling Parameters" size="md">
      <div className="space-y-6">
        <div className="flex items-center justify-between">
          <label className="text-sm font-medium text-neutral-700 dark:text-zinc-300">
            Allow Really Arbitrary Values
          </label>
          <button
            onClick={() => setIsArbitrary(!isArbitrary)}
            className={`relative inline-flex h-6 w-11 items-center rounded-full transition-colors focus:outline-none ${
              isArbitrary ? "bg-blue-600" : "bg-neutral-200 dark:bg-zinc-800"
            }`}
          >
            <span
              className={`inline-block h-4 w-4 transform rounded-full bg-white transition-transform ${
                isArbitrary ? "translate-x-6" : "translate-x-1"
              }`}
            />
          </button>
        </div>

        {/* Temperature */}
        <div className="space-y-3">
          <div className="flex items-center justify-between">
            <label className="text-sm font-semibold text-neutral-900 dark:text-zinc-100">
              Temperature
            </label>
            <input
              type="number"
              step="0.01"
              value={temperature}
              onChange={(e) => setTemperature(parseFloat(e.target.value) || 0)}
              className="w-20 px-2 py-1 text-sm bg-neutral-100 dark:bg-zinc-800 border border-neutral-200 dark:border-zinc-700 rounded text-right focus:outline-none focus:ring-1 focus:ring-blue-500"
            />
          </div>
          <p className="text-xs text-neutral-500 dark:text-zinc-400">
            Higher values make the output more random, while lower values make it more focused and deterministic.
          </p>
          {!isArbitrary && (
            <input
              type="range"
              min="0"
              max="2"
              step="0.1"
              value={temperature}
              onChange={(e) => setTemperature(parseFloat(e.target.value))}
              className="w-full h-1.5 bg-neutral-200 dark:bg-zinc-800 rounded-lg appearance-none cursor-pointer accent-blue-600"
            />
          )}
        </div>

        {/* Top-P */}
        <div className="space-y-3">
          <div className="flex items-center justify-between">
            <label className="text-sm font-semibold text-neutral-900 dark:text-zinc-100">
              Top-P
            </label>
            <input
              type="number"
              step="0.01"
              value={topP}
              onChange={(e) => setTopP(parseFloat(e.target.value) || 0)}
              className="w-20 px-2 py-1 text-sm bg-neutral-100 dark:bg-zinc-800 border border-neutral-200 dark:border-zinc-700 rounded text-right focus:outline-none focus:ring-1 focus:ring-blue-500"
            />
          </div>
          <p className="text-xs text-neutral-500 dark:text-zinc-400">
            Nucleus sampling: only the smallest set of tokens whose cumulative probability exceeds P are considered.
          </p>
          {!isArbitrary && (
            <input
              type="range"
              min="0"
              max="1"
              step="0.05"
              value={topP}
              onChange={(e) => setTopP(parseFloat(e.target.value))}
              className="w-full h-1.5 bg-neutral-200 dark:bg-zinc-800 rounded-lg appearance-none cursor-pointer accent-blue-600"
            />
          )}
        </div>

        {/* Top-K */}
        <div className="space-y-3">
          <div className="flex items-center justify-between">
            <label className="text-sm font-semibold text-neutral-900 dark:text-zinc-100">
              Top-K
            </label>
            <input
              type="number"
              value={topK}
              onChange={(e) => setTopK(parseInt(e.target.value, 10) || 0)}
              className="w-20 px-2 py-1 text-sm bg-neutral-100 dark:bg-zinc-800 border border-neutral-200 dark:border-zinc-700 rounded text-right focus:outline-none focus:ring-1 focus:ring-blue-500"
            />
          </div>
          <p className="text-xs text-neutral-500 dark:text-zinc-400">
            Sample from the best K tokens. Reduces the probability of low-ranked tokens being selected.
          </p>
          {!isArbitrary && (
            <input
              type="range"
              min="1"
              max="100"
              step="1"
              value={topK}
              onChange={(e) => setTopK(parseInt(e.target.value, 10))}
              className="w-full h-1.5 bg-neutral-200 dark:bg-zinc-800 rounded-lg appearance-none cursor-pointer accent-blue-600"
            />
          )}
        </div>

        <div className="pt-4 flex justify-end gap-3">
          <button
            onClick={onClose}
            className="px-4 py-2 text-sm font-medium text-neutral-600 dark:text-zinc-400 hover:bg-neutral-100 dark:hover:bg-zinc-800 rounded-lg transition-colors"
          >
            Cancel
          </button>
          <button
            onClick={handleSave}
            className="px-4 py-2 text-sm font-medium text-white bg-blue-600 hover:bg-blue-700 rounded-lg transition-colors shadow-sm"
          >
            Save Changes
          </button>
        </div>
      </div>
    </Modal>
  );
}
