"use client";
import { useCallback, useEffect, useRef, useState } from "react";
import { supabase } from "@/lib/supabase/client";
import { parseMentionPeople, type MentionPerson } from "../../../packages/shared/src/presentation/social";
import { Button } from "./ui";
export function BlockedPeople() {
  const [people, setPeople] = useState<MentionPerson[]>([]);
  const [state, setState] = useState<"loading" | "ready" | "error">("loading");
  const [message, setMessage] = useState("");
  const [busy, setBusy] = useState<string | null>(null);
  const pending = useRef(false);
  const load = useCallback(async () => {
    setState("loading");
    try {
      const { data, error } = await supabase.rpc("get_my_blocked_users_v1");
      if (error) throw error;
      setPeople(parseMentionPeople(data)); setState("ready");
    } catch { setState("error"); }
  }, []);
  useEffect(() => { void load(); }, [load]);
  async function unblock(person: MentionPerson) {
    if (pending.current || !window.confirm(`Blockierung von ${person.display_name} aufheben? Ihr könnt euch danach wieder schreiben, sofern keine weitere Blockierung besteht.`)) return;
    pending.current = true; setBusy(person.user_id);
    try {
      const { data, error } = await supabase.rpc("unblock_user_v1", { p_user_id: person.user_id });
      const receipt = Array.isArray(data) ? data[0] : data;
      if (error || receipt?.is_blocked !== false || receipt?.blocked_user_id !== person.user_id) throw error ?? new Error("missing_receipt");
      setPeople(rows => rows.filter(p => p.user_id !== person.user_id));
      setMessage("Blockierung aufgehoben.");
    } catch { setMessage("Blockierung konnte nicht aufgehoben werden. Bitte versuche es erneut."); }
    finally { pending.current = false; setBusy(null); }
  }
  return <section className="b-input-group" aria-labelledby="blocked-people-heading">
    <h2 className="b-section-title" id="blocked-people-heading">Blockierte Personen</h2>
    <p className="b-meta">Blockierungen verhindern Nachrichten und weitere Interaktionen zwischen euren Konten.</p>
    {state === "loading" ? <p role="status">Blockierungen werden geladen …</p> : state === "error" ? <Button onClick={() => void load()}>Blockierungen nicht geladen. Erneut versuchen</Button> : !people.length ? <p>Du hast niemanden blockiert.</p> : people.map(p => <div className="b-setting-row" style={{flexWrap:"wrap"}} key={p.user_id}><span style={{flex:1}}>{p.display_name}</span><Button variant="secondary" disabled={Boolean(busy)} onClick={() => void unblock(p)}>{busy === p.user_id ? "Wird aufgehoben …" : "Blockierung aufheben"}</Button></div>)}
    <p role="status">{message}</p>
  </section>;
}
