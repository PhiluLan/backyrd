import React from "react";
import { StyleSheet, View } from "react-native";
import { AppText } from "./foundation/AppText";

export function HomeDisplayHeading({ title, accent }: { title: string; accent: string }) {
  return <View style={styles.container}><AppText accessibilityRole="header" role="sectionTitle" style={styles.title}>{title}<AppText role="sectionTitle" tone="pink" style={styles.title}>{accent}</AppText></AppText></View>;
}
const styles = StyleSheet.create({
  container: { flex: 1, minWidth: 0 },
  title: { fontSize: 26, lineHeight: 34, letterSpacing: -0.5 },
});
