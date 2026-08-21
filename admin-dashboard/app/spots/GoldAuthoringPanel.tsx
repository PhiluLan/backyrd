"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { supabase } from "@/lib/supabaseClient";

type CatalogField = {
  field_key: string;
  section: string;
  capability: "BASIC" | "DEEP";
  value_kind: string;
  allowed_values: unknown[];
  engine_role: string;
};

type Proposal = {
  id: string;
  field_key: string;
  proposed_value: unknown;
  status: string;
  created_at: string;
  source_id: string;
};

type GoldProfile = {
  actor: { role: "FOUNDER" | "ADMIN" | "OWNER"; capability: "BASIC" | "DEEP" };
  catalog: CatalogField[];
  proposals: Proposal[];
  acceptedFacts: Array<{ id: string; field_key: string; value: unknown; status: string }>;
  readiness: { status: string; coverage: number; gaps: Array<{ item: string; state: string }>; n4?: { snapshotHash?: string; conceptCount?: number } };
  canonicalN4: { snapshotHash?: string; confidence?: number; completeness?: number; intelligence?: { concepts?: Record<string, unknown> }; calculatedAt?: string } | null;
  legacy: { label: string };
};

function initialValue(field: CatalogField | undefined): string {
  if (!field) return "";
  if (field.value_kind === "MULTI_SELECT") return "[]";
  if (field.value_kind === "RANGE" || field.value_kind === "STRUCTURED_OBJECT") return "{}";
  return "";
}

function parseValue(field: CatalogField, raw: string): unknown {
  if (["MULTI_SELECT", "RANGE", "STRUCTURED_OBJECT"].includes(field.value_kind)) return JSON.parse(raw);
  if (field.value_kind === "BOOLEAN") return raw === "true";
  if (field.value_kind === "ENUM" && field.allowed_values.some((item) => typeof item === "number")) return Number(raw);
  return raw;
}

function jsonObject(raw: string): Record<string, unknown> {
  try { const value=JSON.parse(raw); return value && typeof value==="object" && !Array.isArray(value) ? value as Record<string, unknown> : {}; } catch { return {}; }
}

function jsonArray(raw: string): unknown[] {
  try { const value=JSON.parse(raw); return Array.isArray(value) ? value : []; } catch { return []; }
}

