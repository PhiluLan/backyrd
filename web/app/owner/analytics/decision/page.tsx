"use client";

import { useEffect, useState } from "react";
import { OwnerShell } from "@/components/owner/owner-shell";
import { OwnerDateRange } from "@/components/owner/owner-date-range";
import { OwnerMetric } from "@/components/owner/owner-metric";
import { getOwnerDecision, rangeForPreset, type DatePreset } from "@/lib/owner-intelligence";

type DecisionActivity = {
  summary: { impressions: number; opens: number };
  spots: { spot_id: string; spot_name: string; impressions: number; opens: number }[];
};

export default function OwnerRecommendationActivityPage() {
  const [preset, setPreset] = useState<DatePreset>("month");
  const [data, setData] = useState<DecisionActivity | null>(null);
  const [error, setError] = useState("");

  useEffect(() => {
    let active = true;
    const range = rangeForPreset(preset);
    getOwnerDecision(range.from, range.to)
      .then((result: DecisionActivity) => { if (active) setData(result); })
      .catch((cause: unknown) => {
        if (active) setError(cause instanceof Error ? cause.message : "Die Einblicke konnten nicht geladen werden.");
      });
    return () => { active = false; };
  }, [preset]);

  return <OwnerShell
    eyebrow="EMPFEHLUNGS-AKTIONEN"
    title="Aus Empfehlungen entdeckt"
    subtitle="Erfasste Anzeigen und Öffnungen deiner Spots aus Empfehlungen. Diese Ereignisse erklären weder die vNext-Reihenfolge noch beeinflussen sie das Ranking."
    actions={<OwnerDateRange value={preset} onChange={(value) => { setData(null); setError(""); setPreset(value); }} />}
  >
    {error ? <div className="owner-error-state">{error}</div> : !data ? <div className="owner-empty-state">Einblicke werden geladen …</div> : <>
      <div className="owner-kpi-grid owner-kpi-grid-3">
        <OwnerMetric label="Erfasste Anzeigen" value={data.summary.impressions} />
        <OwnerMetric label="Erfasste Spot-Öffnungen" value={data.summary.opens} accent />
      </div>
      <section className="owner-panel owner-section-panel">
        <div className="owner-section-heading"><div><div className="owner-section-kicker">PRO SPOT</div><h2>Beobachtete Interaktionen</h2></div></div>
        {data.spots.length === 0 ? <p className="owner-empty-state">In diesem Zeitraum wurden keine entsprechenden Ereignisse erfasst.</p> :
          <div className="owner-performance-list">{data.spots.map((spot) => <div key={spot.spot_id} className="owner-performance-row">
            <div className="owner-performance-name"><strong>{spot.spot_name}</strong></div>
            <div><span>Anzeigen</span><strong>{spot.impressions}</strong></div>
            <div><span>Öffnungen</span><strong>{spot.opens}</strong></div>
          </div>)}</div>}
      </section>
    </>}
  </OwnerShell>;
}
