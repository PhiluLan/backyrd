import type { Metadata } from "next";
import { Suspense } from "react";
import { DecisionExperience } from "@/components/consumer/decision-experience";

export const metadata: Metadata = {
  title: "Für jetzt",
  description:
    "Beschreibe deinen Moment. Backyrd findet den Ort, der jetzt passt.",
  alternates: { canonical: "/decision" },
};
export default function DecisionPage() {
  return (
    <Suspense
      fallback={
        <div className="b-container b-main">
          <div
            className="b-skeleton"
            style={{ height: 640, borderRadius: 30 }}
          />
        </div>
      }
    >
      <DecisionExperience />
    </Suspense>
  );
}
