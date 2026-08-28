import type { Metadata } from "next";
import { Geist, Inter } from "next/font/google";
import "./globals.css";
import "./owner-intelligence.css";
import "./landing-logo-moments.css";
import "./consumer.css";
import { ConsumerShell } from "@/components/consumer/consumer-shell";

const inter = Inter({
  variable: "--font-inter",
  subsets: ["latin"],
  display: "swap",
});
const geist = Geist({
  variable: "--font-geist-sans",
  subsets: ["latin"],
  display: "swap",
});

export const metadata: Metadata = {
  metadataBase: new URL(
    process.env.NEXT_PUBLIC_SITE_URL || "https://www.backyrd.ch",
  ),
  title: {
    default: "Backyrd – Orte nach Gefühl",
    template: "%s · Backyrd",
  },
  description:
    "Finde Restaurants, Bars, Cafés und Erlebnisse danach, wie sie sich anfühlen – nicht nur nach Sternen.",
  openGraph: {
    type: "website",
    locale: "de_CH",
    siteName: "Backyrd",
    title: "Backyrd – Orte nach Gefühl",
    description:
      "Finde Restaurants, Bars, Cafés und Erlebnisse danach, wie sie sich anfühlen – nicht nur nach Sternen.",
  },
  twitter: { card: "summary_large_image" },
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html
      lang="de"
      className={`${inter.variable} ${geist.variable} h-full antialiased`}
    >
      <body className="min-h-full flex flex-col">
        <ConsumerShell>{children}</ConsumerShell>
      </body>
    </html>
  );
}
