import { Ionicons } from "@expo/vector-icons";
import type { ReactNode } from "react";
import { Pressable, StyleSheet, Text, View } from "react-native";

import { backyrdTheme as theme } from "../../theme/backyrd";

export function MarkerStroke({ width = 184, inset = 20 }: { width?: number; inset?: number }) {
  return (
    <View accessibilityElementsHidden importantForAccessibility="no-hide-descendants" style={[styles.marker, { width, marginLeft: inset }]}>
      <View style={[styles.markerLine, styles.markerOne]} />
      <View style={[styles.markerLine, styles.markerTwo]} />
      <View style={[styles.markerLine, styles.markerThree]} />
    </View>
  );
}

export function EditorialSectionHeader({ index, title, actionLabel, onAction }: { index?: string; title: string; actionLabel?: string; onAction?: () => void }) {
  return (
    <View style={styles.sectionHeader}>
      <View style={styles.sectionTitleRow}>
        {index ? <Text style={styles.sectionIndex}>{index}</Text> : null}
        <Text style={styles.sectionTitle}>{title}</Text>
      </View>
      {actionLabel && onAction ? (
        <Pressable accessibilityRole="button" hitSlop={10} onPress={onAction} style={styles.sectionAction}>
          <Text style={styles.sectionActionText}>{actionLabel}</Text>
          <Ionicons color={theme.color.acid} name="arrow-forward" size={17} />
        </Pressable>
      ) : null}
    </View>
  );
}

export function EditorialRule() {
  return <View style={styles.rule}><View style={styles.rulePrimary} /><View style={styles.ruleSecondary} /></View>;
}

export function EditorialMeta({ children }: { children: ReactNode }) {
  return <Text style={styles.meta}>{children}</Text>;
}

const styles = StyleSheet.create({
  marker: { height: 11, position: "relative" },
  markerLine: { position: "absolute", left: 0, right: 0, backgroundColor: theme.color.pink },
  markerOne: { top: 1, height: 5, transform: [{ rotate: "-1.4deg" }] },
  markerTwo: { left: 4, right: 6, top: 5, height: 3, opacity: 0.92, transform: [{ rotate: "0.8deg" }] },
  markerThree: { left: 11, right: 2, top: 8, height: 2, opacity: 0.72, transform: [{ rotate: "-0.5deg" }] },
  sectionHeader: { minHeight: 44, paddingHorizontal: 22, flexDirection: "row", alignItems: "center", justifyContent: "space-between", gap: 12 },
  sectionTitleRow: { flex: 1, flexDirection: "row", alignItems: "baseline", gap: 12 },
  sectionIndex: { color: theme.color.pink, fontFamily: theme.type.bodyMedium, fontSize: 17, letterSpacing: -0.4 },
  sectionTitle: { flexShrink: 1, color: theme.color.textPrimary, fontFamily: theme.type.bodyMedium, fontSize: 18, letterSpacing: -0.35, textTransform: "uppercase" },
  sectionAction: { minHeight: 44, flexDirection: "row", alignItems: "center", gap: 7 },
  sectionActionText: { color: theme.color.acid, fontFamily: theme.type.bodyMedium, fontSize: 13, letterSpacing: 0.3, textTransform: "uppercase" },
  rule: { height: 9, justifyContent: "center" },
  rulePrimary: { height: 2, backgroundColor: theme.color.pink, transform: [{ rotate: "0.35deg" }] },
  ruleSecondary: { marginTop: 2, marginHorizontal: 5, height: 1, backgroundColor: theme.color.pink, opacity: 0.58, transform: [{ rotate: "-0.25deg" }] },
  meta: { color: theme.color.acid, fontFamily: theme.type.bodyMedium, fontSize: 14, lineHeight: 19, letterSpacing: 0.7, textTransform: "uppercase" },
});
