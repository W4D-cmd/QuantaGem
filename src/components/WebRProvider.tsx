"use client";

import React, { createContext, useContext, useEffect, useState, useCallback, useMemo } from "react";
import { webRSingleton } from "@/lib/webr/webr-singleton";
import type { WebRState } from "@/types/webr";

interface WebRContextValue {
  state: WebRState;
  initialize: () => Promise<void>;
  isReady: boolean;
  isInitializing: boolean;
}

const WebRContext = createContext<WebRContextValue | null>(null);

export function WebRProvider({ children }: { children: React.ReactNode }) {
  const [state, setState] = useState<WebRState>({
    status: "idle",
    progress: 0,
    progressMessage: "",
    error: null,
  });

  useEffect(() => {
    // Subscribe to progress updates from the singleton
    const unsubscribe = webRSingleton.addProgressCallback(setState);
    return unsubscribe;
  }, []);

  const initialize = useCallback(async () => {
    try {
      await webRSingleton.getInstance();
    } catch (error) {
      // Error state is already handled by the singleton
      console.error("WebR initialization failed:", error);
    }
  }, []);

  const value = useMemo(
    () => ({
      state,
      initialize,
      isReady: state.status === "ready",
      isInitializing: state.status === "initializing",
    }),
    [state, initialize],
  );

  return <WebRContext.Provider value={value}>{children}</WebRContext.Provider>;
}

export function useWebRContext(): WebRContextValue {
  const context = useContext(WebRContext);
  if (!context) {
    throw new Error("useWebRContext must be used within a WebRProvider");
  }
  return context;
}
