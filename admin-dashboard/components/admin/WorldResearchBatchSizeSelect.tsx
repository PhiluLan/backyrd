"use client";

import { isWorldResearchBatchSize, WORLD_RESEARCH_BATCH_SIZES, type WorldResearchBatchSize } from "@/lib/worldResearchQueue";

export function WorldResearchBatchSizeSelect({ size, onChange, disabled, className }: {
  size: WorldResearchBatchSize;
  onChange: (size: WorldResearchBatchSize) => void;
  disabled?: boolean;
  className?: string;
}) {
  return (
    <label className={className}>
      <span>Spots pro Recherche-Durchlauf</span>{" "}
      <select value={size} disabled={disabled} onChange={(event) => {
        const next = Number(event.currentTarget.value);
        if (isWorldResearchBatchSize(next)) onChange(next);
      }}>
        {WORLD_RESEARCH_BATCH_SIZES.map((option) => <option key={option} value={option}>{option}</option>)}
      </select>
    </label>
  );
}
