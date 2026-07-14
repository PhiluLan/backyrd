"use client";
import { presets, type Preset } from "@/lib/intelligence";
export function DateRangeSelector({ value, onChange }: { value: Preset; onChange: (value: Preset) => void }) {
  return <div className="bi-periods">{presets.map(([key,label]) => <button key={key} className={value === key ? "active" : ""} onClick={() => onChange(key)}>{label}</button>)}</div>;
}
