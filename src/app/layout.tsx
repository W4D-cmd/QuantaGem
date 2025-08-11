import type { Metadata } from "next";
import "./globals.css";
import React from "react";
import { ThemeProvider } from "@/components/ThemeProvider";

export const metadata: Metadata = {
  title: "QuantaGem",
  description: "WebUI for Google Gemini API",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en">
      <body
        className={`antialiased bg-white dark:bg-neutral-950 text-black dark:text-white transition-colors duration-300
          ease-in-out`}
      >
        <ThemeProvider>{children}</ThemeProvider>
      </body>
    </html>
  );
}
