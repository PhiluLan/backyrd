"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { PROTOTYPE_VERSION, STORAGE_KEY, analysisReport, catalog, deriveFits, emptyState, engineSnapshot, exportPackage, groups, qualityFor, relevantDefinitions, resolveKnowledge, validateImport, type CatalogDefinition, type ClaimStatus, type GroupKey, type PrototypeState, type ResolvedStatus, type Role } from "@/lib/world-knowledge/model";
import { ClaimEditor } from "./claim-editor";
import { AnalysisView, ClaimsView, QualityView, ResolvedView, SnapshotView } from "./knowledge-views";
import { TemporalEditor } from "./temporal-editor";
import { IntentCapabilityEditor } from "./intent-capability-editor";

type ViewKey = "AUTHORING" | "CLAIMS" | "RESOLVED" | "QUALITY" | "SNAPSHOT" | "ANALYSIS";
type StatusFilter = "ALL" | "FILLED" | "OPEN" | "UNKNOWN" | "DISPUTED" | "EXPIRED";
export const roleLabels: Record<Role, string> = { ADMIN: "Admin", OWNER_BASIC: "Verified Owner Basic", OWNER_PRO: "Verified Owner Pro" };
export const statusLabels: Record<ClaimStatus | "UNFILLED" | "EXPIRED", string> = { UNFILLED: "Nicht ausgefüllt", KNOWN_TRUE: "Known true", KNOWN_FALSE: "Known false", KNOWN_VALUE: "Known value", UNKNOWN: "Unknown", NOT_APPLICABLE: "Not applicable", DISPUTED: "Disputed", EXPIRED: "Expired" };
const groupLabels: Record<GroupKey, string> = Object.fromEntries(groups.map((item) => [item.key, item.label])) as Record<GroupKey, string>;
const accessRank = { BASIC: 1, PRO: 2, ADMIN: 3 };
const roleRank: Record<Role, number> = { OWNER_BASIC: 1, OWNER_PRO: 2, ADMIN: 3 };
export const isUnlocked = (definition: CatalogDefinition, role: Role) => roleRank[role] >= accessRank[definition.ownerAccess];
export const tone = (status: string) => status === "DISPUTED" ? "danger" : status === "EXPIRED" ? "warning" : status === "UNKNOWN" ? "neutral" : status === "NOT_APPLICABLE" ? "muted" : status.startsWith("KNOWN") ? "positive" : "empty";
export const displayValue = (value: unknown) => value === null || value === undefined || value === "" ? "—" : typeof value === "object" ? JSON.stringify(value) : String(value);

declare global { interface Document { modelContext?: { registerTool(tool: { name: string; title?: string; description: string; inputSchema: object; annotations?: { readOnlyHint?: boolean; untrustedContentHint?: boolean }; execute(input: unknown): unknown | Promise<unknown> }, options?: { signal?: AbortSignal }): void | Promise<void> } } }

function downloadJson(data: unknown) {
  const link = document.createElement("a");
  link.href = URL.createObjectURL(new Blob([`${JSON.stringify(data, null, 2)}\n`], { type: "application/json" }));
  link.download = `philipps-casa-analysis-${new Date().toISOString().slice(0, 10)}.json`;
  link.click(); URL.revokeObjectURL(link.href);
}

