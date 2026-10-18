import { useRouter } from "expo-router";
import { moodEvidenceCopy, moodIsProminent } from "../../../packages/shared/src/presentation/mood";
import { Ionicons } from "@expo/vector-icons";
import { useMemo, useState } from "react";
import { Modal, Pressable, StyleSheet, View } from "react-native";
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
  const [showAll, setShowAll] = useState(false);
  const [selected, setSelected] = useState<SpotMoodProfileItem | null>(null);
  const light = appearance === "light";
  const early = moods[0]?.evidence_state === "EARLY";
  const visible = useMemo(() => (showAll ? moods : moods.slice(0, 5)), [moods, showAll]);

  return (
    <>
      <AppText role="meta" style={[styles.bodyRegular, { marginBottom: 16 }, light && styles.textMutedLight]} tone="secondary">Von Gästen beschrieben. Jeder Besuch kann anders sein.</AppText>
      {early ? <AppText role="meta" style={[styles.earlyLabel, styles.bodyRegular, light && styles.textMutedLight]}>Erste Eindrücke</AppText> : null}
      <View style={styles.wrap}>
        {visible.map((mood) => {
          const prominent = moodIsProminent(mood);
          return (
            <Pressable
              key={mood.concept_key}
              accessibilityHint="Öffnet die Einordnung dieses Community-Moods"
              accessibilityLabel={`${mood.label}${prominent ? ", besonders prägender Community-Eindruck" : ""}`}
              accessibilityRole="button"
              onPress={() => setSelected(mood)}
              style={({ pressed }) => [styles.pill, light && styles.pillLight, prominent && styles.pillProminent, light && prominent && styles.pillProminentLight, pressed && styles.pillPressed]}
            >
              <AppText numberOfLines={1} role="label" style={[styles.bodyBold, light && styles.textLight, !prominent && light && styles.textMutedLight, prominent && styles.labelProminent]}>{mood.label}</AppText>

            </Pressable>
          );
        })}
      </View>
      {moods.length > 5 ? (
        <Pressable accessibilityRole="button" accessibilityState={{ expanded: showAll }} onPress={() => setShowAll((current) => !current)} style={({ pressed }) => [styles.more, pressed && styles.morePressed]}>
          <AppText role="label" tone="pink" style={styles.bodyBold}>{showAll ? "Weniger anzeigen" : "Mehr anzeigen"}</AppText>
          <Ionicons name={showAll ? "chevron-up" : "chevron-down"} size={16} color={theme.color.pink} />
        </Pressable>
      ) : null}

      <Modal animationType="slide" onRequestClose={() => setSelected(null)} transparent visible={Boolean(selected)}>
        <View style={styles.backdrop}>
          <Pressable accessibilityLabel="Mood-Details schließen" accessibilityRole="button" onPress={() => setSelected(null)} style={StyleSheet.absoluteFill} />
          <View style={[styles.sheet, light && styles.sheetLight, { paddingBottom: Math.max(insets.bottom, theme.spacing.xl) }]}>
            <View style={[styles.handle, light && styles.handleLight]} />
            <View style={styles.sheetHeader}>
              <View style={styles.sheetHeading}>
                <AppText role="caption" tone="pink" style={[styles.kicker, styles.bodyBold]}>COMMUNITY-EINDRUCK</AppText>
                <AppText role="sectionTitle" style={[styles.sheetTitle, light && styles.textLight]}>{selected?.label ?? "Mood"}</AppText>
              </View>
              <IconButton accessibilityLabel="Schließen" onPress={() => setSelected(null)}>
                <Ionicons name="close" size={21} color={light ? theme.color.textPrimaryLight : theme.color.textPrimary} />
              </IconButton>
            </View>
            {selected ? <AppText style={[styles.explanation, styles.bodyRegular, light && styles.textMutedLight]}>{moodEvidenceCopy(selected)}</AppText> : null}
            <AppText role="meta" tone="secondary" style={{ marginTop: 14 }}>Gäste beschreiben die Atmosphäre nach ihrem Besuch. Die Begriffe sind keine Qualitätsnote.</AppText>
            {selected ? <Button label="Orte mit diesem Mood" style={{ marginTop: 24 }} onPress={() => { const mood = selected.label; setSelected(null); router.push({ pathname: "/(tabs)/map", params: { mood, view: "list" } }); }} /> : null}
          </View>
        </View>
      </Modal>
    </>
  );
}

const styles = StyleSheet.create({
  earlyLabel: { marginBottom: theme.spacing.md },
  wrap: { flexDirection: "row", flexWrap: "wrap", gap: theme.spacing.sm },
  pill: { minHeight: theme.control.compact, minWidth: 92, justifyContent: "center", overflow: "hidden", paddingHorizontal: theme.spacing.lg, paddingBottom: theme.spacing.xs, paddingTop: theme.spacing.xs, borderRadius: theme.radius.pill, borderWidth: 1, borderColor: theme.color.border, backgroundColor: "rgba(255,255,255,0.045)" },
  pillLight: { borderColor: theme.color.borderLight, backgroundColor: "rgba(23,22,26,0.025)" },
  pillProminent: { borderColor: "rgba(255,79,145,0.35)", backgroundColor: "rgba(255,79,145,0.085)" },
  pillProminentLight: { borderColor: "rgba(255,79,145,0.46)", backgroundColor: "rgba(255,79,145,0.075)" },
  pillPressed: { opacity: 0.78, transform: [{ scale: theme.motion.pressScale }] },
  labelProminent: { color: theme.color.textPrimary },
  bodyRegular: { fontFamily: theme.type.body },
  bodyBold: { fontFamily: theme.type.bodyBold, fontSize: 14, lineHeight: 20 },
  textLight: { color: theme.color.textPrimaryLight },
  textMutedLight: { color: theme.color.textSecondaryLight },
  more: { alignSelf: "flex-start", minHeight: theme.control.compact, marginTop: theme.spacing.sm, flexDirection: "row", alignItems: "center", gap: theme.spacing.xs },
  morePressed: { opacity: 0.72 },
  backdrop: { flex: 1, justifyContent: "flex-end", backgroundColor: "rgba(0,0,0,0.62)" },
  sheet: { paddingHorizontal: theme.spacing.xl, paddingTop: theme.spacing.sm, borderTopLeftRadius: theme.radius.xl, borderTopRightRadius: theme.radius.xl, borderWidth: 1, borderColor: theme.color.border, backgroundColor: theme.color.surfaceElevated },
  sheetLight: { borderColor: theme.color.borderLight, backgroundColor: theme.color.surfaceLightElevated },
  handle: { alignSelf: "center", width: 42, height: 5, marginBottom: theme.spacing.lg, borderRadius: theme.radius.pill, backgroundColor: theme.color.borderStrong },
  handleLight: { backgroundColor: "rgba(23,22,26,0.22)" },
  sheetHeader: { flexDirection: "row", alignItems: "center", gap: theme.spacing.md },
  sheetTitle: { fontFamily: theme.type.display, fontSize: 30, lineHeight: 36 },
  sheetHeading: { flex: 1, gap: theme.spacing.xxs },
  kicker: { letterSpacing: 1.6 },
  explanation: { marginTop: theme.spacing.md, maxWidth: 430, color: theme.color.textSecondary },
});
