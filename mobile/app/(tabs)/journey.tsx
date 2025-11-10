// mobile/app/(tabs)/journey.tsx

import React, { useEffect, useState } from "react";
import {
  View,
  Text,
  TextInput,
  Pressable,
  ScrollView,
  KeyboardAvoidingView,
  Platform,
  StyleSheet,
  Alert,
  Image,
  Modal,
  ActivityIndicator,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { Ionicons } from "@expo/vector-icons";
import * as Location from "expo-location";
import { supabase } from "../../lib/supabase";
import { useRouter } from "expo-router";
import DateTimePicker from "@react-native-community/datetimepicker";

/** ===== AI MODULES ===== */
import { rerankSpots } from "../../lib/ai/rerank";
import { buildUserProfile } from "../../lib/ai/userProfile";
import { extractIntention } from "../../lib/ai/intention";
import { rankCandidates } from "../../lib/ai/rankCandidates";
import { synthesizeJourney } from "../../lib/ai/synthesizeJourney";
import { buildUserMemory } from "../../lib/ai/memory";
import { buildUserPreferences } from "../../lib/ai/buildUserPreferences";
import { buildDeepPreferences } from "../../lib/ai/preferences/deepPreferences";
import { computeGeoContext } from "../../lib/ai/computeGeoContext";
import { computeAreaContext } from "../../lib/ai/computeAreaContext";
import { classifyArea, getAreaFlowPreference } from "../../lib/ai/localKnowledge";
import { buildContext } from "../../lib/ai/buildContext";
import { buildWeather } from "../../lib/ai/buildWeather";

/* ===================== THEME ===================== */
const theme = {
  colors: {
    background: "#000",
    text: "#fff",
    textMuted: "#9ca3af",
    primary: "#3A86FF",
    accent: "#10B981",
    card: "#0B0B0C",
    chip: "rgba(255,255,255,0.06)",
    chipBorder: "rgba(255,255,255,0.12)",
    hairline: "#222",
  },
  radius: { sm: 8, md: 12, lg: 16, xl: 24, pill: 999 },
  spacing: (n: number) => n * 8,
};

/* ===================== HELPERS ===================== */
const DEFAULT_CENTER = { latitude: 47.5596, longitude: 7.5886 }; // Basel

function normalize(s?: string | null) {
  return (s || "").trim().toLowerCase();
}
function toNumber(n: any): number {
  const v = Number(n);
  return Number.isFinite(v) ? v : NaN;
}
function haversineKm(a: { latitude: number; longitude: number }, b: { latitude: number; longitude: number }) {
  const R = 6371;
  const dLat = ((b.latitude - a.latitude) * Math.PI) / 180;
  const dLon = ((b.longitude - a.longitude) * Math.PI) / 180;
  const lat1 = (a.latitude * Math.PI) / 180;
  const lat2 = (b.latitude * Math.PI) / 180;
  const x = Math.sin(dLat / 2) ** 2 + Math.sin(dLon / 2) ** 2 * Math.cos(lat1) * Math.cos(lat2);
  return R * 2 * Math.atan2(Math.sqrt(x), Math.sqrt(1 - x));
}
const uniq = <T,>(arr: T[]) => Array.from(new Set(arr));

/* ===================== TYPES ===================== */
type CatalogSpot = {
  id: string;
  name: string;
  address?: string | null;
  lat: number;
  lng: number;
  distanceKm: number | null;
  categoryName: string;
  moods: string[];
  reviewMoods: string[];
  moodSummary: string;
  website?: string | null;
  photo?: string | null;
};

type UIJourneyStep = {
  step: number;
  spotId: string;
  title: string;
  reason: string;
  spot: CatalogSpot;
};

/* ===================== SCREEN ===================== */
export default function JourneyScreen() {
  const router = useRouter();

  const [input, setInput] = useState("");
  const [loading, setLoading] = useState(false);
  const [catalogLoading, setCatalogLoading] = useState(true);

  const [myPos, setMyPos] = useState<{ latitude: number; longitude: number } | null>(null);
  const [catalog, setCatalog] = useState<CatalogSpot[]>([]);
  const [greeting, setGreeting] = useState<string | null>(null);
  const [steps, setSteps] = useState<UIJourneyStep[]>([]);

  /** Booking */
  const [bookingVisible, setBookingVisible] = useState(false);
  const [selectedSpot, setSelectedSpot] = useState<CatalogSpot | null>(null);
  const [date, setDate] = useState(new Date());
  const [persons, setPersons] = useState(2);

  /* ============================================================
   * 1) STANDORT + SPOT-KATALOG LADEN (robust)
   * ============================================================ */
  useEffect(() => {
    (async () => {
      try {
        // Standort sicher laden (mit Timeout)
        async function loadSafeLocation() {
          try {
            const { status } = await Location.requestForegroundPermissionsAsync();
            if (status !== "granted") return null;

            const pos: any = await Promise.race([
              Location.getCurrentPositionAsync({ accuracy: Location.Accuracy.Balanced }),
              new Promise((resolve) => setTimeout(() => resolve(null), 2500)),
            ]);

            if (!pos) return null;
            return { latitude: pos.coords.latitude, longitude: pos.coords.longitude };
          } catch (err) {
            console.warn("Standort konnte nicht geladen werden:", err);
            return null;
          }
        }

        const loc = await loadSafeLocation();
        setMyPos(loc);

        // Spots laden
        const { data, error } = await supabase
          .from("spots")
          .select(`
            id, name, address, lat, lng, website, status,
            categories(name),
            spot_moods(mood, rank),
            reviews(mood_a, mood_b),
            spot_photos(url)
          `)
          .eq("status", "approved")
          .limit(1500);

        if (error) throw error;

        const center = loc ?? DEFAULT_CENTER;

        const spots = (data || [])
          .map((row: any) => {
            const lat = toNumber(row.lat);
            const lng = toNumber(row.lng);
            if (!Number.isFinite(lat) || !Number.isFinite(lng)) return null;

            const dist = loc ? haversineKm(center, { latitude: lat, longitude: lng }) : null;

            const topMoods =
              (row.spot_moods || [])
                .filter((m: any) => Number.isFinite(m?.rank) && m.rank <= 3)
                .map((m: any) => normalize(m.mood))
                .filter(Boolean) || [];

            const reviewMoodsRaw: string[] = [];
            (row.reviews || []).forEach((r: any) => {
              if (r?.mood_a) reviewMoodsRaw.push(normalize(r.mood_a));
              if (r?.mood_b) reviewMoodsRaw.push(normalize(r.mood_b));
            });

            const moodCounts: Record<string, number> = {};
            reviewMoodsRaw.forEach((m) => {
              if (!m) return;
              moodCounts[m] = (moodCounts[m] || 0) + 1;
            });

            const topReviewMoods = Object.entries(moodCounts)
              .sort((a, b) => b[1] - a[1])
              .map(([m]) => m)
              .slice(0, 5);

            return {
              id: row.id,
              name: row.name,
              address: row.address ?? null,
              lat,
              lng,
              distanceKm: dist,
              categoryName: row.categories?.name || "",
              moods: topMoods,
              reviewMoods: topReviewMoods,
              moodSummary: topReviewMoods.join(", "),
              website: row.website ?? null,
              photo: row.spot_photos?.[0]?.url ?? null,
            } as CatalogSpot;
          })
          .filter(Boolean) as CatalogSpot[];

        const filtered = loc ? spots.filter((s) => (s.distanceKm ?? 9999) <= 15) : spots;

        filtered.sort((a, b) => {
          const da = a.distanceKm ?? 9999;
          const db = b.distanceKm ?? 9999;
          if (da !== db) return da - db;
          return a.name.localeCompare(b.name);
        });

        setCatalog(filtered);
      } catch (e: any) {
        console.error("Katalog-Fehler:", e);
        Alert.alert("Fehler", "Konnte Spots nicht laden.");
      } finally {
        setCatalogLoading(false);
      }
    })();
  }, []);

  /* ============================================================
   * 2) JOURNEY GENERIEREN (modern & robust)
   * ============================================================ */
  const generate = async () => {
    if (!input.trim()) return;
    if (catalogLoading) return Alert.alert("Bitte warten …", "Spots werden noch geladen.");
    if (!catalog.length) return Alert.alert("Keine Spots", "Keine Spots in deiner Nähe gefunden.");

    setLoading(true);
    try {
      /** Context (Zeit / Saison / Tagesmodus / Wetter) */
      const context = await buildContext();
      let weather: any = null;
      try {
        const loc = myPos ?? DEFAULT_CENTER;
        weather = await buildWeather(loc.latitude, loc.longitude);
      } catch (e) {
        console.warn("Weather konnte nicht geladen werden:", e);
      }

      /** Session → UserId */
      const { data: session } = await supabase.auth.getSession();
      const userId = session.session?.user.id || null;

      /** Userdaten (soft-fail) */
      let userProfile: any = null;
      let memory: any = null;
      let preferences: any = null;
      let deepPreferences: any = null;

      if (userId) {
        try {
          userProfile = await buildUserProfile(userId);
        } catch {}
        try {
          memory = await buildUserMemory(userId);
        } catch {}
        try {
          preferences = await buildUserPreferences(userId);
        } catch {}
        try {
          deepPreferences = await buildDeepPreferences(userId);
        } catch {}

        // Suche loggen (nicht kritisch)
        try {
          await supabase.from("user_searches").insert({ user_id: userId, query: input });
        } catch (e) {
          console.warn("Fehler beim Speichern der Suche:", e);
        }
      }

      /** Lokales Re-Ranking (ohne KI) */
      const base = catalog.map((s) => ({
        id: s.id,
        name: s.name,
        category: s.categoryName,
        moods: s.moods,
        reviewMoods: s.reviewMoods,
        distanceKm: s.distanceKm,
      }));
      const rankedLocal = rerankSpots(base, { memory, preferences });
      const slim = rankedLocal.slice(0, 40);

      /** Phase 1 → Intention (GPT-4.1-mini) */
      const intention = await extractIntention(input, { profile: userProfile, memory, preferences, deepPreferences });

      /** Phase 2 → AI Candidate Ranking (GPT-4.1) */
      const rankedAi = await rankCandidates(intention, slim, { memory, preferences, deepPreferences });

      let topRanked: Array<{ id: string; score: number }> = [];
      if (Array.isArray(rankedAi) && rankedAi.length) {
        topRanked = rankedAi
          .filter((x: any) => x && x.id)
          .sort((a: any, b: any) => Number(b.score || 0) - Number(a.score || 0))
          .slice(0, 6);
      } else {
        topRanked = slim.slice(0, 6).map((s) => ({ id: s.id, score: 0 }));
      }
      if (topRanked.length < 2) {
        topRanked = uniq([...topRanked, ...slim.slice(0, 2).map((s) => ({ id: s.id, score: 0 }))]).slice(0, 2);
      }

      /** GEO CONTEXT (Distanzen, Wege) */
      const geoInput = topRanked
        .map((s) => {
          const spot = catalog.find((c) => c.id === s.id);
          if (!spot) return null;
          return { id: spot.id, lat: spot.lat, lng: spot.lng };
        })
        .filter(Boolean) as Array<{ id: string; lat: number; lng: number }>;

      const geoContext = computeGeoContext(geoInput);

      /** AREA CONTEXT — Hybrid:
       *  1) computeAreaContext: clusterbasierte Area/Vibe aus Spots
       *  2) classifyArea: lokale Wissens-Feinjustierung pro Spot
       *  3) getAreaFlowPreference: bevorzugter Flow (z. B. Kleinbasel → Rhein)
       */
      const topRankedSpots = topRanked
        .map((s) => catalog.find((c) => c.id === s.id))
        .filter(Boolean) as CatalogSpot[];

      const areaContextAuto = computeAreaContext(topRankedSpots); // dynamisch
      const areaContextManual = topRankedSpots.map((spot) => {
        const info = classifyArea(spot.lat, spot.lng); // lokal gepflegt
        return { id: spot.id, area: info.area, vibe: info.vibe };
      });

      const areaFlowPreference = getAreaFlowPreference(
        topRankedSpots.map((s) => ({ id: s.id, lat: s.lat, lng: s.lng }))
      );

      // Hybrid-Merge: automatische Cluster + manuelle Feinheiten
      const areaContext = {
        auto: areaContextAuto,
        manual: areaContextManual,
        flow: areaFlowPreference,
      };

      /** Phase 3 → Journey Synthese (GPT-4.1) */
      const journey = await synthesizeJourney(intention, topRanked, userProfile, {
        memory,
        preferences,
        deepPreferences,
        geoContext,
        areaContext,
        weather,
        context,
      });

      if (!journey?.steps || !Array.isArray(journey.steps) || journey.steps.length === 0) {
        throw new Error("Die KI hat keine validen Schritte geliefert.");
      }

      /** Mapping: KI → echte Spots */
      const safeSteps: UIJourneyStep[] = journey.steps
        .map((x: any, i: number) => {
          const sid = String(x?.spotId || "").trim().toLowerCase();
          const match = rankedLocal.find((c: any) => c.id.toLowerCase() === sid);
          if (!match) return null;

          const full = catalog.find((c) => c.id === match.id);
          if (!full) return null;

          return {
            step: Number(x?.step ?? i + 1),
            spotId: match.id,
            title: String(x?.title || full.name),
            reason: String(x?.reason || ""),
            spot: full,
          };
        })
        .filter(Boolean)
        .slice(0, 4) as UIJourneyStep[];

      /** Fallsafe */
      if (!safeSteps.length) {
        const fallback = rankedLocal.slice(0, 3).map((s: any, i: number) => ({
          step: i + 1,
          spotId: s.id,
          title: s.name,
          reason: "Automatische Empfehlung – passend zu deiner Anfrage.",
          spot: catalog.find((c) => c.id === s.id)!,
        }));
        setGreeting("Ich hab dir passende Spots rausgesucht:");
        setSteps(fallback);
        return;
      }

      /** UI Update */
      setGreeting(journey.greeting || "Hier ist eine Idee, die zu dir passt:");
      setSteps(safeSteps);
    } catch (e: any) {
      console.error(e);
      Alert.alert("KI", e.message ?? "Konnte die Journey nicht erstellen.");
    } finally {
      setLoading(false);
    }
  };

  /* ============================================================
   * BOOKING
   * ============================================================ */
  const openBooking = (spot: CatalogSpot) => {
    setSelectedSpot(spot);
    setBookingVisible(true);
  };

  const submitBooking = async () => {
    if (!selectedSpot) return;
    try {
      const { data: session } = await supabase.auth.getSession();
      const userId = session.session?.user.id;
      if (!userId) return Alert.alert("Fehler", "Bitte logge dich ein.");

      const { error } = await supabase.from("reservations").insert({
        spot_id: selectedSpot.id,
        user_id: userId,
        date: date.toISOString(),
        persons,
      });
      if (error) throw error;

      setBookingVisible(false);
      Alert.alert("Reserviert 🎉", `${selectedSpot.name} für ${persons} Person(en) am ${date.toLocaleString()}.`);
    } catch (e: any) {
      Alert.alert("Fehler", e.message ?? "Reservierung fehlgeschlagen.");
    }
  };

  /* ============================================================
   * RENDER
   * ============================================================ */
  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: theme.colors.background }}>
      <KeyboardAvoidingView behavior={Platform.OS === "ios" ? "padding" : undefined} style={{ flex: 1 }}>
        <ScrollView contentContainerStyle={styles.container}>
          <Text style={styles.title}>✨ Deine perfekte Mood Journey</Text>
          <Text style={styles.subtitle}>Sag mir, wonach dir heute ist — ich kenn da was 😉</Text>

          <TextInput
            placeholder="z. B. Romantischer Abend zu zweit (ruhig, gute Drinks)"
            placeholderTextColor="#666"
            style={styles.input}
            multiline
            value={input}
            onChangeText={setInput}
          />

          <Pressable
            onPress={generate}
            style={({ pressed }) => [styles.button, { opacity: pressed || loading ? 0.7 : 1 }]}
            disabled={loading || catalogLoading}
          >
            <Ionicons name="sparkles" size={20} color="#fff" style={{ marginRight: 6 }} />
            <Text style={styles.buttonText}>
              {loading ? "Wird generiert…" : catalogLoading ? "Lade Spots…" : "Vorschlag generieren"}
            </Text>
          </Pressable>

          {!catalogLoading && (
            <Text style={{ color: theme.colors.textMuted, marginTop: 8 }}>
              {catalog.length} Spots berücksichtigt {myPos ? "im Radius ~15 km" : "(ohne Standort)"}
            </Text>
          )}

          {greeting && <Text style={styles.greeting}>{greeting}</Text>}

          {steps.length > 0 && (
            <View style={{ marginTop: 16 }}>
              {steps.map((s) => (
                <View key={`${s.step}-${s.spotId}`} style={styles.card}>
                  {s.spot.photo && <Image source={{ uri: s.spot.photo }} style={styles.cardImage} />}

                  <Text style={styles.cardStep}>Schritt {s.step}</Text>
                  <Text style={styles.cardTitle}>{s.title}</Text>
                  <Text style={styles.cardMeta}>
                    {s.spot.categoryName}
                    {typeof s.spot.distanceKm === "number" ? ` • ${s.spot.distanceKm.toFixed(1)} km` : ""}
                    {s.spot.moodSummary ? ` • ${s.spot.moodSummary}` : ""}
                  </Text>
                  <Text style={styles.cardReason}>{s.reason}</Text>

                  {(s.spot.moods.length > 0 || s.spot.reviewMoods.length > 0) && (
                    <View style={{ flexDirection: "row", flexWrap: "wrap", gap: 8, marginTop: 10 }}>
                      {uniq([...s.spot.moods, ...s.spot.reviewMoods])
                        .slice(0, 6)
                        .map((m) => (
                          <View key={m} style={styles.chip}>
                            <Text style={styles.chipText}>{m}</Text>
                          </View>
                        ))}
                    </View>
                  )}

                  <View style={{ flexDirection: "row", gap: 8, marginTop: 12 }}>
                    <Pressable
                      onPress={() => router.push(`/spot/${s.spot.id}`)}
                      style={[styles.detailButton, { flex: 1, backgroundColor: theme.colors.primary }]}
                    >
                      <Text style={styles.detailButtonText}>Details</Text>
                    </Pressable>

                    {["restaurant", "bar", "weinbar", "event"].some((k) => normalize(s.spot.categoryName).includes(k)) && (
                      <Pressable
                        onPress={() => openBooking(s.spot)}
                        style={[styles.detailButton, { flex: 1, backgroundColor: theme.colors.accent }]}
                      >
                        <Text style={styles.detailButtonText}>Reservieren</Text>
                      </Pressable>
                    )}
                  </View>
                </View>
              ))}
            </View>
          )}

          {(loading || catalogLoading) && (
            <View style={{ marginTop: 24, alignItems: "center" }}>
              <ActivityIndicator color={theme.colors.primary} />
            </View>
          )}
        </ScrollView>
      </KeyboardAvoidingView>

      {/* BOOKING MODAL */}
      <Modal visible={bookingVisible} transparent animationType="slide" onRequestClose={() => setBookingVisible(false)}>
        <View style={styles.modalBackdrop}>
          <View style={styles.modalContent}>
            <Text style={styles.modalTitle}>Tisch reservieren bei {selectedSpot?.name}</Text>

            <Text style={styles.modalLabel}>Datum & Uhrzeit</Text>
            <DateTimePicker value={date} mode="datetime" onChange={(e, d) => d && setDate(d)} minimumDate={new Date()} />

            <Text style={styles.modalLabel}>Personen</Text>
            <View style={{ flexDirection: "row", alignItems: "center", gap: 12 }}>
              <Pressable onPress={() => setPersons(Math.max(1, persons - 1))}>
                <Ionicons name="remove-circle" size={32} color={theme.colors.primary} />
              </Pressable>
              <Text style={{ color: "#fff", fontSize: 18 }}>{persons}</Text>
              <Pressable onPress={() => setPersons(persons + 1)}>
                <Ionicons name="add-circle" size={32} color={theme.colors.primary} />
              </Pressable>
            </View>

            <Pressable onPress={submitBooking} style={[styles.button, { marginTop: 16 }]}>
              <Text style={styles.buttonText}>Reservierung bestätigen</Text>
            </Pressable>

            <Pressable onPress={() => setBookingVisible(false)} style={{ marginTop: 12, alignItems: "center" }}>
              <Text style={{ color: "#aaa" }}>Abbrechen</Text>
            </Pressable>
          </View>
        </View>
      </Modal>
    </SafeAreaView>
  );
}

