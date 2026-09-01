import { useMemo, useState } from "react";
import { Modal, Pressable, StyleSheet, View } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { useSafeAreaInsets } from "react-native-safe-area-context";

import { AppText } from "../foundation/AppText";
import { IconButton } from "../foundation/Button";
import { backyrdTheme as theme } from "../../theme/backyrd";

export type SpotMoodProfileItem = {
  concept_key: string;
  label: string;
  concept_contributors: number | null;
  eligible_contributors: number | null;
  percentage: number | null;
  evidence_state: "EARLY" | "ESTABLISHED";
  rank: number;
};

function strengthWidth(percentage: number | null) {
  const value = Number(percentage);
  if (!Number.isFinite(value)) return 0;
  return Math.max(12, Math.min(100, value));
}

function communityCopy(mood: SpotMoodProfileItem) {
  if (mood.evidence_state === "EARLY") {
    return "Ein erster Eindruck aus der Community. Noch ist die Grundlage zu klein für eine Gewichtung.";
  }
  if (mood.rank <= 2) {
    return "Dieser Mood gehört zu den zwei prägendsten Community-Eindrücken für diesen Ort.";
  }
  return "Dieser Mood taucht in den Community-Eindrücken zu diesem Ort wiederkehrend auf.";
}

export function SpotMoodProfile({ moods }: { moods: SpotMoodProfileItem[] }) {
  const insets = useSafeAreaInsets();
  const [showAll, setShowAll] = useState(false);
  const [selected, setSelected] = useState<SpotMoodProfileItem | null>(null);
  const early = moods[0]?.evidence_state === "EARLY";
  const visible = useMemo(() => (showAll ? moods : moods.slice(0, 5)), [moods, showAll]);

  return (
    <>
      {early ? (
        <AppText role="meta" tone="secondary" style={styles.earlyLabel}>
          Erste Eindrücke
        </AppText>
      ) : null}

      <View style={styles.wrap}>
        {visible.map((mood) => {
          const established = mood.evidence_state === "ESTABLISHED";
          const prominent = established && mood.rank <= 2;
          return (
            <Pressable
              key={mood.concept_key}
              accessibilityHint="Öffnet die Einordnung dieses Community-Moods"
              accessibilityLabel={`${mood.label}${prominent ? ", besonders prägender Community-Eindruck" : ""}`}
              accessibilityRole="button"
              onPress={() => setSelected(mood)}
              style={({ pressed }) => [
                styles.pill,
                prominent && styles.pillProminent,
                pressed && styles.pillPressed,
              ]}
            >
              <AppText
                role="label"
                tone={prominent ? "primary" : "secondary"}
                style={prominent ? styles.labelProminent : undefined}
              >
                {mood.label}
              </AppText>
              {established ? (
                <View accessibilityElementsHidden importantForAccessibility="no-hide-descendants" style={styles.strengthTrack}>
                  <View style={[styles.strengthLine, { width: `${strengthWidth(mood.percentage)}%` }]} />
                </View>
              ) : null}
            </Pressable>
          );
        })}
      </View>

      {moods.length > 5 ? (
        <Pressable
          accessibilityRole="button"
          accessibilityState={{ expanded: showAll }}
          onPress={() => setShowAll((current) => !current)}
          style={({ pressed }) => [styles.more, pressed && styles.morePressed]}
        >
          <AppText role="label" tone="pink">
            {showAll ? "Weniger anzeigen" : "Mehr anzeigen"}
          </AppText>
          <Ionicons
            name={showAll ? "chevron-up" : "chevron-down"}
            size={16}
            color={theme.color.pink}
          />
        </Pressable>
      ) : null}

      <Modal
        animationType="slide"
        onRequestClose={() => setSelected(null)}
        transparent
        visible={Boolean(selected)}
      >
        <View style={styles.backdrop}>
          <Pressable
            accessibilityLabel="Mood-Details schließen"
            accessibilityRole="button"
            onPress={() => setSelected(null)}
            style={StyleSheet.absoluteFill}
          />
          <View style={[styles.sheet, { paddingBottom: Math.max(insets.bottom, theme.spacing.xl) }]}>
            <View style={styles.handle} />
            <View style={styles.sheetHeader}>
              <View style={styles.sheetHeading}>
                <AppText role="caption" tone="lime" style={styles.kicker}>
                  COMMUNITY-EINDRUCK
                </AppText>
                <AppText role="sectionTitle">{selected?.label ?? "Mood"}</AppText>
              </View>
              <IconButton accessibilityLabel="Schließen" onPress={() => setSelected(null)}>
                <Ionicons name="close" size={21} color={theme.color.textPrimary} />
              </IconButton>
            </View>
            {selected ? (
              <AppText tone="secondary" style={styles.explanation}>
                {communityCopy(selected)}
              </AppText>
            ) : null}
            {selected?.evidence_state === "ESTABLISHED" && typeof selected.concept_contributors === "number" ? (
              <View style={styles.evidence}>
                <AppText role="cardTitle">{selected.concept_contributors}</AppText>
                <AppText role="meta" tone="secondary" style={styles.evidenceCopy}>
                  {selected.concept_contributors === 1
                    ? "Community-Stimme bildet die Grundlage."
                    : "Community-Stimmen bilden die Grundlage."}
                </AppText>
              </View>
            ) : null}
          </View>
        </View>
      </Modal>
    </>
  );
}

