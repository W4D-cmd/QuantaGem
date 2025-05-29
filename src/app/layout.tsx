import type { Metadata } from "next";
import { Roboto, Roboto_Mono } from "next/font/google";
import "./globals.css";
import React from "react";
import "highlight.js/styles/atom-one-light.css";

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
      <body className={`antialiased`}>{children}</body>
    </html>
  );
}
