"use client";

import { useCallback, useEffect, useState } from "react";
import { AdminPageHeader, ErrorState, LoadingState, StatusBadge } from "@/components/admin/AdminUi";
import { supabase } from "@/lib/supabaseClient";

type ReferenceLocation = {
  key: string;
  name: string;
  type: "QUARTER" | "LANDMARK";
  coordinates: { latitude: number; longitude: number };
  source: string;
  persistence: string;
  status: string;
  aliases: string[];
};
type Operations = {
  references: ReferenceLocation[];
  persistedReferenceLocationCount: number;
  knownReferenceLocationCount: number;
  dynamicResolution: { enabled: boolean; provider: string; mode: string; persistence: string; baselBiasRadiusM: number; exactOrUniquePrefixRequired: boolean; unresolvedBehavior: string };
  disambiguation: { inputs: string[]; result: string; source: string };
  config: { version: string; cityKey: string; defaultNearRadiusM: number; status: string; updatedAt: string; updatedBy: string | null };
  limits: { minimumNearRadiusM: number; maximumNearRadiusM: number };
  audit: Array<{ id: number; actor_id: string | null; action: string; previous_near_radius_m: number | null; next_near_radius_m: number; reason: string; created_at: string }>;
};

async function adminRequest(method: "GET" | "PUT", body?: object) {
  const { data } = await supabase.auth.getSession();
  const token = data.session?.access_token;
  if (!token) throw new Error("Bitte melde dich erneut an.");
  const response = await fetch("/api/admin/reference-locations", {
    method,
    headers: { Authorization: `Bearer ${token}`, ...(body ? { "Content-Type": "application/json" } : {}) },
    body: body ? JSON.stringify(body) : undefined,
    cache: "no-store",
  });
  const payload = await response.json() as Operations & { error?: string };
  if (!response.ok) throw new Error(payload.error ?? "Referenzorte konnten nicht geladen werden.");
  return payload;
}

const date = (value: string) => new Intl.DateTimeFormat("de-CH", { dateStyle: "medium", timeStyle: "short" }).format(new Date(value));

