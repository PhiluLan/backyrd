"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import type { ProductAdminSpotSearch } from "@backyrd/world-knowledge-authoring-ui";
import { parseWorldResearchQueue, type WorldResearchQueue } from "@/lib/worldResearchQueue";
import { findResearchPlaces, type ResearchPlace } from "./WorldAddressPicker";
import { refreshResearchDocument } from "./researchBatchRefresh.mjs";
import { ResearchValue, researchGapReason, researchFieldLabel } from "./ResearchValue";
import { NuknukDraftPreview, type DraftReviewState } from "./NuknukDraftPreview";
import { parseNuknukDraft, type NuknukDraft } from "@/lib/nuknukResearchDraft";
import type { AdminResearchReview as ResearchReview } from "@/lib/nuknukDraftImport";
import { ResearchPipelinePanel } from "./ResearchPipelinePanel";
import styles from "./WorldResearchBatchPanel.module.css";

type Spot = ProductAdminSpotSearch["spots"][number];
type Report = { followupError?: string; batchId: string; mode: string; totals: Record<string, number>; perSpot: Array<{ spotId: string; name: string; ready: string[]; readyClaims: Array<{ attributeKey: string; value: unknown; source: { evidence: string; url: string }; supportingSources?: Array<{ evidence: string; url: string }> }>; storedClaims?: Array<{ attributeKey: string; value: unknown }>; declined: string[]; imported: string[]; skipped: string[]; conflicts: string[]; invalid: string[]; unresolved: string[]; unresolvedDetails: Array<{ attributeKey: string; reason: string }>; reviews: ResearchReview[]; blocked: string[]; derived: string[]; manifestHash?: string; reviewCompleted?: boolean; reviewCompletionError?: string; location?: { message: string; automatic: string | null; query?: string; candidates: Array<{ placeId: string; name: string; address: string; latitude: number; longitude: number; token: string; sourceUrl: string }> } }> };
type ResearchJob = { pipeline?:{state:string;stored:number;review:number;errors:string[]}; jobId: string; spotId: string; spotName: string; status: "QUEUED" | "RUNNING" | "READY_FOR_REVIEW" | "FAILED"; attempts: number; failureCode: string | null; createdAt: string; updatedAt: string; completedAt: string | null };
type ResearchJobsResponse = { enabled: boolean; jobs: ResearchJob[] };
type StoredDraft = { draftId: string; spotId: string; spotName: string; version: string; createdAt: string; archivedAt?:string|null };

