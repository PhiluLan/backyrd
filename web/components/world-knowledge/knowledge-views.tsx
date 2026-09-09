"use client";

import { analysisReport, catalog, engineSnapshot, qualityFor, trustStateFor, type CatalogDefinition, type PrototypeState, type resolveKnowledge, type deriveFits } from "@/lib/world-knowledge/model";
import { displayValue, roleLabels, tone } from "./world-knowledge-prototype";

type Resolved = ReturnType<typeof resolveKnowledge>;
type Derived = ReturnType<typeof deriveFits>;
type Analysis = ReturnType<typeof analysisReport>;
type Snapshot = ReturnType<typeof engineSnapshot>;
const trustLabels = { UNBACKED: "Ohne belastbare Quelle", SOURCED: "Mit Quelle", CONFIRMED: "Geprüft", CONFLICTING: "Widersprüchlich", STALE: "Veraltet" } as const;

export function ClaimsView({ state, onDefinition }: { state: PrototypeState; onDefinition(definition: CatalogDefinition): void }) {
  return <Frame kicker="ROHE EINGABEN" title={`Angaben und Quellen · ${state.claims.length}`} help="Append-only Prototype-Historie. Owner-Angaben überschreiben keine kanonische Wahrheit.">{state.claims.length === 0 ? <Empty text="Noch keine Angaben" help="Öffne eine Definition und erfasse eine Aussage." /> : <div className="wk-table-list">{[...state.claims].reverse().map((claim) => { const definition = catalog.definitions.find((item) => item.id === claim.definitionId); if (!definition) return null; return <button key={claim.id} onClick={() => onDefinition(definition)}><span className={`wk-status-pill ${tone(claim.status)}`}>{claim.operation === "RETRACT" ? "ZURÜCKGEZOGEN" : claim.status}</span><div><strong>{definition.label}</strong><small>{roleLabels[claim.actor]} · {claim.evidence.sourceType} · {claim.evidence.verificationState}</small></div><em>{displayValue(claim.value)}</em></button>; })}</div>}</Frame>;
}

export function ResolvedView({ resolved, derived, onDefinition }: { resolved: Resolved; derived: Derived; onDefinition(definition: CatalogDefinition): void }) {
  return <Frame kicker="AUFLÖSUNGSVORSCHAU" title="Aktueller Wissensstand" help="Deterministische Konflikt-, Ablauf- und Quellenauflösung.">{resolved.length === 0 ? <Empty text="Noch kein Wissen auflösbar" help="Nicht ausgefüllt bedeutet nicht false." /> : <div className="wk-table-list">{resolved.map((item) => <button key={item.definition.id} onClick={() => onDefinition(item.definition)}><span className={`wk-status-pill ${tone(item.status)}`}>{item.status}</span><div><strong>{item.definition.label}</strong><small>{item.reason} · {trustLabels[trustStateFor(item)]}</small></div><em>{displayValue(item.value)}</em></button>)}</div>}<div className="wk-derived-block"><div className="wk-section-head"><div><span className="wk-kicker">ABGELEITET · NICHT ROH</span><h3>Vorsichtige Ableitungen</h3></div><span>{derived.length}</span></div>{derived.length === 0 ? <p>Keine Ableitung aktiv.</p> : derived.map((fit) => <div className="wk-derived" key={fit.ruleId}><strong>{fit.label}</strong><p>{fit.explanation}</p><span>Quellen: {fit.sourceFacts.join(" + ")} · Trust: {trustLabels[fit.trust]}</span></div>)}</div></Frame>;
}

export function QualityView({ state }: { state: PrototypeState }) {
  const q = qualityFor(state);
  const cards: Array<[string, unknown[]]> = [["Wichtige Ergänzungen", q.importantMissing], ["Semantische Prüfhinweise", q.semanticIssues], ["Konflikte", q.conflicts], ["Abgelaufen", q.expired], ["Ohne Quelle", q.withoutSource], ["Kategorie-fremd", q.foreign]];
  return <Frame kicker="DATENCHECK" title="Pflegezustand, nicht Ranking" help="Abdeckung, Quellenlage und Frische sind getrennte Dimensionen."><div className="wk-quality-grid"><Metric label="Grundprofil" value={`${q.profile.completed}/${q.profile.total}`} help="Name, Adresse, Ort und Hauptkategorie." /><Metric label="Bearbeitete Fragen" value={String(q.answeredQuestions)} help="Nur ausdrücklich beantwortete Fragen." /><Metric label="Verwendbare Fakten" value={String(q.knownFacts)} help="Unvollständige Pseudo-Fakten zählen nicht." /><Metric label="Technische Katalogabdeckung" value={`${q.technicalCatalogCoverage}%`} help={`${q.filledCount} von ${q.relevantCount} technisch relevanten Definitionen; kein Qualitätsurteil.`} />{cards.map(([label, items]) => <div className="wk-quality-card" key={label}><span>{label}</span><strong>{items.length}</strong><p>{(items as Array<{ label?: string; title?: string; definition?: { label: string } }>).slice(0, 5).map((item) => item.label ?? item.title ?? item.definition?.label).filter(Boolean).join(" · ") || "Keine"}</p></div>)}</div></Frame>;
}

