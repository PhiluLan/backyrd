"use client";

import { useMemo, useRef, useState, type Dispatch, type SetStateAction } from "react";
import {
  analysisReport,
  catalog,
  deriveFits,
  engineSnapshot,
  resolveKnowledge,
  type CatalogDefinition,
  type Claim,
  type Evidence,
  type PrototypeState,
  type Role,
} from "@/lib/world-knowledge/model";
import { isUnlocked } from "./world-knowledge-prototype";

export const guidedSteps = [
  { id: "basics", label: "Grundinformationen", title: "Welchen Spot beschreibst du?", help: "Prüfe den Namen, den Ort und die Hauptkategorie. Diese Angaben reichen aus, um später weiterzumachen." },
  { id: "place-type", label: "Art des Ortes", title: "Was für ein Ort ist Philipps Casa?", help: "Wähle nur Begriffe, die den Ort wirklich beschreiben. Eine oder mehrere Antworten sind möglich." },
  { id: "food-offer", label: "Küche und Angebot", title: "Welche Küche und welches Angebot gibt es?", help: "Wähle passende Küchenrichtungen, Angebote und Stile. Nicht ausgewählte Möglichkeiten gelten nicht als fehlend." },
  { id: "intents", label: "Wofür eignet sich der Ort?", title: "Wofür würden Menschen Philipps Casa wählen?", help: "Beschreibe den Anlass aus Sicht der Gäste – zum Beispiel Frühstück, Date oder Freunde treffen." },
  { id: "capabilities", label: "Was kann man dort machen?", title: "Was ermöglicht Philipps Casa konkret?", help: "Wähle belegbare Möglichkeiten des Ortes. Ein Wunsch des Gastes und eine Fähigkeit des Ortes bleiben verschieden." },
  { id: "situation", label: "Atmosphäre und Situation", title: "In welchen Situationen passt Philipps Casa?", help: "Wähle nur Eindrücke, die du für den Spot direkt vertreten kannst. Zusätzliche Fits kann Backyrd später nachvollziehbar ableiten." },
  { id: "amenities", label: "Ausstattung und Einschränkungen", title: "Was sollten Gäste über Ausstattung und Grenzen wissen?", help: "Ergänze hilfreiche Ausstattung oder wichtige Einschränkungen. Dieser Bereich ist vollständig optional." },
  { id: "hours", label: "Öffnungszeiten und Zustand", title: "Wann ist Philipps Casa verfügbar?", help: "Pflege reguläre Zeiten und den aktuellen Zustand. Einzelne Ausnahmen können später ergänzt werden." },
  { id: "review", label: "Prüfen und analysieren", title: "Bereit für den Wissenscheck?", help: "Prüfe die ausgewählten Angaben, speichere den Stand und starte anschließend die Analyse." },
] as const;

export type GuidedStepId = (typeof guidedSteps)[number]["id"];

const priority: Record<string, string[]> = {
  "place-type": ["Restaurant", "Brasserie", "Bistro", "Café", "Cafe", "Casual Dining", "Fine Dining", "Breakfast Spot", "Brunch Spot", "Bar", "Bakery"],
  "food-offer": ["Swiss", "Italian", "French", "Mediterranean", "Asian", "Japanese", "Vegetarian Restaurant", "Vegan Restaurant", "Breakfast", "Brunch", "Lunch", "Dinner", "Coffee", "Wine"],
  intents: ["Frühstücken", "Brunchen", "Mittagessen", "Abendessen", "Date", "Freunde treffen", "Familienzeit", "Business", "Geburtstag / Celebration"],
  capabilities: ["Breakfast", "Brunch", "Lunch", "Dinner", "Coffee", "Tea", "Wine", "Full meal", "Quick meal", "Group gathering", "Work / study"],
  situation: ["Date", "Freunde", "Familie", "Alleine", "Kleine Gruppe", "Große Gruppe", "Ruhig", "Gemütlich", "Lebhaft", "Arbeiten"],
  amenities: ["WLAN", "Steckdosen", "Terrasse", "überdachte Außenplätze", "Rollstuhl-WC", "Kinderstühle", "Reservation", "Walk-in", "Sitzplatzkapazität", "Barrierefrei zugänglich"],
};

