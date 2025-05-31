import type { Metadata } from "next";
import { Roboto, Roboto_Mono } from "next/font/google";
import "./globals.css";
import React from "react";
import { ThemeProvider } from "@/components/ThemeProvider";
import { HighlightJsThemeLoader } from "@/components/HighlightJsThemeLoader";

const roboto = Roboto({ subsets: ["latin"], variable: "--font-roboto" });

const robotoMono = Roboto_Mono({
  subsets: ["latin"],
  variable: "--font-roboto-mono",
});

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
    <html lang="en" className={`${roboto.variable} ${robotoMono.variable}`}>
      <body
        className={
          "antialiased bg-white dark:bg-neutral-950 text-black dark:text-white transition-colors duration-300 ease-in-out"
        }
      >
        <ThemeProvider>
          <HighlightJsThemeLoader />
          {children}
        </ThemeProvider>
      </body>
    </html>
  );
}
