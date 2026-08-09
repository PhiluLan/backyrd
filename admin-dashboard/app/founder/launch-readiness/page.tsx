"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import {
  categoryLabel,
  founderDate,
  founderGateCopy,
  founderOwner,
  gateStatusLabels,
  priorityLabels,
  priorityOrder,
  sourceLabels,
} from "@/lib/founder";
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
      if (rpcError) {
        console.error("Founder launch register could not be loaded", rpcError);
        setError("Die Launch-Übersicht konnte gerade nicht geladen werden. Bitte versuche es erneut.");
      }
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
        <div><span className="fcc-wordmark">BACKYRD · FOUNDER</span><h1>Launch-Übersicht</h1><p>Alle Kriterien für den öffentlichen Basel-Launch – mit Verantwortung, aktuellem Stand und belastbaren Nachweisen.</p></div>
        <Link href="/founder" className="fcc-back">← Founder Cockpit</Link>
      </header>
      <div className="fcc-registerSummary">
        {(["P0", "P1", "P2"] as FounderPriority[]).map((item) => <div key={item}><span>{priorityLabels[item]}</span><strong>{gates.filter((gate) => gate.priority === item && !["verified", "accepted_risk"].includes(gate.status)).length}</strong><small>noch offen</small></div>)}
        <div><span>Bestätigt</span><strong>{gates.filter((gate) => gate.status === "verified").length}</strong><small>mit Nachweis</small></div>
      </div>
      <div className="fcc-filters">
        <select aria-label="Priorität filtern" value={priority} onChange={(event) => setPriority(event.target.value as FounderPriority | "all")}><option value="all">Alle Prioritäten</option><option value="P0">Kritisch</option><option value="P1">Wichtig</option><option value="P2">Beobachten</option></select>
        <select aria-label="Status filtern" value={status} onChange={(event) => setStatus(event.target.value as FounderGateStatus | "all")}><option value="all">Alle Status</option>{Object.entries(gateStatusLabels).map(([value, label]) => <option value={value} key={value}>{label}</option>)}</select>
      </div>
      {loading ? <div className="fcc-loading">Launch-Übersicht wird geladen …</div> : null}
      {error ? <div className="fcc-error">{error}</div> : null}
      <section className="fcc-register">
        {visible.map((gate) => {
          const copy = founderGateCopy(gate);
          return <Link className="fcc-registerGate" href={`/founder/launch-readiness/${gate.key}`} key={gate.id}>
            <div className="fcc-registerTop">
              <span className={`fcc-priority ${gate.priority}`}>{priorityLabels[gate.priority]}</span>
              <span className={`fcc-status ${gate.status}`}>{gateStatusLabels[gate.status]}</span>
              <span className={`fcc-source ${gate.source_type}`}>{sourceLabels[gate.source_type]}</span>
              <small>{categoryLabel(gate.category_key, gate.category)}</small>
            </div>
            <h2>{copy.title}</h2>
            <p>{copy.description}</p>
            <div className="fcc-registerMeta"><span>Verantwortlich: {founderOwner(gate.owner)}</span><span>Nachweise: {gate.evidence.length}</span><span>Zuletzt aktualisiert: {founderDate(gate.updated_at)}</span></div>
          </Link>
        })}
      </section>
    </div>
  );
}
