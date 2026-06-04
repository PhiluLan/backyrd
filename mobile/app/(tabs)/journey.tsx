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

const DEFAULT_CENTER = { latitude: 47.5596, longitude: 7.5886 };

function normalize(s?: string | null) {
  return (s || "").trim().toLowerCase();
}

function toNumber(n: any): number {
  const v = Number(n);
  return Number.isFinite(v) ? v : NaN;
}

function haversineKm(
  a: { latitude: number; longitude: number },
  b: { latitude: number; longitude: number }
) {
  const R = 6371;
  const dLat = ((b.latitude - a.latitude) * Math.PI) / 180;
  const dLon = ((b.longitude - a.longitude) * Math.PI) / 180;
  const lat1 = (a.latitude * Math.PI) / 180;
  const lat2 = (b.latitude * Math.PI) / 180;
  const x =
    Math.sin(dLat / 2) ** 2 +
    Math.sin(dLon / 2) ** 2 * Math.cos(lat1) * Math.cos(lat2);
  return R * 2 * Math.atan2(Math.sqrt(x), Math.sqrt(1 - x));
}

const uniq = <T,>(arr: T[]) => Array.from(new Set(arr));

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

type LocalIntention = {
  journeyType: string;
  primaryMood: string;
  summary: string;
  wantsFood: boolean;
  wantsDrinks: boolean;
  wantsCoffee: boolean;
  wantsWalk: boolean;
};

function looksLikeBar(cat: string) {
  return /bar|weinbar|pub|cocktail|spritz|lounge|speakeasy|bier|club|nightclub/i.test(
    cat
  );
}

function looksLikeRestaurant(cat: string) {
  return /restaurant|bistro|trattoria|brasserie|kitchen|beiz|ristorante/i.test(cat);
}

function looksLikeSightseeing(cat: string) {
  return /museum|kirche|kirch|münster|denkmal|monument|galerie|gallery|park|platz|aussicht|lookout/i.test(
    cat
  );
}

function looksLikeCafe(cat: string) {
  return /café|cafe|coffee|espresso|bakery|bäckerei/i.test(cat);
}

function filterCatalogByJourneyType(
  catalog: CatalogSpot[],
  intention: { journeyType?: string; primaryMood?: string; summary?: string },
  rawInput: string
) {
  const jt = normalize(intention?.journeyType);
  const primaryMood = normalize(intention?.primaryMood);
  const summary = normalize(intention?.summary);
  const text = `${rawInput} ${summary}`.toLowerCase();

  const wantsDrinks =
    jt.includes("bar") ||
    jt.includes("drinks") ||
    jt.includes("barhopping") ||
    text.includes("trinken") ||
    text.includes("drinks") ||
    text.includes("bar");

  const isDateNight =
    jt.includes("date") ||
    jt.includes("datenight") ||
    text.includes("date night") ||
    text.includes("datenight") ||
    text.includes("datenacht");

  const isFriendsNight =
    jt.includes("friends") ||
    jt.includes("group") ||
    text.includes("freunde") ||
    text.includes("freunden");

  const wantsWalkOnly =
    jt.includes("walk") ||
    jt.includes("spaziergang") ||
    primaryMood.includes("spazieren") ||
    text.includes("spaziergang");

  if (wantsDrinks && !isDateNight && isFriendsNight) {
    const filtered = catalog.filter((s) => {
      const cat = normalize(s.categoryName);
      if (!cat) return false;
      if (looksLikeSightseeing(cat)) return false;
      return looksLikeBar(cat);
    });
    return filtered.length >= 6 ? filtered : catalog;
  }

  if (isDateNight) {
    const filtered = catalog.filter((s) => {
      const cat = normalize(s.categoryName);
      if (!cat) return true;
      if (looksLikeSightseeing(cat)) return false;
      return looksLikeRestaurant(cat) || looksLikeBar(cat) || cat.includes("café") || cat.includes("cafe");
    });
    return filtered.length >= 6 ? filtered : catalog;
  }

  if (wantsWalkOnly && !wantsDrinks) {
    return catalog;
  }

  return catalog;
}

