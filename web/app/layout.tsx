import type { Metadata } from "next";
import { Geist, Geist_Mono } from "next/font/google";
import "./globals.css";
import "./owner-intelligence.css";

const geistSans = Geist({
  variable: "--font-geist-sans",
  subsets: ["latin"],
});

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
});

export const metadata: Metadata = {
  metadataBase: new URL(
    process.env.NEXT_PUBLIC_SITE_URL || "https://www.backyrd.ch"
  ),
  title: {
    default: "Backyrd – Orte nach Gefühl",
    template: "%s · Backyrd",
  },
  description:
    "Finde Restaurants, Bars, Cafés und Erlebnisse danach, wie sie sich anfühlen – nicht nur nach Sternen.",
  applicationName: "Backyrd",
  keywords: [
    "Backyrd",
    "Basel",
    "Restaurants",
    "Bars",
    "Cafés",
    "Erlebnisse",
    "Spot Discovery",
  ],
  openGraph: {
    type: "website",
    locale: "de_CH",
    siteName: "Backyrd",
    title: "Backyrd – Orte nach Gefühl",
    description:
      "Finde nicht irgendeinen Ort. Finde den richtigen.",
    url: "/",
  },
  twitter: {
    card: "summary_large_image",
    title: "Backyrd – Orte nach Gefühl",
    description:
      "Finde nicht irgendeinen Ort. Finde den richtigen.",
  },
  alternates: {
    canonical: "/",
  },
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html
      lang="de"
      className={`${geistSans.variable} ${geistMono.variable} h-full antialiased`}
    >
      <body className="min-h-full flex flex-col">{children}</body>
    </html>
  );
}
