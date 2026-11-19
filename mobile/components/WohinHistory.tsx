import { useEffect, useState } from "react";
import { ActivityIndicator, Modal, Platform, Pressable, ScrollView, StyleSheet, View } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { SafeAreaView } from "react-native-safe-area-context";
import { AppText } from "@/components/foundation/AppText";
import type { RecentDecisionHistoryEntry } from "@/lib/decision/recentDecisionSearch";

type Colors = { background: string; card: string; text: string; muted: string; pink: string; border: string; tint: string; onAccent: string };
type EntriesProps = { entries: readonly RecentDecisionHistoryEntry[]; color: Colors; loading: boolean; unavailable: boolean; onSelect: (entry: RecentDecisionHistoryEntry) => void; disabled: boolean };

function requestDate(timestamp: number) {
  const date = new Date(timestamp), now = new Date();
  const sameDay = (a: Date, b: Date) => a.getFullYear() === b.getFullYear() && a.getMonth() === b.getMonth() && a.getDate() === b.getDate();
  const time = `${String(date.getHours()).padStart(2, "0")}:${String(date.getMinutes()).padStart(2, "0")}`;
  if (sameDay(date, now)) return `Heute · ${time}`;
  const yesterday = new Date(now); yesterday.setDate(now.getDate() - 1);
  if (sameDay(date, yesterday)) return `Gestern · ${time}`;
  return `${date.getDate()}. ${["Jan.", "Feb.", "März", "Apr.", "Mai", "Juni", "Juli", "Aug.", "Sept.", "Okt.", "Nov.", "Dez."][date.getMonth()]} · ${time}`;
}

export function WohinRecentRequests({ entries, color, loading, unavailable, onSelect, disabled, onOpen, width }: EntriesProps & { onOpen: () => void; width: number }) {
  return <View style={styles.section} testID="wohin-recent-requests">
    <View style={styles.headingRow}>
      <AppText role="sectionTitle" style={styles.sectionTitle}>Zuletzt mit NukNuk</AppText>
      <Pressable accessibilityRole="button" accessibilityLabel="Alle Anfragen öffnen" onPress={onOpen} style={styles.textButton}><AppText role="caption" tone="pink">Verlauf</AppText><Ionicons name="arrow-forward" color={color.pink} size={16} /></Pressable>
    </View>
    {loading ? <ActivityIndicator accessibilityLabel="Anfragen werden geladen" color={color.pink} /> : unavailable
      ? <AppText role="caption" tone="secondary">Dein Verlauf ist gerade nicht verfügbar. Du kannst trotzdem etwas Neues suchen.</AppText>
      : entries.length ? <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.rail}>
        {entries.slice(0, 5).map(entry => <Pressable key={entry.id} accessibilityRole="button" accessibilityLabel={`Anfrage übernehmen: ${entry.query}`} disabled={disabled} onPress={() => onSelect(entry)} style={({ pressed }) => [styles.recentCard, { width, backgroundColor: color.card, borderColor: color.border }, pressed && styles.pressed]}>
          <View style={styles.reuse}><AppText role="caption" tone="secondary" style={styles.date}>{requestDate(entry.searchedAt)}</AppText><Ionicons name="arrow-forward" size={15} color={color.pink} /></View>
          <AppText role="bodyStrong" numberOfLines={3} style={styles.recentQuery}>{entry.query}</AppText>
        </Pressable>)}
      </ScrollView> : <View style={styles.emptyRow}><Ionicons name="time-outline" size={22} color={color.muted} /><AppText role="caption" tone="secondary" style={styles.flex}>Hier findest du deine Anfragen später wieder.</AppText></View>}
  </View>;
}