function evidenceFor(role: Role): Evidence {
  return {
    sourceType: role === "ADMIN" ? "ADMIN_OBSERVATION" : "OWNER_CLAIM",
    sourceName: role === "ADMIN" ? "Geführte Admin-Erfassung" : "Philipps Casa · verifizierter Owner",
    observedAt: new Date().toISOString().slice(0, 10),
    validFrom: new Date().toISOString().slice(0, 10),
    validUntil: "",
    verificationState: role === "ADMIN" ? "UNVERIFIED" : "PENDING",
    reference: "Automatisch aus der geführten Erfassung angelegt.",
    stance: "SUPPORTS",
    privateReference: false,
  };
}

function definitionsFor(step: GuidedStepId, state: PrototypeState) {
  const categories = new Set([state.spot.primaryCategory, ...state.spot.secondaryCategories]);
  return catalog.definitions.filter((item) => {
    if (!item.applicableCategories.some((key) => categories.has(key))) return false;
    if (step === "place-type") return item.semanticClass === "SUBCATEGORY";
    if (step === "food-offer") return item.semanticClass === "CUISINE" || item.semanticClass === "OFFERING";
    if (step === "intents") return item.semanticClass === "DECISION_INTENT";
    if (step === "capabilities") return item.semanticClass === "CAPABILITY";
    if (step === "situation") return item.semanticClass === "DIRECT_FIT";
    if (step === "amenities") return item.group === "AMENITIES_CONSTRAINTS" || item.group === "CHARACTERISTICS";
    return false;
  });
}

function selectedIds(state: PrototypeState) {
  return new Set(resolveKnowledge(state).filter((item) => item.status === "KNOWN_TRUE" || item.status === "KNOWN_VALUE").map((item) => item.definition.id));
}

export function GuidedWorkflow({ state, setState, role, onSave, onAnalyze, onOpenExpert }: {
  state: PrototypeState;
  setState: Dispatch<SetStateAction<PrototypeState>>;
  role: Role;
  onSave(): void;
  onAnalyze(): void;
  onOpenExpert(): void;
}) {
  const [step, setStep] = useState<GuidedStepId>("basics");
  const headingRef = useRef<HTMLHeadingElement>(null);
  const currentIndex = guidedSteps.findIndex((item) => item.id === step);
  const current = guidedSteps[currentIndex];
  const selected = useMemo(() => selectedIds(state), [state]);

  const navigate = (next: GuidedStepId) => {
    setState((value) => ({ ...value, guidedProgress: { ...value.guidedProgress, visitedSteps: [...new Set([...value.guidedProgress.visitedSteps, next])] } }));
    setStep(next);
    requestAnimationFrame(() => headingRef.current?.focus());
  };
  const skip = () => {
    setState((value) => ({ ...value, guidedProgress: { ...value.guidedProgress, skippedSteps: [...new Set([...value.guidedProgress.skippedSteps, step])] } }));
    if (currentIndex < guidedSteps.length - 1) navigate(guidedSteps[currentIndex + 1].id);
  };
  const next = () => currentIndex < guidedSteps.length - 1 ? navigate(guidedSteps[currentIndex + 1].id) : onAnalyze();

  return <div className="wk-guide-layout">
    <aside className="wk-guide-steps" aria-label="Schritte der Spot-Erfassung">
      <div className="wk-guide-progress"><span>Spot-Erfassung</span><strong>Schritt {currentIndex + 1} von {guidedSteps.length}</strong><i><b style={{ width: `${((currentIndex + 1) / guidedSteps.length) * 100}%` }} /></i></div>
      <nav>{guidedSteps.map((item, index) => {
        const count = item.id === "basics" ? 0 : definitionsFor(item.id, state).filter((definition) => selected.has(definition.id)).length;
        const skipped = state.guidedProgress.skippedSteps.includes(item.id);
        const visited = state.guidedProgress.visitedSteps.includes(item.id);
        const summary = item.id === "basics" ? (state.spot.name && state.spot.city && state.spot.primaryCategory ? "Grundinformationen vollständig" : "Angaben prüfen") : count ? `${count} ${count === 1 ? "Angabe" : "Angaben"} ausgewählt` : skipped ? "Später ausfüllen" : visited ? "Noch nichts ausgewählt" : "Noch nicht bearbeitet";
        return <button type="button" key={item.id} data-active={step === item.id} onClick={() => navigate(item.id)}><span>{index + 1}</span><div><strong>{item.label}</strong><small>{summary}</small></div></button>;
      })}</nav>
      <button className="wk-open-expert" type="button" onClick={onOpenExpert}>Erweiterte Angaben und Quellen <span>→</span></button>
    </aside>

    <main className="wk-guide-main">
      <div className="wk-guide-intro"><div><span className="wk-kicker">PHILIPPS CASA BESCHREIBEN</span><h1 ref={headingRef} tabIndex={-1}>{current.title}</h1><p>{current.help}</p></div><div className="wk-guide-reminder"><strong>Du musst nicht alles ausfüllen.</strong><span>Wähle nur aus, was wirklich auf den Spot zutrifft. Alles andere kann offenbleiben.</span></div></div>
      {step === "basics" && <Basics state={state} setState={setState} />}
      {(["place-type", "food-offer", "intents", "capabilities", "situation", "amenities"] as GuidedStepId[]).includes(step) && <SelectionStep step={step} state={state} setState={setState} role={role} selected={selected} />}
      {step === "hours" && <FriendlyHours state={state} setState={setState} />}
      {step === "review" && <Review state={state} onSave={onSave} onAnalyze={onAnalyze} onOpenExpert={onOpenExpert} />}
      <footer className="wk-guide-actions"><button type="button" className="wk-guide-secondary" onClick={skip} disabled={step === "review"}>Später ausfüllen</button><span>Deine bisherigen Angaben bleiben erhalten.</span><button type="button" className="wk-guide-next" onClick={next}>{step === "review" ? "Analyse starten" : "Weiter"} <span>→</span></button></footer>
    </main>
  </div>;
}