export function GoldAuthoringPanel({ spotId }: { spotId: string }) {
  const [profile, setProfile] = useState<GoldProfile | null>(null);
  const [fieldKey, setFieldKey] = useState("");
  const [rawValue, setRawValue] = useState("");
  const [sourceType, setSourceType] = useState("ADMIN_VERIFIED");
  const [sourceUrl, setSourceUrl] = useState("");
  const [sourceReference, setSourceReference] = useState("");
  const [message, setMessage] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const load = useCallback(async () => {
    const { data, error } = await supabase.rpc("backyrd_gold_profile_v1", { p_spot_id: spotId });
    if (error) throw error;
    const next=data as GoldProfile;
    setProfile(next);
    setFieldKey((current)=>current||next.catalog[0]?.field_key||"");
  }, [spotId]);

  useEffect(() => {
    // Initial server synchronization for this client-only Admin surface.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    void load().catch((error: unknown) => setMessage(error instanceof Error ? error.message : "Gold-Profil konnte nicht geladen werden."));
  }, [load]);

  const field = useMemo(() => profile?.catalog.find((item) => item.field_key === fieldKey), [fieldKey, profile]);

  async function submitProposal() {
    if (!field) return;
    setBusy(true); setMessage(null);
    try {
      const { data: sourceId, error: sourceError } = await supabase.rpc("backyrd_gold_create_source_v1", {
        p_spot_id: spotId,
        p_source_type: sourceType,
        p_source_url: sourceUrl.trim() || null,
        p_source_reference: sourceReference.trim() || null,
        p_title: "Admin Spot Editor V2",
        p_provider_identity: "Backyrd Admin",
        p_observed_at: new Date().toISOString(),
        p_last_checked_at: new Date().toISOString(),
        p_legal_use_status: "NOT_REQUIRED",
      });
      if (sourceError) throw sourceError;
      const { error } = await supabase.rpc("backyrd_gold_submit_proposal_v1", {
        p_spot_id: spotId,
        p_field_key: field.field_key,
        p_value: parseValue(field, rawValue),
        p_source_id: sourceId,
        p_idempotency_key: `admin-v2:${crypto.randomUUID()}`,
        p_confidence_rationale: "Vom Admin mit sichtbarer Quelle erfasst.",
        p_evidence_excerpt: null,
      });
      if (error) throw error;
      setMessage("Vorschlag gespeichert. Er muss bewusst akzeptiert werden, bevor er kanonische Wahrheit wird.");
      await load();
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Vorschlag konnte nicht gespeichert werden.");
    } finally { setBusy(false); }
  }

  async function review(proposalId: string, action: "ACCEPT" | "REJECT" | "MARK_UNKNOWN" | "MARK_STALE") {
    setBusy(true); setMessage(null);
    try {
      const { error } = await supabase.rpc("backyrd_gold_review_proposal_v1", { p_proposal_id: proposalId, p_action: action, p_resolution_note: "Admin Spot Editor V2" });
      if (error) throw error;
      setMessage(action === "ACCEPT" ? "Akzeptiert: Facts, N4 und Gold Readiness wurden atomar aktualisiert." : "Vorschlag aktualisiert.");
      await load();
    } catch (error) { setMessage(error instanceof Error ? error.message : "Review fehlgeschlagen."); }
    finally { setBusy(false); }
  }

  if (!profile) return <section className="spot-editor-section"><h2>Gold Authoring</h2><p>{message ?? "Wird geladen …"}</p></section>;

  const concepts = Object.entries(profile.canonicalN4?.intelligence?.concepts ?? {});
  // Field IDs, types and options come exclusively from the server catalog.
  const fields = profile.catalog;
  const objectValue=jsonObject(rawValue);
  const arrayValue=jsonArray(rawValue);
  const updateObject=(key:string,value:unknown)=>setRawValue(JSON.stringify({...objectValue,[key]:value}));

  return (
    <section className="spot-editor-section" style={{ marginTop: 24 }}>
      <div style={{ display: "flex", justifyContent: "space-between", gap: 16, alignItems: "start" }}>
        <div><div className="spot-editor-eyebrow">Canonical Gold Authoring</div><h2>Gold Readiness — {profile.readiness.status} {profile.readiness.coverage}%</h2><p>UNKNOWN ist erlaubt. Coverage ist keine Ranking- oder Match-Confidence.</p></div>
        <strong>{profile.actor.role}</strong>
      </div>

      {message && <p role="status">{message}</p>}

      <div className="spot-editor-grid" style={{ marginTop: 20 }}>
        <label><span>Typisiertes Feld</span><select value={fieldKey} onChange={(event) => { const next=event.target.value; setFieldKey(next); setRawValue(initialValue(profile.catalog.find((item) => item.field_key===next))); }}>{fields.map((item) => <option key={item.field_key} value={item.field_key}>{item.section} · {item.field_key} · {item.capability}</option>)}</select></label>
        {field?.value_kind === "ENUM" ? (
          <label><span>Wert</span><select value={rawValue} onChange={(event) => setRawValue(event.target.value)}><option value="">Bitte wählen</option>{field.allowed_values.map((item) => <option key={String(item)} value={String(item)}>{String(item)}</option>)}</select></label>
        ) : field?.field_key === "suitability.age" ? (
          <div><span>Alters-Eignung</span><div style={{display:"grid",gridTemplateColumns:"1fr 1fr 1fr",gap:8}}><input type="number" min="0" max="120" placeholder="Min. Alter" value={String(objectValue.min_age ?? "")} onChange={(event)=>updateObject("min_age",event.target.value===""?null:Number(event.target.value))}/><input type="number" min="0" max="120" placeholder="Max. Alter" value={String(objectValue.max_age ?? "")} onChange={(event)=>updateObject("max_age",event.target.value===""?null:Number(event.target.value))}/><select value={String(objectValue.adult_supervision_required ?? "UNKNOWN")} onChange={(event)=>updateObject("adult_supervision_required",event.target.value==="UNKNOWN"?"UNKNOWN":event.target.value==="YES")}><option>UNKNOWN</option><option>YES</option><option>NO</option></select></div></div>
        ) : field?.field_key === "social.suitability" || field?.field_key.startsWith("accessibility.") ? (
          <div><span>{field.field_key === "social.suitability" ? "Social Context" : "Accessibility capabilities"}</span><div style={{display:"grid",gridTemplateColumns:"repeat(2,minmax(0,1fr))",gap:8}}>{(field.field_key === "social.suitability" ? ["solo","date","friends","family","groups","work"] : ["step_free","wheelchair_spaces","accessible_toilet","elevator","hearing_support","assistance_dogs"]).map((key)=><label key={key}><small>{key}</small><select value={String(objectValue[key] ?? "UNKNOWN")} onChange={(event)=>updateObject(key,event.target.value)}><option>UNKNOWN</option><option>SUITABLE</option><option>NOT_SUITABLE</option></select></label>)}</div></div>
        ) : field?.value_kind === "MULTI_SELECT" && field.allowed_values.length > 0 ? (
          <div><span>Kontrollierte Auswahl</span><div style={{display:"flex",flexWrap:"wrap",gap:8}}>{field.allowed_values.map((item)=><label key={String(item)}><input type="checkbox" checked={arrayValue.includes(item)} onChange={(event)=>setRawValue(JSON.stringify(event.target.checked?[...arrayValue,item]:arrayValue.filter((value)=>value!==item)))}/>{String(item)}</label>)}</div></div>
        ) : field?.value_kind === "RANGE" ? (
          <div><span>Bereich</span><div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:8}}><input type="number" placeholder="Minimum" value={String(objectValue.min ?? "")} onChange={(event)=>updateObject("min",event.target.value===""?null:Number(event.target.value))}/><input type="number" placeholder="Maximum" value={String(objectValue.max ?? "")} onChange={(event)=>updateObject("max",event.target.value===""?null:Number(event.target.value))}/></div></div>
        ) : (
          <label><span>Strukturierter Wert ({field?.value_kind})</span><textarea value={rawValue} onChange={(event) => setRawValue(event.target.value)} rows={3} placeholder={field?.value_kind === "STRUCTURED_OBJECT" ? '{"min_age":4,"max_age":12,"adult_supervision_required":true}' : "[]"} /></label>
        )}
        <label><span>Quelle</span><select value={sourceType} onChange={(event) => setSourceType(event.target.value)}><option>ADMIN_VERIFIED</option><option>OFFICIAL_WEBSITE</option><option>OFFICIAL_DOCUMENT</option><option>STRUCTURED_PROVIDER</option><option>IMPORT</option></select></label>
        <label><span>Source URL</span><input value={sourceUrl} onChange={(event) => setSourceUrl(event.target.value)} placeholder="https://…" /></label>
        <label><span>Source Reference (falls keine URL)</span><input value={sourceReference} onChange={(event) => setSourceReference(event.target.value)} placeholder="Dokument / interne Referenz" /></label>
      </div>
      <button type="button" disabled={busy || !rawValue || (!sourceUrl.trim() && !sourceReference.trim())} onClick={() => void submitProposal()}>Als Proposal speichern</button>

      <h3 style={{ marginTop: 28 }}>Proposal Review</h3>
      <div style={{ display: "grid", gap: 10 }}>
        {profile.proposals.filter((item) => ["PENDING", "CONFLICT", "STALE"].includes(item.status)).map((item) => (
          <div key={item.id} style={{ border: "1px solid #ddd", borderRadius: 12, padding: 12 }}>
            <strong>{item.field_key}</strong> · {item.status}<pre style={{ whiteSpace: "pre-wrap" }}>{JSON.stringify(item.proposed_value, null, 2)}</pre>
            <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}><button type="button" onClick={() => void review(item.id, "ACCEPT")}>Accept</button><button type="button" onClick={() => void review(item.id, "REJECT")}>Reject</button><button type="button" onClick={() => void review(item.id, "MARK_UNKNOWN")}>Mark Unknown</button><button type="button" onClick={() => void review(item.id, "MARK_STALE")}>Mark Stale</button></div>
          </div>
        ))}
        {!profile.proposals.some((item) => ["PENDING", "CONFLICT", "STALE"].includes(item.status)) && <p>Keine offenen Proposals.</p>}
      </div>

      <h3 style={{ marginTop: 28 }}>Gold Readiness</h3>
      <ul>{profile.readiness.gaps.map((gap) => <li key={`${gap.state}:${gap.item}`}><strong>{gap.state}</strong>: {gap.item}</li>)}</ul>

      <h3 style={{ marginTop: 28 }}>Canonical Intelligence (read-only)</h3>
      <p>Snapshot {profile.canonicalN4?.snapshotHash ?? "UNKNOWN"} · {concepts.length} Concepts · Confidence {profile.canonicalN4?.confidence ?? "UNKNOWN"}</p>
      <ul>{concepts.map(([key, value]) => <li key={key}><strong>{key}</strong> <code>{JSON.stringify(value)}</code></li>)}</ul>
      <p><small>{profile.legacy.label}. N4 confidence and snapshot cannot be edited here.</small></p>
    </section>
  );
}
