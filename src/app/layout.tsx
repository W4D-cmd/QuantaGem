import type { Metadata } from "next";
import { Roboto } from "next/font/google";
import "./globals.css";
import React from "react";
import "highlight.js/styles/atom-one-light.css";

const roboto = Roboto({
  subsets: ["latin"],
  weight: ["100", "300", "400", "500", "700", "900"],
  style: ["normal", "italic"],
  display: "swap",
  variable: "--font-roboto",
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
    <html lang="en" className={`${roboto.variable}`}>
      <body className={`antialiased`}>{children}</body>
    </html>
  );
}