function Basics({ state, setState }: { state: PrototypeState; setState: Dispatch<SetStateAction<PrototypeState>> }) {
  const patchSpot = (patch: Partial<PrototypeState["spot"]>) => setState((current) => ({ ...current, spot: { ...current.spot, ...patch } }));
  return <section className="wk-guide-card"><div className="wk-friendly-fields"><label><span>Name des Spots <em>notwendig</em></span><input value={state.spot.name} onChange={(event) => patchSpot({ name: event.target.value })} /></label><label><span>Ort <em>notwendig</em></span><input value={state.spot.city} onChange={(event) => patchSpot({ city: event.target.value })} /></label><label className="wide"><span>Adresse</span><input value={state.spot.address} onChange={(event) => patchSpot({ address: event.target.value })} /></label><label><span>Hauptkategorie <em>notwendig</em></span><select value={state.spot.primaryCategory} onChange={(event) => patchSpot({ primaryCategory: event.target.value, secondaryCategories: state.spot.secondaryCategories.filter((key) => key !== event.target.value) })}>{catalog.categories.map((item) => <option value={item.key} key={item.key}>{item.label}</option>)}</select></label><label><span>Zeitzone</span><input value={state.spot.timezone} onChange={(event) => patchSpot({ timezone: event.target.value })} /></label></div><div className="wk-secondary-categories"><div><strong>Weitere passende Kategorien</strong><span>Optional · Mehrfachauswahl möglich</span></div><div>{catalog.categories.filter((item) => item.key !== state.spot.primaryCategory).map((item) => <label key={item.key} data-selected={state.spot.secondaryCategories.includes(item.key)}><input type="checkbox" checked={state.spot.secondaryCategories.includes(item.key)} onChange={(event) => patchSpot({ secondaryCategories: event.target.checked ? [...state.spot.secondaryCategories, item.key] : state.spot.secondaryCategories.filter((key) => key !== item.key) })} />{item.label}</label>)}</div></div>{state.spot.primaryCategory === "TEMPORARY_PLACES" && <div className="wk-friendly-note"><strong>Temporärer Ort, kein Event</strong><span>Events bleiben eigene Einträge und können später mit diesem Spot verbunden werden.</span></div>}</section>;
}

