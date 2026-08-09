"use client";

import Link from "next/link";
import { useParams } from "next/navigation";
import { useCallback, useEffect, useState } from "react";
import { founderDate, gateStatusLabels, sourceLabels } from "@/lib/founder";
import { supabase } from "@/lib/supabaseClient";
import type { FounderEvidence, FounderGate, FounderGateStatus } from "@/types/founder";

export default function LaunchGateDetailPage() {
  const params = useParams<{ key: string }>();
  const gateKey = params?.key ?? "";
  const [gate, setGate] = useState<FounderGate | null>(null);
  const [status, setStatus] = useState<FounderGateStatus>("open");
  const [evidence, setEvidence] = useState("[]");
  const [note, setNote] = useState("");
  const [owner, setOwner] = useState("");
  const [relatedUrl, setRelatedUrl] = useState("");
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");

  const load = useCallback(async () => {
    const { data, error: rpcError } = await supabase.rpc("founder_launch_gate_detail_v1", { p_gate_key: gateKey });
    if (rpcError) { setError(rpcError.message); return; }
    const result = data as FounderGate;
    setGate(result); setStatus(result.status); setEvidence(JSON.stringify(result.evidence, null, 2));
    setNote(result.verification_note ?? ""); setOwner(result.owner ?? ""); setRelatedUrl(result.related_url ?? "");
  }, [gateKey]);

  useEffect(() => {
    const initial = window.setTimeout(() => void load(), 0);
    return () => window.clearTimeout(initial);
  }, [load]);

  async function save() {
    setSaving(true); setError(""); setMessage("");
    try {
      const parsed = JSON.parse(evidence) as unknown;
      if (!Array.isArray(parsed)) throw new Error("Evidence must be a JSON array.");
      const normalized = parsed as FounderEvidence[];
      const { error: rpcError } = await supabase.rpc("founder_update_launch_gate_v1", {
        p_gate_key: gateKey,
        p_status: status,
        p_evidence: normalized,
        p_verification_note: note || null,
        p_related_url: relatedUrl || null,
        p_owner: owner || null,
      });
      if (rpcError) throw rpcError;
      setMessage(status === "verified" ? "Gate verified with evidence." : "Gate updated. Readiness snapshot recorded.");
      await load();
    } catch (saveError) {
      setError(saveError instanceof Error ? saveError.message : "Gate update failed");
    } finally {
      setSaving(false);
    }
  }

  if (!gate) return <div className="fcc-page"><div className={error ? "fcc-error" : "fcc-loading"}>{error || "Launch gate wird geladen …"}</div></div>;

  return (
    <div className="fcc-page">
      <Link href="/founder/launch-readiness" className="fcc-back">← Launch Readiness</Link>
      <header className="fcc-gateHero">
        <div><div className="fcc-gateLabels"><span className={`fcc-priority ${gate.priority}`}>{gate.priority}</span><span className={`fcc-status ${gate.status}`}>{gateStatusLabels[gate.status]}</span><span className={`fcc-source ${gate.source_type}`}>{sourceLabels[gate.source_type]}</span></div><h1>{gate.title}</h1><p>{gate.description}</p></div>
        <div className="fcc-gateCategory"><span>{gate.category}</span><strong>{gate.category_weight}%</strong><small>category weight</small></div>
      </header>
      <section className="fcc-detailGrid">
        <div className="fcc-detailMain">
          <article className="fcc-panel"><span className="fcc-overline">Acceptance gate</span><h2>What is required</h2><p className="fcc-copy">{gate.requirement}</p></article>
          <article className="fcc-panel"><span className="fcc-overline">Product reason</span><h2>Why it matters</h2><p className="fcc-copy">{gate.why_it_matters}</p></article>
          <article className="fcc-panel">
            <div className="fcc-panelHead"><div><span className="fcc-overline">Evidence ledger</span><h2>Current evidence</h2></div><b>{gate.evidence.length}</b></div>
            {gate.evidence.map((item, index) => <div className="fcc-evidence" key={`${item.ref}-${index}`}><span>{item.type}</span><div><strong>{item.ref}</strong><p>{item.note}</p></div></div>)}
            {gate.evidence.length === 0 ? <div className="fcc-empty">No evidence recorded. This gate cannot be verified.</div> : null}
          </article>
          {gate.related_url ? <a className="fcc-related" href={gate.related_url} target="_blank" rel="noreferrer"><span>Related engineering</span><strong>{gate.related_url}</strong><small>A merge is evidence; acceptance is still required.</small></a> : null}
        </div>
        <aside className="fcc-panel fcc-gateEditor">
          <span className="fcc-overline">Founder / CTO control</span><h2>Verification</h2>
          <label>Status<select value={status} onChange={(event) => setStatus(event.target.value as FounderGateStatus)}>{Object.entries(gateStatusLabels).map(([value, label]) => <option value={value} key={value}>{label}</option>)}</select></label>
          <label>Owner<input value={owner} onChange={(event) => setOwner(event.target.value)} /></label>
          <label>Related PR / URL<input value={relatedUrl} onChange={(event) => setRelatedUrl(event.target.value)} placeholder="https://github.com/…" /></label>
          <label>Evidence JSON<textarea value={evidence} onChange={(event) => setEvidence(event.target.value)} rows={11} spellCheck={false} /></label>
          <label>Verification note<textarea value={note} onChange={(event) => setNote(event.target.value)} rows={5} placeholder="What was accepted, by whom, and against which criteria?" /></label>
          {error ? <div className="fcc-inlineError">{error}</div> : null}{message ? <div className="fcc-success">{message}</div> : null}
          <button onClick={save} disabled={saving}>{saving ? "Saving …" : "Update gate"}</button>
          <dl><div><dt>Verified</dt><dd>{founderDate(gate.verification_date)}</dd></div><div><dt>Last updated</dt><dd>{founderDate(gate.updated_at)}</dd></div><div><dt>Historical review</dt><dd>{gate.review_classification.replaceAll("_", " ")}</dd></div></dl>
        </aside>
      </section>
    </div>
  );
}