function parseLocalIntention(input: string): LocalIntention {
  const text = normalize(input);

  const wantsDrinks =
    /bar|cocktail|wein|wine|drinks|drink|bier|beer|pub|apéro|apero|night/.test(text);

  const wantsFood =
    /essen|dinner|lunch|restaurant|food|küche|kitchen|pizza|pasta|burger|sushi|brunch/.test(
      text
    );

  const wantsCoffee =
    /kaffee|coffee|café|cafe|espresso|latte/.test(text);

  const wantsWalk =
    /spaziergang|walk|laufen|flanieren|park|aussicht/.test(text);

  const cozy =
    /cozy|gemütlich|gemuetlich|ruhig|entspannt|chillig|romantisch/.test(text);

  const lively =
    /lebhaft|laut|party|energie|energetisch|fun|spass|spaß/.test(text);

  const dateNight =
    /date|datenight|datenacht|romantisch|zu zweit|couple/.test(text);

  const withFriends =
    /freunde|freunden|gruppe|group|jungs|mädels|maedels|kollegen/.test(text);

  let journeyType = "mixed";
  if (dateNight) journeyType = "date-night";
  else if (wantsDrinks && withFriends) journeyType = "barhopping";
  else if (wantsWalk && !wantsFood && !wantsDrinks) journeyType = "walk";
  else if (wantsCoffee) journeyType = "coffee";
  else if (wantsFood && wantsDrinks) journeyType = "dinner-drinks";
  else if (wantsFood) journeyType = "food";
  else if (wantsDrinks) journeyType = "drinks";

  let primaryMood = "balanced";
  if (cozy) primaryMood = "cozy";
  else if (lively) primaryMood = "lively";
  else if (wantsWalk) primaryMood = "calm";

  return {
    journeyType,
    primaryMood,
    summary: input.trim(),
    wantsFood,
    wantsDrinks,
    wantsCoffee,
    wantsWalk,
  };
}

function scoreSpotLocal(spot: CatalogSpot, intention: LocalIntention) {
  let score = 0;
  const cat = normalize(spot.categoryName);
  const moods = uniq([...spot.moods, ...spot.reviewMoods].map((m) => normalize(m)));
  const dist = typeof spot.distanceKm === "number" ? spot.distanceKm : 99;

  score += Math.max(0, 25 - dist * 2);

  if (intention.wantsDrinks && looksLikeBar(cat)) score += 24;
  if (intention.wantsFood && looksLikeRestaurant(cat)) score += 24;
  if (intention.wantsCoffee && looksLikeCafe(cat)) score += 24;
  if (intention.wantsWalk && looksLikeSightseeing(cat)) score += 12;

  if (intention.primaryMood === "cozy") {
    if (moods.some((m) => /cozy|gemütlich|gemuetlich|ruhig|romantisch|chillig/.test(m))) score += 18;
  }

  if (intention.primaryMood === "lively") {
    if (moods.some((m) => /lebhaft|energetisch|fun|laut|party|vibrant/.test(m))) score += 18;
  }

  if (intention.primaryMood === "calm") {
    if (moods.some((m) => /ruhig|entspannt|chillig|cozy|gemütlich|gemuetlich/.test(m))) score += 14;
  }

  if (looksLikeSightseeing(cat) && intention.journeyType !== "walk") score -= 10;
  if (dist > 8) score -= 8;
  if (dist > 12) score -= 10;

  return score;
}

function buildFallbackJourney(input: string, catalog: CatalogSpot[]) {
  const intention = parseLocalIntention(input);
  const filtered = filterCatalogByJourneyType(catalog, intention, input);

  const ranked = [...filtered]
    .map((spot) => ({ spot, score: scoreSpotLocal(spot, intention) }))
    .sort((a, b) => b.score - a.score);

  const chosen: CatalogSpot[] = [];
  for (const row of ranked) {
    if (chosen.length >= 4) break;
    if (chosen.some((s) => s.id === row.spot.id)) continue;
    chosen.push(row.spot);
  }

  const steps: UIJourneyStep[] = chosen.map((spot, i) => ({
    step: i + 1,
    spotId: spot.id,
    title: spot.name,
    reason:
      i === 0
        ? "Ein starker Start, der gut zu deiner Anfrage passt."
        : i === chosen.length - 1
        ? "Ein runder Abschluss für deine Journey."
        : "Passt gut als nächster Schritt in deiner Route.",
    spot,
  }));

  return {
    greeting: "Ich habe dir eine passende Journey zusammengestellt.",
    steps,
  };
}

