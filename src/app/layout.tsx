import type { Metadata } from "next";
import "./globals.css";
import React from "react";
import { ThemeProvider } from "@/components/ThemeProvider";
import { WebRProvider } from "@/components/WebRProvider";
import localFont from "next/font/local";

const roboto = localFont({
  src: [
    { path: "../../public/fonts/Roboto-Thin.ttf", weight: "100", style: "normal" },
    { path: "../../public/fonts/Roboto-ThinItalic.ttf", weight: "100", style: "italic" },
    { path: "../../public/fonts/Roboto-ExtraLight.ttf", weight: "200", style: "normal" },
    { path: "../../public/fonts/Roboto-ExtraLightItalic.ttf", weight: "200", style: "italic" },
    { path: "../../public/fonts/Roboto-Light.ttf", weight: "300", style: "normal" },
    { path: "../../public/fonts/Roboto-LightItalic.ttf", weight: "300", style: "italic" },
    { path: "../../public/fonts/Roboto-Regular.ttf", weight: "400", style: "normal" },
    { path: "../../public/fonts/Roboto-Italic.ttf", weight: "400", style: "italic" },
    { path: "../../public/fonts/Roboto-Medium.ttf", weight: "500", style: "normal" },
    { path: "../../public/fonts/Roboto-MediumItalic.ttf", weight: "500", style: "italic" },
    { path: "../../public/fonts/Roboto-SemiBold.ttf", weight: "600", style: "normal" },
    { path: "../../public/fonts/Roboto-SemiBoldItalic.ttf", weight: "600", style: "italic" },
    { path: "../../public/fonts/Roboto-Bold.ttf", weight: "700", style: "normal" },
    { path: "../../public/fonts/Roboto-BoldItalic.ttf", weight: "700", style: "italic" },
    { path: "../../public/fonts/Roboto-ExtraBold.ttf", weight: "800", style: "normal" },
    { path: "../../public/fonts/Roboto-ExtraBoldItalic.ttf", weight: "800", style: "italic" },
    { path: "../../public/fonts/Roboto-Black.ttf", weight: "900", style: "normal" },
    { path: "../../public/fonts/Roboto-BlackItalic.ttf", weight: "900", style: "italic" },
  ],
  display: "swap",
  variable: "--font-sans",
});

const jetbrainsMono = localFont({
  src: [
    { path: "../../public/fonts/JetBrainsMonoNerdFont-Thin.ttf", weight: "100", style: "normal" },
    { path: "../../public/fonts/JetBrainsMonoNerdFont-ThinItalic.ttf", weight: "100", style: "italic" },
    { path: "../../public/fonts/JetBrainsMonoNerdFont-ExtraLight.ttf", weight: "200", style: "normal" },
    { path: "../../public/fonts/JetBrainsMonoNerdFont-ExtraLightItalic.ttf", weight: "200", style: "italic" },
    { path: "../../public/fonts/JetBrainsMonoNerdFont-Light.ttf", weight: "300", style: "normal" },
    { path: "../../public/fonts/JetBrainsMonoNerdFont-LightItalic.ttf", weight: "300", style: "italic" },
    { path: "../../public/fonts/JetBrainsMonoNerdFont-Regular.ttf", weight: "400", style: "normal" },
    { path: "../../public/fonts/JetBrainsMonoNerdFont-Italic.ttf", weight: "400", style: "italic" },
    { path: "../../public/fonts/JetBrainsMonoNerdFont-Medium.ttf", weight: "500", style: "normal" },
    { path: "../../public/fonts/JetBrainsMonoNerdFont-MediumItalic.ttf", weight: "500", style: "italic" },
    { path: "../../public/fonts/JetBrainsMonoNerdFont-SemiBold.ttf", weight: "600", style: "normal" },
    { path: "../../public/fonts/JetBrainsMonoNerdFont-SemiBoldItalic.ttf", weight: "600", style: "italic" },
    { path: "../../public/fonts/JetBrainsMonoNerdFont-Bold.ttf", weight: "700", style: "normal" },
    { path: "../../public/fonts/JetBrainsMonoNerdFont-BoldItalic.ttf", weight: "700", style: "italic" },
    { path: "../../public/fonts/JetBrainsMonoNerdFont-ExtraBold.ttf", weight: "800", style: "normal" },
    { path: "../../public/fonts/JetBrainsMonoNerdFont-ExtraBoldItalic.ttf", weight: "800", style: "italic" },
  ],
  display: "swap",
  variable: "--font-mono",
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
    <html lang="en" className={`${roboto.variable} ${jetbrainsMono.variable}`}>
      <body
        className={`antialiased bg-white dark:bg-zinc-800 text-black dark:text-zinc-100 transition-colors duration-300
          ease-in-out`}
      >
        <ThemeProvider>
          <WebRProvider>{children}</WebRProvider>
        </ThemeProvider>
      </body>
    </html>
  );
}
