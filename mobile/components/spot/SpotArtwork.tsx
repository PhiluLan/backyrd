import { Image } from "expo-image";
import { LinearGradient } from "expo-linear-gradient";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { ActivityIndicator, Linking, Pressable, StyleSheet, View, type StyleProp, type ViewStyle } from "react-native";
import { ProductText as Text } from "../foundation/AppText";

import { useAuth } from "../../hooks/useAuth";
import { getGooglePlacePhotoFallback, type GooglePlacePhotoResult } from "../../lib/google-place-photo";
import { SPOT_PHOTO_POLICY } from "../../lib/spot-photo-policy";
import { imageDiagnosticContext, resolveCanonicalSpotImage, type CanonicalSpotImageProvenance } from "../../lib/spot-images";
import { backyrdTheme as theme } from "../../theme/backyrd";

type Props = { spotId: string; spotName: string; imageUrl?: string | null; style?: StyleProp<ViewStyle>; accessibilityLabel?: string; priority?: "low" | "normal" | "high"; showFallbackName?: boolean; attributionPosition?: "top" | "bottom"; onResolvedImage?: (image: { provenance: CanonicalSpotImageProvenance; identity: string }) => void; onArtworkReady?: () => void };

export function SpotArtwork({ spotId, spotName, imageUrl, style, accessibilityLabel, priority = "normal", showFallbackName = true, attributionPosition = "bottom", onResolvedImage, onArtworkReady }: Props) {
  const { session, user } = useAuth();
  const ownerImage = useMemo(() => resolveCanonicalSpotImage({ headerPhotoUrl: imageUrl }), [imageUrl]);
  const [googleImage, setGoogleImage] = useState<GooglePlacePhotoResult | null>(null);
  const [ownerImageFailed, setOwnerImageFailed] = useState(false);
  const authAccessToken = session?.access_token ?? null;
  const googlePlacePhotosEnabled = SPOT_PHOTO_POLICY.googlePlacePhotosEnabled;
  const [googleResolved, setGoogleResolved] = useState(Boolean(ownerImage.imageUrl) || !googlePlacePhotosEnabled);
  const googleRequestGeneration = useRef(0);
  const activeOwnerUrl = ownerImageFailed ? null : ownerImage.imageUrl;
  const activeUrl = activeOwnerUrl ?? googleImage?.imageUrl ?? null;
  const provenance: CanonicalSpotImageProvenance = activeOwnerUrl ? "OWNER_ADMIN" : googleImage?.imageUrl ? "GOOGLE_PLACES" : "BACKYRD_FALLBACK";
  const [status, setStatus] = useState<"loading" | "loaded" | "error" | "empty">("loading");

  const resolveGoogle = useCallback(async (preferredOwnerImageFailed: boolean, accessToken: string | null) => {
    const generation = ++googleRequestGeneration.current;
    if (!googlePlacePhotosEnabled) {
      setGoogleImage(null);
      setGoogleResolved(true);
      setStatus("empty");
      return;
    }
    setGoogleResolved(false);
    const result = await getGooglePlacePhotoFallback(spotId, {
      preferredOwnerImageFailed,
      accessToken,
      cacheNamespace: user?.id ?? null,
    });
    if (generation !== googleRequestGeneration.current) return;
    setGoogleImage(result?.source === "google" && result.imageUrl ? result : null);
    setGoogleResolved(true);
    setStatus(result?.source === "google" && result.imageUrl ? "loading" : "empty");
  }, [googlePlacePhotosEnabled, spotId, user?.id]);

  useEffect(() => {
    googleRequestGeneration.current += 1;
    setGoogleImage(null);
    setOwnerImageFailed(false);
    setGoogleResolved(Boolean(ownerImage.imageUrl) || !googlePlacePhotosEnabled || !authAccessToken);
    setStatus("loading");
    if (!ownerImage.imageUrl) {
      if (googlePlacePhotosEnabled && authAccessToken) {
        void resolveGoogle(false, authAccessToken);
      } else {
        setStatus("empty");
      }
    }
  }, [authAccessToken, googlePlacePhotosEnabled, ownerImage.imageUrl, resolveGoogle]);

  useEffect(() => {
    onResolvedImage?.({
      provenance,
      identity: ownerImage.imageUrl
        ? ownerImage.identity
        : googleImage?.imageIdentity ?? (googleImage?.imageUrl ? `google:${googleImage.imageUrl}` : "backyrd:fallback"),
    });
  }, [googleImage?.imageIdentity, googleImage?.imageUrl, onResolvedImage, ownerImage.identity, ownerImage.imageUrl, provenance]);

  const fallbackVisible = googleResolved && (status === "error" || status === "empty");
  const [displayedUrl, setDisplayedUrl] = useState<string | null>(null);
  useEffect(() => {
    if (fallbackVisible || (activeUrl && activeUrl === displayedUrl && status === "loaded")) onArtworkReady?.();
  }, [activeUrl, displayedUrl, fallbackVisible, onArtworkReady, status]);

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
              void resolveGoogle(true, authAccessToken);
              return;
            }
            setStatus("error");
          }}
          onLoad={() => setStatus("loaded")}
          onDisplay={onArtworkReady ? () => setDisplayedUrl(activeUrl) : undefined}
          onLoadStart={() => setStatus("loading")}
          priority={priority}
          recyclingKey={`${spotId}:${activeUrl}`}
          source={{ uri: activeUrl }}
          style={StyleSheet.absoluteFill}
          transition={180}
        />
      ) : null}
      {fallbackVisible ? (
        <LinearGradient accessible accessibilityLabel={`Grafische Ortskarte für ${spotName}`} colors={["#32232F", "#19171E", "#101114"]} style={StyleSheet.absoluteFill}>
          <View pointerEvents="none" accessible={false} accessibilityElementsHidden importantForAccessibility="no-hide-descendants" style={StyleSheet.absoluteFill}>
            <View style={styles.fallbackRing} />
            <View style={styles.fallbackRingInner} />
            <View style={styles.fallbackAccent} />
          </View>
          {showFallbackName ? <Text numberOfLines={2} style={styles.fallbackName}>{spotName}</Text> : null}
        </LinearGradient>
      ) : null}
      {status === "loading" || !googleResolved ? <View accessibilityLabel="Bild wird geladen" style={styles.loading}><ActivityIndicator color={theme.color.pink} size="small" /></View> : null}
      {provenance === "GOOGLE_PLACES" ? (
        <Pressable
          accessibilityLabel="Fotoquelle bei Google Maps öffnen"
          onPress={() => { if (googleImage?.googleMapsUri) void Linking.openURL(googleImage.googleMapsUri); }}
          style={[styles.googleAttribution, attributionPosition === "top" && { top: 12, bottom: undefined }]}
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
  googleAttribution: { minHeight: theme.control.compact, justifyContent: "center", position: "absolute", left: 8, right: 8, bottom: 8, alignSelf: "flex-start", maxWidth: "90%", paddingHorizontal: 7, paddingVertical: 4, borderRadius: 999, backgroundColor: "rgba(7,7,8,0.72)" },
  googleAttributionText: { color: "rgba(255,255,255,0.9)", ...theme.typeScale.caption },
  fallbackRing: { position: "absolute", width: 260, height: 260, right: -65, top: -95, borderRadius: 130, borderWidth: 1, borderColor: "rgba(255,186,210,0.20)" },
  fallbackRingInner: { position: "absolute", width: 190, height: 190, right: -30, top: -60, borderRadius: 95, borderWidth: 1, borderColor: "rgba(255,186,210,0.12)" },
  fallbackAccent: { position: "absolute", left: 22, top: 26, width: 32, height: 4, borderRadius: 2, backgroundColor: "#FF4F91" },
  fallbackName: { position: "absolute", left: 18, right: 18, bottom: 18, color: "#FFFFFF", fontFamily: theme.type.display, fontSize: 34, lineHeight: 38, letterSpacing: -0.6 },
});