export function SnapshotView({ snapshot }: { snapshot: Snapshot }) {
  const structured = snapshot.cuisine.length + snapshot.offering.length + snapshot.capabilities.length + snapshot.operationalModel.facts.length + snapshot.amenities.length + snapshot.hardConstraints.length + snapshot.accessibility.length;
  return <Frame kicker="WORLDKNOWLEDGEPORT VORSCHAU" title="Vorschau für die Decision Engine" help="Nur normalisiertes Wissen über den Spot – keine Recommendation oder situative Eligibility."><div className="wk-human-snapshot"><div><span>Primary</span><strong>{snapshot.classification.primaryCategoryKey}</strong></div><div><span>Strukturierte Einträge</span><strong>{structured}</strong></div><div><span>Subjektive Angaben</span><strong>{snapshot.directSubjectiveClaims.length}</strong></div><div><span>Ableitungen</span><strong>{snapshot.derivedKnowledge.length}</strong></div></div><pre className="wk-json">{JSON.stringify(snapshot, null, 2)}</pre></Frame>;
}

export function AnalysisView({ analysis, onRun, onExport }: { analysis: Analysis | null; onRun(): unknown; onExport(): void }) {
  if (!analysis) return <Frame kicker="DETERMINISTISCHE ANALYSE" title="Analyse noch nicht gestartet" help="Klassifiziert Fakten, Ableitungen, Einschränkungen und Engine-Grenze."><div className="wk-analysis-empty"><button onClick={onRun}>Analyse starten →</button></div></Frame>;
  const cards = [
    ["Kategorien", `${analysis.categories.primary} · ${analysis.categories.secondary.join(", ") || "keine Zusatzkategorie"}`],
    ["Spot-Intents bewusst ausgeschlossen", analysis.legacySpotIntentsExcluded.join(" · ") || "Keine Altwerte"],
    ["Capabilities", analysis.evidencedCapabilities.join(" · ") || "Keine belegt"],
    ["Known false", analysis.knownFalse.join(" · ") || "Keine"],
    ["Unknown", analysis.unknown.join(" · ") || "Keine"],
    ["Not applicable", analysis.notApplicable.join(" · ") || "Keine"],
    ["Disputed", analysis.disputed.join(" · ") || "Keine"],
    ["Expired", analysis.expired.join(" · ") || "Keine"],
    ["Direkte subjektive Angaben", analysis.directFits.join(" · ") || "Keine"],
    ["Hard-Constraint-Kandidaten", analysis.hardConstraintCandidates.join(" · ") || "Keine"],
    ["Engine ausgeschlossen", analysis.excludedFromEngine.join(" · ")],
    ["Semantische Prüfhinweise", analysis.semanticIssues.map((item) => item.title).join(" · ") || "Keine"],
  ];
  return <Frame kicker="ANALYSEBERICHT" title="Philipps Casa · technische Vorprüfung" help={`Deterministisch erzeugt für ${analysis.generatedAt.slice(0, 10)}.`}><div className="wk-analysis-toolbar"><button onClick={onRun}>Neu analysieren</button><button onClick={onExport}>Analysepaket exportieren</button></div><div className="wk-analysis-grid">{cards.map(([label, value]) => <div key={label}><span>{label}</span><p>{value}</p></div>)}</div><div className="wk-derived-block"><span className="wk-kicker">ABGELEITETES WISSEN</span>{analysis.derivedFits.length ? analysis.derivedFits.map((fit) => <div className="wk-derived" key={fit.ruleId}><strong>{fit.label}</strong><p>{fit.explanation}</p><span>{fit.sourceFacts.join(" + ")}</span></div>) : <p>Keine Ableitungen.</p>}</div><pre className="wk-json">{JSON.stringify(analysis.engineSnapshot, null, 2)}</pre></Frame>;
}

function Frame({ kicker, title, help, children }: { kicker: string; title: string; help: string; children: React.ReactNode }) { return <section className="wk-view-frame"><div className="wk-section-head"><div><span className="wk-kicker">{kicker}</span><h2>{title}</h2><p>{help}</p></div><span className="wk-draft">SIMULATION</span></div>{children}</section>; }
function Empty({ text, help }: { text: string; help: string }) { return <div className="wk-empty"><strong>{text}</strong><span>{help}</span></div>; }
function Metric({ label, value, help }: { label: string; value: string; help: string }) { return <div className="wk-quality-card wk-gauge"><span>{label}</span><strong>{value}</strong><p>{help}</p></div>; }
