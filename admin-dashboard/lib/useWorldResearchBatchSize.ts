"use client";

import { useEffect, useState } from "react";
import { isWorldResearchBatchSize, type WorldResearchBatchSize } from "./worldResearchQueue";

const preferenceKey = "backyrd.admin.spot-research.batch-size";
let sessionSize: WorldResearchBatchSize = 10;

export function useWorldResearchBatchSize() {
  const [size, setSize] = useState<WorldResearchBatchSize>(10);

  useEffect(() => {
    const frame = window.requestAnimationFrame(() => {
      try {
        const saved = Number(window.localStorage.getItem(preferenceKey));
        if (isWorldResearchBatchSize(saved)) sessionSize = saved;
      } catch {
        // Keep the in-memory preference when persistent storage is unavailable.
      }
      setSize(sessionSize);
    });
    return () => window.cancelAnimationFrame(frame);
  }, []);

  function saveSize(next: WorldResearchBatchSize) {
    sessionSize = next;
    setSize(next);
    try {
      window.localStorage.setItem(preferenceKey, String(next));
    } catch {
      // The preference still applies for the current session.
    }
  }

  return [size, saveSize] as const;
}
