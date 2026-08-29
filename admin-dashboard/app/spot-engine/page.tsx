"use client";

import Link from "next/link";
import { useCallback, useEffect, useMemo, useState } from "react";
import { supabase } from "@/lib/supabaseClient";

type CandidateState = "ALL" | "DISCOVERED" | "PROCESSING" | "REVIEW_REQUIRED" | "PUBLISHED" | "REJECTED" | "FAILED";
type Run = { id: string; mode: string; status: string; stopReason: string | null; startedAt: string | null; candidateCount: number; openReviewCount: number; failedJobCount: number };
type Metrics = { discovered: number; relevant: number; matchedExisting: number; selected: number; processing: number; reviewRequired: number; published: number; rejected: number; failed: number };
type Evidence = { sourceFamily: string; sourceIdentity: string | null; title?: string | null; factFamily?: string; authorityClass?: string; legalUseStatus?: string; observedAt?: string; excerpt?: string | null };
type ReviewCase = { id: string; kind: "BOOTSTRAP" | "FACT_PROPOSAL"; status: string; spotId: string | null; spotName: string; proposedAction: string; proposedValue?: unknown; factFamily: string; scope: string; entityScope?: string | null; durability?: string | null; scopeResolution?: string | null; reason: string; priority: string; resolution: string | null; createdAt: string; reviewedAt: string | null; canAccept: boolean; canReject: boolean; canEdit: boolean; validation: Record<string, unknown>; evidence: Evidence[] };
type Candidate = { id: string; displayName: string; address: string | null; category: string | null; lifecycleState: string; relevanceState: string; relevanceConfidence: string | null; identityState: string; identityConfidence: string | null; matchedSpotId: string | null; openReviewCount: number; openProposalCount: number; failedJobCount: number };
type Job = { id: string; kind: "BOOTSTRAP" | "RESEARCH"; spotName: string | null; stage: string; state: string; attempts: number; maxAttempts: number; failureClass: string | null; failureCode: string | null; canRetry: boolean; totalTokens?: number; webSearchCalls?: number };
type Cost = { provider: string; requestCount: number; totalTokens?: number; webSearchCalls?: number; measuredCostMicrounits: number | null; currency: string | null };
type Checkpoint = { batchNumber: number; verdict: string; snapshot: Record<string, unknown>; createdAt: string };
type Operations = { selectedRun: { id: string; status: string; stop_reason: string | null; started_at: string | null } | null; runs: Run[]; metrics: Metrics; candidates: Candidate[]; reviewCases: ReviewCase[]; jobs: Job[]; costs: Cost[]; checkpoints: Checkpoint[] };

const FILTERS: Array<{ value: CandidateState; label: string }> = [
  { value: "ALL", label: "Alle" }, { value: "DISCOVERED", label: "Entdeckt" }, { value: "PROCESSING", label: "In Verarbeitung" },
  { value: "REVIEW_REQUIRED", label: "Review nötig" }, { value: "PUBLISHED", label: "Publiziert" }, { value: "REJECTED", label: "Abgelehnt" }, { value: "FAILED", label: "Fehlgeschlagen" },
];
const STATUS_DE: Record<string, string> = { RUNNING: "Läuft", PAUSED: "Pausiert", COMPLETED: "Abgeschlossen", FAILED: "Fehlgeschlagen", REVIEW_REQUIRED: "Review nötig", PLANNED: "Geplant", CANCELLED: "Abgebrochen", PUBLISHED: "Publiziert", REJECTED: "Abgelehnt", DISCOVERED: "Entdeckt", PRODUCT_ELIGIBLE: "Publikationsbereit", EVIDENCE_PENDING: "Evidence läuft", QUEUED: "Wartet", COMPLETE: "Abgeschlossen", READY_FOR_REVIEW: "Review nötig", OPEN: "Offen", RESOLVED: "Bestätigt", STALE: "Überholt", ACCEPTED: "Akzeptiert", CONFLICT: "Konflikt", PENDING: "Offen" };
const REASON_DE: Record<string, string> = { IDENTITY_AMBIGUOUS: "Identität nicht eindeutig", CATEGORY_AMBIGUOUS: "Kategorie nicht eindeutig", SOURCE_CONFLICT: "Quellen widersprechen sich", CLOSURE_CONFLICT: "Schliessungsstatus unklar", LOW_CONFIDENCE: "Beleglage zu schwach", LEGAL_MEDIA_DECISION: "Rechtliche Medienprüfung nötig", RELEVANCE_AMBIGUOUS: "Produktrelevanz unklar", MOVE_OR_RENAME_AMBIGUOUS: "Umzug oder Umbenennung unklar", NEW: "Neue Angabe", SAME: "Bestehende Angabe bestätigt", CONFLICT: "Widerspruch zur aktuellen Angabe", STALE: "Möglicherweise veraltet" };

