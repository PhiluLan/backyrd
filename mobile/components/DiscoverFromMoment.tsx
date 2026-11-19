import React from "react";
import { Pressable, StyleSheet } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { useRouter } from "expo-router";
import { AppText } from "./foundation/AppText";
import { useAuth } from "../hooks/useAuth";
import { atmosphereWish } from "../lib/discovery-journey";
import { presentMomentTags } from "../lib/moment-presentation";
import { backyrdTheme as theme } from "../theme/backyrd";

/** A person's impressions start an editable wish, never a claim about another place. */
export function DiscoverFromMoment({ moods, city, category, compact = false, onNavigate }: { moods: string[]; city?: string | null; category?: string | null; compact?: boolean; onNavigate?: () => void }) {
  const router = useRouter();
  const { user } = useAuth();
  const labels = presentMomentTags(moods).slice(0, 2);
  if (!labels.length && !category) return null;
  return <Pressable accessibilityRole="button" accessibilityLabel="Ähnliche Orte finden" accessibilityHint={labels.length ? `Neue Suche mit ${labels.join(" und ")}` : "Öffnet eine neue Ortssuche"} onPress={() => {
    onNavigate?.();
    if (user) router.push({ pathname: "/(tabs)/wohin", params: { query: atmosphereWish(labels, city, category), auto: "1" } });
    else router.push({ pathname: "/(tabs)/map", params: { view: "list", mood: labels[0] ?? "", search: labels.length ? "" : category ?? "" } });
  }} style={[styles.action, compact && styles.compact]}>
    <AppText role={compact ? "meta" : "label"} tone={compact ? "secondary" : "pink"} style={{ flexShrink: 1 }}>{compact ? "Ähnliche Orte" : "Ähnliche Orte finden"}</AppText><Ionicons name="arrow-forward" color={compact ? theme.color.textSecondary : theme.color.pink} size={compact ? 15 : 18} />
  </Pressable>;
}
const styles = StyleSheet.create({ action: { minHeight: 48, flexDirection: "row", alignItems: "center", alignSelf: "flex-start", gap: theme.spacing.sm, paddingVertical: theme.spacing.sm }, compact: { minHeight: 44, paddingVertical: 10 } });
