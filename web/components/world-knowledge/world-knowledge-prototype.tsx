"use client";

import { useEffect, useMemo, useRef, useState, type Dispatch, type SetStateAction } from "react";
import {
  STORAGE_KEY,
  analysisReport,
  catalog,
  deriveFits,
  emptyState,
  engineSnapshot,
  exportPackage,
  groups,
  qualityFor,
  relevantDefinitions,
  resolveKnowledge,
  validateImport,
  type CatalogDefinition,
  type ClaimStatus,
  type GroupKey,
  type PrototypeState,
  type Role,
} from "@/lib/world-knowledge/model";
import { ClaimEditor } from "./claim-editor";
import { FriendlyAnalysis, GuidedWorkflow } from "./guided-workflow";
import { IntentCapabilityEditor } from "./intent-capability-editor";
import { AnalysisView, ClaimsView, QualityView, ResolvedView, SnapshotView } from "./knowledge-views";
import { TemporalEditor } from "./temporal-editor";

type Mode = "GUIDED" | "EXPERT" | "ANALYSIS";
type ExpertView = "EDIT" | "CLAIMS" | "RESOLVED" | "QUALITY" | "SNAPSHOT" | "ANALYSIS";

export const roleLabels: Record<Role, string> = {
  ADMIN: "Admin",
  OWNER_BASIC: "Verified Owner Basic",
  OWNER_PRO: "Verified Owner Pro",
};
export const statusLabels: Record<ClaimStatus | "UNFILLED" | "EXPIRED", string> = {
  UNFILLED: "Nicht angegeben",
  KNOWN_TRUE: "Bestätigt",
  KNOWN_FALSE: "Trifft nicht zu",
  KNOWN_VALUE: "Wert angegeben",
  UNKNOWN: "Noch unbekannt",
  NOT_APPLICABLE: "Für diesen Spot nicht relevant",
  DISPUTED: "Widersprüchliche Angaben",
  EXPIRED: "Möglicherweise veraltet",
};

const accessRank = { BASIC: 1, PRO: 2, ADMIN: 3 };
const roleRank: Record<Role, number> = { OWNER_BASIC: 1, OWNER_PRO: 2, ADMIN: 3 };
export const isUnlocked = (definition: CatalogDefinition, role: Role) => roleRank[role] >= accessRank[definition.ownerAccess];
export const tone = (status: string) => status === "DISPUTED" ? "danger" : status === "EXPIRED" ? "warning" : status === "UNKNOWN" ? "neutral" : status === "NOT_APPLICABLE" ? "muted" : status.startsWith("KNOWN") ? "positive" : "empty";
export const displayValue = (value: unknown) => value === null || value === undefined || value === "" ? "—" : typeof value === "object" ? JSON.stringify(value) : String(value);

declare global {
  interface Document {
    modelContext?: {
      registerTool(
        tool: { name: string; title?: string; description: string; inputSchema: object; annotations?: { readOnlyHint?: boolean; untrustedContentHint?: boolean }; execute(input: unknown): unknown | Promise<unknown> },
        options?: { signal?: AbortSignal },
      ): void | Promise<void>;
    };
  }
}

function downloadJson(data: unknown) {
  const link = document.createElement("a");
  link.href = URL.createObjectURL(new Blob([`${JSON.stringify(data, null, 2)}\n`], { type: "application/json" }));
  link.download = `philipps-casa-analysis-${new Date().toISOString().slice(0, 10)}.json`;
  link.click();
  URL.revokeObjectURL(link.href);
}

