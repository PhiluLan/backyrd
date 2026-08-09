"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import { founderDate, gateStatusLabels, priorityOrder, sourceLabels } from "@/lib/founder";
import { supabase } from "@/lib/supabaseClient";
import type { FounderGate, FounderGateStatus, FounderPriority } from "@/types/founder";

export default function LaunchReadinessPage() {
  const [gates, setGates] = useState<FounderGate[]>([]);
  const [priority, setPriority] = useState<FounderPriority | "all">("all");
  const [status, setStatus] = useState<FounderGateStatus | "all">("all");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;
    void (async () => {
      const { data, error: rpcError } = await supabase.rpc("founder_launch_risks_v1", { p_limit: 200 });
      if (cancelled) return;
      if (rpcError) setError(rpcError.message);
      else setGates((data ?? []) as FounderGate[]);
      setLoading(false);
    })();
    return () => { cancelled = true; };
  }, []);

  const visible = useMemo(() => gates
    .filter((gate) => priority === "all" || gate.priority === priority)
    .filter((gate) => status === "all" || gate.status === status)
    .sort((a, b) => priorityOrder[a.priority] - priorityOrder[b.priority]), [gates, priority, status]);

  return (
    <div className="fcc-page">
      <header className="fcc-pageHeader">
        <div><span className="fcc-wordmark">BACKYRD · FOUNDER</span><h1>Launch Readiness</h1><p>Evidence-backed Basel launch gates. The historical review is context; current verification is the source of truth.</p></div>
        <Link href="/founder" className="fcc-back">← Control Center</Link>
      </header>
      <div className="fcc-registerSummary">
        {(["P0", "P1", "P2"] as FounderPriority[]).map((item) => <div key={item}><span>{item}</span><strong>{gates.filter((gate) => gate.priority === item && !["verified", "accepted_risk"].includes(gate.status)).length}</strong><small>remaining</small></div>)}
        <div><span>Verified</span><strong>{gates.filter((gate) => gate.status === "verified").length}</strong><small>evidence-backed</small></div>
      </div>
      <div className="fcc-filters">
        <select value={priority} onChange={(event) => setPriority(event.target.value as FounderPriority | "all")}><option value="all">All priorities</option><option>P0</option><option>P1</option><option>P2</option></select>
        <select value={status} onChange={(event) => setStatus(event.target.value as FounderGateStatus | "all")}><option value="all">All statuses</option>{Object.entries(gateStatusLabels).map(([value, label]) => <option value={value} key={value}>{label}</option>)}</select>
      </div>
      {loading ? <div className="fcc-loading">Launch register wird geladen …</div> : null}
      {error ? <div className="fcc-error">{error}</div> : null}
      <section className="fcc-register">
        {visible.map((gate) => (
          <Link className="fcc-registerGate" href={`/founder/launch-readiness/${gate.key}`} key={gate.id}>
            <div className="fcc-registerTop">
              <span className={`fcc-priority ${gate.priority}`}>{gate.priority}</span>
              <span className={`fcc-status ${gate.status}`}>{gateStatusLabels[gate.status]}</span>
              <span className={`fcc-source ${gate.source_type}`}>{sourceLabels[gate.source_type]}</span>
              <small>{gate.category}</small>
            </div>
            <h2>{gate.title}</h2>
            <p>{gate.description}</p>
            <div className="fcc-registerMeta"><span>{gate.owner || "Owner open"}</span><span>{gate.evidence.length} evidence item{gate.evidence.length === 1 ? "" : "s"}</span><span>Updated {founderDate(gate.updated_at)}</span></div>
          </Link>
        ))}
      </section>
    </div>
  );
}
