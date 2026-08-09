"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { EngineeringPanel } from "@/components/founder/EngineeringPanel";
import { founderDate, founderNumber, gateStatusLabels, sourceLabels } from "@/lib/founder";
import { supabase } from "@/lib/supabaseClient";
import type { FounderOverview } from "@/types/founder";

export default function FounderControlCenterPage() {
  const [data, setData] = useState<FounderOverview | null>(null);
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;
    void (async () => {
      const { data: result, error: rpcError } = await supabase.rpc("founder_launch_overview_v1");
      if (cancelled) return;
      if (rpcError) setError(rpcError.message);
      else setData(result as FounderOverview);
      setLoading(false);
    })();
    return () => { cancelled = true; };
  }, []);

  if (loading) return <div className="fcc-page"><div className="fcc-loading">Founder Control Center wird aufgebaut …</div></div>;
  if (error || !data) return <div className="fcc-page"><div className="fcc-error">{error || "Founder launch data unavailable"}</div></div>;

  const readiness = data.readiness;
  return (
    <div className="fcc-page">
      <header className="fcc-hero">
        <div className="fcc-heroCopy">
          <span className="fcc-wordmark">BACKYRD</span>
          <div className="fcc-launchLabel">Basel Launch</div>
          <h1>Founder<br />Control Center</h1>
          <p>One operational truth for launch readiness, engineering evidence and the Basel decision habit.</p>
        </div>
        <div className={`fcc-readiness ${readiness.launch_status.toLowerCase()}`}>
          <span>Launch readiness</span>
          <strong>{Math.round(readiness.readiness_percent)}<em>%</em></strong>
          <div className="fcc-readinessTrack"><i style={{ width: `${readiness.readiness_percent}%` }} /></div>
          <div className="fcc-launchVerdict">
            <small>Public launch</small>
            <b>{readiness.launch_status}</b>
          </div>
          <div className="fcc-readinessMeta">
            <span><b>{readiness.p0_remaining}</b> P0 blockers</span>
            <span>Updated {founderDate(data.last_updated)}</span>
          </div>
        </div>
      </header>

      <section className="fcc-kpis">
        <Kpi label="WAU" value={founderNumber(data.kpis.wau)} source="automatic" />
        <Kpi label="MAU" value={founderNumber(data.kpis.mau)} source="automatic" />
        <Kpi label="Decisions / week" value={founderNumber(data.kpis.decisions_week)} source="automatic" />
        <Kpi label="Basel ready spots" value={founderNumber(data.kpis.basel_launch_ready_spots)} source="automatic" />
        <Kpi label="Open trust alerts" value={founderNumber(data.kpis.open_trust_alerts)} source="automatic" danger={data.kpis.open_trust_alerts > 0} />
        <Kpi label="Decision success" value="DATA NOT READY" source="automatic" subdued />
      </section>

      <section className="fcc-grid fcc-gridTop">
        <article className="fcc-panel">
          <div className="fcc-panelHead">
            <div><span className="fcc-overline">Launch engine</span><h2>Category readiness</h2></div>
            <Link href="/founder/launch-readiness">Open register →</Link>
          </div>
          <div className="fcc-categories">
            {readiness.categories.map((category) => (
              <div className="fcc-category" key={category.key}>
                <div><span>{category.label}</span><small>{category.weight}% weight</small><b>{Math.round(category.readiness)}%</b></div>
                <div><i style={{ width: `${category.readiness}%` }} /></div>
              </div>
            ))}
          </div>
        </article>

        <article className="fcc-panel fcc-blockerPanel">
          <div className="fcc-panelHead"><div><span className="fcc-overline">Critical path</span><h2>Highest-priority blockers</h2></div><b>{readiness.p0_remaining} P0</b></div>
          <div className="fcc-gateList">
            {data.blockers.map((gate) => (
              <Link href={`/founder/launch-readiness/${gate.key}`} className="fcc-gateRow" key={gate.key}>
                <span className="fcc-priority P0">P0</span>
                <div><strong>{gate.title}</strong><small>{gate.owner || "Owner not assigned"} · {sourceLabels[gate.source_type]}</small></div>
                <span className={`fcc-status ${gate.status}`}>{gateStatusLabels[gate.status]}</span>
              </Link>
            ))}
          </div>
        </article>
      </section>

      <EngineeringPanel compact />

      <section className="fcc-grid">
        <article className="fcc-panel">
          <div className="fcc-panelHead"><div><span className="fcc-overline">Manual + system</span><h2>Road to Basel</h2></div></div>
          <div className="fcc-road">
            {data.milestones.map((milestone) => (
              <div className={`fcc-milestone ${milestone.status}`} key={milestone.id}>
                <i /><div><strong>{milestone.title}</strong><small>{sourceLabels[milestone.source_type]} · {gateStatusLabels[milestone.status]}</small></div>
              </div>
            ))}
          </div>
        </article>
        <article className="fcc-panel">
          <div className="fcc-panelHead"><div><span className="fcc-overline">Evidence ledger</span><h2>Recently verified</h2></div></div>
          {data.recently_verified.map((gate) => (
            <Link href={`/founder/launch-readiness/${gate.key}`} className="fcc-verified" key={gate.key}>
              <span>✓</span><div><strong>{gate.title}</strong><small>{founderDate(gate.verification_date)}</small></div>
            </Link>
          ))}
          {data.recently_verified.length === 0 ? <div className="fcc-empty">No gates verified yet.</div> : null}
        </article>
      </section>
    </div>
  );
}
function Kpi({ label, value, source, danger = false, subdued = false }: {
  label: string;
  value: string;
  source: "automatic" | "system" | "manual";
  danger?: boolean;
  subdued?: boolean;
}) {
  return <article className={`fcc-kpi ${danger ? "danger" : ""} ${subdued ? "subdued" : ""}`}><span>{label}</span><strong>{value}</strong><small>{sourceLabels[source]}</small></article>;
}