export function WorldKnowledgePrototype() {
  const [state, setState] = useState<PrototypeState>(() => emptyState());
  const [role, setRole] = useState<Role>("ADMIN");
  const [mode, setMode] = useState<Mode>("GUIDED");
  const [saveMessage, setSaveMessage] = useState("Noch nicht gespeichert");
  const importRef = useRef<HTMLInputElement>(null);
  const stateRef = useRef(state);

  useEffect(() => { stateRef.current = state; }, [state]);
  useEffect(() => {
    queueMicrotask(() => {
      try {
        const saved = localStorage.getItem(STORAGE_KEY);
        if (!saved) return;
        const restored = validateImport(JSON.parse(saved));
        setState(restored);
        setSaveMessage(restored.savedAt ? `Gespeichert · ${new Date(restored.savedAt).toLocaleString("de-CH")}` : "Lokaler Entwurf wiederhergestellt");
      } catch {
        setSaveMessage("Gespeicherter Stand war nicht lesbar");
      }
    });
  }, []);

  const save = () => {
    const next = { ...stateRef.current, savedAt: new Date().toISOString() };
    localStorage.setItem(STORAGE_KEY, JSON.stringify(next));
    setState(next);
    setSaveMessage(`Gespeichert · ${new Date(next.savedAt).toLocaleString("de-CH")}`);
    return next;
  };
  const analyze = () => {
    setMode("ANALYSIS");
    return analysisReport(stateRef.current);
  };
  const importFile = async (file?: File) => {
    if (!file) return;
    try {
      setState(validateImport(JSON.parse(await file.text())));
      setSaveMessage("Import geladen · zum Behalten speichern");
      setMode("GUIDED");
    } catch (error) {
      alert(error instanceof Error ? error.message : "Import fehlgeschlagen.");
    }
    if (importRef.current) importRef.current.value = "";
  };
  const reset = () => {
    if (!confirm("Alle lokalen Eingaben für Philipps Casa wirklich zurücksetzen?")) return;
    localStorage.removeItem(STORAGE_KEY);
    setState(emptyState());
    setSaveMessage("Lokaler Stand zurückgesetzt");
    setMode("GUIDED");
  };

  useEffect(() => {
    const context = document.modelContext;
    if (!context?.registerTool) return;
    const lifecycle = new AbortController();
    const register = (tool: Parameters<typeof context.registerTool>[0]) => {
      try { void Promise.resolve(context.registerTool(tool, { signal: lifecycle.signal })).catch(() => undefined); } catch {}
    };
    register({ name: "save_philipps_casa", title: "Philipps Casa speichern", description: "Speichert die geführte Spot-Erfassung im lokalen Browser.", inputSchema: { type: "object", properties: {}, additionalProperties: false }, annotations: { readOnlyHint: false, untrustedContentHint: false }, execute: () => ({ savedAt: save().savedAt, storage: "localStorage" }) });
    register({ name: "analyze_philipps_casa", title: "Philipps Casa analysieren", description: "Erzeugt den aktuellen World-Knowledge-Analysebericht.", inputSchema: { type: "object", properties: {}, additionalProperties: false }, annotations: { readOnlyHint: true, untrustedContentHint: false }, execute: () => analysisReport(stateRef.current) });
    register({ name: "read_philipps_casa_engine_snapshot", title: "Technische Vorschau lesen", description: "Liest die bereinigte Vorschau für die Decision Engine.", inputSchema: { type: "object", properties: {}, additionalProperties: false }, annotations: { readOnlyHint: true, untrustedContentHint: false }, execute: () => engineSnapshot(stateRef.current) });
    return () => lifecycle.abort();
  }, []);

  return <div className="wk-lab wk-v2">
    <header className="wk-v2-topbar">
      <button className="wk-v2-brand" type="button" onClick={() => setMode("GUIDED")} aria-label="Zur geführten Spot-Erfassung">
        <span>B</span><div><small>WORLD KNOWLEDGE</small><strong>{state.spot.name}</strong></div>
      </button>
      <div className="wk-v2-save"><span className={state.savedAt ? "saved" : ""} />{saveMessage}</div>
      <label className="wk-v2-role"><span>Ansicht als</span><select value={role} onChange={(event) => setRole(event.target.value as Role)}><option value="ADMIN">Admin</option><option value="OWNER_BASIC">Verified Owner Basic</option><option value="OWNER_PRO">Verified Owner Pro</option></select></label>
      <div className="wk-v2-actions">
        <button type="button" onClick={save}>Speichern</button>
        <button type="button" className="primary" onClick={analyze}>Analyse starten <span>→</span></button>
      </div>
    </header>
    <div className="wk-v2-role-note"><strong>{roleLabels[role]}</strong><span>{role === "ADMIN" ? "Du kannst alle Angaben bearbeiten und bei Bedarf Quellen prüfen." : role === "OWNER_BASIC" ? "Du kannst die grundlegenden Spot-Angaben bearbeiten. Zusätzliche Bereiche sind als möglicher späterer Umfang gekennzeichnet." : "Du kannst zusätzliche Angaben bearbeiten. Diese Rolle besitzt dadurch keine höhere Verlässlichkeit oder Entscheidungsautorität."}</span><em>Zahlung beeinflusst weder Verlässlichkeit noch Ranking.</em></div>

    {mode === "GUIDED" && <GuidedWorkflow state={state} setState={setState} role={role} onSave={save} onAnalyze={analyze} onOpenExpert={() => setMode("EXPERT")} />}
    {mode === "ANALYSIS" && <FriendlyAnalysis state={state} onOpenExpert={() => setMode("EXPERT")} />}
    {mode === "EXPERT" && <ExpertWorkspace state={state} setState={setState} role={role} onBack={() => setMode("GUIDED")} />}

    <div className="wk-v2-utility">
      <button type="button" onClick={() => importRef.current?.click()}>Importieren</button>
      <button type="button" onClick={() => downloadJson(exportPackage(state))}>Analysepaket exportieren</button>
      <button type="button" className="danger" onClick={reset}>Zurücksetzen</button>
      <input ref={importRef} type="file" accept="application/json,.json" hidden onChange={(event) => void importFile(event.target.files?.[0])} />
    </div>
  </div>;
}

