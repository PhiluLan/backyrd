"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import { AUTHORING_FIELDS } from "@backyrd/world-knowledge-core";
import { AdminPageHeader, ErrorState, LoadingState } from "@/components/admin/AdminUi";
import { supabase } from "@/lib/supabaseClient";

type PresentationField = {
  attributeKey: string;
  sectionKey: string;
  sortOrder: number;
  mobileVisible: boolean;
  webVisible: boolean;
  unknownBehavior: "HIDE" | "SHOW_UNKNOWN";
  publicAllowed: boolean;
  engineAuthorization: "AUTHORIZED" | "EXPLANATION_ONLY";
  valueType: string;
  updatedAt: string;
};
type Policy = {
  contractVersion: "backyrd.spot-detail-presentation-policy@1.0";
  registryVersion: string;
  fields: PresentationField[];
};

const sectionLabels: Record<string, string> = {
  IDENTITY: "Identität", LOCATION: "Standort", DESCRIPTION: "Beschreibung",
  CLASSIFICATION: "Einordnung", PURPOSE: "Hauptzweck", OFFERING: "Angebot",
  CONTEXT: "Besuch & Atmosphäre", PRICE: "Preis", HOURS: "Öffnung & Zustand",
  CAPACITY: "Kapazität", RULES: "Regeln", AMENITIES: "Ausstattung",
  ACCESSIBILITY: "Zugänglichkeit", CONTACT: "Öffentliche Kontakte",
};
const labelFor = (key: string) => AUTHORING_FIELDS.find((field) => field.attributeKey === key)?.label
  ?? key.split(".").map((part) => part.replaceAll("_", " ")).join(" · ");

export default function SpotPresentationPage() {
  const [policy, setPolicy] = useState<Policy | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState<string | null>(null);
  const [error, setError] = useState("");
  const [saved, setSaved] = useState("");

  const load = async () => {
    setLoading(true);
    const { data, error: rpcError } = await supabase.rpc("admin_spot_presentation_policy_v1");
    if (rpcError || !data || data.contractVersion !== "backyrd.spot-detail-presentation-policy@1.0" || !Array.isArray(data.fields)) {
      setError(rpcError?.message ?? "Die Darstellungsregeln konnten nicht geladen werden.");
      setPolicy(null);
    } else {
      setPolicy(data as Policy);
      setError("");
    }
    setLoading(false);
  };
  useEffect(() => { const timer = window.setTimeout(() => { void load(); }, 0); return () => window.clearTimeout(timer); }, []);

  const groups = useMemo(() => policy ? [...new Set(policy.fields.map((field) => field.sectionKey))] : [], [policy]);
  const update = async (field: PresentationField, patch: Partial<Pick<PresentationField,"mobileVisible"|"webVisible"|"unknownBehavior">>) => {
    const next = { ...field, ...patch };
    setSaving(field.attributeKey);
    setError(""); setSaved("");
    const { data, error: rpcError } = await supabase.rpc("admin_update_spot_presentation_policy_v1", {
      p_attribute_key: field.attributeKey,
      p_mobile_visible: next.mobileVisible,
      p_web_visible: next.webVisible,
      p_unknown_behavior: next.unknownBehavior,
    });
    if (rpcError || !data) setError(rpcError?.message ?? "Die Änderung konnte nicht bestätigt werden.");
    else {
      setPolicy((current) => current ? { ...current, fields: current.fields.map((item) => item.attributeKey === field.attributeKey ? next : item) } : current);
      setSaved(`${labelFor(field.attributeKey)} gespeichert.`);
    }
    setSaving(null);
  };

  return <div className="bi-page admin-page spot-presentation-page">
    <AdminPageHeader eyebrow="Spots · öffentliche Darstellung" title="Was sehen Gäste?" description="Steuere zentral, welche bestätigten World-Knowledge-Angaben auf Spot-Detailseiten erscheinen. Die Decision Engine und gespeicherte Fakten bleiben davon vollständig unberührt." actions={<Link href="/spots" className="bi-actionButton">Zur Spot-Übersicht</Link>} />
    <section className="presentation-contract" aria-label="Verbindliche Systemgrenzen">
      <article><strong>Eine Wissensquelle</strong><span>Alle Felder bleiben im kanonischen World Knowledge erhalten.</span></article>
      <article><strong>Decision unverändert</strong><span>vNext nutzt weiter den versiegelten World-Snapshot – unabhängig von diesen Schaltern.</span></article>
      <article><strong>Nur bestätigte Werte</strong><span>Konflikte und unbelegte Werte werden nicht als öffentliche Fakten ausgegeben.</span></article>
    </section>
    {loading ? <LoadingState label="Darstellungsregeln werden geladen …" /> : null}
    {error ? <ErrorState message={error} /> : null}
    {saved ? <div className="by-alert by-alertOk" role="status">{saved}</div> : null}
    {policy ? <>
      <div className="presentation-summary"><strong>{policy.fields.length} World-Knowledge-Felder vollständig erfasst</strong><span>{policy.fields.filter((field) => field.mobileVisible).length} in der App · {policy.fields.filter((field) => field.webVisible).length} im Browser sichtbar · Registry {policy.registryVersion}</span></div>
      {groups.map((section) => <section className="presentation-section" key={section}>
        <header><div><span>{sectionLabels[section] ?? section}</span><h2>{sectionLabels[section] ?? section}</h2></div><small>{policy.fields.filter((field) => field.sectionKey === section).length} Felder</small></header>
        <div className="presentation-list">{policy.fields.filter((field) => field.sectionKey === section).map((field) => <article className="presentation-row" key={field.attributeKey}>
          <div className="presentation-field"><strong>{labelFor(field.attributeKey)}</strong><code>{field.attributeKey}</code><div><span className="presentation-badge decision">{field.engineAuthorization === "AUTHORIZED" ? "von vNext nutzbar" : "nur Erklärung"}</span>{!field.publicAllowed ? <span className="presentation-badge locked">nicht öffentlich freigegeben</span> : null}</div></div>
          <label className="presentation-toggle"><span>Mobile App</span><input type="checkbox" checked={field.mobileVisible} disabled={!field.publicAllowed || saving === field.attributeKey} onChange={(event) => void update(field,{mobileVisible:event.target.checked})}/><i /></label>
          <label className="presentation-toggle"><span>Browser</span><input type="checkbox" checked={field.webVisible} disabled={!field.publicAllowed || saving === field.attributeKey} onChange={(event) => void update(field,{webVisible:event.target.checked})}/><i /></label>
          <label className="presentation-unknown"><span>Wenn unbekannt</span><select value={field.unknownBehavior} disabled={!field.publicAllowed || saving === field.attributeKey} onChange={(event) => void update(field,{unknownBehavior:event.target.value as PresentationField["unknownBehavior"]})}><option value="HIDE">nicht anzeigen</option><option value="SHOW_UNKNOWN">ehrlich als unbekannt zeigen</option></select></label>
        </article>)}</div>
      </section>)}
    </> : null}
  </div>;
}