export function WorldResearchBatchPanel(props: {
  inboxManaged?: boolean;
  search(query: string): Promise<ProductAdminSpotSearch>;
  queue(page: number): Promise<unknown>;
  post(body: unknown): Promise<unknown>;
  pipeline?(body: unknown):Promise<unknown>;
  jobsGet(jobId?: string): Promise<unknown>;
  jobsStart(spotIds: string[]): Promise<unknown>;
  draftsGet(draftId?: string, view?: "archive"): Promise<unknown>;
  draftsSave(report: unknown): Promise<unknown>;
}) {
  const panelRef = useRef<HTMLElement>(null);
  const importedFields = useRef(new Map<string,Set<string>>());
  const [query, setQuery] = useState("");
  const [results, setResults] = useState<Spot[]>([]);
  const [selected, setSelected] = useState<Spot[]>([]);
  const [json, setJson] = useState("");
  const [nuknukDraft, setNuknukDraft] = useState<NuknukDraft | null>(null);
  const [storedDrafts, setStoredDrafts] = useState<StoredDraft[]>([]);
  const [draftReview,setDraftReview] = useState<DraftReviewState|null>(null);
  const [draftArchived,setDraftArchived] = useState(false);
  const [archiveVisible,setArchiveVisible] = useState(false);
  const [archivedDrafts,setArchivedDrafts] = useState<StoredDraft[]>([]);
  const [savedDraftId, setSavedDraftId] = useState<string | null>(null);
  const [draftsError, setDraftsError] = useState("");
  const [draftSaving, setDraftSaving] = useState(false);
  const [preview, setPreview] = useState<Report | null>(null);
  const [reviewOptions, setReviewOptions] = useState<Record<string, ResearchReview[]>>({});
  const [locations, setLocations] = useState<Record<string, string>>({});
  const [confirmations, setConfirmations] = useState<Record<string, Record<string, string>>>({});
  const [declined, setDeclined] = useState<Record<string, string[]>>({});
  const [reviewChanged, setReviewChanged] = useState(false);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState("");
  const [completion, setCompletion] = useState<{ imported: number; spots: number; unresolved: number; archive?:string; archived?:boolean } | null>(null);
  const [uploadKey, setUploadKey] = useState(0);
  const [queuePage, setQueuePage] = useState(1);
  const [queue, setQueue] = useState<WorldResearchQueue | null>(null);
  const [queueError, setQueueError] = useState("");
  const [queueBusy, setQueueBusy] = useState(false);
  const [jobs, setJobs] = useState<ResearchJob[]>([]);
  const [activeJobId, setActiveJobId] = useState<string | null>(null);
  const [automationEnabled, setAutomationEnabled] = useState(false);
  const [jobsError, setJobsError] = useState("");
  const queueRequest = props.queue;
  const jobsGet = props.jobsGet;
  const draftsGet = props.draftsGet;

  useEffect(() => {
    let active = true;
    void draftsGet().then((response) => {
      if (!active) return;
      setStoredDrafts((response as { drafts: StoredDraft[] }).drafts);
      setDraftsError("");
    }).catch(() => { if (active) setDraftsError("Gespeicherte Prüfentwürfe konnten nicht geladen werden."); });
    return () => { active = false; };
  }, [draftsGet]);

  const openStoredDraft = (draftId: string) => run(async () => {
    const response = await draftsGet(draftId) as { report: unknown; review:DraftReviewState; draft:StoredDraft };
    const report = parseNuknukDraft(response.report);
    if (!report) throw new Error("Der gespeicherte Prüfentwurf ist ungültig.");
    setDraftReview(response.review);setDraftArchived(!!response.draft.archivedAt);setNuknukDraft(report); setSavedDraftId(draftId); setDraftsError("");
    panelRef.current?.scrollIntoView({ behavior: "smooth", block: "start" });
  });

  const refreshDraftReview = async () => {
    if (!savedDraftId) return;
    const response=await props.draftsGet(savedDraftId) as {review:DraftReviewState};
    setDraftReview(response.review);
  };
  const completeDraft = async (kept:Record<string,string|null>,manifestHash:string) => {
    if(!savedDraftId)throw new Error("Bitte den Bericht zuerst sichern.");
    const response=await props.draftsSave({action:"complete",draftId:savedDraftId,kept,expectedManifestHash:manifestHash}) as {archived:boolean;pending?:string[]};
    if(!response.archived){await refreshDraftReview();throw new Error(`${response.pending?.length ?? 0} Angaben sind noch nicht abgeschlossen. Bitte erneut prüfen.`);}
    setStoredDrafts(current=>current.filter(item=>item.draftId!==savedDraftId));
    setCompletion({imported:[...importedFields.current.values()].reduce((sum,keys)=>sum+keys.size,0),spots:importedFields.current.size,archived:true,unresolved:nuknukDraft?.results.filter(item=>item.value===undefined).length ?? 0,archive:"Prüfung abgeschlossen. Alle Vorschläge sind im Profil enthalten oder wurden von dir bewusst nicht übernommen. Der Bericht ist archiviert."});
    setNuknukDraft(null);setSavedDraftId(null);setDraftReview(null);setJson("");setPreview(null);setMessage("");
    panelRef.current?.scrollIntoView({behavior:"smooth",block:"start"});
  };
  const showArchive = () => run(async()=>{
    const response=await props.draftsGet(undefined,"archive") as {drafts:StoredDraft[]};setArchivedDrafts(response.drafts);setArchiveVisible(true);
  });
  const restoreDraft = (draftId:string) => run(async()=>{
    await props.draftsSave({action:"restore",draftId});
    setStoredDrafts((await props.draftsGet() as {drafts:StoredDraft[]}).drafts);
    setArchivedDrafts(current=>current.filter(item=>item.draftId!==draftId));setMessage("Bericht wieder zur Prüfung geöffnet. Profilangaben bleiben unverändert.");
  });

  const recoverDraft = async (file:File) => {
    if(!nuknukDraft || file.size > 200_000) throw new Error("Bitte einen gültigen Originalbericht bis 200 KB auswählen.");
    const {recoverDraftObservations} = await import("@/lib/nuknukResearchDraft");
    const original = parseNuknukDraft(JSON.parse(await file.text()));
    if(!original) throw new Error("Die Datei ist kein gültiger Nuknuk-Originalbericht.");
    const recovered = recoverDraftObservations(nuknukDraft,original);
    if(savedDraftId) await props.draftsSave({recoverDraftId:savedDraftId,original});
    setNuknukDraft(recovered);setDraftsError("");setMessage("Originalbelege ergänzt. Bitte die Angaben erneut prüfen und auswählen.");
  };

  const saveDraft = async () => {
    if (!nuknukDraft || draftSaving) return;
    setDraftSaving(true); setDraftsError("");
    try {
      const response = await props.draftsSave(nuknukDraft) as { draft: StoredDraft };
      setSavedDraftId(response.draft.draftId);
      setDraftArchived(false);
      try {const checked=await props.draftsGet(response.draft.draftId) as {review:DraftReviewState};setDraftReview(checked.review);}
      catch {setDraftsError("Der Bericht ist gespeichert. Der Profilabgleich konnte noch nicht geladen werden; bitte den Bericht erneut öffnen.");}
      setStoredDrafts((current) => [response.draft, ...current.filter(item => item.draftId !== response.draft.draftId)]);
    } catch { setDraftsError("Der Prüfentwurf konnte nicht gespeichert werden. Bitte erneut versuchen."); }
    finally { setDraftSaving(false); }
  };

  useEffect(() => {
    let active = true;
    const refresh = async () => {
      try {
        const response = await jobsGet() as ResearchJobsResponse;
        if (active) { setJobs(response.jobs); setAutomationEnabled(response.enabled); setJobsError(""); }
      } catch { if (active) setJobsError("Automatische Recherche ist derzeit nicht verfügbar; der Datei-Import bleibt nutzbar."); }
    };
    void refresh();
    const timer = window.setInterval(() => { void refresh(); }, 15_000);
    return () => { active = false; window.clearInterval(timer); };
  }, [jobsGet]);

  useEffect(() => {
    let active = true;
    queueRequest(1).then((value) => {
      if (!active) return;
      const parsed = parseWorldResearchQueue(value);
      setQueue(parsed);
      setSelected(parsed.spots.filter((spot) => !spot.importedAt));
    }).catch(() => { if (active) setQueueError("Die alphabetische Recherche-Liste ist noch nicht verfügbar."); });
    return () => { active = false; };
  }, [queueRequest]);

  const loadQueue = async (page: number) => {
    setQueueBusy(true); setQueueError("");
    try {
      const next = parseWorldResearchQueue(await props.queue(page));
      if (page > 1 && next.spots.length === 0) throw new Error("Leerer Recherche-Block");
      setQueue(next); setQueuePage(page); setSelected(next.spots.filter((spot) => !spot.importedAt)); setResults([]); setQuery("");
    } catch { setQueueError("Dieser Recherche-Block konnte nicht geladen werden. Bitte erneut versuchen."); }
    finally { setQueueBusy(false); }
  };

  const run = async (operation: () => Promise<void>) => {
    setBusy(true); setMessage("");
    try { await operation(); } catch (cause) { setMessage(cause instanceof Error ? cause.message : "Die Aktion ist fehlgeschlagen."); }
    finally { setBusy(false); }
  };
  const search = () => run(async () => { const response = await props.search(query); setResults(response.spots); setSelected([]); });
  const toggle = (spot: Spot) => {
    setPreview(null);
    setSelected((current) => current.some((item) => item.spotId === spot.spotId)
      ? current.filter((item) => item.spotId !== spot.spotId)
      : current.length < 10 ? [...current, spot] : current);
  };
  const exportBatch = () => run(async () => {
    importedFields.current.clear();setSavedDraftId(null);setDraftReview(null);
    setCompletion(null);
    setActiveJobId(null);
    const document = await props.post({ action: "export", recordExport: true, spotIds: selected.map((spot) => spot.spotId) });
    const text = JSON.stringify(document, null, 2); setJson(text); setPreview(null); setReviewOptions({}); setConfirmations({}); setDeclined({}); setReviewChanged(false);
    const link = documentElement(text, `world-research-${(document as { batch?: { batchId?: string } }).batch?.batchId ?? "batch"}.json`);
    link.click(); URL.revokeObjectURL(link.href);
    setMessage("Export erstellt. Recherchiere extern und füge das vollständige JSON danach wieder ein.");
    if (queue) void props.queue(queuePage).then((value) => setQueue(parseWorldResearchQueue(value))).catch(() => setQueueError("Export erstellt; der Fortschritt konnte nicht aktualisiert werden."));
  });
  const startAutomatic = () => run(async () => {
    const response = await props.jobsStart(selected.map((spot) => spot.spotId)) as { jobs: Array<{ jobId: string }> };
    const refreshed = await props.jobsGet() as ResearchJobsResponse;
    setJobs(refreshed.jobs);
    setMessage(`${response.jobs.length} Rechercheauftrag/Recherchen gestartet. Die Vorschläge erscheinen hier nach Abschluss zur Prüfung; es wird nichts automatisch übernommen.`);
  });
  const parse = () => { try { return JSON.parse(json) as unknown; } catch { throw new Error("Das eingefügte JSON ist nicht gültig."); } };
  const loadPreview = async (document: unknown, choices: typeof confirmations, preserveReviews: boolean, declinedKeys = declined) => {
    if (!preserveReviews) { setPreview(null); setReviewOptions({}); setLocations({}); }
    let report = await props.post({ action: "preview", document, confirmations: choices, declined: declinedKeys }) as Report;
    const pending = report.perSpot.filter((spot) => spot.location?.query);
    if (pending.length) {
      const browserPlaces: Record<string, ResearchPlace[] | null> = {};
      for (const spot of pending) {
        try { browserPlaces[spot.spotId] = await findResearchPlaces(spot.location!.query!); }
        catch { browserPlaces[spot.spotId] = null; }
      }
      report = await props.post({ action: "preview", document, browserPlaces, confirmations: choices, declined: declinedKeys }) as Report;
    }
    setPreview(report);
    setReviewOptions((current) => Object.fromEntries(report.perSpot.map((spot) => {
      const previous = preserveReviews ? current[spot.spotId] ?? [] : [];
      return [spot.spotId, [...previous, ...spot.reviews.filter((review) => !previous.some((item) => item.attributeKey === review.attributeKey))]];
    })));
    setReviewChanged(false);
    setLocations(Object.fromEntries(report.perSpot.flatMap((spot) => {
      const candidate = spot.location?.candidates.find((item) => item.placeId === spot.location?.automatic);
      return candidate ? [[spot.spotId, candidate.token]] : [];
    })));
  };
  const openJob = (jobId: string) => run(async () => {
    importedFields.current.clear();setSavedDraftId(null);setDraftReview(null);
    const result = await props.jobsGet(jobId) as { document?: unknown };
    if (!result.document) throw new Error("Der Recherchevorschlag ist noch nicht verfügbar.");
    setJson(JSON.stringify(result.document, null, 2));
    setCompletion(null); setConfirmations({}); setDeclined({}); setReviewChanged(false);
    await loadPreview(result.document, {}, false, {});
    setActiveJobId(jobId);
    panelRef.current?.scrollIntoView({ behavior: "smooth", block: "start" });
  });
  const prepareDraft = (reviewedKeys: string[]) => run(async () => {
    if (!nuknukDraft) return;
    importedFields.current.clear();
    const prepared = await props.post({ action: "prepare-draft", draftReport: nuknukDraft, reviewedKeys }) as {
      document: unknown; held: Array<{ attributeKey: string; reason: string }>;
    };
    setJson(JSON.stringify(prepared.document,null,2));
    setConfirmations({}); setDeclined({}); setActiveJobId(null); setCompletion(null);
    await loadPreview(prepared.document, {}, false, {});
    setNuknukDraft(null);
    if (prepared.held.length) setMessage(prepared.held.map(item => `${researchFieldLabel(item.attributeKey)}: ${researchGapReason(item.reason)}`).join(" · "));
    else setMessage("Mit dem aktuellen Spotprofil abgeglichen. Prüfe den Vergleich; gespeichert wird erst mit der Übernahme.");
  });
  const previewBatch = (choices = confirmations, preserveReviews = false) => run(async () => {
    const document = parse();
    const draft = parseNuknukDraft(document);
    if (draft) { setNuknukDraft(draft); setSavedDraftId(null); setDraftsError(""); setJson(""); return; }
    await loadPreview(document, choices, preserveReviews);
  });
  const refreshBatch = () => run(async () => {
    const previous = parse() as { batch?: { spots?: Array<{ spotId: string }> } };
    const spotIds = previous.batch?.spots?.map((spot) => spot.spotId);
    if (!spotIds?.length) throw new Error("Die Spot-Auswahl fehlt. Bitte die Recherche-Datei erneut hochladen.");
    const current = await props.post({ action: "export", spotIds });
    const refreshed = refreshResearchDocument(previous, current);
    setJson(JSON.stringify(refreshed, null, 2));
    setConfirmations({});
    setDeclined({});
    setReviewChanged(false);
    await loadPreview(refreshed, {}, false, {});
    setMessage("Aktueller World-Stand geladen. Deine recherchierten Vorschläge wurden neu geprüft.");
  });
  const chooseReview = (spotId: string, review: ResearchReview, accept: boolean) => {
    const next = { ...confirmations, [spotId]: { ...confirmations[spotId], [review.attributeKey]: accept ? review.current.claimId : "" } };
    setConfirmations(next);
    setReviewChanged(true);
    void previewBatch(next, true);
  };
  const toggleDeclined = (spotId: string, attributeKey: string) => {
    const current = declined[spotId] ?? [];
    const next = { ...declined, [spotId]: current.includes(attributeKey) ? current.filter((key) => key !== attributeKey) : [...current, attributeKey] };
    setDeclined(next);
    setReviewChanged(true);
    void run(() => loadPreview(parse(), confirmations, true, next));
  };
  const importBatch = () => run(async () => {
    const report = await props.post({ action: "commit", document: parse(), locations, confirmations, declined, ...(activeJobId ? { jobId: activeJobId } : {}) }) as Report;
    if(report.followupError){setMessage(report.followupError);setPreview(report);return;}
    for(const spot of report.perSpot)if(spot.manifestHash && !spot.invalid.length){
      const keys=importedFields.current.get(spot.spotId) ?? new Set<string>();for(const key of spot.imported)keys.add(key);if(keys.size)importedFields.current.set(spot.spotId,keys);
    }
    if (report.mode === "COMMIT" && (report.totals.imported > 0 || !!activeJobId || !!savedDraftId || report.totals.skipped > 0 || report.perSpot.some(spot=>spot.declined.length>0)) && report.totals.invalid === 0 && report.totals.conflicts === 0 && report.totals.blocked === 0 && report.perSpot.every((spot) => (spot.imported.length === 0 || !!spot.manifestHash) && (!activeJobId || spot.reviewCompleted))) {
      let archive:string|undefined;let archived=false;
      if(savedDraftId) {
        try {
          const checked=await props.draftsGet(savedDraftId) as {review:DraftReviewState};
          const kept=Object.fromEntries(Object.entries(confirmations).flatMap(([spotId,choices])=>(reviewOptions[spotId] ?? []).filter(review=>choices[review.attributeKey] === "").map(review=>[review.attributeKey,review.current.claimId])).filter(([key])=>checked.review.fields.some(field=>field.attributeKey===key)));
          const closed=await props.draftsSave({action:"complete",draftId:savedDraftId,kept,expectedManifestHash:checked.review.manifestHash}) as {archived:boolean;pending?:string[]};
          if(closed.archived){archived=true;setStoredDrafts(current=>current.filter(item=>item.draftId!==savedDraftId));archive="Bericht abgeschlossen und archiviert.";setSavedDraftId(null);}
          else archive=`Dieser Teil ist gespeichert. ${closed.pending?.length ?? 0} weitere Vorschläge im Bericht brauchen noch eine Entscheidung. Öffne den Bericht erneut und schliesse die Prüfung ab.`;
        }catch {archive="Profilübernahme bestätigt. Der Bericht konnte noch nicht archiviert werden; bitte den gespeicherten Bericht erneut öffnen.";}
      }
      setCompletion({ archive, archived, imported:[...importedFields.current.values()].reduce((sum,keys)=>sum+keys.size,0), spots:importedFields.current.size, unresolved: report.totals.unresolved });
      if (activeJobId) {
        try { setJobs((await props.jobsGet() as ResearchJobsResponse).jobs); }
        catch {
          const spotId = report.perSpot[0]?.spotId;
          setJobs((current) => current.filter((job) => job.spotId !== spotId));
        }
      }
      setActiveJobId(null);
      setQuery(""); setResults([]); setSelected([]); setJson(""); setPreview(null); setReviewOptions({}); setLocations({}); setConfirmations({}); setDeclined({}); setReviewChanged(false); setUploadKey((current) => current + 1);
      if (queue) void props.queue(queuePage).then((value) => setQueue(parseWorldResearchQueue(value))).catch(() => setQueueError("Import abgeschlossen; der Fortschritt konnte nicht aktualisiert werden."));
      requestAnimationFrame(() => panelRef.current?.scrollIntoView({ behavior: window.matchMedia("(prefers-reduced-motion: reduce)").matches ? "auto" : "smooth", block: "start" }));
      return;
    }
    const summary = `${report.totals.imported} ${report.totals.imported === 1 ? "Angabe" : "Angaben"} ${report.totals.invalid > 0 ? "geschrieben, Profilabgleich noch unbestätigt" : "übernommen"} · ${report.totals.skipped} bereits vorhanden · ${report.totals.conflicts} noch zu entscheiden · ${report.totals.blocked} zurückgehalten · ${report.totals.invalid} Fehler.`;
    try {
      const previous=parse() as {batch:{spots:Array<{spotId:string}>}};
      const current=await props.post({action:"export",spotIds:previous.batch.spots.map(spot=>spot.spotId)});
      const refreshed=refreshResearchDocument(previous,current);setJson(JSON.stringify(refreshed,null,2));setConfirmations({});setDeclined({});
      await loadPreview(refreshed,{},false,{});
      setMessage(`${summary} Der aktuelle Profilstand ist geladen. Die übrigen Angaben kannst du jetzt entscheiden.`);
    }catch {setPreview(report);setMessage(`${summary} Der aktuelle Stand konnte nicht neu geladen werden. Bitte „Aktuellen Stand laden“ wählen; bereits übernommene Angaben bleiben gespeichert.`);}
  });
  const driftedSpots = preview?.perSpot.filter((spot) => spot.conflicts.includes("EXPORT_OR_MANIFEST_DRIFT")) ?? [];
  const alreadyCurrent = preview?.mode === "PREVIEW" && !driftedSpots.length && preview.totals.ready === 0
    && preview.totals.conflicts === 0 && preview.totals.invalid === 0 && preview.totals.blocked === 0 && preview.totals.skipped > 0;
  const canFinishWithoutWrites = (!!activeJobId || !!savedDraftId) && preview?.mode === "PREVIEW" && !driftedSpots.length
    && preview.totals.ready === 0 && preview.totals.conflicts === 0
    && preview.totals.invalid === 0 && preview.totals.blocked === 0;
  const catalog = useMemo(() => {
    try {
      const fields = (JSON.parse(json) as { fieldCatalog?: Array<{ attributeKey: string; label: string; allowedValues?: Array<{ value: string; label: string }> }> }).fieldCatalog ?? [];
      return Object.fromEntries(fields.map((field) => [field.attributeKey, field]));
    } catch { return {}; }
  }, [json]);
  const fieldLabel = (key: string) => catalog[key]?.label ?? key.replaceAll(".", " · ").replaceAll("_", " ");
  const startNewBatch = () => {
    importedFields.current.clear();setSavedDraftId(null);setDraftReview(null);setDraftArchived(false);
    setQuery(""); setResults([]); setSelected([]); setJson(""); setNuknukDraft(null); setPreview(null); setReviewOptions({});
    setLocations({}); setConfirmations({}); setDeclined({}); setReviewChanged(false); setCompletion(null); setMessage(""); setActiveJobId(null);
    setUploadKey((current) => current + 1);
    if (queue) void loadQueue(queuePage);
    panelRef.current?.scrollIntoView({ behavior: window.matchMedia("(prefers-reduced-motion: reduce)").matches ? "auto" : "smooth", block: "start" });
  };

  return <section className={styles.shell} ref={panelRef}>
    <header className={styles.header}><span className={styles.eyebrow}>RECHERCHE SPOT</span><h2>Wissen ergänzen.</h2><p>Spots automatisch oder per Datei recherchieren. Belegte Angaben mit geringer Restunsicherheit werden über die sichere Übernahme geprüft und gespeichert. Erhebliche Zweifel bleiben mit Grund und Beleg zur Prüfung erhalten.</p></header>
    {nuknukDraft ? <NuknukDraftPreview key={savedDraftId ?? nuknukDraft.spotId} draft={nuknukDraft} reviewState={draftReview} archived={draftArchived} onComplete={completeDraft} onReviewRefresh={refreshDraftReview} post={props.post} onRecover={recoverDraft} onClose={() => { setNuknukDraft(null); setSavedDraftId(null); }} onSave={() => void saveDraft()} saved={!!savedDraftId} saving={draftSaving} error={draftsError || message} onPrepare={prepareDraft} preparing={busy} /> : <>
    <nav className={styles.steps} aria-label="Fortschritt"><span className={!json ? styles.activeStep : ""}>1 <b>Auswählen</b></span><span className={json && !preview ? styles.activeStep : ""}>2 <b>Prüfen</b></span><span className={preview || completion ? styles.activeStep : ""}>3 <b>Übernehmen</b></span></nav>
    {completion ? <div className={styles.outcome} role="status"><span className={styles.outcomeIcon} aria-hidden="true">✓</span><h3>{completion.archived ? "Prüfung abgeschlossen." : completion.imported > 0 ? "Angaben gespeichert." : "Profilabgleich abgeschlossen."}</h3>{completion.archive && <p>{completion.archive}</p>}<p>{completion.imported > 0 ? `${completion.imported} ${completion.imported === 1 ? "Angabe" : "Angaben"} für ${completion.spots} ${completion.spots === 1 ? "Spot" : "Spots"} übernommen und mit dem gespeicherten Profil abgeglichen.` : "Es gab in diesem Schritt keine neuen Angaben zu übernehmen; bestehendes Wissen bleibt unverändert."}</p>{completion.unresolved > 0 && <p>{completion.unresolved} {completion.unresolved === 1 ? "Angabe bleibt" : "Angaben bleiben"} offen. Der Spot ist dadurch nicht automatisch vollständig ausgefüllt.</p>}{savedDraftId && <button className={styles.primary} onClick={()=>void openStoredDraft(savedDraftId)}>Verbleibende Angaben prüfen</button>}<button className={styles.secondary} onClick={startNewBatch}>Zur Rechercheübersicht</button></div> : <>
      {!json && <div className={styles.stage}><div className={styles.stageHeading}><div><span className={styles.stepNumber}>01</span><h3>Welche Spots?</h3></div><span>{selected.length} von 10 ausgewählt</span></div><p>Wähle bis zu zehn Spots. Der Export enthält den aktuellen World-Stand, nicht alte Spot-Felder.</p>
        {queue && <div className={styles.queue} aria-label="Alphabetische Recherche-Blöcke"><div className={styles.queueTop}><div><strong>Block {queuePage} von {Math.max(1, Math.ceil(queue.total / 10))}</strong><small>{queue.total ? `${(queuePage - 1) * 10 + 1}–${Math.min(queuePage * 10, queue.total)} von ${queue.total} freigegebenen Spots` : "Keine freigegebenen Spots"}</small></div><span>{queue.imported} mit übernommenen Angaben · {queue.total - queue.imported} ohne Import · {queue.exported} exportiert</span></div><p>„Exportiert“ heißt noch nicht recherchiert. „Übernommen“ heißt: Mindestens eine recherchierte Angabe wurde in World Knowledge gespeichert – nicht, dass alle Felder vollständig sind. Bereits übernommene Spots sind zunächst abgewählt.</p><div className={styles.queueList}>{queue.spots.map((spot) => <label key={spot.spotId}><input type="checkbox" checked={selected.some((item) => item.spotId === spot.spotId)} disabled={busy || queueBusy || !selected.some((item) => item.spotId === spot.spotId) && selected.length >= 10} onChange={() => toggle(spot)} /><span><b>{spot.name}</b><small>{spot.city ?? "Ort nicht gepflegt"}</small></span><em className={spot.importedAt ? styles.done : spot.exportedAt ? styles.exported : styles.open}>{spot.importedAt ? "Angaben übernommen" : spot.exportedAt ? "Exportiert · Import offen" : "Noch offen"}</em></label>)}</div><div className={styles.queueActions}><button disabled={queueBusy || busy || queuePage <= 1} onClick={() => void loadQueue(queuePage - 1)}>Vorherige 10</button><button disabled={queueBusy || busy || queuePage >= Math.ceil(queue.total / 10)} onClick={() => void loadQueue(queuePage + 1)}>Nächste 10</button></div><button className={styles.secondary} disabled={queueBusy || busy} onClick={() => setSelected([...queue.spots])}>Auch bereits übernommene Spots auswählen</button></div>}
        {queueError && <p className={styles.error} role="alert">{queueError}</p>}
        <div className={styles.search}><input aria-label="Spot suchen" value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Anderen Spot nach Namen suchen" onKeyDown={(event) => { if (event.key === "Enter") void search(); }} /><button disabled={busy} onClick={() => void search()}>Suchen</button></div>{!!results.length && <div className={styles.results}>{results.map((spot) => <label key={spot.spotId}><input type="checkbox" checked={selected.some((item) => item.spotId === spot.spotId)} disabled={!selected.some((item) => item.spotId === spot.spotId) && selected.length >= 10} onChange={() => toggle(spot)} /><span><b>{spot.name}</b><small>{spot.city ?? "Ort nicht gepflegt"}</small></span></label>)}</div>}{!!selected.length && <div className={styles.chips}>{selected.map((spot) => <button key={spot.spotId} onClick={() => toggle(spot)} aria-label={`${spot.name} entfernen`}>{spot.name} <span aria-hidden="true">×</span></button>)}</div>}<button className={styles.primary} disabled={busy || !selected.length || !automationEnabled} onClick={() => void startAutomatic()}>Recherche automatisch starten</button><button className={styles.secondary} disabled={busy || !selected.length} onClick={() => void exportBatch()}>Recherche-Datei herunterladen <span aria-hidden="true">↗</span></button><p className={styles.note}>Die automatische Nuknuk-Recherche liefert zunächst Vorschläge. Für extern recherchierte Dateien nutzt du unten die sichere Übernahme mit erneuter Quellenprüfung.</p>{jobsError && <p className={styles.error} role="alert">{jobsError}</p>}{!automationEnabled && !jobsError && <p className={styles.note}>Automatische Recherche ist noch nicht freigeschaltet. Die manuelle Datei bleibt verfügbar.</p>}</div>}
      {props.pipeline && !json && <ResearchPipelinePanel spot={selected.length === 1 ? selected[0] : null} post={props.pipeline} onProcessed={async()=>{setJobs((await props.jobsGet() as ResearchJobsResponse).jobs);setJobsError("");}} openReview={jobId=>void openJob(jobId)} />}
      {!props.inboxManaged && !!jobs.length && !json && <div className={styles.stage}><div className={styles.stageHeading}><div><span className={styles.stepNumber}>↻</span><h3>Rechercheaufträge</h3></div></div><div className={styles.queueList}>{jobs.map((job) => <div key={job.jobId}><strong>{job.spotName}</strong><p>{job.pipeline?.state === "PROCESSING" ? "Quellenprüfung und Speicherung laufen …" : job.pipeline ? `${job.pipeline.stored} automatisch gespeichert · ${job.pipeline.review} Angaben zur Prüfung${job.pipeline.errors.length ? " · Verarbeitung unvollständig" : ""}` : job.status === "READY_FOR_REVIEW" ? "Vorschlag zur Prüfung bereit" : job.status === "RUNNING" ? "Recherche läuft" : job.status === "QUEUED" ? "Wartet auf Recherche" : `Recherche fehlgeschlagen: ${job.failureCode ?? "unbekannter Fehler"}`}</p>{job.status === "READY_FOR_REVIEW" && (job.pipeline?.errors.length && props.pipeline ? <button className={styles.secondary} disabled={busy} onClick={()=>void run(async()=>{const result=await props.pipeline!({action:"resume",jobId:job.jobId}) as {report:{errors:string[];stored:string[]}};setMessage(result.report.errors.length?"Die Verarbeitung ist noch nicht bestätigt. Der Auftrag bleibt erhalten.":`${result.report.stored.length} Angaben im Profil bestätigt. Offene Vorschläge bleiben zur Prüfung erhalten.`);setJobs((await props.jobsGet() as ResearchJobsResponse).jobs);})}>Verarbeitung fortsetzen</button> : <button className={styles.secondary} disabled={busy || job.pipeline?.state === "PROCESSING"} onClick={() => void openJob(job.jobId)}>{job.pipeline?.state === "PROCESSING" ? "Verarbeitung läuft" : "Vorschlag prüfen"}</button>)}</div>)}</div></div>}
      {!preview && <div className={styles.stage}><div className={styles.stageHeading}><div><span className={styles.stepNumber}>02</span><h3>Recherche einfügen</h3></div></div>
        {!props.inboxManaged && !!storedDrafts.length && <div className={styles.queueList}><h4>Offene Rechercheberichte</h4>{storedDrafts.map((draft) => <div key={draft.draftId}><strong>{draft.spotName}</strong><p>{draft.version} · {new Date(draft.createdAt).toLocaleString("de-CH")} · Noch nicht abgeschlossen</p><button className={styles.secondary} disabled={busy} onClick={() => void openStoredDraft(draft.draftId)}>Prüfentwurf öffnen</button></div>)}</div>}
        <button type="button" className={styles.secondary} disabled={busy} onClick={()=>archiveVisible ? setArchiveVisible(false) : void showArchive()}>{archiveVisible ? "Archiv schliessen" : "Abgeschlossene Berichte ansehen"}</button>
        {archiveVisible && <section className={styles.queueList} aria-label="Recherchearchiv"><h4>Archiv</h4>{!archivedDrafts.length && <p>Noch keine abgeschlossenen Berichte.</p>}{archivedDrafts.map(draft=><div key={draft.draftId}><strong>{draft.spotName}</strong><p>Abgeschlossen: {draft.archivedAt ? new Date(draft.archivedAt).toLocaleString("de-CH") : "–"}</p><button type="button" disabled={busy} className={styles.secondary} onClick={()=>void openStoredDraft(draft.draftId)}>Bericht ansehen</button><button type="button" disabled={busy} className={styles.secondary} onClick={()=>void restoreDraft(draft.draftId)}>Erneut zur Prüfung öffnen</button></div>)}</section>}
        {draftsError && <p className={styles.error} role="alert">{draftsError}</p>}
        <p>Die exportierte Datei extern recherchieren lassen. Nicht belegte Angaben bleiben offen.</p><label className={styles.upload}>Recherchierte JSON-Datei auswählen<input key={uploadKey} type="file" accept="application/json,.json" onChange={(event) => { const file = event.target.files?.[0]; if (file) void file.text().then((text) => { let parsed: unknown; try { parsed = JSON.parse(text); } catch { parsed = null; } const draft = parseNuknukDraft(parsed); importedFields.current.clear();setCompletion(null); setActiveJobId(null); setSavedDraftId(null); setDraftReview(null);setDraftArchived(false);setDraftsError(""); setNuknukDraft(draft); setJson(draft ? "" : text); setPreview(null); setReviewOptions({}); setConfirmations({}); }); }} /></label>{!!json && <p className={styles.note}>Datei geladen. Die Recherche wird erst nach deiner Prüfung gespeichert.</p>}<details className={styles.details}><summary>JSON stattdessen einfügen oder ansehen</summary><textarea className={styles.json} value={json} onChange={(event) => { importedFields.current.clear();setSavedDraftId(null);setDraftReview(null);setCompletion(null); setActiveJobId(null); setJson(event.target.value); setPreview(null); setReviewOptions({}); setConfirmations({}); }} placeholder="Vollständiges Recherche-JSON einfügen …" spellCheck={false} /></details>{!!json && <><button className={styles.primary} disabled={busy} onClick={() => void previewBatch()}>JSON prüfen</button><button className={styles.secondary} onClick={startNewBatch}>Andere Spots auswählen</button></>}</div>}
      {message && !alreadyCurrent && <p className={styles.message} role="status">{message}</p>}
      {preview && <div className={styles.report}>
        {!driftedSpots.length && preview.perSpot.map((spot) => spot.unresolvedDetails.length ? <details className={styles.details} key={`gaps-${spot.spotId}`}><summary>{spot.name}: {spot.unresolvedDetails.length} bewusst offene Angaben mit Gründen</summary><ul>{spot.unresolvedDetails.map((gap) => <li key={gap.attributeKey}><b>{fieldLabel(gap.attributeKey)}</b>: {researchGapReason(gap.reason)}</li>)}</ul></details> : null)}
        {!driftedSpots.length && preview.perSpot.filter(spot => spot.readyClaims.length || spot.declined.length).map((spot) => <section className={styles.spot} key={`sources-${spot.spotId}`} aria-label={`Neue Vorschläge für ${spot.name}`}><h3>Neue Vorschläge · {spot.name}</h3>{spot.readyClaims.map((claim) => <article className={styles.review} key={claim.attributeKey}><h4>{fieldLabel(claim.attributeKey)}</h4><ResearchValue attributeKey={claim.attributeKey} value={claim.value}/><details className={styles.sourceDetails}><summary>Quellen & Belege ({1+(claim.supportingSources?.length ?? 0)})</summary>{[claim.source,...(claim.supportingSources ?? [])].map((source,index) => <blockquote key={index}><p>{source.evidence}</p><a href={source.url} target="_blank" rel="noreferrer">Originalquelle öffnen ↗</a></blockquote>)}</details>{!spot.derived.includes(claim.attributeKey) && !["location.latitude", "location.longitude"].includes(claim.attributeKey) && <button type="button" className={styles.secondary} disabled={busy} onClick={() => toggleDeclined(spot.spotId, claim.attributeKey)}>Diesen Vorschlag nicht übernehmen</button>}</article>)}{spot.declined.map((key) => <p key={key}>{fieldLabel(key)} zurückgehalten. <button type="button" className={styles.secondary} disabled={busy} onClick={() => toggleDeclined(spot.spotId, key)}>Wieder berücksichtigen</button></p>)}</section>)}
        {driftedSpots.length > 0 ? <div className={styles.outcome} role="status"><span className={styles.outcomeIcon} aria-hidden="true">↻</span><h3>Der Stand hat sich geändert.</h3><p>World Knowledge wurde für {driftedSpots.map((spot) => spot.name).join(" und ")} seit dem Export aktualisiert. Deine Recherche bleibt erhalten; wir prüfen sie gegen den neuesten Stand. Dabei wird nichts gespeichert.</p><button className={styles.primary} disabled={busy} onClick={() => void refreshBatch()}>Aktuellen Stand laden</button></div> : alreadyCurrent ? <div className={styles.outcome} role="status"><span className={styles.outcomeIcon} aria-hidden="true">✓</span><h3>Alles bereits aktuell.</h3><p>{preview.totals.skipped} {preview.totals.skipped === 1 ? "Angabe ist" : "Angaben sind"} schon in World Knowledge vorhanden.{preview.totals.unresolved > 0 ? ` ${preview.totals.unresolved} ${preview.totals.unresolved === 1 ? "Angabe bleibt" : "Angaben bleiben"} bewusst offen.` : ""} Du musst nichts mehr übernehmen.</p><button className={styles.primary} disabled={busy || reviewChanged} onClick={activeJobId || savedDraftId ? () => void importBatch() : startNewBatch}>{activeJobId || savedDraftId ? "Prüfung abschliessen" : "Neue Recherche starten"}</button></div> : <div className={styles.status} role="status"><span>{busy || reviewChanged ? "Wird geprüft" : preview.totals.invalid > 0 ? "Fehler prüfen" : preview.totals.conflicts > 0 ? "Deine Entscheidung ist gefragt" : preview.totals.ready > 0 ? "Bereit zur Übernahme" : "Keine neuen Angaben"}</span><h3>{busy || reviewChanged ? "Einen Moment …" : preview.totals.invalid > 0 ? "Eine Angabe konnte nicht verarbeitet werden." : preview.totals.conflicts > 0 ? `${preview.totals.conflicts} ${preview.totals.conflicts === 1 ? "Angabe braucht" : "Angaben brauchen"} deine Entscheidung.` : preview.totals.ready > 0 ? `${preview.totals.ready} ${preview.totals.ready === 1 ? "Angabe ist" : "Angaben sind"} geprüft.` : "Nichts zu übernehmen."}</h3><p>{preview.totals.conflicts > 0 ? "Vergleiche bisheriges Wissen und Recherche direkt unten. Deine Wahl wird automatisch neu geprüft." : preview.totals.ready > 0 ? "Prüfe die Angaben und übernimm sie dann mit einem Schritt." : "Die Details stehen unten."}</p></div>}
        {!driftedSpots.length && preview.perSpot.map((spot) => <article className={styles.spot} key={spot.spotId}><header><h3>{spot.name}</h3><span>{spot.conflicts.length > 0 ? `${spot.conflicts.length} zu prüfen` : spot.ready.length > 0 ? `${spot.ready.length} bereit` : "Aktuell"}</span></header>{spot.reviewCompletionError && <p className={styles.error}>{spot.reviewCompletionError}</p>}{!!spot.invalid.length && <p className={styles.error}>Fehler: {spot.invalid.join(" · ")}</p>}{!!spot.blocked?.length && <p className={styles.note}>Zurückgehalten: {spot.blocked.join(" · ")}</p>}{!!spot.derived?.length && <p className={styles.note}>Zeitzone Europe/Zurich wurde aus dem bestätigten Schweizer Standort abgeleitet. Ein bisher unbekannter Wert braucht deine Bestätigung.</p>}{(reviewOptions[spot.spotId] ?? spot.reviews ?? []).map((review) => { const accepted = confirmations[spot.spotId]?.[review.attributeKey] === review.current.claimId; const kept = confirmations[spot.spotId]?.[review.attributeKey] === ""; return <section className={styles.review} key={review.attributeKey} aria-label={`Prüfung ${review.attributeKey}`}><span className={styles.eyebrow}>ENTSCHEIDUNG</span><h4>{fieldLabel(review.attributeKey)}</h4><div className={styles.comparison}><div><small>Bisher</small>{review.current.knowledgeState === "UNKNOWN" ? <p>Noch unbekannt</p> : <ResearchValue attributeKey={review.attributeKey} value={review.current.value}/>}</div><div><small>Recherchiert</small><ResearchValue attributeKey={review.attributeKey} value={review.proposed.value}/></div></div>{review.editorRequired && <p className={styles.note}>{review.editorRequired} <a href={`/spots/${spot.spotId}/edit#spot-understanding`} target="_blank" rel="noreferrer">Profil bearbeiten ↗</a> Danach hier den aktuellen Stand laden und erneut prüfen.</p>}<p>{review.proposed.source.evidence}</p><a href={review.proposed.source.url} target="_blank" rel="noreferrer">Originalquelle öffnen ↗</a><div className={styles.choices} role="group" aria-label={`Entscheidung für ${fieldLabel(review.attributeKey)}`}><button type="button" className={accepted ? styles.chosen : ""} aria-pressed={accepted} disabled={busy || preview.mode !== "PREVIEW" || !!review.editorRequired} onClick={() => chooseReview(spot.spotId, review, true)}>Neue Angabe übernehmen</button><button type="button" className={kept ? styles.chosen : ""} aria-pressed={kept} disabled={busy || preview.mode !== "PREVIEW"} onClick={() => chooseReview(spot.spotId, review, false)}>Bisherige behalten</button></div><small className={styles.note}>{accepted ? "Neu gewählt. Der bisherige Wert bleibt in der Historie." : kept ? "Bisheriger Wert bleibt. Der Vorschlag wird nicht importiert." : "Noch nichts gespeichert."}</small></section>; })}{spot.location && <fieldset className={styles.location}><legend>Standort abgleichen</legend><p>{spot.location.message}</p>{spot.location.candidates.map((candidate) => <label key={candidate.placeId}><input type="radio" name={`location-${spot.spotId}`} disabled={busy} checked={locations[spot.spotId] === candidate.token} onChange={() => setLocations((current) => ({ ...current, [spot.spotId]: candidate.token }))} /><span><b>{candidate.name}</b><small>{candidate.address} · {candidate.latitude}, {candidate.longitude}</small><a href={candidate.sourceUrl} target="_blank" rel="noreferrer">Auf Google Maps prüfen ↗</a></span></label>)}{!!spot.location.candidates.length && <label><input type="radio" name={`location-${spot.spotId}`} disabled={busy} checked={!locations[spot.spotId]} onChange={() => setLocations((current) => ({ ...current, [spot.spotId]: "" }))} /><span>Koordinaten unverändert lassen</span></label>}{locations[spot.spotId] && <p className={styles.note}>Die zwei Koordinaten werden mit übernommen. Diese Auswahl ist 15 Minuten gültig.</p>}</fieldset>}{!!spot.ready.length && <details className={styles.details}><summary>{spot.ready.length} {spot.ready.length === 1 ? "bereite Angabe" : "bereite Angaben"} ansehen</summary><ul>{spot.ready.map((key) => <li key={key}>{fieldLabel(key)}</li>)}</ul></details>}{!!spot.unresolved.length && <details className={styles.details}><summary>{spot.unresolved.length} {spot.unresolved.length === 1 ? "offene Angabe" : "offene Angaben"} ansehen</summary><ul>{spot.unresolved.map((key) => <li key={key}>{fieldLabel(key)}</li>)}</ul></details>}</article>)}
        {!driftedSpots.length && preview.perSpot.filter(spot => spot.storedClaims?.length).map(spot => <section className={styles.spot} key={`stored-${spot.spotId}`} aria-label={`Bereits gespeichert für ${spot.name}`}><h3>Bereits im Profil · {spot.name}</h3><p className={styles.note}>Diese Angaben stimmen mit dem gespeicherten Profil überein. Sie werden nicht erneut geschrieben.</p>{spot.storedClaims?.map(claim => <article className={styles.review} key={claim.attributeKey}><span className={styles.stateBadge}>Im Profil gespeichert</span><h4>{fieldLabel(claim.attributeKey)}</h4><ResearchValue attributeKey={claim.attributeKey} value={claim.value}/></article>)}</section>)}
        <details className={styles.audit}><summary>Prüfprotokoll ansehen</summary><p>Übernommen: {preview.totals.imported || 0} · Bereit: {preview.totals.ready || 0} · Bereits vorhanden: {preview.totals.skipped || 0} · Konflikte: {preview.totals.conflicts || 0} · Zurückgehalten: {preview.totals.blocked || 0} · Ungültig: {preview.totals.invalid || 0} · Offen: {preview.totals.unresolved || 0}</p>{preview.perSpot.map((spot) => <p key={spot.spotId}>{spot.name}: {spot.conflicts.join(", ") || "keine Konflikte"}</p>)}<button disabled={busy} onClick={() => void previewBatch()}>Import erneut prüfen</button></details>
        {preview.mode === "COMMIT" && <button className={styles.primary} disabled={busy} onClick={()=>void refreshBatch()}>Aktuellen Stand laden und weiterprüfen</button>}
        {preview.mode === "PREVIEW" && !driftedSpots.length && (preview.totals.ready > 0 || canFinishWithoutWrites) && !alreadyCurrent && <div className={styles.footer}><span>{preview.totals.conflicts > 0 ? `${preview.totals.conflicts} offene Angaben bleiben unverändert.` : preview.totals.ready > 0 ? "Nur geprüfte Angaben werden gespeichert." : "Deine Entscheidungen werden als abgeschlossen festgehalten; World Knowledge bleibt unverändert."}</span><button className={styles.primary} disabled={busy || reviewChanged || preview.totals.invalid > 0} onClick={() => void importBatch()}>{preview.totals.ready > 0 ? `Jetzt ${preview.totals.ready} geprüfte Angabe(n) übernehmen` : "Prüfung abschliessen"}</button></div>}
      </div>}
    </>}
    </>}
  </section>;
}

function documentElement(text: string, filename: string) {
  const link = document.createElement("a");
  link.href = URL.createObjectURL(new Blob([text], { type: "application/json" }));
  link.download = filename;
  return link;
}
