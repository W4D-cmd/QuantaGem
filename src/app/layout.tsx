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
    { path: "../../public/fonts/JetBrainsMonoNL-Thin.ttf", weight: "100", style: "normal" },
    { path: "../../public/fonts/JetBrainsMonoNL-ThinItalic.ttf", weight: "100", style: "italic" },
    { path: "../../public/fonts/JetBrainsMonoNL-ExtraLight.ttf", weight: "200", style: "normal" },
    { path: "../../public/fonts/JetBrainsMonoNL-ExtraLightItalic.ttf", weight: "200", style: "italic" },
    { path: "../../public/fonts/JetBrainsMonoNL-Light.ttf", weight: "300", style: "normal" },
    { path: "../../public/fonts/JetBrainsMonoNL-LightItalic.ttf", weight: "300", style: "italic" },
    { path: "../../public/fonts/JetBrainsMonoNL-Regular.ttf", weight: "400", style: "normal" },
    { path: "../../public/fonts/JetBrainsMonoNL-Italic.ttf", weight: "400", style: "italic" },
    { path: "../../public/fonts/JetBrainsMonoNL-Medium.ttf", weight: "500", style: "normal" },
    { path: "../../public/fonts/JetBrainsMonoNL-MediumItalic.ttf", weight: "500", style: "italic" },
    { path: "../../public/fonts/JetBrainsMonoNL-SemiBold.ttf", weight: "600", style: "normal" },
    { path: "../../public/fonts/JetBrainsMonoNL-SemiBoldItalic.ttf", weight: "600", style: "italic" },
    { path: "../../public/fonts/JetBrainsMonoNL-Bold.ttf", weight: "700", style: "normal" },
    { path: "../../public/fonts/JetBrainsMonoNL-BoldItalic.ttf", weight: "700", style: "italic" },
    { path: "../../public/fonts/JetBrainsMonoNL-ExtraBold.ttf", weight: "800", style: "normal" },
    { path: "../../public/fonts/JetBrainsMonoNL-ExtraBoldItalic.ttf", weight: "800", style: "italic" },
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
        className={`antialiased bg-white dark:bg-neutral-950 text-black dark:text-white transition-colors duration-300
          ease-in-out`}
      >
        <ThemeProvider>
          <WebRProvider>{children}</WebRProvider>
        </ThemeProvider>
      </body>
    </html>
  );
}
