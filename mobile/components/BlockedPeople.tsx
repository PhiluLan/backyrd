import React, { useCallback, useRef, useState } from "react";
import { Alert, Pressable, View } from "react-native";
import { useFocusEffect } from "expo-router";
import { AppText } from "./foundation/AppText";
import { supabase } from "../lib/supabase";
import { parseMentionPeople, type MentionPerson } from "../../packages/shared/src/presentation/social";
import { backyrdTheme as theme } from "../theme/backyrd";
export function BlockedPeople() {
  const [people, setPeople] = useState<MentionPerson[]>([]);
  const [state, setState] = useState<"loading" | "ready" | "error">("loading");
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
  useFocusEffect(useCallback(() => { void load(); }, [load]));
  function unblock(person: MentionPerson) {
    if (pending.current) return;
    Alert.alert("Blockierung aufheben?", `Ihr könnt euch danach wieder schreiben, sofern keine weitere Blockierung besteht.`, [
      {text: "Abbrechen", style: "cancel"},
      {text: "Aufheben", onPress: () => {
        if (pending.current) return;
        pending.current = true; setBusy(person.user_id);
        void (async () => {
          try {
            const { data, error } = await supabase.rpc("unblock_user_v1", {p_user_id: person.user_id});
            const receipt = Array.isArray(data) ? data[0] : data;
            if (error || receipt?.is_blocked !== false || receipt?.blocked_user_id !== person.user_id) throw error ?? new Error("missing_receipt");
            setPeople(rows => rows.filter(p => p.user_id !== person.user_id));
            Alert.alert("Blockierung aufgehoben");
          } catch { Alert.alert("Nicht aufgehoben", "Bitte versuche es erneut."); }
          finally { pending.current = false; setBusy(null); }
        })();
      }},
    ]);
  }
  return <View style={{gap:12,marginTop:24,paddingBottom:32}}>
    <AppText role="sectionTitle">Blockierte Personen</AppText>
    <AppText tone="secondary">Blockierungen verhindern Nachrichten und weitere Interaktionen zwischen euren Konten.</AppText>
    {state === "loading" ? <AppText>Blockierungen werden geladen …</AppText> : state === "error" ? <Pressable accessibilityRole="button" onPress={() => void load()} style={{minHeight:44}}><AppText tone="pink">Nicht geladen. Erneut versuchen</AppText></Pressable> : !people.length ? <AppText>Du hast niemanden blockiert.</AppText> : people.map(p => <View key={p.user_id} style={{gap:8,padding:16,borderRadius:theme.radius.md,backgroundColor:theme.color.surface}}><AppText>{p.display_name}</AppText><Pressable accessibilityRole="button" disabled={Boolean(busy)} accessibilityLabel={`Blockierung von ${p.display_name} aufheben`} onPress={() => unblock(p)} style={{minHeight:44,justifyContent:"center"}}><AppText tone="pink">{busy===p.user_id?"Wird aufgehoben …":"Blockierung aufheben"}</AppText></Pressable></View>)}
  </View>;
}