const styles = StyleSheet.create({
  earlyLabel: { marginBottom: theme.spacing.md },
  wrap: { flexDirection: "row", flexWrap: "wrap", gap: theme.spacing.sm },
  pill: {
    minHeight: theme.control.compact,
    minWidth: 92,
    justifyContent: "center",
    overflow: "hidden",
    paddingHorizontal: theme.spacing.lg,
    paddingBottom: theme.spacing.xs,
    paddingTop: theme.spacing.xs,
    borderRadius: theme.radius.pill,
    borderWidth: 1,
    borderColor: theme.color.border,
    backgroundColor: "rgba(255,255,255,0.045)",
  },
  pillProminent: {
    borderColor: "rgba(255,79,145,0.35)",
    backgroundColor: "rgba(255,79,145,0.085)",
  },
  pillPressed: { opacity: 0.78, transform: [{ scale: theme.motion.pressScale }] },
  labelProminent: { fontFamily: theme.type.bodyBold },
  strengthTrack: {
    position: "absolute",
    right: theme.spacing.lg,
    bottom: 6,
    left: theme.spacing.lg,
    height: 2,
    overflow: "hidden",
    borderRadius: theme.radius.pill,
    backgroundColor: "rgba(255,79,145,0.12)",
  },
  strengthLine: { height: 2, borderRadius: theme.radius.pill, backgroundColor: theme.color.pink },
  more: {
    alignSelf: "flex-start",
    minHeight: theme.control.compact,
    marginTop: theme.spacing.sm,
    flexDirection: "row",
    alignItems: "center",
    gap: theme.spacing.xs,
  },
  morePressed: { opacity: 0.72 },
  backdrop: { flex: 1, justifyContent: "flex-end", backgroundColor: "rgba(0,0,0,0.62)" },
  sheet: {
    paddingHorizontal: theme.spacing.xl,
    paddingTop: theme.spacing.sm,
    borderTopLeftRadius: 30,
    borderTopRightRadius: 30,
    borderWidth: 1,
    borderColor: theme.color.border,
    backgroundColor: theme.color.surfaceElevated,
  },
  handle: {
    alignSelf: "center",
    width: 42,
    height: 5,
    marginBottom: theme.spacing.lg,
    borderRadius: theme.radius.pill,
    backgroundColor: theme.color.borderStrong,
  },
  sheetHeader: { flexDirection: "row", alignItems: "center", gap: theme.spacing.md },
  sheetHeading: { flex: 1, gap: theme.spacing.xxs },
  kicker: { letterSpacing: 1.6 },
  explanation: { marginTop: theme.spacing.md, maxWidth: 430 },
  evidence: {
    marginTop: theme.spacing.xl,
    paddingTop: theme.spacing.lg,
    flexDirection: "row",
    alignItems: "baseline",
    gap: theme.spacing.sm,
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: theme.color.border,
  },
  evidenceCopy: { flex: 1 },
});
