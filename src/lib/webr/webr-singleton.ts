// WebR Singleton Manager
// Manages a single WebR instance across the application with lazy initialization

import type { WebRInstance, WebRState } from "@/types/webr";

type ProgressCallback = (state: WebRState) => void;

class WebRSingleton {
  private instance: WebRInstance | null = null;
  private initPromise: Promise<WebRInstance> | null = null;
  private installedPackages: Set<string> = new Set();
  private progressCallbacks: Set<ProgressCallback> = new Set();
  private currentState: WebRState = {
    status: "idle",
    progress: 0,
    progressMessage: "",
    error: null,
  };

  addProgressCallback(callback: ProgressCallback): () => void {
    this.progressCallbacks.add(callback);
    // Immediately call with current state
    callback(this.currentState);
    return () => {
      this.progressCallbacks.delete(callback);
    };
  }

  private updateState(update: Partial<WebRState>): void {
    this.currentState = { ...this.currentState, ...update };
    this.progressCallbacks.forEach((cb) => cb(this.currentState));
  }

  async getInstance(): Promise<WebRInstance> {
    if (this.instance) {
      return this.instance;
    }

    if (this.initPromise) {
      return this.initPromise;
    }

    this.initPromise = this.initialize();
    return this.initPromise;
  }

  private async initialize(): Promise<WebRInstance> {
    try {
      this.updateState({
        status: "initializing",
        progress: 5,
        progressMessage: "Loading WebR runtime...",
        error: null,
      });

      // Dynamically import WebR from CDN
      // @ts-expect-error - WebR is loaded from CDN, types are declared in webr.d.ts
      const { WebR } = await import(/* webpackIgnore: true */ "https://webr.r-wasm.org/latest/webr.mjs");

      this.updateState({
        progress: 20,
        progressMessage: "Initializing R environment...",
      });

      const webR = new WebR();
      await webR.init();

      this.updateState({
        progress: 50,
        progressMessage: "Installing svglite package...",
      });

      // Always install svglite for SVG output
      await webR.installPackages(["svglite"], { quiet: true });
      this.installedPackages.add("svglite");

      this.updateState({
        status: "ready",
        progress: 100,
        progressMessage: "R environment ready",
      });

      this.instance = webR;
      return webR;
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : "Failed to initialize WebR";
      this.updateState({
        status: "error",
        progress: 0,
        progressMessage: "",
        error: errorMessage,
      });
      this.initPromise = null;
      throw error;
    }
  }

  async installPackage(packageName: string, onProgress?: (message: string) => void): Promise<void> {
    if (this.installedPackages.has(packageName)) {
      return;
    }

    const instance = await this.getInstance();

    onProgress?.(`Installing ${packageName}...`);
    this.updateState({
      progressMessage: `Installing ${packageName}...`,
    });

    try {
      await instance.installPackages([packageName], { quiet: true });
      this.installedPackages.add(packageName);
    } catch (error) {
      throw new Error(`Failed to install package: ${packageName}`);
    }
  }

  isPackageInstalled(packageName: string): boolean {
    return this.installedPackages.has(packageName);
  }

  getState(): WebRState {
    return this.currentState;
  }

  isReady(): boolean {
    return this.currentState.status === "ready";
  }

  // Reset the singleton (useful for testing or error recovery)
  reset(): void {
    if (this.instance) {
      try {
        this.instance.destroy();
      } catch {
        // Ignore destroy errors
      }
    }
    this.instance = null;
    this.initPromise = null;
    this.installedPackages.clear();
    this.updateState({
      status: "idle",
      progress: 0,
      progressMessage: "",
      error: null,
    });
  }
}

// Export singleton instance
export const webRSingleton = new WebRSingleton();
