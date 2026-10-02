"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { OwnerShell } from "@/components/owner/owner-shell";
import { OwnerDateRange } from "@/components/owner/owner-date-range";
import { OwnerMetric } from "@/components/owner/owner-metric";
import { getOwnerOverview, rangeForPreset, type DatePreset } from "@/lib/owner-intelligence";

type OwnerOverview = {
  summary: {
    views: number; visitors: number; route_clicks: number; website_clicks: number;
    phone_clicks: number; reviews: number; spots: number;
  };
  spots: {
    spot_id: string; name: string; city: string | null; views: number; visitors: number;
    reviews: number; route_clicks: number; website_clicks: number; phone_clicks: number;
  }[];
};

export default function OwnerInsightsPage() {
  const [preset, setPreset] = useState<DatePreset>("month");
  const [data, setData] = useState<OwnerOverview | null>(null);
  const [error, setError] = useState("");

  useEffect(() => {
    let active = true;
    const range = rangeForPreset(preset);
    getOwnerOverview(range.from, range.to)
      .then((result: OwnerOverview) => { if (active) setData(result); })
      .catch((cause: unknown) => { if (active) setError(cause instanceof Error ? cause.message : "Die Einblicke konnten nicht geladen werden."); });
    return () => { active = false; };
  }, [preset]);

  const summary = data?.summary;
  return <OwnerShell
    eyebrow="DEINE EINBLICKE"
    title="Was bei deinen Spots passiert"
    subtitle="Erfasste Aufrufe und Aktionen für deine verbundenen Orte. Diese Zahlen zeigen keine Platzierung oder Bewertung durch Decision vNext."
    actions={<OwnerDateRange value={preset} onChange={(value) => { setData(null); setError(""); setPreset(value); }} />}
  >
    {error ? <div className="owner-error-state">{error}</div> : !data || !summary ? <div className="owner-empty-state">Einblicke werden geladen …</div> : <>
      <div className="owner-kpi-grid owner-kpi-grid-4">
        <OwnerMetric label="Spot-Aufrufe" value={summary.views} />
        <OwnerMetric label="Erfasste Besucher:innen" value={summary.visitors} />
        <OwnerMetric label="Routen-Anfragen" value={summary.route_clicks} accent />
        <OwnerMetric label="Website-Aufrufe" value={summary.website_clicks} />
        <OwnerMetric label="Telefon-Aktionen" value={summary.phone_clicks} />
        <OwnerMetric label="Neue Reviews" value={summary.reviews} />
        <OwnerMetric label="Verbundene Spots" value={summary.spots} />
      </div>
      <section className="owner-panel owner-table-panel">
        <div className="owner-section-heading"><div><div className="owner-section-kicker">PRO SPOT</div><h2>Deine Orte im Überblick</h2></div></div>
        {data.spots.length === 0 ? <p className="owner-empty-state">Noch keine verbundenen Spots vorhanden.</p> :
          <div className="owner-table-wrap"><table className="owner-table"><thead><tr><th>Spot</th><th>Aufrufe</th><th>Besucher:innen</th><th>Reviews</th><th>Aktionen</th><th /></tr></thead><tbody>{data.spots.map((spot) => <tr key={spot.spot_id}>
            <td><strong>{spot.name}</strong><span>{spot.city}</span></td><td>{spot.views}</td><td>{spot.visitors}</td><td>{spot.reviews}</td>
            <td>{spot.route_clicks + spot.website_clicks + spot.phone_clicks}</td>
            <td><Link href={`/owner/analytics/spots/${spot.spot_id}`} className="owner-table-link">Details →</Link></td>
          </tr>)}</tbody></table></div>}
      </section>
    </>}
  </OwnerShell>;
}
