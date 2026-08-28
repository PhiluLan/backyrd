import type { Metadata } from "next";
import { HomeExperience } from "@/components/consumer/home-experience";

export const metadata: Metadata = {
  title: { absolute: "Entdecken · Backyrd" },
  description:
    "Entdecke Basel nach Gefühl – mit Decision, Orten und echten Momenten.",
  alternates: { canonical: "/" },
};

export default function HomePage() {
  return <HomeExperience />;
}