function SelectionStep({ step, state, setState, role, selected }: { step: GuidedStepId; state: PrototypeState; setState: Dispatch<SetStateAction<PrototypeState>>; role: Role; selected: Set<string> }) {
  const [search, setSearch] = useState("");
  const [expanded, setExpanded] = useState(false);
  const all = useMemo(() => definitionsFor(step, state), [step, state]);
  const ordered = useMemo(() => [...all].sort((a, b) => {
    const labels = priority[step] ?? []; const ai = labels.indexOf(a.label); const bi = labels.indexOf(b.label);
    return (ai < 0 ? 999 : ai) - (bi < 0 ? 999 : bi) || a.label.localeCompare(b.label, "de");
  }), [all, step]);
  const shown = ordered.filter((item) => !search || `${item.label} ${item.family}`.toLocaleLowerCase("de").includes(search.toLocaleLowerCase("de"))).slice(0, expanded || search ? 250 : 14);
  const toggle = (definition: CatalogDefinition) => {
    if (!isUnlocked(definition, role)) return;
    if (selected.has(definition.id)) {
      const alreadyRetracted = new Set(state.claims.filter((claim) => claim.operation === "RETRACT").map((claim) => claim.supersedesClaimId));
      const target = [...state.claims].reverse().find((claim) => claim.definitionId === definition.id && claim.operation !== "RETRACT" && !alreadyRetracted.has(claim.id));
      if (!target) return;
      const retraction: Claim = { id: crypto.randomUUID(), definitionId: definition.id, status: "UNKNOWN", value: null, actor: role, createdAt: new Date().toISOString(), evidence: evidenceFor(role), operation: "RETRACT", supersedesClaimId: target.id };
      setState((current) => ({ ...current, claims: [...current.claims, retraction] }));
    } else {
      const claim: Claim = { id: crypto.randomUUID(), definitionId: definition.id, status: "KNOWN_TRUE", value: true, actor: role, createdAt: new Date().toISOString(), evidence: evidenceFor(role), operation: "ASSERT" };
      setState((current) => ({ ...current, claims: [...current.claims, claim] }));
    }
  };
  const selectedDefinitions = all.filter((item) => selected.has(item.id));
  const cuisine = step === "food-offer" ? shown.filter((item) => item.semanticClass === "CUISINE") : [];
  const offerings = step === "food-offer" ? shown.filter((item) => item.semanticClass !== "CUISINE") : shown;
  return <section className="wk-guide-card"><div className="wk-picker-toolbar"><label><span>In diesem Bereich suchen</span><input type="search" value={search} onChange={(event) => setSearch(event.target.value)} placeholder="Begriff eingeben …" /></label>{selectedDefinitions.length > 0 && <div className="wk-selected-summary"><span>Ausgewählt</span><strong>{selectedDefinitions.length}</strong></div>}</div>{selectedDefinitions.length > 0 && <div className="wk-selected-chips">{selectedDefinitions.map((item) => <button type="button" key={item.id} onClick={() => toggle(item)}>{item.label}<span aria-hidden="true">×</span><span className="sr-only"> entfernen</span></button>)}</div>}{step === "food-offer" && cuisine.length > 0 && <OptionGroup title="Küche" definitions={cuisine} selected={selected} role={role} onToggle={toggle} />}{offerings.length > 0 && <OptionGroup title={step === "food-offer" ? "Angebot und Stil" : undefined} definitions={offerings} selected={selected} role={role} onToggle={toggle} />}{!shown.length && <div className="wk-guide-empty">Keine passende Option gefunden. Im erweiterten Bereich bleibt der vollständige Katalog verfügbar.</div>}{!expanded && !search && ordered.length > 14 && <button type="button" className="wk-show-more" onClick={() => setExpanded(true)}>Alle {ordered.length} Möglichkeiten anzeigen</button>}{expanded && !search && ordered.length > 14 && <button type="button" className="wk-show-more" onClick={() => setExpanded(false)}>Auf häufige Möglichkeiten reduzieren</button>}<p className="wk-picker-footnote">Nicht ausgewählt bedeutet hier nur: keine Aussage gemacht. Es bedeutet nicht „trifft nicht zu“.</p></section>;
}

function OptionGroup({ title, definitions, selected, role, onToggle }: { title?: string; definitions: CatalogDefinition[]; selected: Set<string>; role: Role; onToggle(item: CatalogDefinition): void }) {
  return <div className="wk-option-group">{title && <h2>{title}</h2>}<div className="wk-option-grid">{definitions.map((item) => { const active = selected.has(item.id); const unlocked = isUnlocked(item, role); return <button type="button" aria-pressed={active} disabled={!unlocked} data-selected={active} key={item.id} onClick={() => onToggle(item)}><span className="wk-checkmark" aria-hidden="true">{active ? "✓" : ""}</span><strong>{item.label}</strong>{!unlocked && <small>{item.ownerAccess === "PRO" ? "Zusätzlicher Owner-Bereich (Entwurf)" : "Nur im Admin-Bereich bearbeitbar"}</small>}</button>; })}</div></div>;
}

