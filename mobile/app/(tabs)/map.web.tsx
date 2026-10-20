import React, { useEffect, useMemo, useState } from "react";
import { ActivityIndicator, Pressable, ScrollView, StyleSheet, View } from "react-native";
import { ProductText as Text, ProductTextInput as TextInput } from "../../components/foundation/AppText";
import * as Location from "expo-location";
import { hasActiveConsent } from "../../lib/consent";
import { SafeAreaView } from "react-native-safe-area-context";
import { useLocalSearchParams, useRouter } from "expo-router";

import { useSpotsStore } from "../../lib/useSpotsStore";
import { StateView } from "../../components/foundation/StateView";

import { spotMatchesSearch } from "../../lib/spot-search";
import { openInAppleMaps } from "../../lib/links";
import { withRequestDeadline } from "../../lib/requestDeadline";
import { SpotArtwork } from "../../components/spot/SpotArtwork";
import { loadSpotBrowseMoods } from "../../lib/mood-catalog";
import { backyrdTheme as theme } from "../../theme/backyrd";

type Coords = { latitude: number; longitude: number };

type Spot = {
  id: string;
  name: string;
  lat: number;
  lng: number;
  address?: string | null;
  category_id?: string | null;
  header_photo_url?: string | null;
  categories?: { name?: string | null; color?: string | null } | null;
};

function validPoint(spot: Spot) { return Number.isFinite(spot.lat) && Number.isFinite(spot.lng) && Math.abs(spot.lat) <= 90 && Math.abs(spot.lng) <= 180; }

function distanceKm(a: Coords, b: Coords) {
  const toRad = (x: number) => (x * Math.PI) / 180;
  const R = 6371;
  const dLat = toRad(b.latitude - a.latitude);
  const dLon = toRad(b.longitude - a.longitude);
  const lat1 = toRad(a.latitude);
  const lat2 = toRad(b.latitude);

  const h =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(lat1) * Math.cos(lat2) * Math.sin(dLon / 2) ** 2;

  return 2 * R * Math.atan2(Math.sqrt(h), Math.sqrt(1 - h));
}