export function WorldKnowledgePrototype() {
  const [state, setState] = useState<PrototypeState>(() => emptyState());
  const [role, setRole] = useState<Role>("ADMIN");
  const [group, setGroup] = useState<GroupKey>("CLASSIFICATION");
  const [view, setView] = useState<ViewKey>("AUTHORING");
  const [query, setQuery] = useState("");
  const [statusFilter, setStatusFilter] = useState<StatusFilter>("ALL");
  const [showForeign, setShowForeign] = useState(false);
  const [limit, setLimit] = useState(48);
  const [editor, setEditor] = useState<CatalogDefinition | null>(null);
  const [analysis, setAnalysis] = useState<ReturnType<typeof analysisReport> | null>(null);
  const [saveMessage, setSaveMessage] = useState("Noch nicht lokal gespeichert");
  const importRef = useRef<HTMLInputElement>(null);
  const stateRef = useRef(state);
  useEffect(() => { stateRef.current = state; }, [state]);

  useEffect(() => { queueMicrotask(() => { try { const saved = localStorage.getItem(STORAGE_KEY); if (saved) { const restored = validateImport(JSON.parse(saved)); setState(restored); setSaveMessage(restored.savedAt ? `Lokal gespeichert · ${new Date(restored.savedAt).toLocaleString("de-CH")}` : "Lokaler Entwurf wiederhergestellt"); } } catch { setSaveMessage("Ungültiger Speicherstand – sicherer Leerstand geladen"); } }); }, []);
  const resolved = useMemo(() => resolveKnowledge(state), [state]);
  const resolvedMap = useMemo(() => new Map(resolved.map((item) => [item.definition.id, item])), [resolved]);
  const relevantIds = useMemo(() => new Set(relevantDefinitions(state).map((item) => item.id)), [state]);
  const quality = useMemo(() => qualityFor(state), [state]);
  const derived = useMemo(() => deriveFits(resolved), [resolved]);
  const snapshot = useMemo(() => engineSnapshot(state), [state]);
  const definitions = useMemo(() => {
    const q = query.trim().toLocaleLowerCase("de");
    return catalog.definitions.filter((definition) => {
      if (!showForeign && !relevantIds.has(definition.id)) return false;
      if (!q && definition.group !== group) return false;
      if (q && !`${definition.label} ${definition.family} ${definition.semanticClass} ${groupLabels[definition.group]}`.toLocaleLowerCase("de").includes(q)) return false;
      const item = resolvedMap.get(definition.id);
      if (statusFilter === "FILLED" && !item) return false;
      if (statusFilter === "OPEN" && item) return false;
      if (["UNKNOWN", "DISPUTED", "EXPIRED"].includes(statusFilter) && item?.status !== statusFilter) return false;
      return true;
    });
  }, [group, query, relevantIds, resolvedMap, showForeign, statusFilter]);

  const save = () => { const next = { ...stateRef.current, savedAt: new Date().toISOString() }; localStorage.setItem(STORAGE_KEY, JSON.stringify(next)); setState(next); setSaveMessage(`Lokal gespeichert · ${new Date(next.savedAt).toLocaleString("de-CH")}`); return next; };
  const runAnalysis = () => { const report = analysisReport(stateRef.current); setAnalysis(report); setView("ANALYSIS"); return report; };
  useEffect(() => {
    const context = document.modelContext; if (!context?.registerTool) return; const lifecycle = new AbortController();
    const register = (tool: Parameters<typeof context.registerTool>[0]) => { try { void Promise.resolve(context.registerTool(tool, { signal: lifecycle.signal })).catch(() => undefined); } catch {} };
    register({ name: "save_philipps_casa", title: "Philipps Casa speichern", description: "Speichert den sichtbaren World-Knowledge-Entwurf im lokalen Browser.", inputSchema: { type: "object", properties: {}, additionalProperties: false }, annotations: { readOnlyHint: false, untrustedContentHint: false }, execute: () => ({ savedAt: save().savedAt, storage: "localStorage" }) });
    register({ name: "analyze_philipps_casa", title: "Philipps Casa analysieren", description: "Erzeugt denselben Bericht wie die sichtbare Aktion Analyse starten.", inputSchema: { type: "object", properties: {}, additionalProperties: false }, annotations: { readOnlyHint: true, untrustedContentHint: false }, execute: () => runAnalysis() });
    register({ name: "read_philipps_casa_engine_snapshot", title: "Engine Snapshot lesen", description: "Liest den bereinigten World-Knowledge-Snapshot der lokalen Eingaben.", inputSchema: { type: "object", properties: {}, additionalProperties: false }, annotations: { readOnlyHint: true, untrustedContentHint: false }, execute: () => engineSnapshot(stateRef.current) });
    return () => lifecycle.abort();
  }, []);

  const updateSpot = <K extends keyof PrototypeState["spot"]>(key: K, value: PrototypeState["spot"][K]) => setState((current) => ({ ...current, spot: { ...current.spot, [key]: value } }));
  const choosePrimary = (key: string) => setState((current) => ({ ...current, spot: { ...current.spot, primaryCategory: key, secondaryCategories: current.spot.secondaryCategories.filter((item) => item !== key) } }));
  const toggleSecondary = (key: string) => { if (key === state.spot.primaryCategory) return; updateSpot("secondaryCategories", state.spot.secondaryCategories.includes(key) ? state.spot.secondaryCategories.filter((item) => item !== key) : [...state.spot.secondaryCategories, key]); };
  const importFile = async (file?: File) => { if (!file) return; try { setState(validateImport(JSON.parse(await file.text()))); setAnalysis(null); setSaveMessage("Import geladen · zum Behalten speichern"); } catch (error) { alert(error instanceof Error ? error.message : "Import fehlgeschlagen."); } if (importRef.current) importRef.current.value = ""; };
  const reset = () => { if (!confirm("Alle lokalen Eingaben für Philipps Casa wirklich zurücksetzen?")) return; localStorage.removeItem(STORAGE_KEY); setState(emptyState()); setAnalysis(null); setSaveMessage("Lokaler Stand zurückgesetzt"); };

  return <div className="wk-lab">
    <header className="wk-topbar"><div className="wk-brand"><span className="wk-mark">B</span><div><span className="wk-kicker">WORLD KNOWLEDGE LAB · {PROTOTYPE_VERSION}</span><h1>{state.spot.name}</h1></div></div><div className="wk-role" aria-label="Rolle simulieren">{(Object.keys(roleLabels) as Role[]).map((item) => <button key={item} type="button" data-active={role === item} onClick={() => setRole(item)}>{roleLabels[item]}</button>)}</div><div className="wk-actions"><button className="wk-button" onClick={save}>Speichern</button><button className="wk-button" onClick={() => downloadJson(exportPackage(state))}>Export</button><button className="wk-primary-action" onClick={runAnalysis}>Analyse starten <span>→</span></button></div></header>
    <div className="wk-notice"><strong>{roleLabels[role]}</strong><span>{role === "ADMIN" ? "Vollständiger Draft-Katalog, Claims, Evidence und Historie." : "Verified Ownership wird simuliert. Eingaben bleiben Source-bound Claims."}</span><em>Abo ≠ Trust · Payment ≠ Ranking</em></div>
    <div className="wk-grid"><aside className="wk-nav"><label className="wk-search"><span>Alle {catalog.definitions.length} Parameter durchsuchen</span><input value={query} onChange={(event) => { setQuery(event.target.value); setLimit(48); }} type="search" placeholder="Terrasse, WLAN, Date …" /></label><button className="wk-identity-nav" data-active={view === "AUTHORING" && !query} onClick={() => { setView("AUTHORING"); setQuery(""); }}><span>01</span><div>Spot Identity<small>1 Primary · {state.spot.secondaryCategories.length} Secondary</small></div></button><nav aria-label="Eigenschaftsgruppen">{groups.map((item, index) => { const count = catalog.definitions.filter((definition) => definition.group === item.key && relevantIds.has(definition.id)).length; const filled = resolved.filter((entry) => entry.definition.group === item.key && relevantIds.has(entry.definition.id)).length; return <button key={item.key} data-active={view === "AUTHORING" && group === item.key && !query} onClick={() => { setView("AUTHORING"); setGroup(item.key); setQuery(""); setLimit(48); }}><span>{String(index + 2).padStart(2, "0")}</span><div>{item.label}<small>{filled} / {count} gepflegt</small></div></button>; })}</nav><div className="wk-local-note"><span /> Nur localStorage · keine Production-Verbindung<small>{saveMessage}</small></div></aside>
      <main className="wk-workspace"><div className="wk-view-tabs" aria-label="Arbeitsansicht">{(["AUTHORING", "CLAIMS", "RESOLVED", "QUALITY", "SNAPSHOT", "ANALYSIS"] as ViewKey[]).map((item) => <button key={item} data-active={view === item} onClick={() => setView(item)}>{({ AUTHORING:"Authoring", CLAIMS:"Claims", RESOLVED:"Resolved", QUALITY:"Data Quality", SNAPSHOT:"Engine Snapshot", ANALYSIS:"Analyse" } as Record<ViewKey,string>)[item]}</button>)}</div>
      {view === "AUTHORING" && <><section className="wk-identity-panel"><div className="wk-section-head"><div><span className="wk-kicker">SPOT IDENTITY</span><h2>{state.spot.name}</h2><p>Synthetischer Testspot · Kategorienwechsel löschen keine Claims.</p></div><span className="wk-draft">PROTOTYPE · DRAFT</span></div><div className="wk-identity-fields"><label>Name<input value={state.spot.name} onChange={(event) => updateSpot("name", event.target.value)} /></label><label>Adresse<input value={state.spot.address} onChange={(event) => updateSpot("address", event.target.value)} /></label><label>Ort<input value={state.spot.city} onChange={(event) => updateSpot("city", event.target.value)} /></label><label>Zeitzone<input value={state.spot.timezone} onChange={(event) => updateSpot("timezone", event.target.value)} /></label></div><CategoryPicker primary={state.spot.primaryCategory} secondary={state.spot.secondaryCategories} onPrimary={choosePrimary} onSecondary={toggleSecondary} /></section>
      <div className="wk-section-head wk-parameter-head"><div><span className="wk-kicker">{query ? "SEARCH RESULTS" : "CATEGORY-AWARE AUTHORING"}</span><h2>{query ? `„${query}“` : groupLabels[group]}</h2><p>{query ? "Treffer über alle Gruppen und Kategorien." : groups.find((item) => item.key === group)?.help}</p></div><span className="wk-result-count">{definitions.length} Parameter</span></div>{group === "TEMPORAL_STATE" && !query && <TemporalEditor state={state} setState={setState} />}<div className="wk-filterbar"><div>{(["ALL", "FILLED", "OPEN", "UNKNOWN", "DISPUTED", "EXPIRED"] as StatusFilter[]).map((item) => <button key={item} data-active={statusFilter === item} onClick={() => setStatusFilter(item)}>{({ALL:"Alle",FILLED:"Ausgefüllt",OPEN:"Offen",UNKNOWN:"Unknown",DISPUTED:"Konflikt",EXPIRED:"Abgelaufen"} as Record<StatusFilter,string>)[item]}</button>)}</div><label><input type="checkbox" checked={showForeign} onChange={(event) => setShowForeign(event.target.checked)} /> Category-fremde Parameter</label></div><div className="wk-definition-list">{definitions.slice(0, limit).map((definition) => { const item = resolvedMap.get(definition.id); const foreign = !relevantIds.has(definition.id); return <button className="wk-definition" key={definition.id} onClick={() => setEditor(definition)}><span className={`wk-status-dot ${tone(item?.status ?? "UNFILLED")}`} /><div><div className="wk-definition-title"><strong>{definition.label}</strong>{definition.reviewState === "REVIEW_NEEDED" && <em>Review needed</em>}{foreign && <em className="foreign">Category-fremd</em>}{!isUnlocked(definition, role) && <em className="locked">{definition.ownerAccess} · gesperrt</em>}</div><p>{definition.family} · {definition.semanticClass.replaceAll("_", " ")} · {definition.valueType}</p></div><div className="wk-definition-value"><span>{statusLabels[item?.status ?? "UNFILLED"]}</span><strong>{item ? displayValue(item.value) : "Offen"}</strong><small>{item ? `${item.confidence}% simulated confidence` : `${definition.applicableCategories.length} Kategorie(n)`}</small></div><span className="wk-chevron">›</span></button>; })}{!definitions.length && <Empty />}</div>{definitions.length > limit && <button className="wk-load-more" onClick={() => setLimit((value) => value + 48)}>Weitere 48 anzeigen · {definitions.length - limit} verbleibend</button>}</>}
      {view === "AUTHORING" && group === "CAPABILITIES" && !query && <IntentCapabilityEditor state={state} setState={setState} />}
      {view === "CLAIMS" && <ClaimsView state={state} onDefinition={setEditor} />}{view === "RESOLVED" && <ResolvedView resolved={resolved} derived={derived} onDefinition={setEditor} />}{view === "QUALITY" && <QualityView state={state} />}{view === "SNAPSHOT" && <SnapshotView snapshot={snapshot} />}{view === "ANALYSIS" && <AnalysisView analysis={analysis} onRun={runAnalysis} onExport={() => downloadJson(exportPackage(state))} />}</main>
      <aside className="wk-inspector"><span className="wk-kicker">LIVE AUSWERTUNG</span><h2>World State</h2><Metric label="Completeness" value={quality.completeness} help="Pflegekennzahl – kein Ranking-Signal."/><Metric label="Confidence simulation" value={quality.confidence} lime help="Evidence-basiert; Rolle und Abo zählen nie."/><dl className="wk-counts">{(["KNOWN_TRUE","KNOWN_FALSE","UNKNOWN","NOT_APPLICABLE","DISPUTED","EXPIRED"] as ResolvedStatus[]).map((status) => <div key={status}><dt>{status.replaceAll("_"," ")}</dt><dd>{resolved.filter((item) => item.status === status).length}</dd></div>)}</dl><button className="wk-inspector-link" onClick={() => setView("RESOLVED")}>Resolved Knowledge <span>→</span></button><div className="wk-mini-snapshot"><span>ENGINE SNAPSHOT PREVIEW</span><code>{JSON.stringify({ primaryCategory: snapshot.classification.primaryCategory, facts: snapshot.facts.length, directFits: snapshot.directFits.length, derivedFits: snapshot.derivedFits.length }, null, 2)}</code><button onClick={() => setView("SNAPSHOT")}>JSON öffnen</button></div><div className="wk-boundary"><strong>Engine Boundary</strong><p>Kein Owner Tier, Abo, Payment, Admin Notes, private Evidence oder rohe AI-Ausgabe.</p></div><div className="wk-file-actions"><button onClick={() => importRef.current?.click()}>Import</button><button onClick={reset}>Reset</button><input ref={importRef} type="file" accept="application/json,.json" onChange={(event) => void importFile(event.target.files?.[0])} hidden /></div></aside></div>
    {editor && <ClaimEditor definition={editor} role={role} state={state} onClose={() => setEditor(null)} onChange={setState} />}
  </div>;
}

