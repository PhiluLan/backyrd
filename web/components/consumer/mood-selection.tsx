"use client";
import { useEffect, useId, useState } from "react";
import { supabase } from "@/lib/supabase/client";
import { moodExpressionKey, parseMoodOptions, toggleMoodExpression, type MoodOption } from "../../../packages/shared/src/presentation/mood";
import styles from "./mood-experience.module.css";

export function MoodSelection({ values, onChange }: { values: readonly string[]; onChange: (values: string[]) => void }) {
  const id = useId();
  const [query, setQuery] = useState("");
  const [options, setOptions] = useState<MoodOption[]>([]);
  const [state, setState] = useState<"loading" | "ready" | "error">("loading");
  const [revision, setRevision] = useState(0);
  const [notice, setNotice] = useState("");
  useEffect(() => {
    let active = true;
    const abort = new AbortController();
    const timeout = setTimeout(() => abort.abort(), 8000);
    const debounce = setTimeout(() => {
      setState("loading");
      void (async () => {
        try {
          const { data, error } = await supabase.rpc("backyrd_search_mood_concepts_v1", { p_query: query, p_locale: "de", p_limit: 30 }).abortSignal(abort.signal);
          if (!active) return;
          if (error) throw error;
          setOptions(parseMoodOptions(data)); setState("ready");
        } catch { if (active) { setOptions([]); setState("error"); } }
        finally { clearTimeout(timeout); }
      })();
    }, 150);
    return () => { active = false; clearTimeout(timeout); clearTimeout(debounce); abort.abort(); };
  }, [query, revision]);
  const selected = values.filter(v => v.trim());
  const exact = options.find(o => [o.label, o.matched_expression].some(v => moodExpressionKey(v) === moodExpressionKey(query)));
  function choose(value: string) {
    const result = toggleMoodExpression(selected, value);
    setNotice(result.full ? "Zwei Eindrücke sind ausgewählt. Entferne einen, um einen anderen zu wählen." : "");
    if (!result.full) { onChange(result.values); setQuery(""); }
  }
  return <fieldset className={styles.selection}>
    <legend>Wie fühlt sich der Ort an?</legend>
    <div className={styles.intro}><p>Beschreibe die Atmosphäre bei deinem Besuch. Bis zu zwei Eindrücke, ganz ohne Pflicht.</p><span aria-label={`${selected.length} von 2 ausgewählt`}>{selected.length}/2</span></div>
    {selected.length > 0 ? <div className={styles.chips} aria-label="Deine Auswahl">{selected.map(value => <button type="button" key={value} className={`${styles.chip} ${styles.active}`} aria-label={`${value} entfernen`} onClick={() => choose(value)}>{value} ×</button>)}</div> : null}
    <label htmlFor={id} className="b-label">Mood suchen oder selbst beschreiben</label>
    <input id={id} className="b-input" placeholder="Zum Beispiel gemütlich" maxLength={40} value={query} onChange={e => { setState("loading"); setOptions([]); setQuery(e.target.value); }} autoComplete="off" aria-describedby={`${id}-hint`} />
    {state === "loading" ? <p className={styles.hint} role="status">Moods werden geladen …</p> : null}
    {state === "error" ? <p className={styles.hint} role="status">Die Vorschläge sind gerade nicht verfügbar. Deine Auswahl bleibt erhalten. <button type="button" className={styles.textButton} onClick={() => setRevision(v => v + 1)}>Erneut laden</button></p> : null}
    <div className={styles.chips} aria-label="Mood-Vorschläge">{options.map(option => {
      const active = selected.some(value => moodExpressionKey(value) === moodExpressionKey(option.label));
      return <button key={option.concept_key} type="button" aria-pressed={active} className={`${styles.chip} ${active ? styles.active : ""}`} onClick={() => choose(option.label)}>{active ? "✓ " : ""}{option.label}</button>;
    })}</div>
    {query.trim() && !exact && state === "ready" ? <button className={styles.textButton} type="button" onClick={() => choose(query)}>„{query.trim()}“ verwenden +</button> : null}
    <p id={`${id}-hint`} className={styles.hint}>Eigene Begriffe bleiben bei deinem Beitrag erhalten. Für das gemeinsame Mood-Bild werden sie zuerst geprüft.</p>
    <p className={styles.notice} role="status">{notice}</p>
  </fieldset>;
}
