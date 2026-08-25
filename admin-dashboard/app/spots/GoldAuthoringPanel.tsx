"use client";

import { useEffect, useMemo, useState } from "react";
import { supabase } from "@/lib/supabaseClient";
import { AUTHORING_SECTIONS, READINESS_LABELS, currentFact, humanError, type AuthoringProfile, type AuthoringQuestion, type AuthoringSectionId } from "@/lib/humanSpotV2";
import { HumanSpotQuestion } from "./HumanSpotQuestion";

const SOURCE_OPTIONS = [["ADMIN_VERIFIED", "Eigene Kenntnis / vor Ort geprüft"], ["OFFICIAL_WEBSITE", "Offizielle Website"], ["OFFICIAL_DOCUMENT", "Offizielle Dokumentation"]] as const;
const SCOPE_OPTIONS = [["SPOT", "Gilt allgemein für diesen Ort"], ["PROGRAM", "Nur für ein regelmäßiges Angebot"], ["EVENT", "Nur für ein bestimmtes Event"], ["TEMPORARY", "Nur vorübergehend"]] as const;
const GASTRONOMY = new Set(["BREWPUB", "BAR", "COCKTAIL_BAR", "WINE_BAR", "RESTAURANT", "CAFE", "BAKERY", "NIGHTLIFE"]);

function defaultValue(question: AuthoringQuestion): unknown {
  if (question.control_type === "MULTI_CHOICE") return [];
  if (question.control_type === "TRI_STATE_MAP" || question.control_type === "ACCESSIBILITY_MAP") return Object.fromEntries(question.options.map((option) => [String(option.value), "UNKNOWN"]));
  if (question.control_type === "AGE_RANGE") return { min_age: null, max_age: null, adult_supervision_required: "UNKNOWN" };
  return "UNKNOWN";
}
function stableEqual(a: unknown, b: unknown): boolean { return JSON.stringify(a) === JSON.stringify(b); }

