"use client";
import { useEffect } from "react";
import { Button } from "@/components/consumer/ui";
export default function GlobalError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  useEffect(() => {
    console.error("Consumer Web render error", error.digest ?? "no-digest");
  }, [error]);
  return (
    <div className="b-narrow b-main">
      <div className="b-state">
        <div className="b-state-inner">
          <h1 className="b-section-title">Backyrd ist kurz gestolpert.</h1>
          <p>
            Deine Daten bleiben unverändert. Versuch diesen Bereich noch einmal.
          </p>
          <Button onClick={reset}>Erneut versuchen</Button>
        </div>
      </div>
    </div>
  );
}
