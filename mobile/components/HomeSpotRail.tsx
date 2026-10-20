import { LinearGradient } from "expo-linear-gradient";
import { useRouter } from "expo-router";
import { Pressable, ScrollView, StyleSheet, useWindowDimensions, View } from "react-native";
import { AppText } from "./foundation/AppText";
import { MoodSignature, moodCountDescription } from "./spot/MoodSignature";
import { OpeningStatusBadge } from "./spot/OpeningStatusBadge";
import { SpotArtwork } from "./spot/SpotArtwork";
import { HOME_RAIL, homeRailCardWidth } from "../lib/home-rail";
import type { LocationCoordinates } from "../lib/locationContext";
import type { DiscoverySpot } from "../lib/spot-images";
import type { SpotOpeningStatus } from "../lib/spot-opening-status";
import { haversineKm } from "../lib/utils/haversine";
import { backyrdTheme as theme } from "../theme/backyrd";

/** The same place card and rail geometry for all Home discovery entry points. */
export function HomeSpotRail({ spots, moods, moodCounts, location, label, openingStatuses }: {
  spots: readonly DiscoverySpot[];
  moods: Record<string, string[]>;
  moodCounts: Record<string, number | null | undefined>;
  location: LocationCoordinates | null;
  label: string;
  openingStatuses: Record<string, SpotOpeningStatus>;
}) {
  const router = useRouter();
  const { width } = useWindowDimensions();
  const cardWidth = homeRailCardWidth(width, { minimum: 248, maximum: 356 });
  const cardHeight = Math.round(cardWidth * 1.08);
  function meta(spot: DiscoverySpot) {
    if (location && spot.lat !== null && spot.lng !== null) {
      const distance = haversineKm(location, { latitude: spot.lat, longitude: spot.lng });
      return `${spot.category_name ?? "Ort"} · ${distance < 1 ? `${Math.round(distance * 1000)} m` : `${distance.toFixed(1)} km`}`;
    }
    return [spot.category_name, spot.city ?? spot.address].filter(Boolean).join(" · ");
  }
  return <ScrollView accessibilityLabel={label} horizontal contentContainerStyle={styles.cards}
    decelerationRate={HOME_RAIL.decelerationRate} disableIntervalMomentum={HOME_RAIL.disableIntervalMomentum}
    showsHorizontalScrollIndicator={false} snapToInterval={cardWidth + HOME_RAIL.gap}
    snapToOffsets={spots.map((_, index) => index * (cardWidth + HOME_RAIL.gap))}>
    {spots.map((spot, index) => <Pressable accessibilityRole="button"
      accessibilityLabel={`${spot.name} öffnen${moods[spot.id]?.length ? `. Moods: ${moods[spot.id].slice(0, 3).join(", ")}` : ""}${moodCountDescription(moodCounts[spot.id]) ? `. ${moodCountDescription(moodCounts[spot.id])}` : ""}`}
      key={spot.id} onPress={() => router.push(`/spot/${spot.id}` as never)}
      style={({ pressed }) => [styles.card, { width: cardWidth, minHeight: cardHeight, paddingTop: theme.spacing.display * 2 }, pressed && styles.pressed]}>
      <SpotArtwork imageUrl={spot.header_photo_url} priority={index < 2 ? "high" : "normal"} spotId={spot.id} spotName={spot.name} showFallbackName={false} style={StyleSheet.absoluteFill} />
      <LinearGradient colors={["rgba(5,5,5,0.02)", "rgba(5,5,5,0.18)", "rgba(5,5,5,0.92)"]} locations={[0.2, 0.54, 1]} style={StyleSheet.absoluteFill} />
      <OpeningStatusBadge status={openingStatuses[spot.id] ?? "unknown"} style={styles.statusPill} />
      <View style={styles.cardContent}>
        <LinearGradient pointerEvents="none" colors={["rgba(5,5,5,0)", "rgba(5,5,5,0.32)", "rgba(5,5,5,0.56)"]} locations={[0, 0.3, 1]} style={[StyleSheet.absoluteFill, styles.textScrim]} />
        <AppText role="displayM" style={styles.name}>{spot.name}</AppText>
        <MoodSignature labels={moods[spot.id] ?? []} moodCount={moodCounts[spot.id]} compact />
        <AppText role="meta" style={styles.meta}>{meta(spot)}</AppText>
      </View>
    </Pressable>)}
  </ScrollView>;
}
const styles = StyleSheet.create({
  cards: { paddingTop: theme.spacing.lg, paddingHorizontal: HOME_RAIL.horizontalInset, gap: HOME_RAIL.gap },
  card: { overflow: "hidden", borderRadius: theme.radius.xl, justifyContent: "flex-end", backgroundColor: theme.color.surface },
  cardContent: { paddingHorizontal: theme.spacing.lg, paddingBottom: theme.spacing.lg },
  statusPill: { position: "absolute", top: theme.spacing.md, left: theme.spacing.md, maxWidth: "88%", zIndex: 1 },
  textScrim: { top: -36 },
  name: { color: theme.color.textPrimary },
  meta: { marginTop: 8, color: "rgba(246,240,232,0.78)" },
  pressed: { opacity: 0.9, transform: [{ scale: theme.motion.pressScale }] },
});