function CategoryPicker({ primary, secondary, onPrimary, onSecondary }: { primary:string;secondary:string[];onPrimary(key:string):void;onSecondary(key:string):void }) { return <div className="wk-category-block"><div className="wk-field-heading"><div><span>Primary & Secondary Categories</span><p>Primary ist eindeutig; Secondary mehrfach. Bestehende Eingaben bleiben erhalten.</p></div><strong>16 / 16</strong></div><div className="wk-category-grid">{catalog.categories.map((category) => <div key={category.key} className="wk-category-choice" data-primary={primary===category.key} data-secondary={secondary.includes(category.key)}><button onClick={() => onPrimary(category.key)}><span>{category.label}</span>{primary===category.key&&<small>PRIMARY</small>}</button><label><input type="checkbox" checked={secondary.includes(category.key)} disabled={primary===category.key} onChange={() => onSecondary(category.key)}/> Secondary</label></div>)}</div></div>; }
function Metric({label,value,help,lime=false}:{label:string;value:number;help:string;lime?:boolean}) { return <div className="wk-metric"><span>{label}</span><strong>{value}%</strong><i><b className={lime?"wk-confidence":""} style={{width:`${value}%`}}/></i><small>{help}</small></div>; }
function Empty() { return <div className="wk-empty"><strong>Keine Parameter in diesem Filter.</strong><span>Filter zurücksetzen oder category-fremde Parameter einblenden.</span></div>; }
