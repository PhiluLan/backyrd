import React from "react";
import { ScrollView, StyleSheet, View } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { Ionicons } from "@expo/vector-icons";
import { AppText } from "../foundation/AppText";
import { Button } from "../foundation/Button";
import { presentMomentTags } from "../../lib/moment-presentation";
import { backyrdTheme as theme } from "../../theme/backyrd";

export function MomentShared({ placeName, moods, onViewPlace, onDone }: { placeName?: string | null; moods: string[]; onViewPlace: () => void; onDone: () => void }) {
  const labels = presentMomentTags(moods);
  return <SafeAreaView style={styles.screen}>
    <ScrollView style={{ flex: 1 }} contentContainerStyle={styles.content} accessibilityLiveRegion="polite">
      <Ionicons name="checkmark-circle-outline" color={theme.color.pink} size={48} />
      <AppText role="displayM">Dein Moment ist geteilt.</AppText>
      <AppText role="body" tone="secondary">{placeName ? `Danke für deinen Eindruck von ${placeName}.` : "Danke für deinen Eindruck."} Auf der Ortsseite kommen Momente und Moods zusammen.</AppText>
      {labels.length ? <AppText role="bodyStrong" tone="pink">{labels.join(" · ")}</AppText> : null}
    </ScrollView>
    <View style={styles.actions}><Button label="Zum Ort" onPress={onViewPlace} /><Button label="Zur Startseite" variant="tertiary" onPress={onDone} /></View>
  </SafeAreaView>;
}
const styles = StyleSheet.create({ screen: { flex: 1, backgroundColor: theme.color.background }, content: { flexGrow: 1, justifyContent: "center", padding: theme.layout.pageGutter, gap: theme.spacing.lg }, actions: { padding: theme.layout.pageGutter, gap: theme.spacing.sm } });
