"use client";

import React, { useEffect, useState, useCallback, useRef } from "react";
import { useWebR } from "@/hooks/useWebR";
import { RCodeBlockControls, ViewMode } from "./RCodeBlockControls";
import { RCodeBlockSVGView } from "./RCodeBlockSVGView";
import { RCodeBlockLoading } from "./RCodeBlockLoading";
import { downloadSVG, downloadPNG, downloadPDF } from "@/lib/webr/svg-utils";
import { ExclamationTriangleIcon, ArrowPathIcon } from "@heroicons/react/24/outline";

interface RCodeBlockProps {
  code: string;
  className?: string;
  chatAreaContainerRef?: React.RefObject<HTMLDivElement | null>;
}

export const RCodeBlock: React.FC<RCodeBlockProps> = ({ code, className }) => {
  const { execute, result, status, progressMessage, webRState, reset } = useWebR();
  const [view, setView] = useState<ViewMode>("output");
  const hasExecutedRef = useRef(false);
  const codeRef = useRef(code);

  // Auto-execute on first render only
  useEffect(() => {
    if (!hasExecutedRef.current) {
      hasExecutedRef.current = true;
      codeRef.current = code;
      execute(code);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [execute]); // With stable execute callback, this runs once on mount

  const handleRerun = useCallback(() => {
    reset();
    execute(code);
  }, [code, execute, reset]);

  const handleCopyCode = useCallback(() => {
    navigator.clipboard.writeText(code);
  }, [code]);

  const handleDownloadSVG = useCallback(() => {
    if (result?.svg) {
      downloadSVG(result.svg);
    }
  }, [result?.svg]);

  const handleDownloadPNG = useCallback(async () => {
    if (result?.svg) {
      try {
        await downloadPNG(result.svg);
      } catch (error) {
        console.error("PNG download failed:", error);
      }
    }
  }, [result?.svg]);

  const handleDownloadPDF = useCallback(async () => {
    if (result?.svg) {
      try {
        await downloadPDF(result.svg);
      } catch (error) {
        console.error("PDF download failed:", error);
      }
    }
  }, [result?.svg]);

  const isLoading = status === "initializing" || status === "executing";
  const hasOutput = result?.hasGraphicalOutput === true && result?.svg !== undefined;
  const hasError = status === "error" || (result?.success === false) || (result?.success === true && !result?.hasGraphicalOutput);

  // Calculate progress for loading state
  const progress = status === "initializing" ? webRState.progress : status === "executing" ? 80 : 0;
  const loadingMessage = progressMessage || webRState.progressMessage || "Processing...";

  return (
    <div
      className={`rounded-xl overflow-hidden border border-neutral-400/30 dark:border-zinc-600/30 ${className || ""}`}
    >
      <RCodeBlockControls
        view={view}
        onViewChange={setView}
        onRerun={handleRerun}
        onCopyCode={handleCopyCode}
        onDownloadSVG={handleDownloadSVG}
        onDownloadPNG={handleDownloadPNG}
        onDownloadPDF={handleDownloadPDF}
        hasOutput={hasOutput}
        isExecuting={isLoading}
      />

      <div className="bg-neutral-100 dark:bg-zinc-900">
        {/* Loading State */}
        {isLoading && <RCodeBlockLoading progress={progress} message={loadingMessage} />}

        {/* Error State */}
        {!isLoading && hasError && (
          <div
            className="p-4 bg-red-50 dark:bg-red-900/20 border-l-4 border-red-500 dark:border-red-400"
          >
            <div className="flex items-start gap-2">
              <ExclamationTriangleIcon className="size-5 text-red-500 dark:text-red-400 flex-shrink-0 mt-0.5" />
              <div className="flex-1">
                <p className="font-medium text-red-800 dark:text-red-200">
                  {result?.error ? "Execution Error" : "No Output"}
                </p>
                <p className="text-sm text-red-700 dark:text-red-300 mt-1">
                  {result?.error || "Code executed but produced no graphical output. Use plot(), ggplot(), or similar."}
                </p>
              </div>
              <button
                onClick={handleRerun}
                className="cursor-pointer flex items-center gap-1 px-3 py-1.5 text-sm font-medium text-red-700
                  dark:text-red-300 bg-red-100 dark:bg-red-800/30 rounded-lg hover:bg-red-200
                  dark:hover:bg-red-800/50 transition-colors"
              >
                <ArrowPathIcon className="size-4" />
                Retry
              </button>
            </div>
          </div>
        )}

        {/* Output View */}
        {!isLoading && !hasError && view === "output" && hasOutput && (
          <div className="p-4">
            <RCodeBlockSVGView svg={result!.svg!} />
          </div>
        )}

        {/* Code View */}
        {!isLoading && view === "code" && (
          <pre className="overflow-x-auto p-4 text-sm font-mono">
            <code className="language-r">{code}</code>
          </pre>
        )}
      </div>
    </div>
  );
};