export default function ReferenceLocationsPage() {
  const [data, setData] = useState<Operations | null>(null);
  const [radius, setRadius] = useState(800);
  const [reason, setReason] = useState("");
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");

  const load = useCallback(async () => {
    setLoading(true); setError("");
    try { const next = await adminRequest("GET"); setData(next); setRadius(next.config.defaultNearRadiusM); }
    catch (loadError) { setError(loadError instanceof Error ? loadError.message : "Referenzorte konnten nicht geladen werden."); }
    finally { setLoading(false); }
  }, []);
  useEffect(() => {
    const timer = window.setTimeout(() => void load(), 0);
    return () => window.clearTimeout(timer);
  }, [load]);

  async function save() {
    if (!data) return;
    setSaving(true); setError(""); setNotice("");
    try {
      const next = await adminRequest("PUT", { radiusM: radius, reason, requestId: crypto.randomUUID() });
      setData(next); setRadius(next.config.defaultNearRadiusM); setReason("");
      setNotice(`Standard-Näheradius auf ${next.config.defaultNearRadiusM} m geändert und auditiert.`);
    } catch (saveError) { setError(saveError instanceof Error ? saveError.message : "Radius konnte nicht geändert werden."); }
    finally { setSaving(false); }
  }

  return <div className="bi-page admin-page rl-page">
    <AdminPageHeader eyebrow="Decision Location · Basel" title="Referenzorte" description="Bekannte Referenzpunkte, dynamische Ortsauflösung und der auditable Standard-Näheradius der Production Decision Engine." actions={<button className="bi-actionButton" type="button" onClick={() => void load()} disabled={loading}>Aktualisieren</button>} />
    {error ? <ErrorState message={error} onRetry={() => void load()} /> : null}
    {notice ? <div className="rl-notice" role="status">{notice}</div> : null}
    {loading && !data ? <LoadingState label="Location-Contract wird geladen …" /> : null}
    {data ? <>
      <section className="admin-summaryGrid" aria-label="Referenzort-Übersicht">
        <article><span>Bekannte Referenzorte</span><strong>{data.knownReferenceLocationCount}</strong><small>Versionierte Basel-Registry</small></article>
        <article><span>Persistierte Referenzorte</span><strong>{data.persistedReferenceLocationCount}</strong><small>Dynamische Treffer werden nicht gespeichert</small></article>
        <article><span>Standard-Näheradius</span><strong>{data.config.defaultNearRadiusM} m</strong><small>{data.config.status === "ACTIVE" ? "Production aktiv" : "Fail-closed deaktiviert"}</small></article>
        <article><span>Dynamischer Resolver</span><strong>{data.dynamicResolution.enabled ? "Aktiv" : "Aus"}</strong><small>Serverseitig · Basel-beschränkt</small></article>
      </section>

      <section className="admin-sectionCard rl-config">
        <header><div><h2>Operative Near-Konfiguration</h2><p>Gilt nur, wenn Nutzer „in der Nähe von …“ ohne eigene Distanz nennen. Explizite Entfernungen bleiben autoritativ.</p></div><StatusBadge tone={data.config.status === "ACTIVE" ? "success" : "danger"}>{data.config.status}</StatusBadge></header>
        <div className="rl-configGrid">
          <label><span>Standard-Näheradius</span><div><input type="number" min={data.limits.minimumNearRadiusM} max={data.limits.maximumNearRadiusM} step={50} value={radius} onChange={(event) => setRadius(Number(event.target.value))} /><b>Meter</b></div><small>Zulässig: {data.limits.minimumNearRadiusM}–{data.limits.maximumNearRadiusM} m</small></label>
          <label><span>Änderungsgrund</span><textarea value={reason} maxLength={500} onChange={(event) => setReason(event.target.value)} placeholder="Warum ist dieser Radius für Product und Basel korrekt?" /><small>Pflichtfeld · erscheint unveränderlich im Audit</small></label>
        </div>
        <footer><div><span>Contract</span><code>{data.config.version}</code><small>Zuletzt geändert: {date(data.config.updatedAt)}</small></div><button type="button" onClick={() => void save()} disabled={saving || radius === data.config.defaultNearRadiusM || reason.trim().length < 8}>{saving ? "Wird auditiert …" : "Radius sicher ändern"}</button></footer>
      </section>

      <section className="admin-listPanel">
        <div className="rl-sectionHead"><div><span>Kanonische Registry</span><h2>Bekannte Referenzorte</h2><p>Diese Punkte beschleunigen eindeutige Basel-Anfragen. Sie sind keine Pflicht-Tags für Spots.</p></div></div>
        <div className="admin-desktopTable"><table><thead><tr><th>Name</th><th>Typ</th><th>Koordinaten</th><th>Resolution / Source</th><th>Status</th></tr></thead><tbody>{data.references.map((reference) => <tr key={reference.key}><td><strong>{reference.name}</strong><small>{reference.aliases.join(" · ")}</small></td><td>{reference.type === "QUARTER" ? "Quartier" : "Landmark"}</td><td><code>{reference.coordinates.latitude.toFixed(6)}, {reference.coordinates.longitude.toFixed(6)}</code></td><td><strong>{reference.source}</strong><small>{reference.persistence}</small></td><td><StatusBadge tone="success">{reference.status}</StatusBadge></td></tr>)}</tbody></table></div>
        <div className="admin-mobileList">{data.references.map((reference) => <article className="rl-referenceCard" key={reference.key}><header><div><h2>{reference.name}</h2><p>{reference.type === "QUARTER" ? "Quartier" : "Landmark"}</p></div><StatusBadge tone="success">{reference.status}</StatusBadge></header><code>{reference.coordinates.latitude.toFixed(6)}, {reference.coordinates.longitude.toFixed(6)}</code><small>{reference.source} · {reference.persistence}</small></article>)}</div>
      </section>

      <section className="rl-twoColumn">
        <article className="admin-sectionCard"><header><div><h2>Dynamische Auflösung</h2><p>Ergänzt die Registry und bleibt für unbekannte natürliche Referenzorte erhalten.</p></div><StatusBadge tone="success">AKTIV</StatusBadge></header><dl><div><dt>Provider</dt><dd>{data.dynamicResolution.provider}</dd></div><div><dt>Ausführung</dt><dd>Request-time, serverseitig</dd></div><div><dt>Basel-Bias</dt><dd>{(data.dynamicResolution.baselBiasRadiusM / 1000).toLocaleString("de-CH")} km</dd></div><div><dt>Unklar / nicht gefunden</dt><dd>Fail-closed, keine Nähebehauptung</dd></div></dl></article>
        <article className="admin-sectionCard"><header><div><h2>Bahnhof-Disambiguation</h2><p>Eindeutige Basel-Sprache wird deterministisch aufgelöst.</p></div><StatusBadge tone="info">KANONISCH</StatusBadge></header><div className="rl-disambiguation"><div>{data.disambiguation.inputs.map((input) => <span key={input}>{input}</span>)}</div><b>→</b><strong>{data.disambiguation.result}</strong><small>{data.disambiguation.source}</small></div></article>
      </section>

      <section className="admin-sectionCard rl-audit"><header><div><h2>Änderungshistorie</h2><p>Unveränderlicher Audit-Trail der operativen Near-Konfiguration.</p></div></header>{data.audit.map((entry) => <article key={entry.id}><div><strong>{entry.previous_near_radius_m === null ? "Initialisiert" : `${entry.previous_near_radius_m} m → ${entry.next_near_radius_m} m`}</strong><span>{date(entry.created_at)}</span></div><p>{entry.reason}</p><small>{entry.action} · Actor {entry.actor_id ?? "SYSTEM"}</small></article>)}</section>
    </> : null}
  </div>;
}
