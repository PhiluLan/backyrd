import type { Metadata } from "next";
import { PlacesExperience } from "@/components/consumer/places-experience";

export const metadata: Metadata = {
  title: "Orte",
  description: "Basels Orte als Liste und auf der Karte entdecken.",
  alternates: { canonical: "/places" },
};
export default function PlacesPage() {
  return <PlacesExperience />;
}
