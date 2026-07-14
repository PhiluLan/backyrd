"use client";
import type { DatePreset } from "@/lib/owner-intelligence";

const options: Array<{ value: DatePreset; label: string }> = [
  { value: "today", label: "Heute" },
  { value: "yesterday", label: "Gestern" },
  { value: "week", label: "7 Tage" },
  { value: "month", label: "30 Tage" },
  { value: "year", label: "1 Jahr" },
];

export function OwnerDateRange({ value, onChange }: { value: DatePreset; onChange: (value: DatePreset) => void }) {
  return (
    <div className="owner-date-range" role="group" aria-label="Zeitraum">
      {options.map((option) => (
        <button
          key={option.value}
          type="button"
          onClick={() => onChange(option.value)}
          className={value === option.value ? "is-active" : ""}
        >
          {option.label}
        </button>
      ))}
    </div>
  );
}
