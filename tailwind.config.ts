import type { Config } from "tailwindcss";

const config: Config = {
  content: ["app/**/*.{ts,tsx}", "components/**/*.{ts,tsx}"],
  theme: {
    extend: {
      fontFamily: {
        sans: "var(--font-roboto)",
        mono: "var(--font-mono)",
      },
      typography: ({ theme }) => ({
        DEFAULT: {
          css: {
            table: {
              width: "100%",
              tableLayout: "auto",
              borderCollapse: "collapse",
            },
            "thead th": {
              padding: `${theme("spacing.2")} ${theme("spacing.4")}`,
              borderBottom: `1px solid ${theme("colors.gray.400")}`,
              borderBottomColor: "rgba(156, 163, 175, 1)",
              textAlign: "left",
            },
            "tbody td": {
              padding: `${theme("spacing.2")} ${theme("spacing.4")}`,
              borderBottom: `1px solid rgba(229, 231, 235, 0.2)`,
              textAlign: "left",
            },
          },
        },

        customtext: {
          css: {
            "--tw-prose-body": "#0d0d0d",
          },
        },
      }),
      colors: {
        gray: {
          100: "#f9f9f9",
          200: "#ececec",
          300: "#e3e3e3",
        },
      },
    },
  },

  plugins: [require("@tailwindcss/typography")],
};

export default config;
