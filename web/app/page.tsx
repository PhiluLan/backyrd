import type { Metadata } from "next";
import { LandingExperience } from "./landing-experience";

export const metadata: Metadata = {
  title: "Backyrd – Orte nach Gefühl",
  description: "Finde Restaurants, Bars, Cafés und Erlebnisse danach, wie sie sich anfühlen.",
};

export default function HomePage() {
  return <LandingExperience />;
}
