import type { Metadata } from "next";
import { MomentsExperience } from "@/components/consumer/moments-experience";
export const metadata: Metadata = {
  title: "Momente",
  description: "Was Menschen gerade in Basel erleben.",
  alternates: { canonical: "/moments" },
};
export default function MomentsPage() {
  return <MomentsExperience />;
}
