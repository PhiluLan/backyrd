import React from "react";
import { StyleSheet, Text, useWindowDimensions, View } from "react-native";

import { AppText } from "./foundation/AppText";
import { useBackyrdTheme } from "../theme/backyrd";

export function HomeDisplayHeading({ title, accent }: { title: string; accent: string }) {
  const { color } = useBackyrdTheme();
  const { width } = useWindowDimensions();
  const label = `${title}${accent}`;
  const size = Math.max(42, Math.min(52, Math.round(width * 0.132)));
  const metrics = { fontSize: size, lineHeight: Math.round(size * 1.02), letterSpacing: -0.4 };

  return <View style={styles.container}>
    <AppText accessibilityLabel={label} numberOfLines={1} adjustsFontSizeToFit minimumFontScale={0.72} role="displayXL" style={[styles.title, metrics, { color: color.textPrimary }]}>{title}<Text style={{ color: color.pink }}>{accent}</Text></AppText>
  </View>;
}

const styles = StyleSheet.create({
  container: { flex: 1, minWidth: 0 },
  title: { color: "#F8F8F8" },
});