export default function MapWebScreen() {
  const router = useRouter();
  const { spots, loading, error, refresh } = useSpotsStore();

  const params = useLocalSearchParams<{ search?: string; q?: string; mood?: string; spotIds?: string }>();
  const [search, setSearch] = useState(params.search ?? params.q ?? "");
  const [moods, setMoods] = useState<Record<string, string[]>>({});
  const [moodError, setMoodError] = useState(false);
  const [locationMessage, setLocationMessage] = useState<string | null>(null);
  useEffect(() => { setSearch(params.search ?? params.q ?? ""); }, [params.search, params.q]);
  useEffect(() => {
    let active = true;
    setMoodError(false);
    void loadSpotBrowseMoods(spots.map(spot => spot.id)).then(rows => {
      if (!active) return;
      const grouped: Record<string, string[]> = {};
      for (const row of rows) (grouped[row.spot_id] ??= []).push(row.label);
      setMoods(grouped);
    }).catch(() => { if (active) setMoodError(true); });
    return () => { active = false; };
  }, [spots]);
  const [coords, setCoords] = useState<Coords | null>(null);
  const [locating, setLocating] = useState(false);

  useEffect(() => {
    refresh();
  }, [refresh]);

  const filtered = useMemo(() => {
    const ids = params.spotIds?.split(",");
    const base = spots.filter(spot => (!ids || ids.includes(spot.id)) && spotMatchesSearch(spot, search, moods[spot.id]) && (!params.mood || (!moodError && spotMatchesSearch({name: (moods[spot.id] ?? []).join(" ")}, params.mood))));

    if (!coords) return base;

    return [...base].sort((a, b) => {
      const da = validPoint(a) ? distanceKm(coords, { latitude: a.lat, longitude: a.lng }) : Infinity;
      const db = validPoint(b) ? distanceKm(coords, { latitude: b.lat, longitude: b.lng }) : Infinity;
      return da - db;
    });
  }, [spots, search, coords, moods, params.mood, params.spotIds, moodError]);

  async function locateMe() {
    if (locating) return;
    setLocating(true);
    setLocationMessage(null);
    try {
      const consentGranted = await hasActiveConsent("precise_location", {
        forceRefresh: true,
      });
      if (!consentGranted) { setLocationMessage("Du kannst nach einem Ort suchen oder den Standort unter Datenschutz & Einwilligungen aktivieren."); return; }

      const permission = await Location.requestForegroundPermissionsAsync();
      if (permission.status !== "granted") { setLocationMessage("Standort nicht freigegeben. Suche einfach nach einem Ort oder einer Stadt."); return; }

      const pos = await withRequestDeadline(() => Location.getCurrentPositionAsync({ accuracy: Location.Accuracy.Balanced }), 8_000);
      setCoords({ latitude: pos.coords.latitude, longitude: pos.coords.longitude });
    } catch { setLocationMessage("Dein Standort ist gerade nicht erreichbar. Die Ortssuche funktioniert weiterhin."); } finally {
      setLocating(false);
    }
  }

  function openInMaps(spot: Spot) {
    void openInAppleMaps(validPoint(spot) ? spot.lat : null, validPoint(spot) ? spot.lng : null, spot.name, spot.address ?? undefined);
  }

  return (
    <SafeAreaView style={styles.safe}>
      <View style={styles.header}>
        <Text style={styles.title}>Orte entdecken</Text>
        <Text style={styles.subtitle}>
          Finde Orte nach Name, Stadt oder Atmosphäre.
        </Text>
      </View>

      <View style={styles.toolbar}>
        <TextInput
          accessibilityLabel="Orte suchen"
          value={search}
          onChangeText={setSearch}
          placeholder="Ort, Stadt oder Atmosphäre suchen"
          placeholderTextColor="#8a8a93"
          style={styles.input}
        />

        <Pressable accessibilityRole="button" accessibilityState={{ busy: locating, disabled: locating }} disabled={locating} onPress={locateMe} style={styles.button}>
          <Text style={styles.buttonText}>{locating ? "Wird gesucht …" : "Mein Standort"}</Text>
        </Pressable>
      </View>

      {locationMessage ? <Text accessibilityLiveRegion="polite" style={styles.feedback}>{locationMessage}</Text> : null}
      {params.mood && moodError ? <Text accessibilityRole="alert" style={styles.feedback}>Die Atmosphäre konnte gerade nicht geladen werden. Bitte lade die Orte erneut.</Text> : null}
      {loading ? (
        <View style={styles.center}>
          <ActivityIndicator color="#ffffff" />
        </View>
      ) : error ? (
        <View style={styles.center}>
          <StateView kind="error" title="Orte gerade nicht verfügbar" message="Bitte versuche es erneut." actionLabel="Erneut laden" onAction={() => void refresh()} />
        </View>
      ) : (
        <ScrollView contentContainerStyle={styles.list}>
          {filtered.map((spot) => {
            const km =
              coords == null || !validPoint(spot)
                ? null
                : distanceKm(coords, {
                    latitude: Number(spot.lat),
                    longitude: Number(spot.lng),
                  });

            return (
              <View key={spot.id} style={styles.card}>
                <SpotArtwork spotId={spot.id} spotName={spot.name} imageUrl={spot.header_photo_url} style={{height: 160, borderRadius: theme.radius.md}} showFallbackName={false} />
                <View style={styles.cardMain}>
                  <Text style={styles.name}>{spot.name}</Text>
                  {!!spot.address && <Text style={styles.meta}>{spot.address}</Text>}
                  {!!spot.categories?.name && <Text style={styles.meta}>{spot.categories.name}</Text>}
                  {km != null && <Text style={styles.distance}>{km.toFixed(1)} km entfernt</Text>}
                </View>

                <View style={styles.actions}>
                  <Pressable accessibilityRole="button" accessibilityLabel={`${spot.name} öffnen`}
                    onPress={() => router.push(`/spot/${spot.id}`)}
                    style={[styles.button, styles.smallButton]}
                  >
                    <Text style={styles.buttonText}>Details</Text>
                  </Pressable>

                  <Pressable accessibilityRole="button" accessibilityLabel={`Route zu ${spot.name}`} onPress={() => openInMaps(spot)} style={[styles.button, styles.smallButton]}>
                    <Text style={styles.buttonText}>In Maps</Text>
                  </Pressable>
                </View>
              </View>
            );
          })}

          {!filtered.length && <Text style={styles.empty}>Keine passenden Orte. Versuche einen anderen Namen oder eine Stadt.</Text>}
        </ScrollView>
      )}
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  feedback: { color: theme.color.textSecondary, margin: 16, fontSize: 14, lineHeight: 21 },
  safe: { flex: 1, backgroundColor: "#0b0b0f" },
  header: { paddingHorizontal: 24, paddingTop: 12, paddingBottom: 6 },
  title: { color: "#fff", fontSize: 24, fontWeight: "700" },
  subtitle: { color: "#a2a2ad", marginTop: 4, fontSize: 13 },
  toolbar: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 10,
    paddingHorizontal: 24,
    paddingBottom: 8,
    alignItems: "center",
  },
  input: {
    flex: 1,
    backgroundColor: "#17171c",
    color: "#fff",
    borderRadius: 10,
    paddingHorizontal: 12,
    paddingVertical: 10,
    borderWidth: 1,
    borderColor: "#2f2f38",
  },
  button: {
    backgroundColor: theme.color.pink, minHeight: 44, justifyContent: "center",
    borderRadius: 10,
    paddingHorizontal: 12,
    paddingVertical: 10,
  },
  smallButton: {
    minWidth: 82,
    alignItems: "center",
  },
  buttonText: { color: theme.color.background, fontWeight: "600", fontSize: 13 },
  center: { flex: 1, alignItems: "center", justifyContent: "center" },
  list: { padding: 16, gap: 12, paddingBottom: 120 },
  card: {
    borderRadius: 14,
    borderWidth: 1,
    borderColor: "#2a2a34",
    backgroundColor: "#141419",
    padding: 12,
    gap: 10,
  },
  cardMain: { gap: 2 },
  name: { color: "#fff", fontSize: 16, fontWeight: "700" },
  meta: { color: "#b1b1ba", fontSize: 13 },
  distance: { color: theme.color.textSecondary, marginTop: 3, fontSize: 12, fontWeight: "600" },
  actions: { flexDirection: "row", gap: 8 },
  empty: { color: "#888", textAlign: "center", marginTop: 20 },
});
