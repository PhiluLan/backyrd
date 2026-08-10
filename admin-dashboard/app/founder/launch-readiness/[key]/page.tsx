"use client";

import Link from "next/link";
import { useParams } from "next/navigation";
import { useCallback, useEffect, useState } from "react";
import {
  categoryLabel,
  founderDate,
  founderGateCopy,
  founderOwner,
  gateStatusLabels,
  priorityLabels,
  sourceLabels,
} from "@/lib/founder";
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
    if (rpcError) {
      console.error("Founder launch criterion could not be loaded", rpcError);
      setError("Dieses Launch-Kriterium konnte gerade nicht geladen werden.");
      return;
    }
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
      if (!Array.isArray(parsed)) throw new Error("Die technischen Nachweise müssen als Liste erfasst sein.");
      const normalized = parsed as FounderEvidence[];
      const { error: rpcError } = await supabase.rpc("founder_update_launch_gate_v1", {
        p_gate_key: gateKey,
        p_status: status,
        p_evidence: normalized,
        p_verification_note: note || null,
        p_related_url: relatedUrl || null,
        p_owner: owner || null,
      });
      if (rpcError) {
        console.error("Founder launch criterion could not be updated", rpcError);
        throw new Error("Die Änderung konnte nicht gespeichert werden. Bitte Status, Nachweise und Prüfnotiz kontrollieren.");
      }
      setMessage(status === "verified" ? "Launch-Kriterium mit Nachweis bestätigt." : "Launch-Kriterium aktualisiert. Der Fortschritt wurde neu berechnet.");
      await load();
    } catch (saveError) {
      setError(saveError instanceof Error ? saveError.message : "Das Launch-Kriterium konnte nicht aktualisiert werden.");
    } finally {
      setSaving(false);
    }
  }

  if (!gate) return <div className="fcc-page"><div className={error ? "fcc-error" : "fcc-loading"}>{error || "Launch-Kriterium wird geladen …"}</div></div>;

  const copy = founderGateCopy(gate);
  const reviewLabels = {
    ready: "Bereit",
    needs_polish: "Nacharbeit nötig",
    blocker: "Blockiert den Launch",
    not_needed_freeze: "Für den Freeze vorgesehen",
  } as const;

  return (
    <div className="fcc-page">
      <Link href="/founder/launch-readiness" className="fcc-back">← Launch-Übersicht</Link>
      <header className="fcc-gateHero">
        <div><div className="fcc-gateLabels"><span className={`fcc-priority ${gate.priority}`}>{priorityLabels[gate.priority]}</span><span className={`fcc-status ${gate.status}`}>{gateStatusLabels[gate.status]}</span><span className={`fcc-source ${gate.source_type}`}>{sourceLabels[gate.source_type]}</span></div><h1>{copy.title}</h1><p>{copy.description}</p></div>
        <div className="fcc-gateCategory"><span>{categoryLabel(gate.category_key, gate.category)}</span><strong>{gate.category_weight}%</strong><small>Gewichtung im Gesamtbild</small></div>
      </header>
      <section className="fcc-detailGrid">
        <div className="fcc-detailMain">
          <article className="fcc-panel"><span className="fcc-overline">Bedeutung für den Launch</span><h2>Warum ist das wichtig?</h2><p className="fcc-copy">{copy.why_it_matters}</p></article>
          <article className="fcc-panel"><span className="fcc-overline">Freigabekriterium</span><h2>Was muss erfüllt sein?</h2><p className="fcc-copy">{copy.requirement}</p></article>
          <article className="fcc-panel fcc-currentState">
            <span className="fcc-overline">Aktueller Stand</span>
            <h2>{gateStatusLabels[gate.status]}</h2>
            <p className="fcc-copy">{gate.status === "verified" ? "Das Kriterium wurde anhand der hinterlegten Nachweise bestätigt." : gate.status === "verify" ? "Die technische oder operative Grundlage ist vorhanden. Die abschliessende Prüfung und Freigabe steht noch aus." : gate.status === "in_progress" ? "Die verantwortliche Person arbeitet aktuell an diesem Launch-Kriterium." : gate.status === "accepted_risk" ? "Das verbleibende Risiko wurde bewusst dokumentiert und akzeptiert." : "Für dieses Launch-Kriterium fehlt noch ein ausreichender bestätigter Nachweis."}</p>
          </article>
          <article className="fcc-panel">
            <div className="fcc-panelHead"><div><span className="fcc-overline">Belege für die Freigabe</span><h2>Nachweise</h2></div><b>{gate.evidence.length}</b></div>
            {gate.evidence.map((item, index) => <div className="fcc-evidence" key={`${item.ref}-${index}`}><span>{evidenceTypeLabel(item.type)}</span><div><strong>{item.ref}</strong><p>{evidenceExplanation(item.type)}</p></div></div>)}
            {gate.evidence.length === 0 ? <div className="fcc-empty">Noch kein Nachweis hinterlegt. Dieses Kriterium kann deshalb nicht bestätigt werden.</div> : null}
          </article>
          <article className="fcc-panel fcc-responsibility"><span className="fcc-overline">Verantwortung</span><h2>{founderOwner(gate.owner)}</h2><p className="fcc-copy">Quelle: {sourceLabels[gate.source_type]} · Zuletzt aktualisiert: {founderDate(gate.updated_at)}</p></article>
          {gate.related_url ? <a className="fcc-related" href={gate.related_url} target="_blank" rel="noreferrer"><span>Verknüpfte Entwicklungsarbeit</span><strong>{gate.related_url}</strong><small>Abgeschlossene Entwicklung ist ein Nachweis. Die fachliche Prüfung und Freigabe bleibt trotzdem erforderlich.</small></a> : null}
        </div>
        <aside className="fcc-panel fcc-gateEditor">
          <span className="fcc-overline">Founder- und CTO-Freigabe</span><h2>Prüfung / Freigabe</h2>
          <label>Status<select value={status} onChange={(event) => setStatus(event.target.value as FounderGateStatus)}>{Object.entries(gateStatusLabels).map(([value, label]) => <option value={value} key={value}>{label}</option>)}</select></label>
          <label>Verantwortlich<input value={owner} onChange={(event) => setOwner(event.target.value)} /></label>
          <label>Verknüpfter PR oder Link<input value={relatedUrl} onChange={(event) => setRelatedUrl(event.target.value)} placeholder="https://github.com/…" /></label>
          <details className="fcc-technicalEditor"><summary>Technische Nachweisdaten bearbeiten</summary><label>Strukturierte Nachweise<textarea value={evidence} onChange={(event) => setEvidence(event.target.value)} rows={11} spellCheck={false} /></label></details>
          <label>Prüf- und Freigabenotiz<textarea value={note} onChange={(event) => setNote(event.target.value)} rows={5} placeholder="Was wurde geprüft, von wem und anhand welcher Kriterien?" /></label>
          {error ? <div className="fcc-inlineError">{error}</div> : null}{message ? <div className="fcc-success">{message}</div> : null}
          <button onClick={save} disabled={saving}>{saving ? "Wird gespeichert …" : "Launch-Kriterium aktualisieren"}</button>
          <dl><div><dt>Bestätigt am</dt><dd>{founderDate(gate.verification_date)}</dd></div><div><dt>Zuletzt aktualisiert</dt><dd>{founderDate(gate.updated_at)}</dd></div><div><dt>Historische Einordnung</dt><dd>{reviewLabels[gate.review_classification]}</dd></div></dl>
        </aside>
      </section>
    </div>
  );
}

function evidenceTypeLabel(type: string): string {
  if (type === "ci") return "Automatische Prüfung";
  if (type === "git") return "Technischer Nachweis";
  if (type === "migration") return "Datenbank-Nachweis";
  if (type === "test") return "Testergebnis";
  return "Nachweis";
}

function evidenceExplanation(type: string): string {
  if (type === "ci") return "Diese automatisierte Prüfung belegt einen funktionierenden technischen Stand. Die fachliche Launch-Freigabe bleibt separat.";
  if (type === "git") return "Diese Referenz zeigt die vorhandene technische Umsetzung. Sie ersetzt nicht die abschliessende operative Prüfung.";
  if (type === "migration") return "Diese versionierte Änderung bestätigt den nachvollziehbaren Datenbankstand.";
  if (type === "test") return "Dieses Testergebnis belegt die geprüfte technische Anforderung.";
  return "Dieser Beleg unterstützt die Prüfung des Launch-Kriteriums.";
}
