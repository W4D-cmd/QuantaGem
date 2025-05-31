"use client";

import { useEffect } from "react";
import { useTheme } from "@/components/ThemeProvider";

export function HighlightJsThemeLoader() {
  const { resolvedTheme } = useTheme();

  useEffect(() => {
    const existingLink = document.getElementById("highlight-theme");
    if (existingLink) {
      existingLink.remove();
    }

    const link = document.createElement("link");
    link.id = "highlight-theme";
    link.rel = "stylesheet";

    if (resolvedTheme === "dark") {
      link.href = "/highlightjs-themes/atom-one-dark.css";
    } else {
      link.href = "/highlightjs-themes/atom-one-light.css";
    }
    document.head.appendChild(link);

    return () => {
      const currentLink = document.getElementById("highlight-theme");
      if (currentLink) {
        currentLink.remove();
      }
    };
  }, [resolvedTheme]);

  return null;
}
