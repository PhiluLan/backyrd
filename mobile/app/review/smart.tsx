// mobile/app/review/smart.tsx
import React, { useEffect, useState, useMemo } from "react";
import {
  View,
  Text,
  Pressable,
  StyleSheet,
  ActivityIndicator,
  Image,
  Alert,
} from "react-native";
import * as ImagePicker from "expo-image-picker";
import * as Location from "expo-location";
import { useRouter, useLocalSearchParams } from "expo-router";
import { SafeAreaView } from "react-native-safe-area-context";
import { Ionicons } from "@expo/vector-icons";
import { supabase } from "../../lib/supabase";
import { reverseGeocode } from "../../lib/geocode";

// einfache Theme-Helpers (du kannst dein theme importieren)
const theme = {
  colors: {
    background: "#0A0A0B",
    text: "#fff",
    textMuted: "#A6A8AD",
    primary: "#0EA5E9",
    card: "#15151A",
    border: "#2A2A33",
    success: "#22C55E",
  },
  radius: { lg: 16, pill: 999 },
  spacing: (n: number) => n * 8,
};

type SpotRow = {
  id: string;
  name: string;
  address?: string | null;
  lat: number;
  lng: number;
  status: "approved" | "pending";
};

// Haversine (km)
function haversineKm(lat1: number, lon1: number, lat2: number, lon2: number) {
  const R = 6371;
  const dLat = ((lat2 - lat1) * Math.PI) / 180;
  const dLon = ((lon2 - lon1) * Math.PI) / 180;
  const a =
    Math.sin(dLat / 2) ** 2 +
    Math.cos((lat1 * Math.PI) / 180) *
      Math.cos((lat2 * Math.PI) / 180) *
      Math.sin(dLon / 2) ** 2;
  return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
}