/* ===================== STYLES ===================== */
const styles = StyleSheet.create({
  container: { padding: 20 },
  title: { fontSize: 26, fontWeight: "700", color: "#fff", marginBottom: 4 },
  subtitle: { color: "#ccc", marginBottom: 16, fontSize: 15 },
  input: {
    backgroundColor: "#111",
    borderRadius: 12,
    padding: 14,
    color: "#fff",
    minHeight: 90,
    marginBottom: 12,
  },
  button: {
    backgroundColor: theme.colors.primary,
    borderRadius: 12,
    paddingVertical: 14,
    paddingHorizontal: 16,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    marginTop: 4,
  },
  buttonText: { color: "#fff", fontWeight: "600", fontSize: 16 },
  greeting: { color: "#fff", fontSize: 18, marginTop: 22, fontWeight: "600" },
  card: {
    backgroundColor: theme.colors.card,
    borderRadius: theme.radius.lg,
    padding: 16,
    marginBottom: 18,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: theme.colors.hairline,
  },
  cardImage: { width: "100%", height: 150, borderRadius: theme.radius.md, marginBottom: 12 },
  cardStep: { color: theme.colors.primary, fontSize: 13, marginBottom: 4 },
  cardTitle: { color: "#fff", fontSize: 20, fontWeight: "600" },
  cardMeta: { color: theme.colors.textMuted, marginTop: 2, marginBottom: 8 },
  cardReason: { color: "#fff", marginTop: 8, fontSize: 15 },
  chip: {
    backgroundColor: theme.colors.chip,
    borderColor: theme.colors.chipBorder,
    borderWidth: 1,
    paddingHorizontal: 10,
    paddingVertical: 6,
    borderRadius: theme.radius.pill,
  },
  chipText: { color: "#fff", fontSize: 12 },
  detailButton: { paddingVertical: 10, borderRadius: theme.radius.md, alignItems: "center" },
  detailButtonText: { color: "#fff", fontWeight: "600" },
  modalBackdrop: { flex: 1, backgroundColor: "rgba(0,0,0,0.7)", justifyContent: "flex-end" },
  modalContent: { backgroundColor: "#111", padding: 20, borderTopLeftRadius: 16, borderTopRightRadius: 16 },
  modalTitle: { color: "#fff", fontSize: 18, fontWeight: "700", marginBottom: 12 },
  modalLabel: { color: "#ccc", marginTop: 12, marginBottom: 4 },
});
