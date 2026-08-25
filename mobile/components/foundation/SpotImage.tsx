import React, { useEffect, useState } from "react";
import { ActivityIndicator, StyleSheet, View, type StyleProp, type ViewStyle } from "react-native";
import { Image } from "expo-image";
import { LinearGradient } from "expo-linear-gradient";

import { backyrdTheme as theme } from "../../theme/backyrd";
import { AppText } from "./AppText";

type Props = { spotName: string; uri?: string | null; style?: StyleProp<ViewStyle>; overlay?: boolean; accessibilityLabel?: string };

export function SpotImage({ spotName, uri, style, overlay = false, accessibilityLabel }: Props) {
  const [status, setStatus] = useState<"loading" | "loaded" | "fallback">(uri ? "loading" : "fallback");
  useEffect(() => setStatus(uri ? "loading" : "fallback"), [uri]);
  return <View accessible accessibilityLabel={accessibilityLabel ?? `Foto von ${spotName}`} style={[styles.root, style]}>
    {uri ? <Image source={{ uri }} contentFit="cover" cachePolicy="memory-disk" transition={theme.motion.image} onLoad={() => setStatus("loaded")} onError={() => setStatus("fallback")} style={StyleSheet.absoluteFill} /> : null}
    {status === "fallback" ? <LinearGradient colors={["#28242A", "#111113", "#070708"]} style={StyleSheet.absoluteFill}><View style={styles.mark} /><AppText numberOfLines={2} role="displayM" style={styles.fallbackName}>{spotName.toUpperCase()}</AppText></LinearGradient> : null}
    {status === "loading" ? <View accessibilityLabel="Bild wird geladen" style={styles.loading}><ActivityIndicator color={theme.color.pink} /></View> : null}
    {overlay ? <LinearGradient pointerEvents="none" colors={["rgba(0,0,0,0.02)", "rgba(0,0,0,0.72)"]} style={StyleSheet.absoluteFill} /> : null}
  </View>;
}

const styles = StyleSheet.create({ root: { overflow: "hidden", backgroundColor: theme.color.surface }, loading: { ...StyleSheet.absoluteFillObject, alignItems: "center", justifyContent: "center", backgroundColor: theme.color.surface }, mark: { position: "absolute", width: "145%", height: 82, left: "-18%", top: "40%", backgroundColor: "rgba(255,125,167,0.1)", transform: [{ rotate: "-11deg" }] }, fallbackName: { position: "absolute", left: 18, right: 18, bottom: 18 }, });