function date(value: string | null | undefined) { return value ? new Intl.DateTimeFormat("de-CH", { dateStyle: "medium", timeStyle: "short" }).format(new Date(value)) : "–"; }
function label(value: string) { return STATUS_DE[value] ?? value.replaceAll("_", " "); }
function valueText(value: unknown) { if (typeof value === "string") return value; try { return JSON.stringify(value); } catch { return "Nicht darstellbar"; } }
function friendlyError(message: string) {
  if (message.includes("spot_engine_review_accept_requires_correction_or_reject")) return "Dieser Konflikt darf nicht blind akzeptiert werden. Korrigiere den bestehenden Spot oder lehne den Candidate ab.";
  if (message.includes("spot_engine_candidate_validation_failed")) return "Die deterministischen Identity-/Evidence-Gates sind noch nicht erfüllt. Es wurde nichts freigegeben.";
  if (message.includes("spot_engine_job_not_retryable")) return "Dieser Job ist nicht transient oder hat sein Retry-Limit erreicht.";
  return message;
}

export default function SpotEnginePage() {
  const [data, setData] = useState<Operations | null>(null);
  const [runId, setRunId] = useState<string | null>(null);
  const [candidateState, setCandidateState] = useState<CandidateState>("ALL");
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const [notes, setNotes] = useState<Record<string, string>>({});

  const load = useCallback(async (selectedRun: string | null, selectedState: CandidateState) => {
    setLoading(true); setError("");
    const { data: result, error: rpcError } = await supabase.rpc("backyrd_admin_spot_engine_operations_v1", { p_city_key: "basel", p_run_id: selectedRun, p_candidate_state: selectedState, p_limit: 500, p_offset: 0 });
    if (rpcError) setError(friendlyError(rpcError.message));
    else { const operations = result as Operations; setData(operations); if (!selectedRun && operations.selectedRun?.id) setRunId(operations.selectedRun.id); }
    setLoading(false);
  }, []);
  useEffect(() => {
    const timer = window.setTimeout(() => void load(runId, candidateState), 0);
    return () => window.clearTimeout(timer);
  }, [candidateState, load, runId]);

  const openReviews = useMemo(() => data?.reviewCases.filter((item) => ["OPEN", "PENDING", "CONFLICT", "STALE"].includes(item.status)) ?? [], [data]);
  const decidedReviews = useMemo(() => data?.reviewCases.filter((item) => !["OPEN", "PENDING", "CONFLICT", "STALE"].includes(item.status)) ?? [], [data]);
  const failedJobs = useMemo(() => data?.jobs.filter((item) => item.state === "FAILED") ?? [], [data]);
  const activeJobs = useMemo(() => data?.jobs.filter((item) => ["QUEUED", "RUNNING"].includes(item.state)) ?? [], [data]);

  async function decide(review: ReviewCase, action: "ACCEPT" | "REJECT") {
    const note = (notes[review.id] ?? "Founder review via Spot Engine Operations").trim();
    if (note.length < 4) { setError("Bitte eine kurze Entscheidungsnotiz angeben."); return; }
    setBusy(review.id); setError(""); setNotice("");
    const result = review.kind === "FACT_PROPOSAL"
      ? await supabase.rpc("backyrd_gold_review_proposal_v1", { p_proposal_id: review.id, p_action: action, p_resolution_note: note })
      : await supabase.rpc("backyrd_admin_spot_engine_review_v1", { p_review_id: review.id, p_action: action, p_resolution_note: note });
    if (result.error) setError(friendlyError(result.error.message));
    else { setNotice(action === "ACCEPT" ? "Review bestätigt und auditiert." : "Review abgelehnt; Candidate oder Proposal bleibt nachvollziehbar isoliert."); await load(runId, candidateState); }
    setBusy(null);
  }

  async function retry(job: Job) {
    setBusy(job.id); setError(""); setNotice("");
    const { error: retryError } = await supabase.rpc("backyrd_admin_spot_engine_retry_job_v1", { p_job_id: job.id });
    if (retryError) setError(friendlyError(retryError.message)); else { setNotice("Transienter Job innerhalb des bestehenden Attempt-Limits erneut eingeplant."); await load(runId, candidateState); }
    setBusy(null);
  }

  const selectedRun = data?.selectedRun;
  return <div className="bi-page se-page">
    <header className="bi-header se-header"><div><div className="bi-eyebrow">Spot Operations · Basel</div><h1>Spot Engine</h1><p>City Bootstrap überwachen, Human Reviews entscheiden und technische Blocker verstehen – ohne Secrets oder Datenbankwerkzeuge.</p></div><button className="bi-actionButton" type="button" onClick={() => void load(runId, candidateState)} disabled={loading}>{loading ? "Aktualisiert …" : "Aktualisieren"}</button></header>
    {error && <div className="bi-error" role="alert">{error}</div>}{notice && <div className="se-notice" role="status">{notice}</div>}
    <section className="se-runbar"><label><span>City</span><strong>Basel</strong></label><label><span>Run</span><select value={runId ?? ""} onChange={(event) => setRunId(event.target.value)}>{data?.runs.map((run) => <option value={run.id} key={run.id}>{run.mode} · {label(run.status)} · {date(run.startedAt)}</option>)}</select></label>{selectedRun && <div className={`se-runstate tone-${selectedRun.status.toLowerCase()}`}><span>Aktueller Zustand</span><strong>{label(selectedRun.status)}</strong><small>{selectedRun.started_at ? `Start ${date(selectedRun.started_at)}` : "Noch nicht gestartet"}</small></div>}</section>
    {selectedRun?.stop_reason && <section className="se-breaker"><strong>{selectedRun.status === "PAUSED" ? "Warum pausiert?" : "Run-Hinweis"}</strong><p>{selectedRun.stop_reason.replace(/^CIRCUIT_BREAKER:/, "Quality Circuit Breaker: ").replaceAll("_", " ")}</p><small>Systemische Qualitätsfehler bleiben fail-closed. Einzelne Reviews werden darunter isoliert.</small></section>}
    {data && <>
      <section className="se-metrics" aria-label="Run-Kennzahlen"><Metric label="Discovered" value={data.metrics.discovered}/><Metric label="Relevant" value={data.metrics.relevant}/><Metric label="Matched existing" value={data.metrics.matchedExisting}/><Metric label="Selected" value={data.metrics.selected}/><Metric label="Processing" value={data.metrics.processing}/><Metric label="Review required" value={data.metrics.reviewRequired} tone="warning"/><Metric label="Published" value={data.metrics.published} tone="success"/><Metric label="Rejected" value={data.metrics.rejected}/><Metric label="Failed" value={data.metrics.failed} tone={data.metrics.failed ? "danger" : "neutral"}/></section>
      <section className="se-section" id="reviews"><header><div><span>Human Review</span><h2>{openReviews.length} offene Fälle</h2><p>Bootstrap-Konflikte und Research-Proposals in einer Queue. Entscheidungen laufen ausschließlich über authentifizierte Review-Verträge.</p></div></header>{openReviews.length ? <div className="se-reviewlist">{openReviews.map((review) => <ReviewCard key={`${review.kind}:${review.id}`} review={review} busy={busy === review.id} note={notes[review.id] ?? ""} onNote={(next) => setNotes((current) => ({ ...current, [review.id]: next }))} onDecide={decide}/>)}</div> : <div className="se-empty">Keine offenen Human Reviews.</div>}<details className="se-history"><summary>Entschiedene Reviews · {decidedReviews.length}</summary><div>{decidedReviews.map((review) => <article key={`${review.kind}:${review.id}`}><div><strong>{review.spotName}</strong><span>{review.factFamily} · {label(review.status)}</span></div><small>{review.resolution ?? "Entscheidung auditiert"} · {date(review.reviewedAt)}</small></article>)}</div></details></section>
      <section className="se-section"><header><div><span>Candidates</span><h2>Run-Inventar</h2><p>Operative Candidate-Zustände; die normale Spot-Bearbeitung bleibt die einzige Editor-Welt.</p></div></header><div className="se-filters">{FILTERS.map((filter) => <button type="button" className={candidateState === filter.value ? "active" : ""} key={filter.value} onClick={() => setCandidateState(filter.value)}>{filter.label}</button>)}</div><div className="se-tablewrap"><table className="se-table"><thead><tr><th>Spot / Candidate</th><th>Status</th><th>Relevance</th><th>Identity</th><th>Offen</th><th>Aktion</th></tr></thead><tbody>{data.candidates.map((candidate) => <tr key={candidate.id}><td><strong>{candidate.displayName}</strong><small>{candidate.address ?? "Keine Adresse"} · {candidate.category ?? "Keine Kategorie"}</small></td><td><Status value={candidate.lifecycleState}/></td><td>{label(candidate.relevanceState)}<small>{candidate.relevanceConfidence ?? "–"}</small></td><td>{label(candidate.identityState)}<small>{candidate.identityConfidence ?? "–"}</small></td><td>{candidate.openReviewCount + candidate.openProposalCount ? `${candidate.openReviewCount + candidate.openProposalCount} Reviews` : candidate.failedJobCount ? `${candidate.failedJobCount} Fehler` : "–"}</td><td>{candidate.matchedSpotId ? <Link href={`/spots/${candidate.matchedSpotId}/edit#spot-understanding`}>Spot bearbeiten →</Link> : <span className="se-muted">Kein Product Spot</span>}</td></tr>)}</tbody></table>{!data.candidates.length && <div className="se-empty">Keine Candidates in diesem Filter.</div>}</div></section>
      <section className="se-two"><div className="se-section"><header><div><span>Jobs</span><h2>{activeJobs.length} aktiv · {failedJobs.length} fehlgeschlagen</h2></div></header>{failedJobs.length ? <div className="se-joblist">{failedJobs.map((job) => <article key={`${job.kind}:${job.id}`}><div><strong>{job.spotName ?? job.stage}</strong><span>{job.kind} · {job.stage}</span></div><p>{job.failureCode?.replaceAll("_", " ") ?? "Unbekannter Fehler"}</p><small>{job.failureClass ?? "Keine Failure-Class"} · Versuch {job.attempts}/{job.maxAttempts}</small>{job.canRetry && <button type="button" disabled={busy !== null} onClick={() => void retry(job)}>{busy === job.id ? "Wird eingeplant …" : "Transient erneut versuchen"}</button>}</article>)}</div> : <div className="se-empty">Keine fehlgeschlagenen Jobs.</div>}</div><div className="se-section"><header><div><span>Provider & AI</span><h2>Kosten-Telemetrie</h2></div></header><div className="se-costs">{data.costs.map((cost) => <article key={cost.provider}><span>{cost.provider.replaceAll("_", " ")}</span><strong>{cost.requestCount} Requests</strong><small>{cost.totalTokens ? `${cost.totalTokens.toLocaleString("de-CH")} Tokens · ` : ""}{cost.webSearchCalls ? `${cost.webSearchCalls} Web Searches · ` : ""}{cost.measuredCostMicrounits !== null && cost.currency ? `${(cost.measuredCostMicrounits / 1_000_000).toFixed(4)} ${cost.currency}` : "Kosten nicht vom Provider gemessen"}</small></article>)}</div><p className="se-boundary">Browser-Grenze: nur aggregierte Telemetrie. Provider-Keys und Service-Credentials bleiben serverseitig.</p></div></section>
      <section className="se-section"><header><div><span>Checkpoints</span><h2>Batch- und Gate-Historie</h2></div></header><div className="se-checkpoints">{data.checkpoints.map((checkpoint) => <details key={checkpoint.batchNumber}><summary>Batch {checkpoint.batchNumber} · <Status value={checkpoint.verdict}/> · {date(checkpoint.createdAt)}</summary><pre>{JSON.stringify(checkpoint.snapshot, null, 2)}</pre></details>)}</div></section>
    </>}{loading && !data && <div className="se-loading">Spot Engine wird geladen …</div>}
  </div>;
}

