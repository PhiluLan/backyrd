import { useRouter } from "expo-router";
import { ScrollView, StyleSheet, useWindowDimensions } from "react-native";
import { SpotPreviewCard } from "./spot/SpotPreviewCard";
import { HOME_RAIL, homeRailCardWidth } from "../lib/home-rail";
import type { LocationCoordinates } from "../lib/locationContext";
import type { DiscoverySpot } from "../lib/spot-images";
import type { SpotOpeningStatus } from "../lib/spot-opening-status";
import { haversineKm } from "../lib/utils/haversine";
import { backyrdTheme as theme } from "../theme/backyrd";

/** The same place card and rail geometry for all Home discovery entry points. */
export function HomeSpotRail({ spots, moods, moodCounts, location, label, openingStatuses, onVisibleArtworkReady }: {
  spots: readonly DiscoverySpot[];
  moods: Record<string, string[]>;
  moodCounts: Record<string, number | null | undefined>;
  location: LocationCoordinates | null;
  label: string;
  openingStatuses: Record<string, SpotOpeningStatus>;
  onVisibleArtworkReady?: (spotId: string) => void;
}) {
  const router = useRouter();
  const { width } = useWindowDimensions();
  const cardWidth = homeRailCardWidth(width, { minimum: 248, maximum: 356 });
  function meta(spot: DiscoverySpot) {
    if (location && spot.lat !== null && spot.lng !== null) {
      const distance = haversineKm(location, { latitude: spot.lat, longitude: spot.lng });
      return distance < 1 ? `${Math.round(distance * 1000)} m entfernt` : `${distance.toFixed(1)} km entfernt`;
    }
    return spot.city ?? spot.address;
  }
  return <ScrollView accessibilityLabel={label} horizontal contentContainerStyle={styles.cards}
    decelerationRate={HOME_RAIL.decelerationRate} disableIntervalMomentum={HOME_RAIL.disableIntervalMomentum}
    showsHorizontalScrollIndicator={false} snapToInterval={cardWidth + HOME_RAIL.gap}
    snapToOffsets={spots.map((_, index) => index * (cardWidth + HOME_RAIL.gap))}>
    {spots.map((spot, index) => <SpotPreviewCard key={spot.id} id={spot.id} name={spot.name} imageUrl={spot.header_photo_url}
      category={spot.category_name} context={meta(spot)} moods={moods[spot.id] ?? []} moodCount={moodCounts[spot.id]}
      status={openingStatuses[spot.id] ?? "unknown"} onPress={() => router.push(`/spot/${spot.id}` as never)} style={{ width: cardWidth }}
      priority={index < 2 ? "high" : "normal"} onArtworkReady={index < 2 && onVisibleArtworkReady ? () => onVisibleArtworkReady(spot.id) : undefined} />)}
  </ScrollView>;
}
const styles = StyleSheet.create({
  cards: { paddingTop: theme.spacing.lg, paddingHorizontal: HOME_RAIL.horizontalInset, gap: HOME_RAIL.gap },
});
