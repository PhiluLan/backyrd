import type { Metadata } from "next";
import { DM_Serif_Display, Geist, Libre_Franklin } from "next/font/google";
import "./globals.css";
import "./owner-intelligence.css";
import "./landing-logo-moments.css";
import "./consumer.css";
import { ConsumerShell } from "@/components/consumer/consumer-shell";

const libreFranklin = Libre_Franklin({
  variable: "--font-libre-franklin",
  subsets: ["latin"],
  display: "swap",
});
const dmSerif = DM_Serif_Display({
  variable: "--font-dm-serif",
  subsets: ["latin"],
  weight: "400",
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
      className={`${libreFranklin.variable} ${dmSerif.variable} ${geist.variable} h-full antialiased`}
    >
      <body className="min-h-full flex flex-col">
        <ConsumerShell>{children}</ConsumerShell>
      </body>
    </html>
  );
}
