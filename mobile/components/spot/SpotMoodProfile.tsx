import { useRouter } from "expo-router";
import { moodEvidenceCopy, rankMoodSupport, publicMoodCount, moodSupportRatio } from "../../../packages/shared/src/presentation/mood";
import { Ionicons } from "@expo/vector-icons";
import { useState } from "react";
import { Modal, Pressable, ScrollView, StyleSheet, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";

import { backyrdTheme as theme } from "../../theme/backyrd";
import { MoodSignature } from "./MoodSignature";
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

export function SpotMoodProfile({ moods, reviewCount, appearance = "dark" }: { moods: SpotMoodProfileItem[]; reviewCount?: number | null; appearance?: "dark" | "light" }) {
  const insets = useSafeAreaInsets();
  const router = useRouter();
  const [selected, setSelected] = useState<SpotMoodProfileItem | null>(null);
  const light = appearance === "light";
  const ranked = rankMoodSupport(moods);
  const current = ranked.find(mood => mood.concept_key === selected?.concept_key) ?? null;
  const renderRow = (mood: SpotMoodProfileItem) => {
    const count = publicMoodCount(mood), ratio = moodSupportRatio(mood);
    return <Pressable key={mood.concept_key} accessibilityRole="button" accessibilityLabel={`${mood.label}: ${count === null ? "Erste Eindrücke" : `${count} ${count === 1 ? "Person" : "Personen"}`}. Details ansehen`} onPress={() => setSelected(mood)} style={styles.supportRow}>
      <View style={styles.supportLabel}><AppText role="label" style={light && styles.textLight}>{mood.label}</AppText><AppText role="caption" tone="secondary">{count === null ? "Erste Eindrücke" : `${count} ${count === 1 ? "Person" : "Personen"}`}</AppText></View>
      {ratio !== null ? <View accessibilityElementsHidden importantForAccessibility="no-hide-descendants" style={styles.track}><View style={[styles.fill, { width: `${ratio * 100}%` }]} /></View> : null}
    </Pressable>;
  };
  return (
    <>
      <MoodSignature labels={ranked.map(mood => mood.label)} reviewCount={reviewCount} onPress={ranked.length ? () => setSelected(ranked[0]) : undefined} />
      {ranked[0]?.evidence_state === "EARLY" ? <AppText role="caption" tone="secondary" style={{ marginTop: 5 }}>Erste Eindrücke</AppText> : null}
      {ranked.length ? <View style={styles.distribution}>
        <AppText role="meta" tone="secondary">So haben Gäste den Ort erlebt</AppText>
        {ranked.slice(0, 3).map(renderRow)}
        <Pressable accessibilityRole="button" onPress={() => setSelected(ranked[0])} style={styles.allMoods}><AppText role="label" tone="pink">Alle Moods ansehen →</AppText></Pressable>
      </View> : <AppText role="meta" tone="secondary">Noch keine Moods geteilt</AppText>}
      <Modal animationType="slide" onRequestClose={() => setSelected(null)} transparent visible={Boolean(current)}>
        <View style={styles.backdrop}>
          <Pressable accessibilityLabel="Mood-Details schließen" accessibilityRole="button" onPress={() => setSelected(null)} style={StyleSheet.absoluteFill} />
          <View style={[styles.sheet, light && styles.sheetLight, { paddingBottom: Math.max(insets.bottom, theme.spacing.xl) }]}>
            <View style={[styles.handle, light && styles.handleLight]} />
            <View style={styles.sheetHeader}>
              <View style={styles.sheetHeading}>
                <AppText role="caption" tone="pink" style={styles.kicker}>DIE MOODS DIESES ORTES</AppText>
                <AppText role="sectionTitle" style={[styles.sheetTitle, light && styles.textLight]}>{current?.label ?? "Mood"}</AppText>
              </View>
              <IconButton accessibilityLabel="Schließen" onPress={() => setSelected(null)}>
                <Ionicons name="close" size={21} color={light ? theme.color.textPrimaryLight : theme.color.textPrimary} />
              </IconButton>
            </View>
            <ScrollView style={{ flexShrink: 1 }} contentContainerStyle={{ gap: 18, paddingTop: 18 }}>

              {ranked.map(renderRow)}
              <AppText role="caption" tone="secondary">Jede Person zählt pro Mood einmal. Mehrere Moods sind möglich. Die Balken zeigen den Anteil der Gäste mit Mood-Angaben.</AppText>
              {current ? <AppText style={[styles.explanation, styles.bodyRegular, light && styles.textMutedLight]}>{moodEvidenceCopy(current)}</AppText> : null}
              <AppText role="meta" tone="secondary">So haben Gäste den Ort erlebt. Welche Moods zu dir passen, entscheidest du.</AppText>
              {current ? <Button label="Orte mit diesem Mood entdecken" onPress={() => { const mood = current.label; setSelected(null); router.push({ pathname: "/(tabs)/map", params: { mood, view: "list" } }); }} /> : null}
            </ScrollView>
          </View>
        </View>
      </Modal>
    </>
  );
}

const styles = StyleSheet.create({
  distribution: { marginTop: 20, gap: 6 },
  supportRow: { minHeight: 48, justifyContent: "center", gap: 8, paddingVertical: 8 },
  supportLabel: { flexDirection: "row", justifyContent: "space-between", alignItems: "center", gap: 12, flexWrap: "wrap" },
  track: { height: 4, backgroundColor: "rgba(255,79,145,0.12)", borderRadius: 2, overflow: "hidden" },
  fill: { height: 4, backgroundColor: theme.color.pink, borderRadius: 2 },
  allMoods: { minHeight: 48, justifyContent: "center", alignSelf: "flex-start" },
  bodyRegular: { fontFamily: theme.type.body },
  textLight: { color: theme.color.textPrimaryLight },
  textMutedLight: { color: theme.color.textSecondaryLight },
  backdrop: { flex: 1, justifyContent: "flex-end", backgroundColor: "rgba(0,0,0,0.62)" },
  sheet: { maxHeight: "90%", paddingHorizontal: theme.spacing.xl, paddingTop: theme.spacing.sm, borderTopLeftRadius: theme.radius.xl, borderTopRightRadius: theme.radius.xl, borderWidth: 1, borderColor: theme.color.border, backgroundColor: theme.color.surfaceElevated },
  sheetLight: { borderColor: theme.color.borderLight, backgroundColor: theme.color.surfaceLightElevated },
  handle: { alignSelf: "center", width: 42, height: 5, marginBottom: theme.spacing.lg, borderRadius: theme.radius.pill, backgroundColor: theme.color.borderStrong },
  handleLight: { backgroundColor: "rgba(23,22,26,0.22)" },
  sheetHeader: { flexDirection: "row", alignItems: "center", gap: theme.spacing.md },
  sheetTitle: { fontFamily: theme.type.display, fontSize: 30, lineHeight: 36 },
  sheetHeading: { flex: 1, gap: theme.spacing.xxs },
  kicker: { letterSpacing: 1.6 },
  explanation: { marginTop: theme.spacing.md, maxWidth: 430, color: theme.color.textSecondary },
});
