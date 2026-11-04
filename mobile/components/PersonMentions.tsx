import React, { useEffect, useState } from "react";
import { ActivityIndicator, Pressable, View } from "react-native";
import { AppText, ProductTextInput } from "./foundation/AppText";
import { supabase } from "../lib/supabase";
import { parseMentionPeople, type MentionPerson } from "../../packages/shared/src/presentation/social";
import { backyrdTheme as theme } from "../theme/backyrd";

export function PersonMentions({ values, onChange, disabled = false }: { values: MentionPerson[]; onChange: (v: MentionPerson[]) => void; disabled?: boolean }) {
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
  return <View style={{ gap: 12 }} pointerEvents={disabled ? "none" : "auto"}>
    <AppText role="cardTitle">Mit wem warst du unterwegs?</AppText>
    <AppText role="meta" tone="secondary">Optional: bis zu zehn öffentliche Konten markieren. Private oder blockierte Konten sind nicht auswählbar.</AppText>
    {values.map(p => <Pressable accessibilityRole="button" accessibilityLabel={`${p.display_name} entfernen`} key={p.user_id} onPress={() => onChange(values.filter(v => v.user_id !== p.user_id))} style={{ minHeight: 44, justifyContent: "center" }}><AppText tone="pink">{p.display_name} ×</AppText></Pressable>)}
    <ProductTextInput accessibilityLabel="Person zum Markieren suchen" value={query} editable={!disabled && values.length < 10} onChangeText={v => { setQuery(v); setPeople([]); setState("loading"); }} placeholder="Name oder Nutzername" placeholderTextColor={theme.color.textMuted} style={{ color: theme.color.textPrimary, minHeight: 52, padding: 14, borderWidth: 1, borderColor: theme.color.border, borderRadius: theme.radius.md }} />
    {state === "loading" ? <ActivityIndicator color={theme.color.pink} accessibilityLabel="Personen werden gesucht" /> : null}
    {state === "error" ? <Pressable accessibilityRole="button" style={{ minHeight: 44 }} onPress={() => setRetry(v => v + 1)}><AppText>Suche nicht verfügbar. Erneut versuchen</AppText></Pressable> : null}
    {state === "ready" && !people.length ? <AppText role="meta">Kein markierbares Konto gefunden.</AppText> : null}
    {people.filter(p => !values.some(v => v.user_id === p.user_id)).map(p => <Pressable accessibilityRole="button" disabled={disabled || values.length >= 10} key={p.user_id} onPress={() => { onChange([...values, p]); setQuery(""); setPeople([]); }} style={{ minHeight: 48, justifyContent: "center" }}><AppText>{p.display_name}{p.username ? ` · @${p.username}` : ""} +</AppText></Pressable>)}
  </View>;
}
