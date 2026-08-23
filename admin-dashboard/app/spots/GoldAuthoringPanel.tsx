"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { HUMAN_ACCESSIBILITY_LABELS, HUMAN_CONTEXT_LABELS, HUMAN_OBJECT_FIELD_LABELS, HUMAN_SPOT_FIELDS, HUMAN_SPOT_SECTIONS, HUMAN_VALUE_LABELS } from "@backyrd/canonical-semantics";
import { supabase } from "@/lib/supabaseClient";

type CatalogField = { field_key: string; section: string; capability: "BASIC" | "DEEP"; value_kind: string; allowed_values: unknown[]; owner_editable: boolean };
type Source = { id: string; source_type: string; source_url?: string | null; source_reference?: string | null; last_checked_at?: string | null };
type AcceptedFact = { id: string; field_key: string; value: unknown; status: string; source_id: string; accepted_at?: string; last_checked_at?: string | null; evidence_scope?: string | null };
type Proposal = { id: string; field_key: string; proposed_value: unknown; status: string; source_id: string; evidence_excerpt?: string | null; research_evidence_scope?: string | null; evidence_scope?: string | null };
type ReadinessGap = { item: string; state: "MISSING" | "UNKNOWN" | "STALE" | "CONFLICT" | "INVALID" | "UNSUPPORTED"; label?: string; detail?: string };
type ReviewIssue = { code: string; factId?: string | null; fieldKey: string; label: string; detail: string; severity: string; currentValue?: unknown; sourceId?: string | null; canonicalValue?: unknown; canConfirm?: boolean; canMarkUnknown?: boolean };
type GoldProfile = {
  actor: { role: "FOUNDER" | "ADMIN" | "OWNER"; capability: "BASIC" | "DEEP" };
  catalog: CatalogField[]; proposals: Proposal[]; sources: Source[]; acceptedFacts: AcceptedFact[];
  readiness: { status: string; coverage: number; gaps: ReadinessGap[]; ready?: Array<{ item: string; label?: string }> };
  reviewIssues?: ReviewIssue[];
  canonicalN4: { snapshotHash?: string; intelligence?: { concepts?: Record<string, unknown> } } | null;
};

const SOURCE_OPTIONS = [["ADMIN_VERIFIED", "Eigene Kenntnis / vor Ort geprüft"], ["OFFICIAL_WEBSITE", "Offizielle Website"], ["OFFICIAL_DOCUMENT", "Andere verlässliche offizielle Quelle"]] as const;
const SCOPE_OPTIONS = [["SPOT", "Ja, diese Angabe gilt allgemein für den Ort"], ["EVENT", "Nur für ein bestimmtes Event"], ["PROGRAM", "Nur für ein bestimmtes Angebot / Programm"], ["TEMPORARY", "Nur vorübergehend"]] as const;
const SECTION_ORDER = ["ACTIVITY_DETAILS", "SUITABILITY", "AUDIENCE_SOCIAL"];

function humanField(key: string) { return HUMAN_SPOT_FIELDS[key as keyof typeof HUMAN_SPOT_FIELDS] ?? { question: key }; }
function humanValue(value: unknown): string {
  if (value == null) return "Noch nicht bekannt";
  if (Array.isArray(value)) return value.map(humanValue).join(", ") || "Keine Auswahl";
  if (typeof value === "object") return Object.entries(value).map(([key, entry]) => `${HUMAN_CONTEXT_LABELS[key as keyof typeof HUMAN_CONTEXT_LABELS] ?? HUMAN_ACCESSIBILITY_LABELS[key as keyof typeof HUMAN_ACCESSIBILITY_LABELS] ?? HUMAN_OBJECT_FIELD_LABELS[key as keyof typeof HUMAN_OBJECT_FIELD_LABELS] ?? "Angabe"}: ${humanValue(entry)}`).join(" · ");
  const key = String(value);
  if (key === "SUITABLE") return "Ja / gut geeignet";
  if (key === "NOT_SUITABLE") return "Nein / eher nicht geeignet";
  if (key === "true") return "Ja";
  if (key === "false") return "Nein";
  return HUMAN_VALUE_LABELS[key as keyof typeof HUMAN_VALUE_LABELS] ?? key.replaceAll("_", " ").toLocaleLowerCase("de-CH");
}
function blankValue(field: CatalogField): unknown {
  if (field.field_key === "suitability.age") return { min_age: null, max_age: null, adult_supervision_required: "UNKNOWN" };
  if (field.field_key === "social.suitability") return Object.fromEntries(Object.keys(HUMAN_CONTEXT_LABELS).map((key) => [key, "UNKNOWN"]));
  if (field.field_key === "accessibility.capabilities") return Object.fromEntries(Object.keys(HUMAN_ACCESSIBILITY_LABELS).map((key) => [key, "UNKNOWN"]));
  if (field.value_kind === "MULTI_SELECT") return [];
  if (["RANGE", "STRUCTURED_OBJECT"].includes(field.value_kind)) return {};
  return "";
}

