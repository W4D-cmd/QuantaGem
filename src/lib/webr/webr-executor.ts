// WebR Executor
// Handles R code execution with SVG output capture

import { webRSingleton } from "./webr-singleton";
import type { ExecutionResult } from "@/types/webr";

const EXECUTION_TIMEOUT = 300000;

// Detect packages that need to be installed based on code content
function detectRequiredPackages(code: string): string[] {
  const packages: string[] = [];

  // Check for ggplot2 usage
  if (/\b(ggplot|geom_|aes\(|theme_|scale_|facet_|labs\()\b/.test(code)) {
    packages.push("ggplot2");
  }

  // Check for viridis usage (standalone package or viridis scales like scale_color_viridis_d)
  if (/\b(viridis|scale_\w*viridis\w*)\b/.test(code)) {
    packages.push("viridis");
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
  // Generate unique paths for this execution
  const uniqueId = typeof crypto !== 'undefined' && crypto.randomUUID
    ? crypto.randomUUID()
    : `${Date.now()}-${Math.random().toString(36).substring(2, 11)}`;
  const outputPath = `/tmp/output-${uniqueId}.svg`;
  const codePath = `/tmp/code-${uniqueId}.R`;
  const errorPath = `/tmp/errors-${uniqueId}.txt`;

  // Write user code to a temp file to avoid escaping issues with quotes and special characters
  const encoder = new TextEncoder();
  await webR.FS.writeFile(codePath, encoder.encode(code));

  // Wrap code to capture SVG output with REPL-style evaluation
  // This simulates R's interactive behavior where visible results are auto-printed
  const wrappedCode = `
    # Set up SVG output
    library(svglite)
    svglite("${outputPath}", width = 8, height = 6)

    # Store execution errors for reporting
    .webr_exec_errors <- character(0)

    # Parse and evaluate code expression-by-expression (REPL simulation)
    tryCatch({
      # Parse user code from file (avoids escaping issues)
      .webr_parsed_code <- parse(file = "${codePath}")

      # Iterate over each expression and evaluate with visibility check
      for (.webr_i in seq_along(.webr_parsed_code)) {
        .webr_expr <- .webr_parsed_code[[.webr_i]]

        tryCatch({
          # Evaluate with visibility information
          .webr_result <- withVisible(eval(.webr_expr, envir = globalenv()))

          # If result is visible, print it (triggers ggplot rendering, shows data frames, etc.)
          if (.webr_result$visible) {
            print(.webr_result$value)
          }
        }, error = function(e) {
          # Store error but continue execution for remaining expressions
          .webr_exec_errors <<- c(.webr_exec_errors, paste("Error in expression", .webr_i, ":", e$message))
        })
      }
    }, error = function(e) {
      # Parse-level error (syntax error in user code)
      .webr_exec_errors <<- c(.webr_exec_errors, paste("Parse error:", e$message))
    })

    # Write errors to file for retrieval
    if (length(.webr_exec_errors) > 0) {
      writeLines(.webr_exec_errors, "${errorPath}")
    }

    # Clean up temporary variables from global environment (safely)
    tryCatch({
      .webr_cleanup_vars <- c(".webr_parsed_code", ".webr_i", ".webr_expr", ".webr_result", ".webr_exec_errors", ".webr_err")
      .webr_existing_vars <- .webr_cleanup_vars[.webr_cleanup_vars %in% ls(envir = globalenv())]
      if (length(.webr_existing_vars) > 0) {
        rm(list = .webr_existing_vars, envir = globalenv())
      }
      rm(".webr_cleanup_vars", ".webr_existing_vars", envir = globalenv())
    }, error = function(e) {
      # Ignore cleanup errors
    })

    # Close device (always executed)
    dev.off()
  `;

  // Helper to read file content
  const readFile = async (path: string): Promise<string | null> => {
    try {
      const content = await webR.FS.readFile(path, { encoding: "utf8" });
      const str = typeof content === "string" ? content : new TextDecoder().decode(content);
      return str.trim() || null;
    } catch {
      return null;
    }
  };

  // Helper to clean up temp files
  const cleanup = async () => {
    const filesToClean = [outputPath, codePath, errorPath];
    for (const file of filesToClean) {
      try {
        await webR.FS.unlink(file);
      } catch {
        // Ignore cleanup errors
      }
    }
  };

  try {
    // Execute the R code
    await webR.evalRVoid(wrappedCode);

    // Check for R-level errors
    const rErrors = await readFile(errorPath);

    // Try to read the SVG output
    try {
      const svgContent = await webR.FS.readFile(outputPath, { encoding: "utf8" });
      const svgString = typeof svgContent === "string" ? svgContent : new TextDecoder().decode(svgContent);

      // Check if SVG has actual content (more than just the empty SVG skeleton)
      const hasContent = svgString.includes("<path") || svgString.includes("<polygon") ||
                        svgString.includes("<circle") || svgString.includes("<rect") ||
                        svgString.includes("<line") || svgString.includes("<text") ||
                        svgString.includes("<polyline");

      await cleanup();

      if (hasContent) {
        return {
          success: true,
          svg: svgString,
          hasGraphicalOutput: true,
          // Include any non-fatal errors as warnings
          error: rErrors || undefined,
        };
      } else {
        // No graphical output - report R errors
        const errorMsg = rErrors
          ? rErrors
          : "Code executed but produced no graphical output. Use plot(), ggplot(), or similar.";
        return {
          success: !rErrors,
          hasGraphicalOutput: false,
          error: errorMsg,
        };
      }
    } catch {
      // No SVG file was created
      await cleanup();
      const errorMsg = rErrors
        ? rErrors
        : "Code executed but produced no graphical output. Use plot(), ggplot(), or similar.";
      return {
        success: !rErrors,
        hasGraphicalOutput: false,
        error: errorMsg,
      };
    }
  } catch (error) {
    // R execution error at JavaScript level
    await cleanup();

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
