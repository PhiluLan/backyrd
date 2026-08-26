import { Ionicons } from "@expo/vector-icons";
import { Image } from "expo-image";
import { LinearGradient } from "expo-linear-gradient";
import { useCallback, useEffect, useMemo, useState } from "react";
import { ActivityIndicator, Linking, Pressable, StyleSheet, Text, View, type StyleProp, type ViewStyle } from "react-native";

import { getGooglePlacePhotoFallback, type GooglePlacePhotoResult } from "../../lib/google-place-photo";
import { imageDiagnosticContext, resolveCanonicalSpotImage, type CanonicalSpotImageProvenance } from "../../lib/spot-images";
import { backyrdTheme as theme } from "../../theme/backyrd";

type Props = { spotId: string; spotName: string; imageUrl?: string | null; style?: StyleProp<ViewStyle>; accessibilityLabel?: string; priority?: "low" | "normal" | "high"; onResolvedImage?: (image: { provenance: CanonicalSpotImageProvenance; identity: string }) => void };

export function SpotArtwork({ spotId, spotName, imageUrl, style, accessibilityLabel, priority = "normal", onResolvedImage }: Props) {
  const ownerImage = useMemo(() => resolveCanonicalSpotImage({ headerPhotoUrl: imageUrl }), [imageUrl]);
  const [googleImage, setGoogleImage] = useState<GooglePlacePhotoResult | null>(null);
  const [ownerImageFailed, setOwnerImageFailed] = useState(false);
  const [googleResolved, setGoogleResolved] = useState(Boolean(ownerImage.imageUrl));
  const activeOwnerUrl = ownerImageFailed ? null : ownerImage.imageUrl;
  const activeUrl = activeOwnerUrl ?? googleImage?.imageUrl ?? null;
  const provenance: CanonicalSpotImageProvenance = activeOwnerUrl ? "OWNER_ADMIN" : googleImage?.imageUrl ? "GOOGLE_PLACES" : "BACKYRD_FALLBACK";
  const [status, setStatus] = useState<"loading" | "loaded" | "error" | "empty">("loading");

  const resolveGoogle = useCallback(async (preferredOwnerImageFailed: boolean) => {
    setGoogleResolved(false);
    const result = await getGooglePlacePhotoFallback(spotId, { preferredOwnerImageFailed });
    setGoogleImage(result?.source === "google" && result.imageUrl ? result : null);
    setGoogleResolved(true);
    setStatus(result?.source === "google" && result.imageUrl ? "loading" : "empty");
  }, [spotId]);

  useEffect(() => {
    setGoogleImage(null);
    setOwnerImageFailed(false);
    setGoogleResolved(Boolean(ownerImage.imageUrl));
    setStatus("loading");
    if (!ownerImage.imageUrl) void resolveGoogle(false);
  }, [ownerImage.imageUrl, resolveGoogle]);

  useEffect(() => {
    onResolvedImage?.({
      provenance,
      identity: ownerImage.imageUrl
        ? ownerImage.identity
        : googleImage?.imageIdentity ?? (googleImage?.imageUrl ? `google:${googleImage.imageUrl}` : "backyrd:fallback"),
    });
  }, [googleImage?.imageIdentity, googleImage?.imageUrl, onResolvedImage, ownerImage.identity, ownerImage.imageUrl, provenance]);

  const fallbackVisible = googleResolved && (status === "error" || status === "empty");

  return (
    <View style={[styles.root, style]}>
      {activeUrl ? (
        <Image
          accessibilityLabel={accessibilityLabel ?? `Foto von ${spotName}`}
          cachePolicy="memory-disk"
          contentFit="cover"
          onError={(event) => {
            console.warn("Spot image failed", { spotId, ...imageDiagnosticContext(activeUrl), error: event.error });
            if (provenance === "OWNER_ADMIN") {
              setOwnerImageFailed(true);
              void resolveGoogle(true);
              return;
            }
            setStatus("error");
          }}
          onLoad={() => setStatus("loaded")}
          onLoadStart={() => setStatus("loading")}
          priority={priority}
          recyclingKey={`${spotId}:${activeUrl}`}
          source={{ uri: activeUrl }}
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
      {status === "loading" || !googleResolved ? <View accessibilityLabel="Bild wird geladen" style={styles.loading}><ActivityIndicator color={theme.color.pink} size="small" /></View> : null}
      {provenance === "GOOGLE_PLACES" ? (
        <Pressable
          accessibilityLabel="Fotoquelle bei Google Maps öffnen"
          onPress={() => { if (googleImage?.googleMapsUri) void Linking.openURL(googleImage.googleMapsUri); }}
          style={styles.googleAttribution}
        >
          <Text numberOfLines={1} style={styles.googleAttributionText}>
            {googleImage?.authorAttributions?.[0]?.displayName ? `Foto: ${googleImage.authorAttributions[0].displayName} · Google Maps` : "Foto · Google Maps"}
          </Text>
        </Pressable>
      ) : null}
    </View>
  );
}

/** Canonical product image primitive. Alias preserves existing Product image call sites. */
export const SpotImage = SpotArtwork;

const styles = StyleSheet.create({
  root: { overflow: "hidden", backgroundColor: theme.color.surface },
  loading: { ...StyleSheet.absoluteFillObject, alignItems: "center", justifyContent: "center", backgroundColor: theme.color.surface },
  googleAttribution: { position: "absolute", left: 8, right: 8, bottom: 8, alignSelf: "flex-start", maxWidth: "90%", paddingHorizontal: 7, paddingVertical: 4, borderRadius: 999, backgroundColor: "rgba(7,7,8,0.72)" },
  googleAttributionText: { color: "rgba(255,255,255,0.9)", fontSize: 9, lineHeight: 12 },
  fallbackPattern: { position: "absolute", width: "145%", height: 92, left: "-18%", top: "38%", backgroundColor: "rgba(255,79,145,0.08)", transform: [{ rotate: "-11deg" }] },
  fallbackIcon: { position: "absolute", left: 18, top: 18 },
  fallbackName: { position: "absolute", left: 18, right: 18, bottom: 18, color: theme.color.textPrimary, fontFamily: theme.type.display, fontWeight: "900", fontSize: 34, lineHeight: 33, letterSpacing: -0.6 },
});
