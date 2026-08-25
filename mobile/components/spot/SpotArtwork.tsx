import { Ionicons } from "@expo/vector-icons";
import { Image } from "expo-image";
import { LinearGradient } from "expo-linear-gradient";
import { useEffect, useState } from "react";
import { ActivityIndicator, StyleSheet, Text, View, type StyleProp, type ViewStyle } from "react-native";

import { imageDiagnosticContext } from "../../lib/spot-images";
import { backyrdTheme as theme } from "../../theme/backyrd";

type Props = { spotId: string; spotName: string; imageUrl?: string | null; style?: StyleProp<ViewStyle>; accessibilityLabel?: string; priority?: "low" | "normal" | "high" };

export function SpotArtwork({ spotId, spotName, imageUrl, style, accessibilityLabel, priority = "normal" }: Props) {
  const [status, setStatus] = useState<"loading" | "loaded" | "error" | "empty">(imageUrl ? "loading" : "empty");
  useEffect(() => setStatus(imageUrl ? "loading" : "empty"), [imageUrl]);
  const fallbackVisible = status === "error" || status === "empty";

  return (
    <View style={[styles.root, style]}>
      {imageUrl ? (
        <Image
          accessibilityLabel={accessibilityLabel ?? `Foto von ${spotName}`}
          cachePolicy="memory-disk"
          contentFit="cover"
          onError={(event) => {
            setStatus("error");
            console.warn("Spot image failed", { spotId, ...imageDiagnosticContext(imageUrl), error: event.error });
          }}
          onLoad={() => setStatus("loaded")}
          onLoadStart={() => setStatus("loading")}
          priority={priority}
          recyclingKey={`${spotId}:${imageUrl}`}
          source={{ uri: imageUrl }}
          style={StyleSheet.absoluteFill}
          transition={180}
        />
      ) : null}
      {fallbackVisible ? (
        <LinearGradient colors={["#242126", "#111113", "#070708"]} style={StyleSheet.absoluteFill}>
          <View style={styles.fallbackPattern} />
          <Ionicons color="rgba(247,243,233,0.28)" name="location-outline" size={30} style={styles.fallbackIcon} />
          <Text numberOfLines={2} style={styles.fallbackName}>{spotName.toUpperCase()}</Text>
        </LinearGradient>
      ) : null}
      {status === "loading" ? <View accessibilityLabel="Bild wird geladen" style={styles.loading}><ActivityIndicator color={theme.color.pink} size="small" /></View> : null}
    </View>
  );
}

const styles = StyleSheet.create({
  root: { overflow: "hidden", backgroundColor: theme.color.surface },
  loading: { ...StyleSheet.absoluteFillObject, alignItems: "center", justifyContent: "center", backgroundColor: theme.color.surface },
  fallbackPattern: { position: "absolute", width: "145%", height: 92, left: "-18%", top: "38%", backgroundColor: "rgba(255,79,145,0.08)", transform: [{ rotate: "-11deg" }] },
  fallbackIcon: { position: "absolute", left: 18, top: 18 },
  fallbackName: { position: "absolute", left: 18, right: 18, bottom: 18, color: theme.color.textPrimary, fontFamily: theme.type.display, fontWeight: "900", fontSize: 34, lineHeight: 33, letterSpacing: -0.6 },
});
