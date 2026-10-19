import { useRouter } from "expo-router";
import { rankMoodSupport, publicMoodCount, moodSupportFraction } from "../../../packages/shared/src/presentation/mood";
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
  const strongestCount = ranked.length ? publicMoodCount(ranked[0]) : null;
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
        <View style={styles.summaryHeader}>
          <AppText role="sectionTitle" style={[styles.summaryTitle, light && styles.textLight]}>Moods</AppText>
          <AppText role="body" tone="secondary" style={[styles.summarySubtitle, light && styles.secondaryLight]}>So wird dieser Ort beschrieben</AppText>
        </View>
        <View style={styles.topMoods}>{ranked.slice(0, 3).map((mood, index) => {
          const count = publicMoodCount(mood);
          const fraction = moodSupportFraction(mood, strongestCount);
          return <View key={mood.concept_key}>
            <View style={styles.leadingLabel}>
              <AppText role="bodyStrong" style={[styles.leadingMood, light && styles.textLight]}>{mood.label}</AppText>
              {count !== null ? <AppText role="body" tone="secondary" accessibilityLabel={`${count} ${count === 1 ? "Person" : "Personen"}`} style={[styles.leadingCount, light && styles.secondaryLight]}>{count}</AppText> : null}
            </View>
            {fraction !== null ? <View accessible={false} accessibilityElementsHidden importantForAccessibility="no-hide-descendants" style={[styles.track, light && { backgroundColor: theme.color.borderLight }]}><View style={[styles.fill, { width: `${fraction * 100}%`, opacity: [1, 0.72, 0.5][index] }]} /></View> : null}
          </View>;
        })}</View>
        {ranked.length > 3 ? <View style={[styles.otherMoods, light && { borderColor: theme.color.borderLight }]}>{ranked.slice(3, 10).map(mood => <View key={mood.concept_key} style={styles.otherRow}>
          <AppText role="body" style={[styles.otherLabel, light && styles.textLight]}>{mood.label}</AppText>
          {publicMoodCount(mood) !== null ? <AppText role="body" tone="secondary" accessibilityLabel={`${publicMoodCount(mood)} ${publicMoodCount(mood) === 1 ? "Person" : "Personen"}`} style={[styles.otherCount, light && styles.secondaryLight]}>{publicMoodCount(mood)}</AppText> : null}
        </View>)}</View> : null}
        {ranked.some(mood => mood.evidence_state === "EARLY") ? <AppText role="caption" tone="secondary" style={[styles.earlyEvidence, light && styles.secondaryLight]}>Erste Eindrücke</AppText> : null}
        <Pressable accessibilityRole="button" onPress={() => setSelected(ranked[0])} style={[styles.allMoods, light && { borderColor: theme.color.borderLight }]}><AppText role="meta" style={[styles.allMoodsLabel, light && styles.textLight]}>Alle Moods ansehen</AppText><Ionicons name="arrow-forward" size={18} color={theme.color.pink} /></Pressable>
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
  summary: { gap: 0 },
  summaryHeader: { gap: 6, marginBottom: 24 },
  summaryTitle: { fontFamily: theme.type.bodyMedium, fontSize: 21, lineHeight: 28, letterSpacing: -0.4 },
  summarySubtitle: { fontSize: 13, lineHeight: 20 },
  topMoods: { gap: 19 },
  leadingLabel: { flexDirection: "row", alignItems: "baseline", justifyContent: "space-between", gap: 20 },
  leadingMood: { fontSize: 18, lineHeight: 24, letterSpacing: -0.2, flexShrink: 1 },
  leadingCount: { fontSize: 14, lineHeight: 19 },
  track: { height: 4, marginTop: 10, backgroundColor: theme.color.border, overflow: "hidden" },
  fill: { height: 4, backgroundColor: theme.color.pink },
  otherMoods: { flexDirection: "row", flexWrap: "wrap", justifyContent: "space-between", rowGap: 16, marginTop: 23, paddingTop: 23, borderTopWidth: 1, borderColor: theme.color.border },
  otherRow: { width: "47%", flexDirection: "row", alignItems: "baseline", justifyContent: "space-between", gap: 8 },
  otherLabel: { fontSize: 13, lineHeight: 19, flexShrink: 1 },
  otherCount: { fontSize: 12, lineHeight: 19 },
  earlyEvidence: { marginTop: 16 },
  supportRow: { minHeight: 48, justifyContent: "center", gap: 8, paddingVertical: 8 },
  supportLabel: { flexDirection: "row", justifyContent: "space-between", alignItems: "center", gap: 12, flexWrap: "wrap" },
  allMoods: { minHeight: 58, flexDirection: "row", alignItems: "center", justifyContent: "space-between", gap: 14, marginTop: 21, borderTopWidth: 1, borderColor: theme.color.border },
  allMoodsLabel: { fontSize: 13, lineHeight: 19 },
  textLight: { color: theme.color.textPrimaryLight },
  secondaryLight: { color: theme.color.textSecondaryLight },
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