function Metric({ label: metricLabel, value, tone = "neutral" }: { label: string; value: number; tone?: string }) { return <article className={`se-metric tone-${tone}`}><span>{metricLabel}</span><strong>{value}</strong></article>; }
function Status({ value }: { value: string }) { return <span className={`se-status tone-${value.toLowerCase()}`}>{label(value)}</span>; }
function ReviewCard({ review, busy, note, onNote, onDecide }: { review: ReviewCase; busy: boolean; note: string; onNote: (value: string) => void; onDecide: (review: ReviewCase, action: "ACCEPT" | "REJECT") => Promise<void> }) {
  return <article className={`se-review priority-${review.priority.toLowerCase()}`}><header><div><span>{review.kind === "FACT_PROPOSAL" ? "Research Proposal" : "Bootstrap Review"} · {review.priority}</span><h3>{review.spotName}</h3><p>{REASON_DE[review.reason] ?? review.reason.replaceAll("_", " ")}</p></div><Status value={review.status}/></header><div className="se-reviewgrid"><div><span>Vorgeschlagene Änderung</span><strong>{review.proposedValue === undefined ? review.proposedAction : `${review.factFamily} = ${valueText(review.proposedValue)}`}</strong></div><div><span>Fact Family / Scope</span><strong>{review.factFamily} · {review.scope}</strong><small>{[review.entityScope && `Entity ${review.entityScope}`, review.durability, review.scopeResolution].filter(Boolean).join(" · ") || "Deterministische Candidate-Validierung"}</small></div><div><span>Confidence / Validation</span><code>{Object.entries(review.validation).filter(([, entry]) => entry !== null).map(([key, entry]) => `${key}: ${String(entry)}`).join(" · ")}</code></div></div><details className="se-evidence"><summary>Quelle und Evidence · {review.evidence.length}</summary>{review.evidence.map((evidence, index) => <div key={`${evidence.sourceFamily}:${index}`}><strong>{evidence.sourceFamily}</strong>{evidence.sourceIdentity?.startsWith("http") ? <a href={evidence.sourceIdentity} target="_blank" rel="noreferrer">{evidence.title || evidence.sourceIdentity} ↗</a> : <span>{evidence.title || evidence.sourceIdentity || "Keine externe URL"}</span>}<small>{[evidence.factFamily, evidence.authorityClass, evidence.legalUseStatus, evidence.observedAt && date(evidence.observedAt)].filter(Boolean).join(" · ")}</small>{evidence.excerpt && <blockquote>{evidence.excerpt}</blockquote>}</div>)}</details><label className="se-reviewnote"><span>Entscheidungsnotiz</span><textarea value={note} onChange={(event) => onNote(event.target.value)} placeholder="Warum ist diese Entscheidung korrekt?" /></label><footer>{review.canEdit && review.spotId && <Link href={`/spots/${review.spotId}/edit#spot-understanding`}>Spot prüfen / korrigieren</Link>}<div><button type="button" className="se-reject" disabled={busy || !review.canReject} onClick={() => void onDecide(review, "REJECT")}>Ablehnen</button><button type="button" className="se-accept" disabled={busy || !review.canAccept} onClick={() => void onDecide(review, "ACCEPT")}>{busy ? "Wird geprüft …" : "Bestätigen"}</button></div></footer>{!review.canAccept && review.canReject && <p className="se-guardnote">Dieser Fall darf nicht blind akzeptiert werden. Erst im bestehenden Spot-Editor korrigieren oder den Candidate ablehnen.</p>}</article>;
}