function HumanControl({ field, value, onChange }: { field: CatalogField; value: unknown; onChange: (next: unknown) => void }) {
  const config = humanField(field.field_key);
  const labels = "labels" in config ? config.labels : undefined;
  if (field.field_key === "suitability.age") {
    const age = (value && typeof value === "object" ? value : {}) as Record<string, unknown>;
    const supervision = age.adult_supervision_required === true ? "YES" : age.adult_supervision_required === false ? "NO" : String(age.adult_supervision_required ?? "UNKNOWN");
    return <div className="human-age-grid"><label><span>Ab welchem Alter?</span><input type="number" min="0" max="120" value={String(age.min_age ?? "")} onChange={(e) => onChange({ ...age, min_age: e.target.value === "" ? null : Number(e.target.value) })} /></label><label><span>Bis zu welchem Alter besonders geeignet?</span><input type="number" min="0" max="120" value={String(age.max_age ?? "")} onChange={(e) => onChange({ ...age, max_age: e.target.value === "" ? null : Number(e.target.value) })} /></label><label><span>Begleitung durch Erwachsene?</span><select value={supervision} onChange={(e) => onChange({ ...age, adult_supervision_required: e.target.value === "YES" ? true : e.target.value === "NO" ? false : "UNKNOWN" })}><option value="UNKNOWN">Weiß ich nicht</option><option value="YES">Ja</option><option value="NO">Nein</option></select></label></div>;
  }
  if (["social.suitability", "accessibility.capabilities"].includes(field.field_key)) {
    const current = (value && typeof value === "object" ? value : {}) as Record<string, unknown>;
    const items = field.field_key === "social.suitability" ? HUMAN_CONTEXT_LABELS : HUMAN_ACCESSIBILITY_LABELS;
    return <div className="human-tristate-grid">{Object.entries(items).map(([key, label]) => <label key={key}><span>{label}</span><select value={String(current[key] ?? "UNKNOWN")} onChange={(e) => onChange({ ...current, [key]: e.target.value })}><option value="UNKNOWN">Weiß ich nicht</option><option value="SUITABLE">Ja / gut geeignet</option><option value="NOT_SUITABLE">Nein / eher nicht</option></select></label>)}</div>;
  }
  if (field.field_key === "duration.approximate") {
    const range = (value && typeof value === "object" ? value : {}) as Record<string, unknown>;
    return <div className="human-age-grid"><label><span>Mindestens (Minuten)</span><input type="number" min="0" value={String(range.min ?? "")} onChange={(e) => onChange({ ...range, min: e.target.value === "" ? null : Number(e.target.value) })} /></label><label><span>Höchstens (Minuten)</span><input type="number" min="0" value={String(range.max ?? "")} onChange={(e) => onChange({ ...range, max: e.target.value === "" ? null : Number(e.target.value) })} /></label></div>;
  }
  if (field.value_kind === "ENUM") return <select value={String(value ?? "")} onChange={(e) => onChange(e.target.value)}><option value="">Bitte auswählen</option>{field.allowed_values.map((option) => <option key={String(option)} value={String(option)}>{labels?.[String(option) as keyof typeof labels] ?? humanValue(option)}</option>)}</select>;
  if (field.value_kind === "MULTI_SELECT" && field.allowed_values.length) {
    const selected = Array.isArray(value) ? value : [];
    return <div className="human-choice-grid">{field.allowed_values.map((option) => <label key={String(option)} className={selected.includes(option) ? "selected" : ""}><input type="checkbox" checked={selected.includes(option)} onChange={(e) => onChange(e.target.checked ? [...selected, option] : selected.filter((item) => item !== option))} /><span>{humanValue(option)}</span></label>)}</div>;
  }
  return <textarea rows={3} value={typeof value === "string" ? value : JSON.stringify(value ?? "", null, 2)} onChange={(e) => onChange(e.target.value)} placeholder="Kurze, konkrete Angabe" />;
}

