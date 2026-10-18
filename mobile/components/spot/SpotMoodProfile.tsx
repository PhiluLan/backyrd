import { useRouter } from "expo-router";
import { rankMoodSupport, publicMoodCount } from "../../../packages/shared/src/presentation/mood";
import { Ionicons } from "@expo/vector-icons";
import { useState } from "react";
import { Modal, Pressable, ScrollView, StyleSheet, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";

import { backyrdTheme as theme } from "../../theme/backyrd";
import { AppText } from "../foundation/AppText";
import { Button, IconButton } from "../foundation/Button";

export type SpotMoodProfileItem = {
  concept_key: string;
  label: string;
  concept_contributors: number | null;
  eligible_contributors: number | null;
  percentage: number | null;
  evidence_state: "EARLY" | "ESTABLISHED";
  rank: number;
};

export function SpotMoodProfile({ moods, appearance = "dark" }: { moods: SpotMoodProfileItem[]; appearance?: "dark" | "light" }) {
  const insets = useSafeAreaInsets();
  const router = useRouter();
  const [selected, setSelected] = useState<SpotMoodProfileItem | null>(null);
  const light = appearance === "light";
  const ranked = rankMoodSupport(moods);
  const current = ranked.find(mood => mood.concept_key === selected?.concept_key) ?? null;
  const renderRow = (mood: SpotMoodProfileItem) => {
    const count = publicMoodCount(mood);
    return <Pressable key={mood.concept_key} accessibilityRole="button" accessibilityLabel={`${mood.label}: ${count === null ? "Erste Eindrücke" : `${count} ${count === 1 ? "Person" : "Personen"}`}. Zum Entdecken auswählen`} accessibilityState={{ selected: current?.concept_key === mood.concept_key }} onPress={() => setSelected(mood)} style={styles.supportRow}>
      <View style={styles.supportLabel}><AppText role="label" tone={current?.concept_key === mood.concept_key ? "pink" : undefined} style={light && styles.textLight}>{mood.label}</AppText><AppText role="caption" tone="secondary">{count === null ? "Erste Eindrücke" : `${count} ${count === 1 ? "Person" : "Personen"}`}</AppText></View>
    </Pressable>;
  };
  return (
    <>
      {ranked.length ? <View style={styles.summary}>
        <AppText role="sectionTitle" style={[styles.summaryTitle, light && styles.textLight]}>So fühlt’s sich hier an.</AppText>
        <View style={styles.topMoods}>{ranked.slice(0, 3).map(mood => <View key={mood.concept_key} style={styles.topChip}>
          <AppText role="label" tone="pink" style={styles.topChipLabel}>{mood.label}</AppText>
          {publicMoodCount(mood) !== null ? <AppText role="caption" style={[styles.topChipCount, light && styles.textLight]}>{publicMoodCount(mood)}</AppText> : null}
        </View>)}</View>
        <View style={styles.otherMoods}>{ranked.slice(3, 10).map(mood => <View key={mood.concept_key} style={[styles.otherChip, light && { borderColor: theme.color.borderLight }]}>
          <AppText role="caption" tone="secondary">{mood.label}</AppText>
          {publicMoodCount(mood) !== null ? <AppText role="caption" tone="secondary">{publicMoodCount(mood)}</AppText> : null}
        </View>)}</View>
        {ranked[0]?.evidence_state === "EARLY" ? <AppText role="caption" tone="secondary">Erste Eindrücke</AppText> : null}
        <Pressable accessibilityRole="button" onPress={() => setSelected(ranked[0])} style={styles.allMoods}><AppText role="label" tone="pink">Alle Moods entdecken →</AppText></Pressable>
      </View> : <AppText role="meta" tone="secondary">Noch keine Moods geteilt</AppText>}
      <Modal animationType="slide" onRequestClose={() => setSelected(null)} transparent visible={Boolean(current)}>
        <View style={styles.backdrop}>
          <Pressable accessibilityLabel="Mood-Details schließen" accessibilityRole="button" onPress={() => setSelected(null)} style={StyleSheet.absoluteFill} />
          <View style={[styles.sheet, light && styles.sheetLight, { paddingBottom: Math.max(insets.bottom, theme.spacing.xl) }]}>
            <View style={[styles.handle, light && styles.handleLight]} />
            <View style={styles.sheetHeader}>
              <View style={styles.sheetHeading}>
                <AppText role="caption" tone="pink" style={styles.kicker}>DIE MOODS DIESES ORTES</AppText>
                <AppText role="sectionTitle" style={[styles.sheetTitle, light && styles.textLight]}>Alle Moods</AppText>
              </View>
              <IconButton accessibilityLabel="Schließen" onPress={() => setSelected(null)}>
                <Ionicons name="close" size={21} color={light ? theme.color.textPrimaryLight : theme.color.textPrimary} />
              </IconButton>
            </View>
            <ScrollView style={{ flexShrink: 1 }} contentContainerStyle={{ gap: 18, paddingTop: 18 }}>

              {ranked.map(renderRow)}
              <AppText role="caption" tone="secondary">Die Zahlen zeigen, wie viele Gäste den Ort so beschrieben haben.</AppText>
              {current ? <Button label={`Orte mit ${current.label} entdecken`} onPress={() => { const mood = current.label; setSelected(null); router.push({ pathname: "/(tabs)/map", params: { mood, view: "list" } }); }} /> : null}
            </ScrollView>
          </View>
        </View>
      </Modal>
    </>
  );
}

const styles = StyleSheet.create({
  summary: { gap: 12 },
  summaryTitle: { fontFamily: theme.type.display, fontSize: 24, lineHeight: 30, marginBottom: 6 },
  topMoods: { flexDirection: "row", flexWrap: "wrap", gap: 8 },
  topChip: { flexDirection: "row", alignItems: "center", gap: 8, paddingHorizontal: 11, paddingVertical: 10, borderRadius: 16, borderWidth: 1, borderColor: "rgba(255,79,145,0.22)", backgroundColor: "rgba(255,79,145,0.10)" },
  topChipLabel: { fontSize: 14, lineHeight: 21 },
  topChipCount: { borderLeftWidth: 1, borderLeftColor: "rgba(255,79,145,0.25)", paddingLeft: 7 },
  otherMoods: { flexDirection: "row", flexWrap: "wrap", gap: 7 },
  otherChip: { flexDirection: "row", alignItems: "center", gap: 9, paddingHorizontal: 11, paddingVertical: 8, borderRadius: 12, borderWidth: 1, borderColor: theme.color.border },
  supportRow: { minHeight: 48, justifyContent: "center", gap: 8, paddingVertical: 8 },
  supportLabel: { flexDirection: "row", justifyContent: "space-between", alignItems: "center", gap: 12, flexWrap: "wrap" },
  allMoods: { minHeight: 48, justifyContent: "center", alignSelf: "flex-start" },
  textLight: { color: theme.color.textPrimaryLight },
  backdrop: { flex: 1, justifyContent: "flex-end", backgroundColor: "rgba(0,0,0,0.62)" },
  sheet: { maxHeight: "90%", paddingHorizontal: theme.spacing.xl, paddingTop: theme.spacing.sm, borderTopLeftRadius: theme.radius.xl, borderTopRightRadius: theme.radius.xl, borderWidth: 1, borderColor: theme.color.border, backgroundColor: theme.color.surfaceElevated },
  sheetLight: { borderColor: theme.color.borderLight, backgroundColor: theme.color.surfaceLightElevated },
  handle: { alignSelf: "center", width: 42, height: 5, marginBottom: theme.spacing.lg, borderRadius: theme.radius.pill, backgroundColor: theme.color.borderStrong },
  handleLight: { backgroundColor: "rgba(23,22,26,0.22)" },
  sheetHeader: { flexDirection: "row", alignItems: "center", gap: theme.spacing.md },
  sheetTitle: { fontFamily: theme.type.display, fontSize: 30, lineHeight: 36 },
  sheetHeading: { flex: 1, gap: theme.spacing.xxs },
  kicker: { letterSpacing: 1.6 },
});
