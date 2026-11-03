import React, { useCallback, useEffect, useRef, useState } from "react";
import { Alert, Modal, Pressable, ScrollView, View } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { AppText, ProductTextInput } from "./foundation/AppText";
import { MoodSelection } from "./MoodSelection";
import { supabase } from "../lib/supabase";
import { parseMomentEditor, type MomentEditorData } from "../../packages/shared/src/presentation/social";
import { backyrdTheme as theme } from "../theme/backyrd";
export function MomentEditor({ postId, onClose, onChanged }: { postId: string | null; onClose: () => void; onChanged: () => void }) {
  const [original, setOriginal] = useState<MomentEditorData | null>(null);
  const [caption, setCaption] = useState("");
  const [moods, setMoods] = useState<string[]>([]);
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const pending = useRef(false);
  const load = useCallback(async () => {
    setError(""); setOriginal(null);
    if (!postId) return;
    try {
      const { data, error } = await supabase.rpc("get_my_moment_editor_v1", { p_post_id: postId });
      if (error) throw error;
      const row = parseMomentEditor(data, postId);
      setOriginal(row); setCaption(row.caption ?? ""); setMoods(row.moods);
    } catch { setError("Dein Moment konnte nicht geladen werden."); }
  }, [postId]);
  useEffect(() => { void load(); }, [load]);
  function close() {
    if (pending.current) return;
    if (original && (caption !== (original.caption ?? "") || JSON.stringify(moods) !== JSON.stringify(original.moods))) {
      Alert.alert("Änderungen verwerfen?", "Deine Änderungen sind noch nicht gespeichert.", [{text:"Weiter bearbeiten",style:"cancel"},{text:"Verwerfen",style:"destructive",onPress:onClose}]);
    } else onClose();
  }
  async function save(remove: boolean) {
    if (!original || pending.current) return;
    pending.current = true; setBusy(true); setError("");
    try {
      const result = remove
        ? await supabase.rpc("remove_my_moment_v1", { p_post_id: original.postId })
        : await supabase.rpc("update_my_moment_v1", { p_post_id: original.postId, p_caption: caption, p_mood_tags: moods, p_expected_caption: original.caption, p_expected_mood_tags: original.moods });
      const receipt = Array.isArray(result.data) ? result.data[0] : result.data;
      if (result.error || receipt?.post_id !== original.postId || (remove && receipt?.status !== "deleted")) throw result.error ?? new Error("missing_receipt");
      onChanged(); onClose();
      Alert.alert(remove ? "Moment entfernt" : "Änderungen gespeichert");
    } catch (e: unknown) {
      const reason = e && typeof e === "object" && "message" in e ? String(e.message) : "";
      setError(reason.includes("moment_changed") ? "Dieser Moment wurde inzwischen geändert. Schliesse den Editor und lade ihn erneut, bevor du speicherst. Deine Eingabe bleibt bis dahin sichtbar." : "Die Änderung konnte nicht bestätigt werden. Deine Eingaben bleiben erhalten.");
    } finally { pending.current = false; setBusy(false); }
  }
  function remove() {
    if (!original || pending.current) return;
    Alert.alert("Moment entfernen?", original.reviewId ? "Dein Ortseindruck und seine Moods bleiben auf der Ortsseite erhalten." : "Dieser Moment wird nicht mehr im Feed oder Profil angezeigt.", [{text:"Abbrechen",style:"cancel"},{text:"Entfernen",style:"destructive",onPress:()=>void save(true)}]);
  }
  return <Modal visible={Boolean(postId)} animationType="slide" onRequestClose={close}>
    <SafeAreaView style={{flex:1,backgroundColor:theme.color.background}}>
      <ScrollView contentContainerStyle={{padding:20,gap:20}} keyboardShouldPersistTaps="handled">
        <View style={{flexDirection:"row",alignItems:"center",gap:12}}><AppText role="sectionTitle" style={{flex:1}}>Dein Moment</AppText><Pressable accessibilityRole="button" disabled={busy} onPress={close} style={{minHeight:44,justifyContent:"center"}}><AppText>Schliessen</AppText></Pressable></View>
        {error ? <AppText accessibilityRole="alert" tone="pink">{error}</AppText> : null}
        {!original ? <Pressable accessibilityRole="button" onPress={()=>void load()} style={{minHeight:44}}><AppText>Moment laden</AppText></Pressable> : <View style={{gap:20}} pointerEvents={busy ? "none" : "auto"}>
          {original.reviewId ? <AppText tone="secondary">Dein Text und deine Moods gehören auch zu deinem Ortseindruck. Änderungen werden an beiden Stellen gespeichert.</AppText> : null}
          <AppText role="label">Dein Erlebnis</AppText>
          <ProductTextInput accessibilityLabel="Dein Erlebnis" value={caption} onChangeText={setCaption} editable={!busy} maxLength={1200} multiline style={{minHeight:120,padding:16,color:theme.color.textPrimary,backgroundColor:theme.color.surface,borderRadius:theme.radius.md}} />
          <MoodSelection context={original.reviewId ? "place" : "moment"} values={moods} onChange={setMoods} />
          <Pressable accessibilityRole="button" onPress={()=>void save(false)} disabled={busy} style={{minHeight:52,padding:16,alignItems:"center",justifyContent:"center",backgroundColor:theme.color.pink,borderRadius:theme.radius.pill}}><AppText style={{color:theme.color.background}}>{busy ? "Wird gespeichert …" : "Änderungen speichern"}</AppText></Pressable>
          <Pressable accessibilityRole="button" onPress={remove} disabled={busy} style={{minHeight:48,justifyContent:"center"}}><AppText tone="secondary">Moment entfernen</AppText></Pressable>
        </View>}
      </ScrollView>
    </SafeAreaView>
  </Modal>;
}