function FriendlyHours({ state, setState }: { state: PrototypeState; setState: Dispatch<SetStateAction<PrototypeState>> }) {
  const updateDay = (index: number, patch: Partial<PrototypeState["schedule"][number]>) => setState((current) => ({ ...current, schedule: current.schedule.map((day, i) => i === index ? { ...day, ...patch } : day) }));
  return <section className="wk-guide-card"><div className="wk-friendly-hours"><div className="wk-hours-heading"><strong>Reguläre Öffnungszeiten</strong><span>{state.spot.timezone}</span></div>{state.schedule.map((item, index) => <div className="wk-hours-row" key={item.day}><label><input type="checkbox" checked={item.enabled} onChange={(event) => updateDay(index, { enabled: event.target.checked })} />{item.day}</label>{item.enabled ? <><input aria-label={`${item.day} öffnet`} type="time" value={item.open} onChange={(event) => updateDay(index, { open: event.target.value })} /><span>bis</span><input aria-label={`${item.day} schließt`} type="time" value={item.close} onChange={(event) => updateDay(index, { close: event.target.value })} /></> : <span className="wk-closed">Geschlossen</span>}</div>)}</div><div className="wk-friendly-state"><label><span>Aktueller Service</span><select value={state.currentState.service} onChange={(event) => setState((current) => ({ ...current, currentState: { ...current.currentState, service: event.target.value } }))}><option value="NORMAL">Normal geöffnet</option><option value="LIMITED">Eingeschränkter Service</option><option value="PAUSED">Service pausiert</option><option value="CLOSED">Aktuell geschlossen</option></select></label><label><span>Aktuelle Verfügbarkeit</span><select value={state.currentState.availability} onChange={(event) => setState((current) => ({ ...current, currentState: { ...current.currentState, availability: event.target.value } }))}><option value="UNKNOWN">Noch unbekannt</option><option value="AVAILABLE">Verfügbar</option><option value="LIMITED">Begrenzt verfügbar</option><option value="SOLD_OUT">Derzeit ausgebucht</option></select></label><label><span>Geöffnete Bereiche</span><select value={state.currentState.area} onChange={(event) => setState((current) => ({ ...current, currentState: { ...current.currentState, area: event.target.value } }))}><option value="ALL_OPEN">Alle Bereiche geöffnet</option><option value="PARTIAL">Teilweise geöffnet</option><option value="INDOOR_ONLY">Nur Innenbereich</option><option value="OUTDOOR_ONLY">Nur Außenbereich</option></select></label></div></section>;
}

function Review({ state, onSave, onAnalyze, onOpenExpert }: { state: PrototypeState; onSave(): void; onAnalyze(): void; onOpenExpert(): void }) {
  const resolved = resolveKnowledge(state); const derived = deriveFits(resolved);
  const grouped = [
    ["Art des Ortes", resolved.filter((item) => item.definition.semanticClass === "SUBCATEGORY")],
    ["Küche und Angebot", resolved.filter((item) => ["CUISINE", "OFFERING"].includes(item.definition.semanticClass))],
    ["Wofür geeignet", resolved.filter((item) => item.definition.semanticClass === "DECISION_INTENT")],
    ["Möglichkeiten", resolved.filter((item) => item.definition.semanticClass === "CAPABILITY")],
    ["Atmosphäre und Situation", resolved.filter((item) => item.definition.semanticClass === "DIRECT_FIT")],
    ["Ausstattung und Einschränkungen", resolved.filter((item) => item.definition.group === "AMENITIES_CONSTRAINTS" || item.definition.group === "CHARACTERISTICS")],
  ] as const;
  return <section className="wk-review"><div className="wk-review-spot"><div><span>Du beschreibst</span><h2>{state.spot.name}</h2><p>{state.spot.address}, {state.spot.city} · {catalog.categories.find((item) => item.key === state.spot.primaryCategory)?.label}</p></div><div><strong>{resolved.length}</strong><span>ausdrückliche Angaben</span></div></div><div className="wk-review-grid">{grouped.map(([label, items]) => <div key={label}><span>{label}</span>{items.length ? <p>{items.map((item) => item.definition.label).join(" · ")}</p> : <p className="empty">Offengelassen – das ist in Ordnung.</p>}</div>)}</div>{derived.length > 0 && <div className="wk-review-derived"><strong>Von Backyrd nachvollziehbar abgeleitet</strong>{derived.map((item) => <span key={item.id}>{item.label} · aus {item.inputs.join(" und ")}</span>)}</div>}<div className="wk-review-actions"><button type="button" onClick={onSave}>Zwischenstand speichern</button><button type="button" onClick={onAnalyze}>Analyse starten →</button></div><button type="button" className="wk-review-expert" onClick={onOpenExpert}>Quellen, Widersprüche und technische Vorschau öffnen</button></section>;
}