export default function JourneyScreen() {
  const router = useRouter();

  const [input, setInput] = useState("");
  const [loading, setLoading] = useState(false);
  const [catalogLoading, setCatalogLoading] = useState(true);

  const [myPos, setMyPos] = useState<{ latitude: number; longitude: number } | null>(null);
  const [catalog, setCatalog] = useState<CatalogSpot[]>([]);
  const [greeting, setGreeting] = useState<string | null>(null);
  const [steps, setSteps] = useState<UIJourneyStep[]>([]);

  const [bookingVisible, setBookingVisible] = useState(false);
  const [selectedSpot, setSelectedSpot] = useState<CatalogSpot | null>(null);
  const [date, setDate] = useState(new Date());
  const [persons, setPersons] = useState(2);

  useEffect(() => {
    (async () => {
      try {
        async function loadSafeLocation() {
          if (Platform.OS === "web") return null;

          try {
            const { status } = await Location.requestForegroundPermissionsAsync();
            if (status !== "granted") return null;

            const pos: any = await Promise.race([
              Location.getCurrentPositionAsync({
                accuracy: Location.Accuracy.Balanced,
              }),
              new Promise((resolve) => setTimeout(() => resolve(null), 2500)),
            ]);

            if (!pos) return null;

            return {
              latitude: pos.coords.latitude,
              longitude: pos.coords.longitude,
            };
          } catch {
            return null;
          }
        }

        const loc = await loadSafeLocation();
        setMyPos(loc);

        const { data, error } = await supabase
          .from("spots")
          .select(
            `
            id, name, address, lat, lng, website, status,
            categories(name),
            reviews(mood_a, mood_b),
            spot_photos(url)
          `
          )
          .eq("status", "approved")
          .limit(1500);

        if (error) throw error;

        const center = loc ?? DEFAULT_CENTER;
        const rawSpots = (data || []) as any[];

        const spots = rawSpots
          .map((row: any) => {
            const lat = toNumber(row.lat);
            const lng = toNumber(row.lng);
            if (!Number.isFinite(lat) || !Number.isFinite(lng)) return null;

            const dist = haversineKm(center, { latitude: lat, longitude: lng });

            const reviewMoodsRaw: string[] = [];
            (row.reviews || []).forEach((r: any) => {
              if (r?.mood_a) reviewMoodsRaw.push(normalize(r.mood_a));
              if (r?.mood_b) reviewMoodsRaw.push(normalize(r.mood_b));
            });

            const moodSummary = uniq(reviewMoodsRaw).join(", ");

            return {
              id: row.id,
              name: row.name,
              address: row.address ?? null,
              lat,
              lng,
              distanceKm: dist,
              categoryName: row.categories?.name || "",
              moods: [],
              reviewMoods: uniq(reviewMoodsRaw),
              moodSummary,
              website: row.website ?? null,
              photo: row.spot_photos?.[0]?.url ?? null,
            } as CatalogSpot;
          })
          .filter(Boolean) as CatalogSpot[];

        const filtered = spots.filter((s) => (s.distanceKm ?? 9999) <= 15);

        filtered.sort((a, b) => {
          const da = a.distanceKm ?? 9999;
          const db = b.distanceKm ?? 9999;
          if (da !== db) return da - db;
          return a.name.localeCompare(b.name);
        });

        setCatalog(filtered);
      } catch (err) {
        console.error(err);
        Alert.alert("Fehler", "Spots konnten nicht geladen werden.");
      } finally {
        setCatalogLoading(false);
      }
    })();
  }, []);

  const generate = async () => {
    if (!input.trim()) return;
    if (catalogLoading) return Alert.alert("Bitte warten …", "Spots werden noch geladen.");
    if (!catalog.length) return Alert.alert("Keine Spots", "Keine Spots in deiner Nähe gefunden.");

    setLoading(true);
    try {
      const fallback = buildFallbackJourney(input, catalog);
      setGreeting(fallback.greeting);
      setSteps(fallback.steps);
    } catch (e: any) {
      console.error("Journey fallback error:", e);
      Alert.alert("Journey", e?.message ?? "Konnte die Journey nicht erstellen.");
    } finally {
      setLoading(false);
    }
  };

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
      Alert.alert(
        "Reserviert 🎉",
        `${selectedSpot.name} für ${persons} Person(en) am ${date.toLocaleString()}.`
      );
    } catch (e: any) {
      Alert.alert("Fehler", e.message ?? "Reservierung fehlgeschlagen.");
    }
  };

  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: theme.colors.background }}>
      <KeyboardAvoidingView
        behavior={Platform.OS === "ios" ? "padding" : undefined}
        style={{ flex: 1 }}
      >
        <ScrollView contentContainerStyle={styles.container}>
          <Text style={styles.title}>✨ Deine perfekte Mood Journey</Text>
          <Text style={styles.subtitle}>
            Sag mir, wonach dir heute ist — ich stelle dir passende Spots zusammen.
          </Text>

          <TextInput
            placeholder="z. B. Barhopping mit 4 Freunden (cozy, gute Drinks)"
            placeholderTextColor="#666"
            style={styles.input}
            multiline
            value={input}
            onChangeText={setInput}
          />

          <Pressable
            onPress={generate}
            style={({ pressed }) => [
              styles.button,
              { opacity: pressed || loading ? 0.7 : 1 },
            ]}
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

          {Platform.OS === "web" && (
            <Text style={{ color: theme.colors.textMuted, marginTop: 8, lineHeight: 20 }}>
              Web läuft aktuell mit lokalem Journey-Fallback. Die serverseitige AI-Version bauen wir danach sauber über eine Backend-Function.
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

                    {["restaurant", "bar", "weinbar", "event"].some((k) =>
                      normalize(s.spot.categoryName).includes(k)
                    ) && (
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

      <Modal
        visible={bookingVisible}
        transparent
        animationType="slide"
        onRequestClose={() => setBookingVisible(false)}
      >
        <View style={styles.modalBackdrop}>
          <View style={styles.modalContent}>
            <Text style={styles.modalTitle}>Tisch reservieren bei {selectedSpot?.name}</Text>

            <Text style={styles.modalLabel}>Datum & Uhrzeit</Text>
            <DateTimePicker
              value={date}
              mode="datetime"
              onChange={(_e, d) => d && setDate(d)}
              minimumDate={new Date()}
            />

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

const styles = StyleSheet.create({
  container: { padding: 20 },
  title: {
    fontSize: 26,
    fontWeight: "700",
    color: "#fff",
    marginBottom: 4,
  },
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
  greeting: {
    color: "#fff",
    fontSize: 18,
    marginTop: 22,
    fontWeight: "600",
  },
  card: {
    backgroundColor: theme.colors.card,
    borderRadius: theme.radius.lg,
    padding: 16,
    marginBottom: 18,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: theme.colors.hairline,
  },
  cardImage: {
    width: "100%",
    height: 150,
    borderRadius: theme.radius.md,
    marginBottom: 12,
  },
  cardStep: { color: theme.colors.primary, fontSize: 13, marginBottom: 4 },
  cardTitle: { color: "#fff", fontSize: 20, fontWeight: "600" },
  cardMeta: {
    color: theme.colors.textMuted,
    marginTop: 2,
    marginBottom: 8,
  },
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
  detailButton: {
    paddingVertical: 10,
    borderRadius: theme.radius.md,
    alignItems: "center",
  },
  detailButtonText: { color: "#fff", fontWeight: "600" },
  modalBackdrop: {
    flex: 1,
    backgroundColor: "rgba(0,0,0,0.7)",
    justifyContent: "flex-end",
  },
  modalContent: {
    backgroundColor: "#111",
    padding: 20,
    borderTopLeftRadius: 16,
    borderTopRightRadius: 16,
  },
  modalTitle: {
    color: "#fff",
    fontSize: 18,
    fontWeight: "700",
    marginBottom: 12,
  },
  modalLabel: { color: "#ccc", marginTop: 12, marginBottom: 4 },
});