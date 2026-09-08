"use client";

import type { AuthoringQuestion } from "@/lib/humanSpotV2";
import { normalizeOfferingHierarchy, normalizeRestaurantSocialUrl, offeringHierarchyConflicts, relevantOptions } from "@/lib/humanSpotV2";

type Props = {
  question: AuthoringQuestion;
  value: unknown;
  archetypes: string[];
  changed: boolean;
  provenance?: string;
  onChange: (value: unknown) => void;
};

function asRecord(value: unknown): Record<string, unknown> {
  return value && typeof value === "object" && !Array.isArray(value) ? value as Record<string, unknown> : {};
}

export function HumanSpotQuestion({ question, value, archetypes, changed, provenance, onChange }: Props) {
  const options = relevantOptions(question, archetypes);
  const selected = Array.isArray(value) ? value : [];
  const objectValue = asRecord(value);
  const supervision = objectValue.adult_supervision_required === true ? "YES" : objectValue.adult_supervision_required === false ? "NO" : "UNKNOWN";
  const mappedValues = new Set(options.map((option) => JSON.stringify(option.value)));
  const legacyValues = selected.filter((item) => !mappedValues.has(JSON.stringify(item)));
  const offeringConflicts = question.control_type === "AVAILABILITY_MAP" ? offeringHierarchyConflicts(value) : [];
  const offeringLabels = new Map(options.map((option) => [String(option.value), option.label]));
  const specialHours = Array.isArray(objectValue.overrides) ? objectValue.overrides.filter((item): item is Record<string, unknown> => Boolean(item) && typeof item === "object" && !Array.isArray(item)) : [];

  return <article className={`hsi-question${changed ? " is-dirty" : ""}`} id={`hsi-${question.question_id}`}>
    <header>
      <div><h4>{question.label_de}</h4>{question.help_de && <p>{question.help_de}</p>}</div>
      <span className="hsi-question-state">{changed ? "Geändert" : provenance ? "Bestätigt" : "Noch offen"}</span>
    </header>

    {question.control_type === "SINGLE_CHOICE" && <div className="hsi-segmented" role="radiogroup" aria-label={question.label_de}>
      {options.map((option) => <button type="button" role="radio" aria-checked={value === option.value} className={value === option.value ? "selected" : ""} key={option.id} onClick={() => onChange(option.value)}>{option.label}</button>)}
    </div>}

    {question.control_type === "MULTI_CHOICE" && <div className="hsi-chip-grid" aria-label={question.label_de}>
      {options.map((option) => { const active = selected.includes(option.value); return <button type="button" aria-pressed={active} className={active ? "selected" : ""} key={option.id} onClick={() => {
        if (option.value === "UNKNOWN") return onChange(active ? [] : ["UNKNOWN"]);
        const withoutUnknown = selected.filter((item) => item !== "UNKNOWN");
        onChange(active ? withoutUnknown.filter((item) => item !== option.value) : [...withoutUnknown, option.value]);
      }}>{option.label}{option.scopeGuard && <small>Gültigkeit prüfen</small>}</button>; })}
    </div>}
    {question.control_type === "MULTI_CHOICE" && legacyValues.length > 0 && <p className="hsi-legacy-value">Vorhandene ältere Angabe – bitte prüfen: {legacyValues.map(String).join(", ")}. Sie bleibt beim Speichern erhalten.</p>}

    {question.control_type === "TRI_STATE_MAP" && <div className="hsi-tristate-list">
      {options.map((option) => <div key={option.id}><span>{option.label}</span><div role="radiogroup" aria-label={`${question.label_de}: ${option.label}`}>
        {[{ label: "Gut geeignet", value: "SUITABLE" }, { label: "Eher nicht", value: "NOT_SUITABLE" }, { label: "Unbekannt", value: "UNKNOWN" }].map((state) => <button type="button" role="radio" aria-checked={objectValue[String(option.value)] === state.value} className={objectValue[String(option.value)] === state.value ? "selected" : ""} key={state.value} onClick={() => onChange({ ...objectValue, [String(option.value)]: state.value })}>{state.label}</button>)}
      </div></div>)}
    </div>}

    {question.control_type === "AVAILABILITY_MAP" && <div className="hsi-tristate-list">
      {options.map((option) => <div key={option.id}><span>{option.label}</span><div role="radiogroup" aria-label={`${question.label_de}: ${option.label}`}>
        {[{ label: "Verfügbar", value: "AVAILABLE" }, { label: "Nicht verfügbar", value: "NOT_AVAILABLE" }, { label: "Unbekannt", value: "UNKNOWN" }].map((state) => <button type="button" role="radio" aria-checked={objectValue[String(option.value)] === state.value} className={objectValue[String(option.value)] === state.value ? "selected" : ""} key={state.value} onClick={() => onChange({ ...objectValue, [String(option.value)]: state.value })}>{state.label}</button>)}
      </div></div>)}
    </div>}
    {question.control_type === "AVAILABILITY_MAP" && offeringConflicts.length > 0 && <div className="hsi-hierarchy-warning" role="alert">
      <strong>Diese Angaben widersprechen sich noch.</strong>
      {offeringConflicts.map((conflict) => <p key={conflict.parent}><b>{offeringLabels.get(conflict.parent) ?? conflict.parent}</b> kann nicht „Nicht verfügbar“ sein, solange {conflict.children.map((child) => offeringLabels.get(child) ?? child).join(", ")} als verfügbar bestätigt ist.</p>)}
      <button type="button" onClick={() => onChange(normalizeOfferingHierarchy(value))}>Aus Detailangaben korrekt ableiten</button>
    </div>}

    {question.control_type === "PURPOSE_MAP" && <div className="hsi-tristate-list">
      {options.map((option) => <div key={option.id}><span>{option.label}</span><div role="radiogroup" aria-label={`${question.label_de}: ${option.label}`}>
        {[{ label: "Typischer Grund", value: "SUITABLE" }, { label: "Eher nicht", value: "NOT_SUITABLE" }, { label: "Unbekannt", value: "UNKNOWN" }].map((state) => <button type="button" role="radio" aria-checked={objectValue[String(option.value)] === state.value} className={objectValue[String(option.value)] === state.value ? "selected" : ""} key={state.value} onClick={() => onChange({ ...objectValue, [String(option.value)]: state.value })}>{state.label}</button>)}
      </div></div>)}
    </div>}

    {question.control_type === "ACCESSIBILITY_MAP" && <div className="hsi-tristate-list compact">
      {options.map((option) => <div key={option.id}><span>{option.label}</span><div role="radiogroup" aria-label={`${question.label_de}: ${option.label}`}>
        {[{ label: "Bestätigt", value: "SUITABLE" }, { label: "Nicht vorhanden", value: "NOT_SUITABLE" }, { label: "Unbekannt", value: "UNKNOWN" }].map((state) => <button type="button" role="radio" aria-checked={objectValue[String(option.value)] === state.value} className={objectValue[String(option.value)] === state.value ? "selected" : ""} key={state.value} onClick={() => onChange({ ...objectValue, [String(option.value)]: state.value })}>{state.label}</button>)}
      </div></div>)}
    </div>}

    {question.control_type === "DURATION_RANGE" && <div className="hsi-chip-grid duration">
      {options.map((option) => { const active = JSON.stringify(value) === JSON.stringify(option.value); return <button type="button" aria-pressed={active} className={active ? "selected" : ""} key={option.id} onClick={() => onChange(option.value)}>{option.label}</button>; })}
    </div>}

    {question.control_type === "AGE_RANGE" && <div className="hsi-age-grid">
      <label><span>Ab ungefähr</span><input type="number" min="0" max="120" inputMode="numeric" value={String(objectValue.min_age ?? "")} onChange={(event) => onChange({ ...objectValue, min_age: event.target.value === "" ? null : Number(event.target.value) })} /><small>Jahren</small></label>
      <label><span>Bis ungefähr</span><input type="number" min="0" max="120" inputMode="numeric" value={String(objectValue.max_age ?? "")} onChange={(event) => onChange({ ...objectValue, max_age: event.target.value === "" ? null : Number(event.target.value) })} /><small>leer = offen</small></label>
      <label><span>Begleitung nötig?</span><select value={supervision} onChange={(event) => onChange({ ...objectValue, adult_supervision_required: event.target.value === "YES" ? true : event.target.value === "NO" ? false : "UNKNOWN" })}><option value="UNKNOWN">Unbekannt</option><option value="YES">Ja</option><option value="NO">Nein</option></select></label>
    </div>}

    {question.control_type === "TEXT_INPUT" && <label className="hsi-text-input"><span>Faktische Angabe</span><textarea maxLength={question.canonical_field_key === "profile.distinctive_fact" ? 280 : 120} rows={question.canonical_field_key === "profile.distinctive_fact" ? 3 : 1} value={typeof value === "string" ? value : ""} onChange={(event) => onChange(event.target.value)} placeholder="Noch nicht erfasst" /></label>}

    {question.control_type === "URL_INPUT" && <label className="hsi-text-input"><span>Offizielle URL</span><input type="url" inputMode="url" value={typeof value === "string" ? value : ""} onChange={(event) => onChange(event.target.value)} onBlur={(event) => onChange(normalizeRestaurantSocialUrl(event.target.value))} placeholder="https://…" /></label>}

    {question.control_type === "CAPACITY" && <div className="hsi-age-grid">
      {([['total','Gesamt'],['indoor','Innen'],['outdoor','Außen']] as const).map(([key, label]) => <label key={key}><span>{label}</span><input type="number" min="0" max="100000" inputMode="numeric" value={String(objectValue[key] ?? "")} onChange={(event) => onChange({ ...objectValue, [key]: event.target.value === "" ? null : Number(event.target.value) })} /><small>leer = unbekannt</small></label>)}
    </div>}

    {question.control_type === "SPECIAL_HOURS" && <div className="hsi-special-hours">
      {specialHours.map((entry, index) => {
        const intervals = Array.isArray(entry.intervals) ? entry.intervals : [];
        const interval = intervals[0] && typeof intervals[0] === "object" ? intervals[0] as Record<string, unknown> : {};
        const update = (next: Record<string, unknown>) => onChange({ overrides: specialHours.map((item, itemIndex) => itemIndex === index ? { ...item, ...next } : item) });
        return <div className="hsi-special-hour-row" key={`${String(entry.date ?? 'new')}-${index}`}>
          <label><span>Datum</span><input type="date" value={String(entry.date ?? "")} onChange={(event) => update({ date: event.target.value })} /></label>
          <label><span>Status</span><select value={String(entry.status ?? "CLOSED")} onChange={(event) => update({ status: event.target.value, intervals: event.target.value === "OPEN" ? [{ open: "12:00", close: "22:00" }] : [] })}><option value="CLOSED">Geschlossen</option><option value="OPEN">Geöffnet</option></select></label>
          {entry.status === "OPEN" && <><label><span>Von</span><input type="time" value={String(interval.open ?? "")} onChange={(event) => update({ intervals: [{ ...interval, open: event.target.value }] })} /></label><label><span>Bis</span><input type="time" value={String(interval.close ?? "")} onChange={(event) => update({ intervals: [{ ...interval, close: event.target.value }] })} /></label></>}
          <label><span>Anlass</span><input maxLength={80} value={String(entry.label ?? "")} onChange={(event) => update({ label: event.target.value })} placeholder="z. B. Weihnachten" /></label>
          <button type="button" onClick={() => onChange({ overrides: specialHours.filter((_, itemIndex) => itemIndex !== index) })}>Entfernen</button>
        </div>;
      })}
      <button type="button" className="hsi-add-row" onClick={() => onChange({ overrides: [...specialHours, { date: "", status: "CLOSED", intervals: [], label: "" }] })}>Sondertag hinzufügen</button>
    </div>}

    {provenance && <footer>{provenance}</footer>}
  </article>;
}
