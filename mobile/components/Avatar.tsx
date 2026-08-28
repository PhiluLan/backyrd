import React, { useEffect, useMemo, useState } from "react";
import { Image, StyleSheet, View } from "react-native";

import { backyrdTheme as theme } from "../theme/backyrd";
import { AppText } from "./foundation/AppText";

export default function Avatar({ uri, name, size = 36 }: { uri?: string | null; name?: string | null; size?: number }) {
  const [failed, setFailed] = useState(false);
  useEffect(() => setFailed(false), [uri]);
  const initials = useMemo(() => (name ?? "?")
    .trim()
    .split(/\s+/)
    .map((part) => part[0]?.toUpperCase())
    .slice(0, 2)
    .join("") || "?", [name]);
  const frame = { width: size, height: size, borderRadius: size / 2 };

  if (uri && !failed) {
    return <Image accessibilityLabel={`${name?.trim() || "Backyrd"} Profilbild`} onError={() => setFailed(true)} source={{ uri }} style={[styles.image, frame]} />;
  }
  return (
    <View accessibilityLabel={`${name?.trim() || "Backyrd"} Profilbild-Platzhalter`} style={[styles.fallback, frame]}>
      <AppText role="label" style={{ fontSize: Math.max(12, Math.round(size * 0.32)) }}>{initials}</AppText>
    </View>
  );
}

const styles = StyleSheet.create({
  image: { backgroundColor: theme.color.surfaceElevated, borderWidth: 1, borderColor: theme.color.border },
  fallback: { alignItems: "center", justifyContent: "center", backgroundColor: theme.color.surfaceElevated, borderWidth: 1, borderColor: theme.color.borderStrong },
});