export function GoldAuthoringPanel({ spotId, refreshToken = 0 }: { spotId: string; refreshToken?: number }) {
  const [profile, setProfile] = useState<GoldProfile | null>(null);
  const [drafts, setDrafts] = useState<Record<string, unknown>>({});
  const [sourceType, setSourceType] = useState("ADMIN_VERIFIED");
  const [sourceUrl, setSourceUrl] = useState("");
  const [sourceReference, setSourceReference] = useState("");
  const [scope, setScope] = useState("SPOT");
  const [busy, setBusy] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);
  const load = useCallback(async () => { const { data, error } = await supabase.rpc("backyrd_gold_profile_v1", { p_spot_id: spotId }); if (error) throw error; setProfile(data as GoldProfile); }, [spotId]);
  useEffect(() => {
    void supabase.rpc("backyrd_gold_profile_v1", { p_spot_id: spotId }).then(({ data, error }) => {
      if (error) setMessage(error.message);
      else setProfile(data as GoldProfile);
    });
  }, [spotId, refreshToken]);
  const sourceById = useMemo(() => new Map((profile?.sources ?? []).map((source) => [source.id, source])), [profile]);
  const acceptedByField = useMemo(() => new Map((profile?.acceptedFacts ?? []).map((fact) => [fact.field_key, fact])), [profile]);
  const issueByField = useMemo(() => new Map((profile?.reviewIssues ?? []).map((issue) => [issue.fieldKey, issue])), [profile]);
  const sections = useMemo(() => SECTION_ORDER.map((key) => ({ key, config: HUMAN_SPOT_SECTIONS.find((section) => section.key === key), fields: (profile?.catalog ?? []).filter((field) => field.field_key !== "audience.basic" && field.section === key && field.owner_editable && humanField(field.field_key).question !== field.field_key) })).filter((section) => section.fields.length), [profile]);

  async function submit(field: CatalogField) {
    setBusy(field.field_key); setMessage(null);
    try {
      const rpc = scope === "SPOT" ? "backyrd_gold_save_human_fact_v1" : "backyrd_gold_submit_human_proposal_v1";
      const { data, error } = await supabase.rpc(rpc, { p_spot_id: spotId, p_field_key: field.field_key, p_value: drafts[field.field_key] ?? acceptedByField.get(field.field_key)?.value ?? blankValue(field), p_source_type: sourceType, p_source_url: sourceUrl.trim() || null, p_source_reference: sourceReference.trim() || (sourceType === "ADMIN_VERIFIED" ? `admin-verified:${new Date().toISOString()}` : null), p_evidence_scope: scope, p_idempotency_key: `human-editor-v1.1:${crypto.randomUUID()}` });
      if (error) throw error;
      const result = data as { reviewRequired?: boolean } | null;
      setDrafts((current) => { const next = { ...current }; delete next[field.field_key]; return next; });
      setMessage(result?.reviewRequired || scope !== "SPOT" ? "Zur Prüfung gespeichert. Bestehende Historie bleibt erhalten." : "✓ Gespeichert. Spot-Verständnis und Readiness sind aktuell."); await load();
    } catch (error) { setMessage(error instanceof Error ? error.message : "Angabe konnte nicht gespeichert werden."); } finally { setBusy(null); }
  }
  async function review(id: string, action: "ACCEPT" | "REJECT" | "MARK_UNKNOWN" | "MARK_STALE") {
    setBusy(id); setMessage(null);
    try { const { error } = await supabase.rpc("backyrd_gold_review_proposal_v1", { p_proposal_id: id, p_action: action, p_resolution_note: "Human Spot Editor V1" }); if (error) throw error; setMessage(action === "ACCEPT" ? "Bestätigt. Spot-Verständnis und Readiness wurden gemeinsam aktualisiert." : "Prüfstatus aktualisiert."); await load(); }
    catch (error) { setMessage(error instanceof Error ? error.message : "Prüfung fehlgeschlagen."); } finally { setBusy(null); }
  }
  async function reviewAcceptedFact(id: string, action: "CONFIRM_SPOT" | "MARK_UNKNOWN" | "RETRACT" | "MARK_STALE") {
    setBusy(id); setMessage(null);
    try { const { error } = await supabase.rpc("backyrd_gold_review_accepted_fact_v1", { p_fact_id: id, p_action: action, p_resolution_note: "Human Spot Editor V1.1" }); if (error) throw error; setMessage(action === "CONFIRM_SPOT" ? "Die allgemeine Gültigkeit wurde bestätigt." : action === "MARK_UNKNOWN" ? "Die Angabe wurde nachvollziehbar als unbekannt korrigiert." : action === "RETRACT" ? "Die Angabe wird nicht mehr verwendet; ihre Historie bleibt erhalten." : "Die Angabe wurde als veraltet markiert."); await load(); }
    catch (error) { setMessage(error instanceof Error ? error.message : "Prüfung fehlgeschlagen."); } finally { setBusy(null); }
  }
  if (!profile) return <section className="spot-editor-section"><h2>Wie Backyrd diesen Spot versteht</h2><p>{message ?? "Wird geladen …"}</p></section>;
  const open = profile.proposals.filter((proposal) => ["PENDING", "CONFLICT", "STALE"].includes(proposal.status));
  const understood = profile.acceptedFacts.filter((fact) => fact.status === "ACTIVE" && fact.evidence_scope === "SPOT" && fact.field_key !== "audience.basic").slice(0, 14);
  const sourceLabel = (source?: Source) => SOURCE_OPTIONS.find(([key]) => key === source?.source_type)?.[1] ?? "Quellenangabe";
  function startCorrection(issue: ReviewIssue) {
    if ((profile?.catalog ?? []).some((field) => field.field_key === issue.fieldKey && field.owner_editable)) {
      setDrafts((current) => ({ ...current, [issue.fieldKey]: issue.canonicalValue ?? issue.currentValue ?? current[issue.fieldKey] }));
      document.getElementById(`human-field-${issue.fieldKey}`)?.scrollIntoView({ behavior: "smooth", block: "center" });
      setMessage("Trage den korrekten Wert oben ein und speichere ihn mit einer passenden Quelle.");
    } else setMessage("Diese ältere technische Angabe wird über die normale Kategorie oder Öffnungszeiten korrigiert. Sie kann hier nachvollziehbar nicht mehr verwendet werden.");
  }

  return <section className="spot-editor-section human-spot-editor">
    <header className="human-editor-header"><div><div className="spot-editor-eyebrow">Spot-Verständnis</div><h2>Erkläre Backyrd diesen Ort</h2><p>Du brauchst keine technischen Begriffe. Beschreibe nur, was zuverlässig stimmt. Unbekannt ist besser als geraten.</p></div><div className="human-readiness"><strong>{profile.readiness.coverage}%</strong><span>{profile.readiness.status === "GOLD_READY" ? "Gut und verlässlich beschrieben" : "Teilweise beschrieben"}</span></div></header>
    <nav className="human-section-nav" aria-label="Bereiche im Spot-Verständnis"><a href="#human-understanding">Verstanden</a><a href="#human-sources">Quelle</a>{sections.map(({ key, config }) => <a href={`#human-section-${key}`} key={key}>{config?.label}</a>)}<a href="#human-review">Prüfen</a></nav>
    {message && <p className="by-alert" role="status">{message}</p>}
    <div className="human-readiness-grid"><div><h3>Bereits gut beschrieben</h3><ul>{(profile.readiness.ready ?? []).map((item) => <li key={item.item}>✓ {item.label ?? item.item}</li>)}</ul></div><div><h3>Noch offen oder zu prüfen</h3><ul>{profile.readiness.gaps.map((gap) => <li key={`${gap.state}:${gap.item}`}><strong>{gap.state === "UNKNOWN" ? "○" : "!"}</strong> {gap.label ?? gap.item}{gap.detail && <small>{gap.detail}</small>}</li>)}{(profile.reviewIssues ?? []).map((issue) => { const issueSource = issue.sourceId ? sourceById.get(issue.sourceId) : undefined; return <li key={issue.code}><strong>!</strong> {humanField(issue.fieldKey).question}: {issue.label}<small>{issue.detail}</small><small>Aktuell: {humanValue(issue.currentValue)} · Quelle: {sourceLabel(issueSource)}</small>{issue.canonicalValue != null && <small>Aktuelle kanonische Einordnung: {humanValue(issue.canonicalValue)}</small>}{issue.factId && <span className="human-issue-actions">{issue.canConfirm && <button type="button" disabled={busy !== null} onClick={() => void reviewAcceptedFact(issue.factId!, "CONFIRM_SPOT")}>Bestätigen</button>}<button type="button" disabled={busy !== null} onClick={() => startCorrection(issue)}>Korrigieren</button>{issue.canMarkUnknown && <button type="button" disabled={busy !== null} onClick={() => void reviewAcceptedFact(issue.factId!, "MARK_UNKNOWN")}>Als unbekannt markieren</button>}<button type="button" disabled={busy !== null} onClick={() => void reviewAcceptedFact(issue.factId!, "RETRACT")}>Nicht mehr verwenden</button></span>}</li>; })}</ul></div></div>
    <section className="human-understanding-card" id="human-understanding"><div><span>Backyrd versteht diesen Spot als</span><h3>{understood.length ? "Verlässlich beschriebener Ort" : "Noch nicht ausreichend beschrieben"}</h3></div><div className="human-understanding-tags">{understood.map((fact) => <span key={fact.id}><b>{humanField(fact.field_key).question}</b>{humanValue(fact.value)}</span>)}</div>{profile.readiness.gaps.length ? <p><strong>Noch unklar:</strong> {profile.readiness.gaps.slice(0, 5).map((gap) => gap.label ?? gap.item).join(" · ")}</p> : null}</section>
    <section className="human-source-panel" id="human-sources"><h3>Quelle für neue Angaben</h3><p>Woher stammt die Information? Diese Angabe bleibt mit deiner Änderung verbunden.</p><div className="spot-editor-grid"><label><span>Quelle</span><select value={sourceType} onChange={(e) => setSourceType(e.target.value)}>{SOURCE_OPTIONS.map(([key, label]) => <option key={key} value={key}>{label}</option>)}</select></label><label><span>Website oder Referenz</span><input value={sourceUrl} onChange={(e) => setSourceUrl(e.target.value)} placeholder="https://… (bei Online-Quelle)" /><input value={sourceReference} onChange={(e) => setSourceReference(e.target.value)} placeholder="z. B. vor Ort geprüft am …" /></label><label><span>Gilt diese Information für den Ort allgemein?</span><select value={scope} onChange={(e) => setScope(e.target.value)}>{SCOPE_OPTIONS.map(([key, label]) => <option key={key} value={key}>{label}</option>)}</select></label></div></section>
    {sections.map(({ key, config, fields }) => <section id={`human-section-${key}`} key={key} className="human-editor-section"><h3>{config?.label}</h3><p>{config?.description}</p><div className="human-field-list">{fields.map((field) => { const accepted = acceptedByField.get(field.field_key); const fieldIssue = issueByField.get(field.field_key); const value = drafts[field.field_key] ?? accepted?.value ?? blankValue(field); const details = humanField(field.field_key); const source = accepted ? sourceById.get(accepted.source_id) : undefined; return <article id={`human-field-${field.field_key}`} key={field.field_key} className="human-field-card"><div className="human-field-copy"><h4>{details.question}</h4>{"help" in details && details.help && <p>{details.help}</p>}{accepted ? <div className="human-current"><strong>Aktuell bestätigt: {humanValue(accepted.value)}</strong><span>Quelle: {sourceLabel(source)} · Gültigkeit: {accepted.evidence_scope === "SPOT" ? "gilt allgemein für den Ort" : accepted.evidence_scope ?? "ungeklärt"}{accepted.last_checked_at || accepted.accepted_at ? ` · zuletzt geprüft ${new Date(accepted.last_checked_at ?? accepted.accepted_at ?? "").toLocaleDateString("de-CH")}` : ""}</span>{fieldIssue && <em>Zu prüfen: {fieldIssue.label}</em>}</div> : <div className="human-current unknown"><strong>Noch nicht bestätigt</strong></div>}</div><div className="human-field-control"><HumanControl field={field} value={value} onChange={(next) => setDrafts((current) => ({ ...current, [field.field_key]: next }))} /><button type="button" disabled={busy !== null} onClick={() => void submit(field)}>{busy === field.field_key ? "Wird gespeichert …" : scope === "SPOT" ? "Speichern" : "Zur Prüfung speichern"}</button></div></article>; })}</div></section>)}
    <section className="human-review-section" id="human-review"><h3>Angaben zur Prüfung</h3><p>Bestätigen verändert die bestehende Wahrheit nachvollziehbar; alte Werte bleiben in der Historie.</p>{open.length ? <div className="human-proposal-list">{open.map((proposal) => { const source = sourceById.get(proposal.source_id); const proposalScope = proposal.evidence_scope ?? proposal.research_evidence_scope ?? "UNGEKLÄRT"; return <article key={proposal.id}><h4>{humanField(proposal.field_key).question}</h4><p><strong>Aktueller Wert:</strong> {humanValue(acceptedByField.get(proposal.field_key)?.value)}</p><p><strong>Neuer Wert:</strong> {humanValue(proposal.proposed_value)}</p><p><strong>Quelle:</strong> {sourceLabel(source)}{source?.source_url ? ` · ${source.source_url}` : ""}</p><p><strong>Warum prüfen?</strong> {proposalScope === "SPOT" ? "Die Angabe verändert das allgemeine Verständnis dieses Ortes." : proposalScope === "EVENT" ? "Die Angabe gilt nur für ein Event." : proposalScope === "PROGRAM" ? "Die Angabe gilt nur für ein Angebot oder Programm." : proposalScope === "TEMPORARY" ? "Die Angabe gilt nur vorübergehend." : "Die Gültigkeit ist noch nicht eindeutig."}</p>{proposal.evidence_excerpt && <p>{proposal.evidence_excerpt}</p>}<div><button type="button" disabled={busy !== null || proposalScope !== "SPOT"} onClick={() => void review(proposal.id, "ACCEPT")}>Bestätigen</button><button type="button" disabled={busy !== null} onClick={() => void review(proposal.id, "REJECT")}>Ablehnen</button><button type="button" disabled={busy !== null || proposalScope !== "SPOT"} onClick={() => void review(proposal.id, "MARK_UNKNOWN")}>Als unbekannt markieren</button><button type="button" disabled={busy !== null} onClick={() => void review(proposal.id, "MARK_STALE")}>Als veraltet markieren</button></div></article>; })}</div> : <div className="admin-emptyState compact"><span>✓</span><strong>Keine offenen Prüfungen</strong><p>Alle aktuellen Angaben sind eingeordnet.</p></div>}</section>
    {profile.actor.role === "FOUNDER" && <details className="human-debug"><summary>Technische Diagnose für Founder</summary><p>Snapshot: {profile.canonicalN4?.snapshotHash ?? "nicht vorhanden"}</p><pre>{JSON.stringify({ acceptedFacts: profile.acceptedFacts, reviewIssues: profile.reviewIssues, concepts: profile.canonicalN4?.intelligence?.concepts }, null, 2)}</pre></details>}
  </section>;
}
