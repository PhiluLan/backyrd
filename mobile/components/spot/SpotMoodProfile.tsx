import { useRouter } from "expo-router";
import { moodEvidenceCopy } from "../../../packages/shared/src/presentation/mood";
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

export function SpotMoodProfile({ moods, appearance = "dark" }: { moods: SpotMoodProfileItem[]; appearance?: "dark" | "light" }) {
  const insets = useSafeAreaInsets();
  const router = useRouter();
  const [selected, setSelected] = useState<SpotMoodProfileItem | null>(null);
  const light = appearance === "light";
  return (
    <>
      <MoodSignature labels={moods.map(mood => mood.label)} onPress={() => setSelected(moods[0] ?? null)} />
      {moods[0]?.evidence_state === "EARLY" ? <AppText role="caption" tone="secondary" style={{ marginTop: 5 }}>Erste Eindrücke</AppText> : null}
      <Modal animationType="slide" onRequestClose={() => setSelected(null)} transparent visible={Boolean(selected)}>
        <View style={styles.backdrop}>
          <Pressable accessibilityLabel="Mood-Details schließen" accessibilityRole="button" onPress={() => setSelected(null)} style={StyleSheet.absoluteFill} />
          <View style={[styles.sheet, light && styles.sheetLight, { paddingBottom: Math.max(insets.bottom, theme.spacing.xl) }]}>
            <View style={[styles.handle, light && styles.handleLight]} />
            <View style={styles.sheetHeader}>
              <View style={styles.sheetHeading}>
                <AppText role="caption" tone="pink" style={styles.kicker}>DIE MOODS DIESES ORTES</AppText>
                <AppText role="sectionTitle" style={[styles.sheetTitle, light && styles.textLight]}>{selected?.label ?? "Mood"}</AppText>
              </View>
              <IconButton accessibilityLabel="Schließen" onPress={() => setSelected(null)}>
                <Ionicons name="close" size={21} color={light ? theme.color.textPrimaryLight : theme.color.textPrimary} />
              </IconButton>
            </View>
            <ScrollView style={{ flexShrink: 1 }} contentContainerStyle={{ gap: 18, paddingTop: 18 }}>
              <View style={styles.wrap}>{moods.map(mood => <Pressable key={mood.concept_key} accessibilityRole="button" accessibilityState={{ selected: selected?.concept_key === mood.concept_key }} onPress={() => setSelected(mood)} style={[styles.pill, light && { backgroundColor: theme.color.surfaceLight, borderColor: theme.color.borderLight }, selected?.concept_key === mood.concept_key && styles.pillProminent]}><AppText role="label" style={light && styles.textLight}>{mood.label}</AppText></Pressable>)}</View>
              {selected ? <AppText style={[styles.explanation, styles.bodyRegular, light && styles.textMutedLight]}>{moodEvidenceCopy(selected)}</AppText> : null}
              <AppText role="meta" tone="secondary">So haben Gäste den Ort erlebt. Welche Moods zu dir passen, entscheidest du.</AppText>
              {selected ? <Button label="Orte mit diesem Mood entdecken" onPress={() => { const mood = selected.label; setSelected(null); router.push({ pathname: "/(tabs)/map", params: { mood, view: "list" } }); }} /> : null}
            </ScrollView>
          </View>
        </View>
      </Modal>
    </>
  );
}

const styles = StyleSheet.create({
  wrap: { flexDirection: "row", flexWrap: "wrap", gap: theme.spacing.sm },
  pill: { minHeight: theme.control.compact, minWidth: 92, justifyContent: "center", overflow: "hidden", paddingHorizontal: theme.spacing.lg, paddingBottom: theme.spacing.xs, paddingTop: theme.spacing.xs, borderRadius: theme.radius.pill, borderWidth: 1, borderColor: theme.color.border, backgroundColor: "rgba(255,255,255,0.045)" },
  pillProminent: { borderColor: "rgba(255,79,145,0.35)", backgroundColor: "rgba(255,79,145,0.085)" },
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
