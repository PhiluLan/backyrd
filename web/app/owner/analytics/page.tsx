"use client";
import Link from "next/link";
import { useEffect, useState } from "react";
import { OwnerShell } from "@/components/owner/owner-shell";
import { OwnerDateRange } from "@/components/owner/owner-date-range";
import { OwnerMetric } from "@/components/owner/owner-metric";
import { getOwnerOverview, rangeForPreset, type DatePreset } from "@/lib/owner-intelligence";

export default function Page() {
  const [preset, setPreset] = useState<DatePreset>("month");
  const [data, setData] = useState<any>(null);
  const [error, setError] = useState("");
  useEffect(() => { const range = rangeForPreset(preset); setError(""); getOwnerOverview(range.from, range.to).then(setData).catch((e) => setError(e.message)); }, [preset]);
  const s = data?.summary ?? {};
  return (
    <OwnerShell eyebrow="OWNER PERFORMANCE" title="Performance" subtitle="Reichweite, Conversion und Business-Intent deiner offiziell verbundenen Spots." actions={<OwnerDateRange value={preset} onChange={setPreset} />}>
      {error ? <div className="owner-error-state">{error}</div> : !data ? <div className="owner-empty-state">Lädt…</div> : <>
        <div className="owner-kpi-grid owner-kpi-grid-4">
          <OwnerMetric label="Spot Views" value={s.views ?? 0} />
          <OwnerMetric label="Besucher" value={s.visitors ?? 0} />
          <OwnerMetric label="Decision CTR" value={`${s.decision_ctr ?? 0}%`} accent />
          <OwnerMetric label="Business Intent" value={(s.route_clicks ?? 0) + (s.website_clicks ?? 0) + (s.phone_clicks ?? 0)} detail="Route, Website, Telefon" />
          <OwnerMetric label="Reviews" value={s.reviews ?? 0} />
          <OwnerMetric label="Impressions" value={s.impressions ?? 0} />
          <OwnerMetric label="Decision Opens" value={s.decision_opens ?? 0} />
          <OwnerMetric label="Owned Spots" value={s.spots ?? 0} />
        </div>
        <section className="owner-panel owner-table-panel">
          <div className="owner-section-heading"><div><div className="owner-section-kicker">LOCATION PERFORMANCE</div><h2>Spot Performance</h2></div></div>
          <div className="owner-table-wrap"><table className="owner-table"><thead><tr><th>Spot</th><th>Views</th><th>Besucher</th><th>CTR</th><th>Reviews</th><th>Intent</th><th /></tr></thead><tbody>{(data.spots ?? []).map((x: any) => <tr key={x.spot_id}><td><strong>{x.name}</strong><span>{x.city}</span></td><td>{x.views}</td><td>{x.visitors}</td><td>{x.impressions ? `${Math.round(x.decision_opens * 1000 / x.impressions) / 10}%` : "0%"}</td><td>{x.reviews}</td><td>{x.route_clicks + x.website_clicks + x.phone_clicks}</td><td><Link href={`/owner/analytics/spots/${x.spot_id}`} className="owner-table-link">Details →</Link></td></tr>)}</tbody></table></div>
        </section>
      </>}
    </OwnerShell>
  );
}