export function WohinHistorySheet({ visible, onClose, entries, color, loading, unavailable, disabled, onSelect, onRetry, onRemove, onClear, busy }: EntriesProps & {
  visible: boolean; onClose: () => void; onRetry: () => void; onRemove: (id: string) => Promise<boolean>; onClear: () => Promise<boolean>; busy: boolean;
}) {
  const [deletion, setDeletion] = useState<RecentDecisionHistoryEntry | "all" | null>(null);
  useEffect(() => { if (!visible) setDeletion(null); }, [visible]);
  const confirmDelete = async () => {
    if (!deletion || busy) return;
    const removed = deletion === "all" ? await onClear() : await onRemove(deletion.id);
    if (removed) setDeletion(null);
  };
  return <Modal visible={visible} transparent animationType="slide" onRequestClose={onClose}>
    <View style={styles.backdrop}>
      <SafeAreaView edges={["bottom", "left", "right"]} style={[styles.sheet, { backgroundColor: color.background, borderColor: color.border }]} accessibilityViewIsModal testID="wohin-history-sheet">
        <View style={styles.sheetHeader}>
          <View style={styles.flex}><AppText role="sectionTitle">{deletion ? "Verlauf aufräumen" : "Deine Anfragen"}</AppText><AppText role="caption" tone="secondary">{Platform.OS === "web" ? "In diesem Tab" : "Auf diesem Gerät"} · bis zu 30 Tage</AppText></View>
          <Pressable accessibilityRole="button" accessibilityLabel="Anfragen schliessen" onPress={onClose} style={styles.close}><Ionicons name="close" size={25} color={color.text} /></Pressable>
        </View>
        {unavailable ? <View style={styles.notice}><AppText role="body" tone="secondary">Dein Verlauf konnte gerade nicht auf diesem Gerät geladen oder geändert werden.</AppText><Pressable accessibilityRole="button" disabled={busy} onPress={onRetry} style={styles.textButton}><AppText role="label" tone="pink">Noch einmal versuchen</AppText></Pressable></View> : null}
        {deletion ? <View style={styles.confirm}>
          <AppText role="cardTitle">{deletion === "all" ? "Alle Anfragen löschen?" : "Diese Anfrage löschen?"}</AppText>
          <AppText role="body" tone="secondary" numberOfLines={4}>{deletion === "all" ? "Dein gespeicherter Verlauf wird auf diesem Gerät entfernt." : deletion.query}</AppText>
          <View style={styles.confirmActions}>
            <Pressable accessibilityRole="button" disabled={busy} onPress={() => setDeletion(null)} style={[styles.confirmButton, { borderColor: color.border }]}><AppText role="label">Abbrechen</AppText></Pressable>
            <Pressable accessibilityRole="button" accessibilityLabel="Löschen bestätigen" disabled={busy} onPress={() => void confirmDelete()} style={[styles.confirmButton, { backgroundColor: color.pink, borderColor: color.pink }]}>{busy ? <ActivityIndicator color={color.onAccent} /> : <AppText role="label" style={{ color: color.onAccent }}>Löschen</AppText>}</Pressable>
          </View>
        </View> : <>
          <ScrollView contentContainerStyle={styles.list} keyboardShouldPersistTaps="handled">
            {loading ? <ActivityIndicator color={color.pink} accessibilityLabel="Anfragen werden geladen" /> : entries.length ? entries.map(entry => <View key={entry.id} style={[styles.listRow, { borderColor: color.border }]}>
              <Pressable accessibilityRole="button" accessibilityLabel={`Anfrage übernehmen: ${entry.query}`} disabled={disabled || busy} onPress={() => onSelect(entry)} style={styles.listQuery}><AppText role="caption" tone="secondary">{requestDate(entry.searchedAt)}</AppText><AppText role="bodyStrong">{entry.query}</AppText><AppText role="caption" tone="pink">Anfrage übernehmen ↗</AppText></Pressable>
              <Pressable accessibilityRole="button" accessibilityLabel={`Anfrage löschen: ${entry.query}`} disabled={busy} onPress={() => setDeletion(entry)} style={styles.close}><Ionicons name="trash-outline" size={21} color={color.muted} /></Pressable>
            </View>) : !unavailable ? <View style={styles.confirm}><Ionicons name="chatbubble-ellipses-outline" size={34} color={color.pink} /><AppText role="cardTitle">Platz für deine nächsten Ideen.</AppText><AppText role="body" tone="secondary">Sobald du etwas suchst, findest du deine Anfrage hier wieder.</AppText></View> : null}
          </ScrollView>
          <View style={[styles.sheetFooter, { borderColor: color.border }]}>
            <AppText role="caption" tone="secondary">Übernimm eine Anfrage und passe sie nach Lust und Laune an. Mit dem Senden-Pfeil suchst du dann neu.</AppText>
            {entries.length || unavailable ? <Pressable accessibilityRole="button" accessibilityLabel="Verlauf leeren" disabled={busy} onPress={() => setDeletion("all")} style={styles.textButton}><Ionicons name="trash-outline" size={16} color={color.pink} /><AppText role="caption" tone="pink">Verlauf leeren</AppText></Pressable> : null}
          </View>
        </>}
      </SafeAreaView>
    </View>
  </Modal>;
}

const styles = StyleSheet.create({
  flex: { flex: 1 }, section: { gap: 12 }, headingRow: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", gap: 8 },
  sectionTitle: { flex: 1, fontSize: 20, lineHeight: 26 }, textButton: { minHeight: 44, flexDirection: "row", alignItems: "center", gap: 7, paddingVertical: 8 },
  rail: { gap: 12, paddingBottom: 2 }, recentCard: { padding: 16, borderRadius: 22, borderWidth: StyleSheet.hairlineWidth, gap: 9, justifyContent: "flex-start", minHeight: 128 },
  date: { fontSize: 12, lineHeight: 18 }, recentQuery: { fontSize: 16, lineHeight: 22 }, reuse: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", gap: 6, paddingTop: 4 },
  emptyRow: { flexDirection: "row", gap: 12, alignItems: "center", paddingVertical: 12 }, pressed: { opacity: 0.7 },
  backdrop: { flex: 1, justifyContent: "flex-end", backgroundColor: "#00000080" }, sheet: { maxHeight: "86%", minHeight: "45%", borderTopLeftRadius: 32, borderTopRightRadius: 32, borderWidth: StyleSheet.hairlineWidth, overflow: "hidden" },
  sheetHeader: { paddingTop: 23, paddingHorizontal: 24, paddingBottom: 12, flexDirection: "row", alignItems: "center", gap: 12 }, close: { width: 44, minHeight: 44, alignItems: "center", justifyContent: "center" },
  list: { paddingHorizontal: 24, paddingBottom: 16 }, listRow: { borderBottomWidth: StyleSheet.hairlineWidth, flexDirection: "row", gap: 8, alignItems: "flex-start", paddingVertical: 16 }, listQuery: { flex: 1, gap: 8, paddingVertical: 4 },
  sheetFooter: { borderTopWidth: StyleSheet.hairlineWidth, paddingHorizontal: 24, paddingTop: 16, paddingBottom: 12, gap: 8 }, notice: { marginHorizontal: 24, paddingVertical: 12, gap: 4 },
  confirm: { padding: 24, gap: 16 }, confirmActions: { flexDirection: "row", gap: 12, paddingTop: 8 }, confirmButton: { flex: 1, minHeight: 50, padding: 12, borderWidth: 1, borderRadius: 25, alignItems: "center", justifyContent: "center" },
});
