import React, { useState } from "react";
import { ActivityIndicator, Pressable, StyleSheet, View } from "react-native";
import { MoodSignature } from "./spot/MoodSignature";
import { AppText, ProductTextInput as TextInput } from "./foundation/AppText";
import { backyrdTheme as theme } from "../theme/backyrd";
import { useMoodCatalog } from "../lib/mood-catalog";
import { moodExpressionKey, toggleMoodExpression } from "../../packages/shared/src/presentation/mood";

export function MoodSelection({ values, onChange }: { values: readonly string[]; onChange: (values: string[]) => void }) {
  const [query, setQuery] = useState("");
  const [notice, setNotice] = useState("");
  const { options, state, retry } = useMoodCatalog(query);
  const selected = values.filter(v => v.trim());
  const exact = options.find(o => [o.label, o.matched_expression].some(v => moodExpressionKey(v) === moodExpressionKey(query)));
  function choose(expression: string) {
    const next = toggleMoodExpression(selected, expression);
    setNotice(next.full ? "Zwei Eindrücke sind ausgewählt. Entferne einen, um einen anderen zu wählen." : "");
    if (!next.full) { onChange(next.values); setQuery(""); }
  }
  return <View style={styles.root}>
    <View style={styles.heading}><AppText role="cardTitle" style={styles.title}>Deine Moods für diesen Ort</AppText><AppText role="meta" tone="pink">{selected.length}/2</AppText></View>
    <AppText role="meta" tone="secondary">Wähle bis zu zwei Begriffe, die deinen Besuch beschreiben.</AppText>
    {selected.length > 0 ? <MoodSignature labels={selected} onRemove={choose} /> : null}
    <TextInput accessibilityLabel="Mood suchen oder eigenen Eindruck eingeben" placeholder="Mood suchen oder selbst beschreiben" placeholderTextColor={theme.color.textMuted} value={query} onChangeText={setQuery} maxLength={40} style={styles.input} autoCorrect={false} />
    {state === "loading" ? <ActivityIndicator accessibilityLabel="Moods werden geladen" color={theme.color.pink} /> : null}
    {state === "error" ? <View style={styles.error}><AppText role="meta" tone="secondary">Die Vorschläge sind gerade nicht verfügbar. Deine Auswahl bleibt erhalten.</AppText><Pressable accessibilityRole="button" onPress={retry} style={styles.retry}><AppText tone="pink">Erneut laden</AppText></Pressable></View> : null}
    <View style={styles.chips}>{options.map(option => {
      const active = selected.some(value => moodExpressionKey(value) === moodExpressionKey(option.label));
      return <Pressable key={option.concept_key} accessibilityRole="button" accessibilityState={{ selected: active }} onPress={() => choose(option.label)} style={[styles.chip, active && styles.selected]}><AppText role="label" tone={active ? "primary" : "secondary"}>{active ? "✓ " : ""}{option.label}</AppText></Pressable>;
    })}</View>
    {query.trim() && !exact && state === "ready" ? <Pressable accessibilityRole="button" onPress={() => choose(query)} style={styles.custom}><AppText tone="pink">„{query.trim()}“ verwenden  +</AppText></Pressable> : null}
    {query.trim() && !exact ? <AppText role="meta" tone="secondary">Eigene Begriffe bleiben bei deinem Beitrag erhalten. Für das gemeinsame Mood-Bild werden sie zuerst geprüft.</AppText> : null}
    {notice ? <AppText accessibilityLiveRegion="polite" role="meta" tone="pink">{notice}</AppText> : null}
  </View>;
}
const styles = StyleSheet.create({
  root: { gap: 14 }, heading: { flexDirection: "row", alignItems: "center", gap: 12 }, title: { flex: 1 },
  chips: { flexDirection: "row", flexWrap: "wrap", gap: 9 },
  chip: { minHeight: 46, justifyContent: "center", paddingHorizontal: 16, paddingVertical: 10, borderRadius: theme.radius.pill, borderWidth: 1, borderColor: theme.color.border, backgroundColor: theme.color.surfaceElevated },
  selected: { borderColor: theme.color.pink, backgroundColor: "rgba(255,79,145,.13)" },
  input: { color: theme.color.textPrimary, backgroundColor: theme.color.background, minHeight: 52, paddingHorizontal: 16, borderWidth: 1, borderColor: theme.color.borderStrong, borderRadius: theme.radius.md, fontFamily: theme.type.body, fontSize: 15 },
  custom: { minHeight: 48, justifyContent: "center" }, error: { gap: 6 }, retry: { minHeight: 44, justifyContent: "center" },
});