export function FriendlyAnalysis({ state, onOpenExpert }: { state: PrototypeState; onOpenExpert(): void }) {
  const report = analysisReport(state); const resolved = resolveKnowledge(state); const snapshot = engineSnapshot(state); const useful = resolved.filter((item) => item.status === "KNOWN_TRUE" || item.status === "KNOWN_VALUE").slice(0, 12); const conflicts = resolved.filter((item) => item.status === "DISPUTED"); const expired = resolved.filter((item) => item.status === "EXPIRED");
  const suggestions = [
    resolved.some((item) => item.definition.semanticClass === "SUBCATEGORY") ? null : "Art des Ortes ergänzen",
    resolved.some((item) => item.definition.semanticClass === "CAPABILITY") ? null : "Mindestens eine konkrete Möglichkeit ergänzen",
    resolved.some((item) => item.definition.group === "AMENITIES_CONSTRAINTS") ? null : "Hilfreiche Ausstattung ergänzen",
  ].filter(Boolean) as string[];
  return <main className="wk-friendly-analysis"><div className="wk-analysis-hero"><span>ANALYSE ABGESCHLOSSEN</span><h1>Das weiß Backyrd über {state.spot.name}.</h1><p>Optionale Angaben bleiben optional. Die Hinweise zeigen nur, welche Ergänzungen spätere Empfehlungen noch genauer machen könnten.</p></div><div className="wk-analysis-summary"><div><span>Hauptkategorie</span><strong>{catalog.categories.find((item) => item.key === state.spot.primaryCategory)?.label}</strong></div><div><span>Ausdrückliche Angaben</span><strong>{resolved.length}</strong></div><div><span>Nachvollziehbare Ableitungen</span><strong>{deriveFits(resolved).length}</strong></div></div><section><h2>Das ist bereits besonders nützlich</h2>{useful.length ? <div className="wk-friendly-tags">{useful.map((item) => <span key={item.definition.id}>{item.definition.label}</span>)}</div> : <p>Noch keine inhaltlichen Angaben ausgewählt. Der Spot bleibt trotzdem gültig gespeichert.</p>}</section><section><h2>Hilfreiche Ergänzungen</h2>{suggestions.length ? <ul>{suggestions.map((item) => <li key={item}>{item}</li>)}</ul> : <p>Für den ersten Teststand sind die wichtigsten Bereiche abgedeckt.</p>}</section><div className="wk-analysis-alerts"><section><h2>Widersprüche</h2><p>{conflicts.length ? conflicts.map((item) => item.definition.label).join(" · ") : "Keine Widersprüche erkannt."}</p></section><section><h2>Möglicherweise veraltet</h2><p>{expired.length ? expired.map((item) => item.definition.label).join(" · ") : "Keine abgelaufenen Angaben erkannt."}</p></section></div><section className="wk-engine-readable"><div><h2>So wird der Spot aktuell übergeben</h2><p>{snapshot.facts.length} aufgelöste Fakten, {snapshot.directFits.length} direkt angegebene Fits und {snapshot.derivedFits.length} abgeleitete Fits. Keine Abo-, Payment- oder privaten Quelldaten.</p></div><button type="button" onClick={onOpenExpert}>Technische Vorschau öffnen →</button></section><details><summary>Vollständige menschliche Analyse anzeigen</summary><pre>{JSON.stringify(report, null, 2)}</pre></details></main>;
}
