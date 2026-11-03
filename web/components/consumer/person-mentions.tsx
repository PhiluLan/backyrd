"use client";
import { useEffect, useId, useState } from "react";
import { supabase } from "@/lib/supabase/client";
import { parseMentionPeople, type MentionPerson } from "../../../packages/shared/src/presentation/social";
export function PersonMentions({ values, onChange, disabled = false }: { values: MentionPerson[]; onChange: (v: MentionPerson[]) => void; disabled?: boolean }) {
  const id = useId();
  const [query, setQuery] = useState("");
  const [people, setPeople] = useState<MentionPerson[]>([]);
  const [state, setState] = useState<"idle" | "loading" | "ready" | "error">("idle");
  const [retry, setRetry] = useState(0);
  useEffect(() => {
    let active = true;
    const abort = new AbortController();
    const timeout = setTimeout(() => abort.abort(), 8000);
    const timer = setTimeout(() => {
      if (query.trim().length < 2) { setPeople([]); setState("idle"); clearTimeout(timeout); return; }
      setState("loading");
      void (async () => {
        try {
          const { data, error } = await supabase.rpc("search_social_users_v1", { p_query: query.trim(), p_limit: 10 }).abortSignal(abort.signal);
          if (error) throw error;
          if (active) { setPeople(parseMentionPeople(data)); setState("ready"); }
        } catch { if (active) { setPeople([]); setState("error"); } }
        finally { clearTimeout(timeout); }
      })();
    }, 250);
    return () => { active = false; clearTimeout(timer); clearTimeout(timeout); abort.abort(); };
  }, [query, retry]);
  return <fieldset className="b-input-group" disabled={disabled}>
    <legend className="b-label">Mit wem warst du unterwegs?</legend>
    <p className="b-meta">Optional: bis zu zehn öffentliche Konten markieren. Private oder blockierte Konten sind nicht auswählbar.</p>
    <div className="b-moment-moods">{values.map(p => <button type="button" className="b-chip" aria-label={`${p.display_name} entfernen`} key={p.user_id} onClick={() => onChange(values.filter(v => v.user_id !== p.user_id))}>{p.display_name} ×</button>)}</div>
    <label className="b-label" htmlFor={id}>Name oder Nutzername</label>
    <input id={id} className="b-input" value={query} disabled={disabled || values.length >= 10} autoComplete="off" onChange={e => { setQuery(e.target.value); setPeople([]); setState("loading"); }} />
    <div role="status">{state === "loading" ? "Personen werden gesucht …" : state === "error" ? <button type="button" onClick={() => setRetry(v => v + 1)}>Suche nicht verfügbar. Erneut versuchen</button> : state === "ready" && !people.length ? "Kein markierbares Konto gefunden." : null}</div>
    {people.filter(p => !values.some(v => v.user_id === p.user_id)).map(p => <button type="button" className="b-button b-button--secondary" disabled={disabled || values.length >= 10} key={p.user_id} onClick={() => { onChange([...values, p]); setQuery(""); setPeople([]); }}>{p.display_name}{p.username ? ` · @${p.username}` : ""} +</button>)}
  </fieldset>;
}
