// WebR Executor
// Handles R code execution with SVG output capture

import { webRSingleton } from "./webr-singleton";
import type { ExecutionResult } from "@/types/webr";

const EXECUTION_TIMEOUT = 300000;

// Generate unique output path to prevent race conditions with concurrent executions
function generateUniqueOutputPath(): string {
  const uniqueId = typeof crypto !== 'undefined' && crypto.randomUUID
    ? crypto.randomUUID()
    : `${Date.now()}-${Math.random().toString(36).substring(2, 11)}`;
  return `/tmp/output-${uniqueId}.svg`;
}

// Detect packages that need to be installed based on code content
function detectRequiredPackages(code: string): string[] {
  const packages: string[] = [];

  // Check for ggplot2 usage
  if (/\b(ggplot|geom_|aes\(|theme_|scale_|facet_|labs\()\b/.test(code)) {
    packages.push("ggplot2");
  }

  // Check for tidyverse packages
  if (/\b(dplyr|tidyr|purrr|tibble|readr|stringr)\b/.test(code)) {
    const tidyversePackages = ["dplyr", "tidyr", "purrr", "tibble", "readr", "stringr"];
    for (const pkg of tidyversePackages) {
      if (new RegExp(`\\b${pkg}\\b`).test(code)) {
        packages.push(pkg);
      }
    }
  }

  // Check for explicit library() or require() calls
  const libraryMatches = code.matchAll(/(?:library|require)\s*\(\s*["']?(\w+)["']?\s*\)/g);
  for (const match of libraryMatches) {
    const pkg = match[1];
    if (!packages.includes(pkg) && pkg !== "svglite") {
      packages.push(pkg);
    }
  }

  return packages;
}

export interface ExecuteRCodeOptions {
  onProgress?: (message: string) => void;
}

export async function executeRCode(code: string, options: ExecuteRCodeOptions = {}): Promise<ExecutionResult> {
  const { onProgress } = options;

  try {
    // Get WebR instance (initializes if needed)
    onProgress?.("Initializing R environment...");
    const webR = await webRSingleton.getInstance();

    // Detect and install required packages
    const requiredPackages = detectRequiredPackages(code);
    for (const pkg of requiredPackages) {
      if (!webRSingleton.isPackageInstalled(pkg)) {
        onProgress?.(`Installing ${pkg}...`);
        await webRSingleton.installPackage(pkg, onProgress);
      }
    }

    // Execute code with timeout
    onProgress?.("Executing R code...");
    const result = await executeWithTimeout(webR, code, EXECUTION_TIMEOUT);
    return result;
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : "Unknown error occurred";
    return {
      success: false,
      error: errorMessage,
      hasGraphicalOutput: false,
    };
  }
}

async function executeWithTimeout(
  webR: Awaited<ReturnType<typeof webRSingleton.getInstance>>,
  code: string,
  timeout: number,
): Promise<ExecutionResult> {
  return new Promise((resolve, reject) => {
    const timeoutId = setTimeout(() => {
      reject(new Error("Execution timed out. Try simplifying your code."));
    }, timeout);

    executeCode(webR, code)
      .then(resolve)
      .catch(reject)
      .finally(() => clearTimeout(timeoutId));
  });
}

async function executeCode(
  webR: Awaited<ReturnType<typeof webRSingleton.getInstance>>,
  code: string,
): Promise<ExecutionResult> {
  // Generate unique output path for this execution
  const outputPath = generateUniqueOutputPath();

  // Wrap code to capture SVG output
  const wrappedCode = `
    # Set up SVG output
    library(svglite)
    svglite("${outputPath}", width = 8, height = 6)

    # Capture any errors
    tryCatch({
      ${code}
    }, error = function(e) {
      message(paste("Error:", e$message))
    })

    # Close device and check if output was created
    dev.off()
  `;

  try {
    // Execute the R code
    await webR.evalRVoid(wrappedCode);

    // Try to read the SVG output
    try {
      const svgContent = await webR.FS.readFile(outputPath, { encoding: "utf8" });
      const svgString = typeof svgContent === "string" ? svgContent : new TextDecoder().decode(svgContent);

      // Check if SVG has actual content (more than just the empty SVG skeleton)
      const hasContent = svgString.includes("<path") || svgString.includes("<polygon") ||
                        svgString.includes("<circle") || svgString.includes("<rect") ||
                        svgString.includes("<line") || svgString.includes("<text") ||
                        svgString.includes("<polyline");

      // Clean up the temp file
      try {
        await webR.FS.unlink(outputPath);
      } catch {
        // Ignore cleanup errors
      }

      if (hasContent) {
        return {
          success: true,
          svg: svgString,
          hasGraphicalOutput: true,
        };
      } else {
        return {
          success: true,
          hasGraphicalOutput: false,
          error: "Code executed but produced no graphical output. Use plot(), ggplot(), or similar.",
        };
      }
    } catch {
      // No SVG file was created
      return {
        success: true,
        hasGraphicalOutput: false,
        error: "Code executed but produced no graphical output. Use plot(), ggplot(), or similar.",
      };
    }
  } catch (error) {
    // R execution error
    const errorMessage = error instanceof Error ? error.message : String(error);

    // Try to extract R-specific error message
    const rErrorMatch = errorMessage.match(/Error.*?:\s*(.+)/);
    const cleanError = rErrorMatch ? rErrorMatch[1] : errorMessage;

    return {
      success: false,
      error: cleanError,
      hasGraphicalOutput: false,
    };
  }
}
