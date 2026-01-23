"use client";

import { useState, useCallback, useRef, useEffect } from "react";
import { executeRCode } from "@/lib/webr/webr-executor";
import { useWebRContext } from "@/components/WebRProvider";
import type { ExecutionResult } from "@/types/webr";

export type ExecutionStatus = "idle" | "initializing" | "executing" | "success" | "error";

export interface UseWebRResult {
  execute: (code: string) => Promise<ExecutionResult>;
  result: ExecutionResult | null;
  status: ExecutionStatus;
  progressMessage: string;
  webRState: ReturnType<typeof useWebRContext>["state"];
  reset: () => void;
}

export function useWebR(): UseWebRResult {
  const { state: webRState, initialize } = useWebRContext();
  const [result, setResult] = useState<ExecutionResult | null>(null);
  const [status, setStatus] = useState<ExecutionStatus>("idle");
  const [progressMessage, setProgressMessage] = useState("");
  const abortRef = useRef(false);

  // Reset abort flag when component mounts
  useEffect(() => {
    abortRef.current = false;
    return () => {
      abortRef.current = true;
    };
  }, []);

  const execute = useCallback(
    async (code: string): Promise<ExecutionResult> => {
      abortRef.current = false;
      setStatus("initializing");
      setProgressMessage("Initializing R environment...");
      setResult(null);

      try {
        // Always call initialize() - it's idempotent and handles ready state internally
        await initialize();

        if (abortRef.current) {
          return { success: false, error: "Execution cancelled", hasGraphicalOutput: false };
        }

        setStatus("executing");
        setProgressMessage("Executing R code...");

        const executionResult = await executeRCode(code, {
          onProgress: (message) => {
            if (!abortRef.current) {
              setProgressMessage(message);
            }
          },
        });

        if (abortRef.current) {
          return { success: false, error: "Execution cancelled", hasGraphicalOutput: false };
        }

        setResult(executionResult);
        setStatus(executionResult.success && executionResult.hasGraphicalOutput ? "success" : "error");

        return executionResult;
      } catch (error) {
        const errorResult: ExecutionResult = {
          success: false,
          error: error instanceof Error ? error.message : "Unknown error",
          hasGraphicalOutput: false,
        };

        if (!abortRef.current) {
          setResult(errorResult);
          setStatus("error");
        }

        return errorResult;
      }
    },
    [initialize], // Removed webRState.status - initialize() is idempotent
  );

  const reset = useCallback(() => {
    abortRef.current = true;
    setResult(null);
    setStatus("idle");
    setProgressMessage("");
  }, []);

  return {
    execute,
    result,
    status,
    progressMessage,
    webRState,
    reset,
  };
}
