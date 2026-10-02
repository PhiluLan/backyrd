"use client";

import Link from "next/link";
import { useParams } from "next/navigation";
import { useEffect, useState } from "react";
import { OwnerShell } from "@/components/owner/owner-shell";
import { OwnerDateRange } from "@/components/owner/owner-date-range";
import { OwnerMetric } from "@/components/owner/owner-metric";
import { getOwnerSpotPerformance, rangeForPreset, type DatePreset } from "@/lib/owner-intelligence";

type SpotActivity = {
  spot: { name: string };
  summary: {
    views: number; visitors: number; reviews: number; favorites: number;
    route_clicks: number; website_clicks: number; phone_clicks: number;
  };
  sources: { source: string; events: number }[];
};

export default function OwnerSpotActivityPage() {
  const { id } = useParams<{ id: string }>();
  const [preset, setPreset] = useState<DatePreset>("month");
  const [data, setData] = useState<SpotActivity | null>(null);
  const [error, setError] = useState("");

  useEffect(() => {
    let active = true;
    const range = rangeForPreset(preset);
    getOwnerSpotPerformance(id, range.from, range.to)
      .then((result: SpotActivity) => { if (active) setData(result); })
      .catch((cause: unknown) => { if (active) setError(cause instanceof Error ? cause.message : "Die Einblicke konnten nicht geladen werden."); });
    return () => { active = false; };
  }, [id, preset]);

  const summary = data?.summary;
  return <OwnerShell
    eyebrow="EINBLICKE PRO SPOT"
    title={data?.spot?.name ?? "Spot-Einblicke"}
    subtitle="Erfasste Aktionen zu diesem Spot. Sie beeinflussen weder die vNext-Reihenfolge noch garantieren sie zusätzliche Reichweite."
    actions={<OwnerDateRange value={preset} onChange={(value) => { setData(null); setError(""); setPreset(value); }} />}
  >
    {error ? <div className="owner-error-state">{error}</div> : !data || !summary ? <div className="owner-empty-state">Einblicke werden geladen …</div> : <>
      <div className="owner-back-row"><Link href="/owner/analytics">Alle Einblicke</Link><Link href={`/owner/spots/${id}`} className="owner-secondary-button">Spot pflegen</Link></div>
      <div className="owner-kpi-grid owner-kpi-grid-4">
        <OwnerMetric label="Spot-Aufrufe" value={summary.views} />
        <OwnerMetric label="Erfasste Besucher:innen" value={summary.visitors} />
        <OwnerMetric label="Neue Reviews" value={summary.reviews} />
        <OwnerMetric label="Favoriten insgesamt" value={summary.favorites} />
        <OwnerMetric label="Routen-Anfragen" value={summary.route_clicks} accent />
        <OwnerMetric label="Website-Aufrufe" value={summary.website_clicks} />
        <OwnerMetric label="Telefon-Aktionen" value={summary.phone_clicks} />
      </div>
      <section className="owner-panel owner-section-panel"><div className="owner-section-heading"><div><div className="owner-section-kicker">ERFASSTE HERKUNFT</div><h2>Wo Spot-Aufrufe begannen</h2></div></div>
        {data.sources.length === 0 ? <p className="owner-empty-state">Noch keine Herkunftsdaten in diesem Zeitraum.</p> :
          <div className="owner-source-list">{data.sources.map((source) => <div key={source.source}><span>{source.source}</span><strong>{source.events}</strong></div>)}</div>}
      </section>
    </>}
  </OwnerShell>;
}
