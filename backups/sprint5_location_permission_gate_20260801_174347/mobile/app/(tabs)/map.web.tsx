import React, { useEffect, useMemo, useState } from "react";
import {
  ActivityIndicator,
  Linking,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from "react-native";
import * as Location from "expo-location";
import { SafeAreaView } from "react-native-safe-area-context";
import { useRouter } from "expo-router";

import { useSpotsStore } from "../../lib/useSpotsStore";

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
  const { spots, loading, refresh } = useSpotsStore();

  const [search, setSearch] = useState("");
  const [coords, setCoords] = useState<Coords | null>(null);
  const [locating, setLocating] = useState(false);

  useEffect(() => {
    refresh();
  }, [refresh]);

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();

    const base = (spots || []).filter((s) => {
      if (!q) return true;
      return (
        s.name?.toLowerCase().includes(q) ||
        s.address?.toLowerCase().includes(q) ||
        s.categories?.name?.toLowerCase().includes(q)
      );
    });

    if (!coords) return base;

    return [...base].sort((a, b) => {
      const da = distanceKm(coords, { latitude: Number(a.lat), longitude: Number(a.lng) });
      const db = distanceKm(coords, { latitude: Number(b.lat), longitude: Number(b.lng) });
      return da - db;
    });
  }, [spots, search, coords]);

  async function locateMe() {
    setLocating(true);
    try {
      const permission = await Location.requestForegroundPermissionsAsync();
      if (permission.status !== "granted") return;

      const pos = await Location.getCurrentPositionAsync({ accuracy: Location.Accuracy.Balanced });
      setCoords({ latitude: pos.coords.latitude, longitude: pos.coords.longitude });
    } finally {
      setLocating(false);
    }
  }

  function openInMaps(spot: Spot) {
    const label = encodeURIComponent(spot.name ?? "Spot");
    const url = `https://www.google.com/maps/search/?api=1&query=${spot.lat},${spot.lng}&query_place_id=${label}`;
    Linking.openURL(url);
  }

  return (
    <SafeAreaView style={styles.safe}>
      <View style={styles.header}>
        <Text style={styles.title}>Karte (Web)</Text>
        <Text style={styles.subtitle}>
          Browser-Modus mit Spot-Liste, Suche und Distanzsortierung.
        </Text>
      </View>

      <View style={styles.toolbar}>
        <TextInput
          value={search}
          onChangeText={setSearch}
          placeholder="Suche nach Spot, Adresse oder Kategorie"
          placeholderTextColor="#8a8a93"
          style={styles.input}
        />

        <Pressable onPress={locateMe} style={styles.button}>
          <Text style={styles.buttonText}>{locating ? "Ortung..." : "Mein Standort"}</Text>
        </Pressable>
      </View>

      {loading ? (
        <View style={styles.center}>
          <ActivityIndicator color="#ffffff" />
        </View>
      ) : (
        <ScrollView contentContainerStyle={styles.list}>
          {filtered.map((spot) => {
            const km =
              coords == null
                ? null
                : distanceKm(coords, {
                    latitude: Number(spot.lat),
                    longitude: Number(spot.lng),
                  });

            return (
              <View key={spot.id} style={styles.card}>
                <View style={styles.cardMain}>
                  <Text style={styles.name}>{spot.name}</Text>
                  {!!spot.address && <Text style={styles.meta}>{spot.address}</Text>}
                  {!!spot.categories?.name && <Text style={styles.meta}>{spot.categories.name}</Text>}
                  {km != null && <Text style={styles.distance}>{km.toFixed(1)} km entfernt</Text>}
                </View>

                <View style={styles.actions}>
                  <Pressable
                    onPress={() => router.push(`/spot/${spot.id}`)}
                    style={[styles.button, styles.smallButton]}
                  >
                    <Text style={styles.buttonText}>Details</Text>
                  </Pressable>

                  <Pressable onPress={() => openInMaps(spot)} style={[styles.button, styles.smallButton]}>
                    <Text style={styles.buttonText}>In Maps</Text>
                  </Pressable>
                </View>
              </View>
            );
          })}

          {!filtered.length && <Text style={styles.empty}>Keine Spots gefunden.</Text>}
        </ScrollView>
      )}
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: "#0b0b0f" },
  header: { paddingHorizontal: 16, paddingTop: 12, paddingBottom: 6 },
  title: { color: "#fff", fontSize: 24, fontWeight: "700" },
  subtitle: { color: "#a2a2ad", marginTop: 4, fontSize: 13 },
  toolbar: {
    flexDirection: "row",
    gap: 10,
    paddingHorizontal: 16,
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
    backgroundColor: "#1f6feb",
    borderRadius: 10,
    paddingHorizontal: 12,
    paddingVertical: 10,
  },
  smallButton: {
    minWidth: 82,
    alignItems: "center",
  },
  buttonText: { color: "#fff", fontWeight: "600", fontSize: 13 },
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
  distance: { color: "#61dafb", marginTop: 3, fontSize: 12, fontWeight: "600" },
  actions: { flexDirection: "row", gap: 8 },
  empty: { color: "#888", textAlign: "center", marginTop: 20 },
});