export default function SmartReviewScreen() {
  const router = useRouter();
  const params = useLocalSearchParams<{ spotId?: string }>();
  const [photoUri, setPhotoUri] = useState<string | null>(null);
  const [coords, setCoords] = useState<{ lat: number; lon: number } | null>(null);
  const [nearest, setNearest] = useState<SpotRow | null>(null);
  const [searching, setSearching] = useState(false);
  const [loading, setLoading] = useState(false);

  // 1) Kamera + Standort Permissions holen und sofort starten
  useEffect(() => {
    (async () => {
      // Kamera
      const cam = await ImagePicker.requestCameraPermissionsAsync();
      if (cam.status !== "granted") {
        Alert.alert("Kamera nötig", "Bitte erlaube den Kamerazugriff.");
        router.back();
        return;
      }
      // Standort
      const locPerm = await Location.requestForegroundPermissionsAsync();
      if (locPerm.status !== "granted") {
        Alert.alert("Standort nötig", "Bitte erlaube den Standortzugriff.");
        router.back();
        return;
      }

      // Kamera öffnen
      const result = await ImagePicker.launchCameraAsync({
        mediaTypes: ImagePicker.MediaTypeOptions.Images,
        quality: 0.85,
      });
      if (result.canceled || result.assets.length === 0) {
        router.back();
        return;
      }
      setPhotoUri(result.assets[0].uri);

      // Standort holen
      const position = await Location.getCurrentPositionAsync({});
      const lat = position.coords.latitude;
      const lon = position.coords.longitude;
      setCoords({ lat, lon });

      // Nächsten Spot suchen
      setSearching(true);
      try {
        // Kandidaten (z.B. 200) laden und clientseitig filtern
        const { data: spots, error } = await supabase
          .from("spots")
          .select("id,name,address,lat,lng,status")
          .eq("status", "approved")
          .limit(200);

        if (error) throw error;

        let nearestSpot: SpotRow | null = null;
        let nearestDist = Number.POSITIVE_INFINITY;
        for (const s of spots || []) {
          const d = haversineKm(lat, lon, s.lat, s.lng);
          if (d < nearestDist) {
            nearestDist = d;
            nearestSpot = s as SpotRow;
          }
        }

        // Schwellwert (in km). 0.12 km = 120 m
        if (nearestSpot && nearestDist <= 0.12) {
          setNearest(nearestSpot);
        } else {
          setNearest(null);
        }
      } catch (e: any) {
        console.log("Nearest search error:", e?.message || e);
        setNearest(null);
      } finally {
        setSearching(false);
      }
    })();
  }, [router]);

  const headerTitle = useMemo(() => {
    if (searching) return "Erkenne Spot…";
    if (nearest) return "Spot gefunden";
    return "Neuer Spot?";
  }, [searching, nearest]);

  async function onConfirmExisting() {
    if (!nearest) return;
    // direkt zur Review-Erstellung für den existierenden Spot
    const q = new URLSearchParams();
    q.set("spotId", nearest.id);
    if (photoUri) q.set("photo", photoUri);
    router.replace(`/review/new?${q.toString()}`);
  }

  async function onConfirmCreate() {
    if (!coords) return;
    setLoading(true);
    try {
      // Reverse Geocoding → Name/Adresse vorschlagen
      const meta = await reverseGeocode(coords.lon, coords.lat);
      // mit vorgefüllten Parametern in deinen vorhandenen New Spot Screen
      const q = new URLSearchParams();
      if (meta.name) q.set("name", meta.name);
      if (meta.address) q.set("address", meta.address);
      q.set("lat", String(coords.lat));
      q.set("lng", String(coords.lon));
      if (photoUri) q.set("photo", photoUri);
      router.replace(`/spot/new?${q.toString()}`);
    } catch (e: any) {
      console.log(e);
      Alert.alert("Fehler", e?.message || "Reverse Geocoding fehlgeschlagen.");
    } finally {
      setLoading(false);
    }
  }

  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: theme.colors.background }}>
      {/* Header */}
      <View style={styles.header}>
        <Pressable onPress={() => router.back()} hitSlop={10}>
          <Ionicons name="chevron-back" size={26} color="#fff" />
        </Pressable>
        <Text style={styles.headerTitle}>{headerTitle}</Text>
        <View style={{ width: 26 }} />
      </View>

      <View style={styles.container}>
        {/* Preview Foto */}
        {photoUri ? (
          <Image source={{ uri: photoUri }} style={styles.photo} />
        ) : (
          <View style={[styles.photo, styles.photoPlaceholder]}>
            <Text style={{ color: theme.colors.textMuted }}>Kein Foto</Text>
          </View>
        )}

        {/* Status / Optionen */}
        <View style={styles.card}>
        {searching ? (
            <View style={{ alignItems: "center" }}>
            <ActivityIndicator color={theme.colors.primary} />
            <Text style={styles.muted}>Suche Spots in deiner Nähe…</Text>
            </View>
        ) : nearest ? (
            <>
            <Text style={styles.title}>Meinst du:</Text>
            <Text style={styles.spotName}>{nearest.name}</Text>
            {!!nearest.address && <Text style={styles.address}>{nearest.address}</Text>}

            <View style={{ height: theme.spacing(2) }} />

            <Pressable onPress={onConfirmExisting} style={[styles.btn, styles.btnPrimary]}>
                <Text style={styles.btnPrimaryText}>Review dafür schreiben</Text>
            </Pressable>

            <View style={{ height: theme.spacing(1) }} />

            <Pressable onPress={onConfirmCreate} style={[styles.btn, styles.btnGhost]}>
                <Text style={styles.btnGhostText}>Nein, neuer Spot</Text>
            </Pressable>
            </>
        ) : (
            <>
            <Text style={styles.title}>Kein Spot in der Nähe gefunden</Text>
            <Text style={styles.muted}>
                Wir haben in ca. 120 m Umkreis nichts Passendes gefunden.
            </Text>

            <View style={{ height: theme.spacing(2) }} />

            <Pressable disabled={loading} onPress={onConfirmCreate} style={[styles.btn, styles.btnPrimary]}>
                {loading ? (
                <ActivityIndicator color="#000" />
                ) : (
                <Text style={styles.btnPrimaryText}>Neuen Spot anlegen</Text>
                )}
            </Pressable>
            </>
        )}

        {/* 🔹 Neuer Abschnitt: Manuell Review schreiben */}
        <View style={{ height: theme.spacing(2) }} />

        <Pressable
        onPress={() => {
            const q = new URLSearchParams();
            q.set("spotId", spot.id);
            if (photoUri) q.set("photo", photoUri); // 👈 Foto anhängen
            router.push(`/review/new?${q.toString()}`);
        }}
        style={[styles.btn, { borderColor: "#555", borderWidth: 1 }]}
        >
        <Text style={{ color: "#bbb", fontWeight: "700" }}>
            Stattdessen manuell Review schreiben
        </Text>
        </Pressable>
        </View>
      </View>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  header: {
    height: 56,
    paddingHorizontal: 16,
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
  },
  headerTitle: { color: "#fff", fontSize: 18, fontWeight: "800", marginLeft: 4 },

  container: { flex: 1, padding: 16, gap: 16 },
  photo: {
    width: "100%",
    height: 220,
    borderRadius: 14,
    backgroundColor: "#111",
  },
  photoPlaceholder: {
    borderWidth: 1,
    borderColor: theme.colors.border,
    alignItems: "center",
    justifyContent: "center",
  },

  card: {
    backgroundColor: theme.colors.card,
    borderRadius: 16,
    padding: 16,
    borderWidth: 1,
    borderColor: theme.colors.border,
  },
  title: { color: "#fff", fontSize: 16, fontWeight: "800" },
  spotName: { color: "#fff", fontSize: 20, fontWeight: "900", marginTop: 6 },
  address: { color: theme.colors.textMuted, marginTop: 4 },

  muted: { color: theme.colors.textMuted, marginTop: 8 },

  btn: {
    paddingVertical: 12,
    borderRadius: theme.radius.pill,
    alignItems: "center",
    justifyContent: "center",
  },
  btnPrimary: { backgroundColor: theme.colors.primary },
  btnPrimaryText: { color: "#000", fontWeight: "900" },

  btnGhost: { borderWidth: 1, borderColor: theme.colors.border },
  btnGhostText: { color: "#fff", fontWeight: "800" },
});
