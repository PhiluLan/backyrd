import React, { useState } from "react";
import { StyleSheet, Text, useWindowDimensions, View } from "react-native";

import { AppText } from "./foundation/AppText";
import { backyrdTheme as theme, useSFPro } from "../theme/backyrd";

export function HomeDisplayHeading({ title, accent, displayTitle }: { title: string; accent: string; displayTitle?: string }) {
  const { width } = useWindowDimensions();
  const [measured, setMeasured] = useState<{ baseSize: number; width: number } | null>(null);
  const label = `${title}${accent}`;
  // The longest Home section title sets one shared type size on each device.
  const referenceTitle = "Orte  in  deiner  Nähe,";
  const baseSize = Math.max(56, Math.min(72, Math.round(width * 0.18)));
  const availableWidth = width - 2 * theme.layout.pageGutter - 8;
  const size = measured?.baseSize === baseSize
    ? Math.max(28, Math.min(baseSize, Math.floor(baseSize * availableWidth / measured.width)))
    : baseSize;
  const metrics = { fontSize: size, lineHeight: Math.round(size * 1.06), letterSpacing: size * -0.075 };

  return <View style={styles.container}>
    {useSFPro ? <>
      <AppText accessible={false} importantForAccessibility="no-hide-descendants" pointerEvents="none" numberOfLines={1} role="displayXL" style={[styles.measure, styles.title, { fontSize: baseSize, lineHeight: Math.round(baseSize * 1.06), letterSpacing: baseSize * -0.075 }]} onTextLayout={event => {
        const measuredWidth = event.nativeEvent.lines[0]?.width ?? 0;
        if (measuredWidth > 0 && (measured?.baseSize !== baseSize || Math.abs(measured.width - measuredWidth) > 1)) {
          setMeasured({ baseSize, width: measuredWidth });
        }
      }}>{referenceTitle}</AppText>
      <AppText accessibilityLabel={label} numberOfLines={1} ellipsizeMode="tail" role="displayXL" style={[styles.title, metrics]}>{displayTitle ?? title}<Text style={styles.accent}>{accent}</Text></AppText>
    </> : <AppText role="sectionTitle">{title}<Text style={styles.accent}>{accent}</Text></AppText>}
  </View>;
}

const styles = StyleSheet.create({
  container: { flex: 1, minWidth: 0 },
  measure: { position: "absolute", left: 0, top: 0, width: 10000, opacity: 0 },
  title: { color: "#F8F8F8", fontWeight: "700" },
  accent: { color: theme.color.pink },
});
