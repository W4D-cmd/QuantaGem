// Type declarations for WebR
// WebR is loaded dynamically from CDN, so we declare the types here

declare module "https://webr.r-wasm.org/latest/webr.mjs" {
  export class WebR {
    init(): Promise<void>;
    evalR(code: string): Promise<RObject>;
    evalRVoid(code: string): Promise<void>;
    installPackages(packages: string[], options?: { quiet?: boolean }): Promise<void>;
    FS: {
      readFile(path: string, options?: { encoding?: string }): Promise<string | Uint8Array>;
      writeFile(path: string, data: string | Uint8Array): Promise<void>;
      unlink(path: string): Promise<void>;
      mkdir(path: string): Promise<void>;
    };
    destroy(): void;
  }

  export interface RObject {
    type: string;
    toJs(): Promise<unknown>;
    toArray(): Promise<unknown[]>;
    toString(): Promise<string>;
  }

  export default WebR;
}

// Internal types for our WebR integration
export interface WebRInstance {
  evalR(code: string): Promise<RObject>;
  evalRVoid(code: string): Promise<void>;
  installPackages(packages: string[], options?: { quiet?: boolean }): Promise<void>;
  FS: {
    readFile(path: string, options?: { encoding?: string }): Promise<string | Uint8Array>;
    writeFile(path: string, data: string | Uint8Array): Promise<void>;
    unlink(path: string): Promise<void>;
    mkdir(path: string): Promise<void>;
  };
  destroy(): void;
}

export interface RObject {
  type: string;
  toJs(): Promise<unknown>;
  toArray(): Promise<unknown[]>;
  toString(): Promise<string>;
}

export type WebRStatus = "idle" | "initializing" | "ready" | "error";

export interface WebRState {
  status: WebRStatus;
  progress: number;
  progressMessage: string;
  error: string | null;
}

export interface ExecutionResult {
  success: boolean;
  svg?: string;
  error?: string;
  hasGraphicalOutput: boolean;
}
