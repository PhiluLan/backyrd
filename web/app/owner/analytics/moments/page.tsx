"use client";

import { useEffect, useState } from "react";
import { OwnerShell } from "@/components/owner/owner-shell";
import { OwnerDateRange } from "@/components/owner/owner-date-range";
import { OwnerMetric } from "@/components/owner/owner-metric";
import { getOwnerMoments, rangeForPreset, type DatePreset } from "@/lib/owner-intelligence";

type MomentActivity = {
  summary: { posts: number; likes: number; comments: number; saves: number; shares: number };
  posts: { post_id: string; spot_name: string; caption: string | null; likes: number; comments: number; saves: number; shares: number }[];
};

export default function OwnerMomentsPage() {
  const [preset, setPreset] = useState<DatePreset>("month");
  const [data, setData] = useState<MomentActivity | null>(null);
  const [error, setError] = useState("");

  useEffect(() => {
    let active = true;
    const range = rangeForPreset(preset);
    getOwnerMoments(range.from, range.to)
      .then((result: MomentActivity) => { if (active) setData(result); })
      .catch((cause: unknown) => { if (active) setError(cause instanceof Error ? cause.message : "Momente konnten nicht geladen werden."); });
    return () => { active = false; };
  }, [preset]);

  const summary = data?.summary;
  return <OwnerShell
    eyebrow="MOMENTE DEINER ORTE"
    title="Was Menschen geteilt haben"
    subtitle="Momente und ihre sichtbaren Interaktionen. Diese Zahlen sind kein Urteil über deinen Spot und kein Ranking-Signal für Owner."
    actions={<OwnerDateRange value={preset} onChange={(value) => { setData(null); setError(""); setPreset(value); }} />}
  >
    {error ? <div className="owner-error-state">{error}</div> : !data || !summary ? <div className="owner-empty-state">Momente werden geladen …</div> : <>
      <div className="owner-kpi-grid owner-kpi-grid-3">
        <OwnerMetric label="Momente" value={summary.posts} accent />
        <OwnerMetric label="Gefällt mir" value={summary.likes} />
        <OwnerMetric label="Kommentare" value={summary.comments} />
        <OwnerMetric label="Gespeichert" value={summary.saves} />
        <OwnerMetric label="Geteilt" value={summary.shares} />
      </div>
      <section className="owner-panel owner-section-panel">
        <div className="owner-section-heading"><div><div className="owner-section-kicker">AUS DEINEN SPOTS</div><h2>Geteilte Momente</h2></div></div>
        {data.posts.length === 0 ? <p className="owner-empty-state">In diesem Zeitraum wurden noch keine Momente geteilt.</p> :
          <div className="owner-moment-grid">{data.posts.map((post) => <article key={post.post_id} className="owner-moment-card">
            <div className="owner-spot-category">{post.spot_name}</div>
            <p>{post.caption?.trim() || "Moment ohne Text"}</p>
            <div className="owner-moment-stats"><span>{post.likes} Likes</span><span>{post.comments} Kommentare</span><span>{post.saves} Saves</span><span>{post.shares} Shares</span></div>
          </article>)}</div>}
      </section>
    </>}
  </OwnerShell>;
}