function ExpertWorkspace({ state, setState, role, onBack }: { state: PrototypeState; setState: Dispatch<SetStateAction<PrototypeState>>; role: Role; onBack(): void }) {
  const [group, setGroup] = useState<GroupKey>("CLASSIFICATION");
  const [view, setView] = useState<ExpertView>("EDIT");
  const [query, setQuery] = useState("");
  const [showForeign, setShowForeign] = useState(false);
  const [editor, setEditor] = useState<CatalogDefinition | null>(null);
  const [limit, setLimit] = useState(60);
  const resolved = useMemo(() => resolveKnowledge(state), [state]);
  const resolvedMap = useMemo(() => new Map(resolved.map((item) => [item.definition.id, item])), [resolved]);
  const relevant = useMemo(() => new Set(relevantDefinitions(state).map((item) => item.id)), [state]);
  const definitions = catalog.definitions.filter((item) => {
    if (!showForeign && !relevant.has(item.id)) return false;
    if (query) return `${item.label} ${item.family} ${item.semanticClass}`.toLocaleLowerCase("de").includes(query.toLocaleLowerCase("de"));
    return item.group === group;
  });
  const quality = qualityFor(state);
  const tabs: Array<[ExpertView, string]> = [["EDIT", "Definitionen bearbeiten"], ["CLAIMS", "Angaben und Quellen"], ["RESOLVED", "Aktueller Wissensstand"], ["QUALITY", "Datencheck"], ["SNAPSHOT", "Vorschau für die Decision Engine"], ["ANALYSIS", "Technische Analyse"]];

  return <div className="wk-expert-shell">
    <aside className="wk-expert-nav">
      <button type="button" className="wk-expert-back" onClick={onBack}>← Zur geführten Erfassung</button>
      <div><span className="wk-kicker">ERWEITERT</span><h2>Angaben und Quellen</h2><p>Der vollständige technische Katalog für Prüfung, Konflikte und Herkunft.</p></div>
      <label className="wk-search"><span>Alle {catalog.definitions.length} Definitionen durchsuchen</span><input type="search" value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Definition suchen …" /></label>
      <nav>{groups.map((item) => <button type="button" key={item.key} data-active={!query && group === item.key} onClick={() => { setQuery(""); setGroup(item.key); setView("EDIT"); }}><strong>{item.label}</strong><small>{resolved.filter((entry) => entry.definition.group === item.key).length} aktuelle Angaben</small></button>)}</nav>
      <label className="wk-expert-check"><input type="checkbox" checked={showForeign} onChange={(event) => setShowForeign(event.target.checked)} /> Definitionen anderer Kategorien zeigen</label>
      <div className="wk-expert-quality"><span>Technische Abdeckung</span><strong>{quality.completeness}%</strong><small>Nur Diagnosewert, kein Ranking-Signal.</small></div>
    </aside>
    <main className="wk-expert-main">
      <div className="wk-expert-tabs">{tabs.map(([key, label]) => <button type="button" key={key} data-active={view === key} onClick={() => setView(key)}>{label}</button>)}</div>
      {view === "EDIT" && <><div className="wk-expert-heading"><div><span className="wk-kicker">TECHNISCHE DEFINITIONEN</span><h1>{query ? `Suche: ${query}` : groups.find((item) => item.key === group)?.label}</h1><p>Hier können Quellen, Wissensstatus, Gültigkeit und Historie ausdrücklich bearbeitet werden.</p></div><span>{definitions.length} verfügbar</span></div>{group === "TEMPORAL_STATE" && !query && <TemporalEditor state={state} setState={setState} />}<div className="wk-definition-list">{definitions.slice(0, limit).map((definition) => { const item = resolvedMap.get(definition.id); return <button type="button" className="wk-definition" key={definition.id} onClick={() => setEditor(definition)}><span className={`wk-status-dot ${tone(item?.status ?? "UNFILLED")}`} /><div><div className="wk-definition-title"><strong>{definition.label}</strong>{definition.reviewState === "REVIEW_NEEDED" && <em>Prüfung nötig</em>}{!isUnlocked(definition, role) && <em className="locked">Nicht freigeschaltet</em>}</div><p>{definition.family} · {definition.semanticClass.replaceAll("_", " ")} · {definition.valueType}</p></div><div className="wk-definition-value"><span>{statusLabels[item?.status ?? "UNFILLED"]}</span><strong>{item ? displayValue(item.value) : "Offen"}</strong><small>{item ? `${item.confidence}% simulierte Verlässlichkeit` : "Keine Aussage"}</small></div><span className="wk-chevron">›</span></button>; })}</div>{definitions.length > limit && <button type="button" className="wk-load-more" onClick={() => setLimit((value) => value + 60)}>Weitere Definitionen anzeigen</button>}{group === "CAPABILITIES" && !query && <IntentCapabilityEditor state={state} setState={setState} />}</>}
      {view === "CLAIMS" && <ClaimsView state={state} onDefinition={setEditor} />}
      {view === "RESOLVED" && <ResolvedView resolved={resolved} derived={deriveFits(resolved)} onDefinition={setEditor} />}
      {view === "QUALITY" && <QualityView state={state} />}
      {view === "SNAPSHOT" && <SnapshotView snapshot={engineSnapshot(state)} />}
      {view === "ANALYSIS" && <AnalysisView analysis={analysisReport(state)} onRun={() => undefined} onExport={() => downloadJson(exportPackage(state))} />}
    </main>
    {editor && <ClaimEditor definition={editor} role={role} state={state} onClose={() => setEditor(null)} onChange={setState} />}
  </div>;
}