export function GoldAuthoringPanel({ spotId, refreshToken = 0 }: { spotId: string; refreshToken?: number }) {
  const [profile, setProfile] = useState<AuthoringProfile | null>(null);
  const draftKey = `backyrd:hsi-v2:draft:${spotId}`;
  const [drafts, setDrafts] = useState<Record<string, unknown>>(() => {
    if (typeof window === "undefined") return {};
    const stored = sessionStorage.getItem(draftKey);
    if (!stored) return {};
    try { return JSON.parse(stored) as Record<string, unknown>; } catch { sessionStorage.removeItem(draftKey); return {}; }
  });
  const [sourceType, setSourceType] = useState("ADMIN_VERIFIED");
  const [sourceUrl, setSourceUrl] = useState("");
  const [sourceReference, setSourceReference] = useState("");
  const [scope, setScope] = useState("SPOT");
  const [busy, setBusy] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);

  useEffect(() => {
    void supabase.rpc("backyrd_human_spot_profile_v2", { p_spot_id: spotId }).then(({ data, error }) => {
      if (error) setMessage(humanError(error));
      else setProfile(data as AuthoringProfile);
    });
  }, [draftKey, spotId, refreshToken]);
  useEffect(() => {
    if (Object.keys(drafts).length) sessionStorage.setItem(draftKey, JSON.stringify(drafts));
    else sessionStorage.removeItem(draftKey);
  }, [draftKey, drafts]);

  const archetypes = useMemo(() => profile ? [profile.authoring.primaryArchetype, ...profile.authoring.secondaryArchetypes] : [], [profile]);
  const facts = useMemo(() => new Map((profile?.acceptedFacts ?? []).filter((fact) => ["ACTIVE", "UNKNOWN", "STALE"].includes(fact.status)).map((fact) => [fact.field_key, fact])), [profile]);
  const sources = useMemo(() => new Map((profile?.sources ?? []).map((source) => [source.id, source])), [profile]);
  const questions = useMemo(() => (profile?.questions ?? []).filter((question) => {
    if (!question.relevant) return false;
    const condition = question.relevance?.showWhen;
    if (!condition) return true;
    const parentQuestion = profile?.questions.find((item) => item.question_id === condition.questionId);
    const parent = drafts[condition.questionId] ?? currentFact(profile!, parentQuestion?.canonical_field_key ?? "")?.value;
    return condition.values.some((value) => stableEqual(value, parent));
  }), [drafts, profile]);
  const dirtyQuestions = useMemo(() => new Set(Object.keys(drafts).filter((id) => {
    const question = profile?.questions.find((item) => item.question_id === id);
    return question && !stableEqual(drafts[id], facts.get(question.canonical_field_key)?.value);
  })), [drafts, facts, profile]);

  async function saveSection(sectionId: AuthoringSectionId) {
    if (!profile) return;
    const changed = questions.filter((question) => question.section_id === sectionId && dirtyQuestions.has(question.question_id));
    if (!changed.length) { setMessage("In diesem Abschnitt gibt es keine ungespeicherten Änderungen."); return; }
    setBusy(sectionId); setMessage(null);
    try {
      const { data, error } = await supabase.rpc("backyrd_human_spot_save_section_v2", {
        p_spot_id: spotId, p_section_id: sectionId,
        p_answers: changed.map((question) => ({ questionId: question.question_id, value: drafts[question.question_id] })),
        p_source_type: sourceType, p_source_url: sourceUrl.trim() || null, p_source_reference: sourceReference.trim() || null,
        p_evidence_scope: scope, p_idempotency_key: `hsi-v2:${crypto.randomUUID()}`,
        p_expected_snapshot_hash: profile.canonicalN4?.snapshotHash ?? null,
      });
      if (error) throw error;
      const result = data as { persisted?: number; profile?: AuthoringProfile; reviewRequired?: boolean };
      if (!result || result.persisted !== changed.length || !result.profile) throw new Error("authoring_persistence_not_confirmed");
      setProfile(result.profile);
      setDrafts((current) => { const next = { ...current }; changed.forEach((question) => delete next[question.question_id]); return next; });
      setMessage(result.reviewRequired ? "Zur Prüfung gespeichert. Die allgemeine Spot-Wahrheit blieb unverändert." : `${changed.length} ${changed.length === 1 ? "Angabe" : "Angaben"} gespeichert. Backyrds Verständnis ist aktuell.`);
    } catch (error) { setMessage(humanError(error)); } finally { setBusy(null); }
  }

  async function saveArchetype(primary: string) {
    if (!profile || primary === profile.authoring.primaryArchetype) return;
    setBusy("ARCHETYPE"); setMessage(null);
    try {
      const { data, error } = await supabase.rpc("backyrd_human_spot_set_archetypes_v2", { p_spot_id: spotId, p_primary_archetype: primary, p_secondary_archetypes: profile.authoring.secondaryArchetypes.filter((item) => item !== primary) });
      if (error) throw error;
      setProfile(data as AuthoringProfile);
      setMessage("Die Fragen wurden an die Art des Orts angepasst. Es wurden keine inhaltlichen Antworten vorausgewählt.");
    } catch (error) { setMessage(humanError(error)); } finally { setBusy(null); }
  }

  async function reviewProposal(proposalId: string, action: "ACCEPT" | "REJECT") {
    setBusy(proposalId); setMessage(null);
    try {
      const { error } = await supabase.rpc("backyrd_gold_review_proposal_v1", { p_proposal_id: proposalId, p_action: action, p_resolution_note: "Human Spot Intelligence V2" });
      if (error) throw error;
      const { data, error: profileError } = await supabase.rpc("backyrd_human_spot_profile_v2", { p_spot_id: spotId });
      if (profileError) throw profileError;
      setProfile(data as AuthoringProfile);
      setMessage(action === "ACCEPT" ? "Vorschlag bestätigt und kanonisches Spot-Verständnis aktualisiert." : "Vorschlag abgelehnt. Die Entscheidung bleibt nachvollziehbar.");
    } catch (error) { setMessage(humanError(error)); } finally { setBusy(null); }
  }

  async function reviewAcceptedFact(factId: string, action: "CONFIRM_SPOT" | "MARK_UNKNOWN" | "RETRACT") {
    setBusy(factId); setMessage(null);
    try {
      const { error } = await supabase.rpc("backyrd_gold_review_accepted_fact_v1", { p_fact_id: factId, p_action: action, p_resolution_note: "Human Spot Intelligence V2" });
      if (error) throw error;
      const { data, error: profileError } = await supabase.rpc("backyrd_human_spot_profile_v2", { p_spot_id: spotId });
      if (profileError) throw profileError;
      setProfile(data as AuthoringProfile);
      setMessage(action === "CONFIRM_SPOT" ? "Die allgemeine Gültigkeit wurde bestätigt." : action === "MARK_UNKNOWN" ? "Die Angabe ist jetzt ehrlich als unbekannt markiert." : "Die Angabe wird nicht mehr verwendet; ihre Historie bleibt erhalten.");
    } catch (error) { setMessage(humanError(error)); } finally { setBusy(null); }
  }

  if (!profile) return <section className="spot-editor-section hsi-v2"><h2>Backyrd Intelligence</h2><p>{message ?? "Wird geladen …"}</p></section>;
  const isGastronomy = GASTRONOMY.has(profile.authoring.primaryArchetype);
  const missing = profile.humanReadiness.missing.filter((item) => item.priority !== "OPTIONAL").slice(0, 6);

  return <section className="spot-editor-section hsi-v2">
    <header className="hsi-hero"><div><span className="spot-editor-eyebrow">Human Spot Intelligence V2</span><h2>Backyrd Intelligence</h2><p>Beschreibe den Ort so, wie du ihn einem Menschen erklären würdest. Unbekannt ist immer besser als geraten.</p></div><div className="hsi-readiness"><strong>{READINESS_LABELS[profile.humanReadiness.status]}</strong><span>{profile.humanReadiness.answered} von {profile.humanReadiness.relevant} wichtigen Bereichen · {profile.humanReadiness.coverage}%</span></div></header>
    <div className="hsi-summary" id="hsi-summary"><span>So versteht Backyrd diesen Ort</span><h3>{profile.humanSummary.text}</h3><p>Deterministisch aus bestätigten Angaben – keine KI-Zusammenfassung.</p></div>
    {missing.length > 0 && <div className="hsi-missing"><div><strong>Was Backyrd noch fehlt</strong><span>{missing.length} wichtige, für diesen Ort relevante Angaben</span></div><div>{missing.map((item) => <button type="button" key={item.questionId} onClick={() => document.getElementById(`hsi-${item.questionId}`)?.scrollIntoView({ behavior: "smooth", block: "center" })}>{item.label}</button>)}</div></div>}
    {message && <p className="by-alert hsi-alert" role="status">{message}</p>}

    <div className="hsi-archetype-card"><label><span>Was beschreibt diesen Ort am besten?</span><select aria-label="Art des Orts" disabled={busy !== null} value={profile.authoring.primaryArchetype} onChange={(event) => void saveArchetype(event.target.value)}>{profile.archetypes.map((item) => <option key={item.archetype_id} value={item.archetype_id}>{item.group_de} · {item.label_de}</option>)}</select><small>Bestimmt nur die Fragen – kein Ranking-Signal und keine vorausgewählte Wahrheit.</small></label></div>
    <div className="hsi-mobile-section"><label htmlFor="hsi-section-select">Bereich öffnen</label><select id="hsi-section-select" onChange={(event) => document.getElementById(event.target.value)?.scrollIntoView({ behavior: "smooth" })}><option value="hsi-summary">Zusammenfassung</option>{AUTHORING_SECTIONS.filter((section) => questions.some((question) => question.section_id === section.id)).map((section) => <option value={`hsi-section-${section.id}`} key={section.id}>{section.label}</option>)}</select></div>
    <nav className="hsi-section-nav" aria-label="Bereiche der Spot Intelligence"><a href="#hsi-summary">Verstanden</a>{AUTHORING_SECTIONS.filter((section) => questions.some((question) => question.section_id === section.id)).map((section) => <a href={`#hsi-section-${section.id}`} key={section.id}>{section.label}</a>)}</nav>
    {isGastronomy && <aside className="hsi-semantic-note"><strong>Gastronomie heute ehrlich abbilden</strong><p>Backyrd kann Ortstyp, Publikum, Zeitpunkt, Atmosphäre und praktische Eignung kanonisch nutzen. Bier, Craft Beer, konkrete Speisen, Apéro und Afterwork sind im eingefrorenen Engine-Modell noch keine strukturierten Offering-Fakten. Dafür wird keine falsche N4-Zuordnung erzeugt.</p></aside>}

    {AUTHORING_SECTIONS.map((section) => {
      const sectionQuestions = questions.filter((question) => question.section_id === section.id);
      if (!sectionQuestions.length) return null;
      const changed = sectionQuestions.filter((question) => dirtyQuestions.has(question.question_id)).length;
      return <section className="hsi-section" id={`hsi-section-${section.id}`} key={section.id}><header><div><span>{changed ? `${changed} ungespeichert` : "Aktuell"}</span><h3>{section.label}</h3><p>{section.description}</p></div><button type="button" disabled={busy !== null || changed === 0} onClick={() => void saveSection(section.id)}>{busy === section.id ? "Wird gespeichert …" : scope === "SPOT" ? "Abschnitt speichern" : "Zur Prüfung speichern"}</button></header><div className="hsi-question-list">{sectionQuestions.map((question) => {
        const fact = facts.get(question.canonical_field_key); const source = fact ? sources.get(fact.source_id) : undefined;
        const value = drafts[question.question_id] ?? fact?.value ?? defaultValue(question);
        const provenance = fact ? `${source?.source_type === "ADMIN_VERIFIED" ? "Von dir bestätigt" : source?.source_type === "OFFICIAL_WEBSITE" ? "Offizielle Website" : "Bestätigte Quelle"}${fact.last_checked_at || fact.accepted_at ? ` · ${new Date(fact.last_checked_at ?? fact.accepted_at ?? "").toLocaleDateString("de-CH")}` : ""}` : undefined;
        return <HumanSpotQuestion key={question.question_id} question={question} value={value} archetypes={archetypes} changed={dirtyQuestions.has(question.question_id)} provenance={provenance} onChange={(value) => setDrafts((current) => ({ ...current, [question.question_id]: value }))} />;
      })}</div></section>;
    })}

    <section className="hsi-source-card" id="human-sources"><h3>Quelle und Gültigkeit</h3><p>Diese Einstellungen gelten für den nächsten gespeicherten Abschnitt.</p><div><label><span>Quelle</span><select value={sourceType} onChange={(event) => setSourceType(event.target.value)}>{SOURCE_OPTIONS.map(([value, label]) => <option value={value} key={value}>{label}</option>)}</select></label><label><span>Website / Referenz</span><input value={sourceUrl} onChange={(event) => setSourceUrl(event.target.value)} placeholder="https://… (nur bei Online-Quelle)" /><input value={sourceReference} onChange={(event) => setSourceReference(event.target.value)} placeholder="Optionaler kurzer Hinweis" /></label><label><span>Wie lange gilt es?</span><select value={scope} onChange={(event) => setScope(event.target.value)}>{SCOPE_OPTIONS.map(([value, label]) => <option value={value} key={value}>{label}</option>)}</select></label></div></section>
    {profile.proposals.some((proposal) => ["PENDING", "CONFLICT", "STALE"].includes(proposal.status)) && <section className="hsi-proposals"><header><div><span>Vorschläge</span><h3>Backyrd hat dazu Angaben gefunden</h3><p>Ein Vorschlag ist nie vorausgewählte Wahrheit. Prüfe ihn bewusst.</p></div></header><div>{profile.proposals.filter((proposal) => ["PENDING", "CONFLICT", "STALE"].includes(proposal.status)).map((proposal) => { const proposalScope = proposal.evidence_scope ?? proposal.research_evidence_scope; return <article key={proposal.id}><div><strong>{profile.questions.find((question) => question.canonical_field_key === proposal.field_key)?.label_de ?? "Ältere Angabe prüfen"}</strong><span>{proposalScope === "SPOT" ? "Gilt allgemein für den Ort" : "Nicht allgemeine Spot-Wahrheit · prüfen"}</span></div><div><button type="button" disabled={busy !== null} onClick={() => void reviewProposal(proposal.id, "REJECT")}>Ablehnen</button><button type="button" disabled={busy !== null || proposalScope !== "SPOT"} onClick={() => void reviewProposal(proposal.id, "ACCEPT")}>{busy === proposal.id ? "Wird geprüft …" : "Bestätigen"}</button></div></article>; })}</div></section>}
    {(profile.reviewIssues?.length ?? 0) > 0 && <section className="hsi-proposals"><header><div><span>Widersprüche</span><h3>Bestehende Angaben prüfen</h3><p>Ältere oder widersprüchliche Wahrheit wird nicht stillschweigend umgedeutet.</p></div></header><div>{profile.reviewIssues?.map((issue) => <article key={issue.code}><div><strong>{issue.label}</strong><span>{issue.detail}</span></div>{issue.factId && <div>{issue.canMarkUnknown && <button type="button" disabled={busy !== null} onClick={() => void reviewAcceptedFact(issue.factId!, "MARK_UNKNOWN")}>Unbekannt</button>}<button type="button" disabled={busy !== null} onClick={() => void reviewAcceptedFact(issue.factId!, "RETRACT")}>Nicht verwenden</button>{issue.canConfirm && <button type="button" disabled={busy !== null} onClick={() => void reviewAcceptedFact(issue.factId!, "CONFIRM_SPOT")}>Bestätigen</button>}</div>}</article>)}</div></section>}
    <div className={`hsi-save-dock${dirtyQuestions.size ? " visible" : ""}`} role="status"><span><strong>{dirtyQuestions.size} {dirtyQuestions.size === 1 ? "Änderung" : "Änderungen"}</strong> noch nicht gespeichert</span><button type="button" onClick={() => document.querySelector<HTMLElement>(".hsi-section .is-dirty")?.scrollIntoView({ behavior: "smooth", block: "center" })}>Zur Änderung</button></div>
  </section>;
}
