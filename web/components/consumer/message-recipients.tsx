"use client";
import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { supabase } from "@/lib/supabase/client";
import { parseMentionPeople, type MentionPerson } from "../../../packages/shared/src/presentation/social";
export function MessageRecipients() {
  const router = useRouter();
  const [query, setQuery] = useState("");
  const [people, setPeople] = useState<MentionPerson[]>([]);
  const [status, setStatus] = useState("");
  const [busy, setBusy] = useState(false);
  const opening = useRef(false);
  useEffect(() => {
    let active = true;
    const abort = new AbortController();
    const timer = setTimeout(() => {
      if (query.trim().length < 2) { setPeople([]); setStatus(""); return; }
      setStatus("Personen werden gesucht …");
      void (async () => {
        try {
          const { data, error } = await supabase.rpc("search_message_recipients_v1", { p_query: query.trim(), p_limit: 20 }).abortSignal(abort.signal);
          if (error) throw error;
          if (active) { const rows = parseMentionPeople(data); setPeople(rows); setStatus(rows.length ? "" : "Kein Konto gefunden."); }
        } catch { if (active) setStatus("Suche gerade nicht verfügbar. Bitte versuche es nochmals."); }
      })();
    }, 250);
    const timeout = setTimeout(() => abort.abort(),8000);
    return () => { active = false; clearTimeout(timer); clearTimeout(timeout); abort.abort(); };
  }, [query]);
  async function choose(person: MentionPerson) {
    if (opening.current) return;
    opening.current = true; setBusy(true);
    try {
      const { data, error } = await supabase.rpc("get_or_create_direct_chat_v2", { p_other_user_id: person.user_id });
      if (error || typeof data !== "string" || !data) throw error ?? new Error("missing_chat");
      router.push(`/messages/${data}`);
    } catch { setStatus("Der Chat konnte nicht geöffnet werden. Zwischen blockierten Konten sind keine Nachrichten möglich."); }
    finally { opening.current = false; setBusy(false); }
  }
  return <section className="b-input-group" aria-label="Neue Nachricht">
    <label className="b-label" htmlFor="message-recipient">Wem möchtest du schreiben?</label>
    <p className="b-meta">Private Konten erreichst du mit ihrem vollständigen Nutzernamen. Blockieren verhindert weiteren Kontakt.</p>
    <input id="message-recipient" className="b-input" value={query} autoComplete="off" disabled={busy} placeholder="Name oder Nutzername" onChange={e => { setQuery(e.target.value); setPeople([]); }} />
    <p role="status">{status}</p>
    {people.map(p => <button key={p.user_id} type="button" className="b-setting-row b-surface" disabled={busy} onClick={() => void choose(p)}>{p.display_name}{p.username ? ` · @${p.username}` : ""} →</button>)}
  </section>;
}
