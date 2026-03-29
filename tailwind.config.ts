import type { Config } from "tailwindcss";

const config: Config = {
  content: ["./src/app/**/*.{ts,tsx}", "./src/components/**/*.{ts,tsx}"],
  darkMode: "class",
  theme: {
    extend: {
      fontFamily: {
        sans: ["var(--font-sans)", "var(--font-symbols)", "var(--font-emoji)", "sans-serif"],
        mono: ["var(--font-mono)", "var(--font-symbols)", "var(--font-emoji)", "monospace"],
      },
    },
  },
};

export default config;
