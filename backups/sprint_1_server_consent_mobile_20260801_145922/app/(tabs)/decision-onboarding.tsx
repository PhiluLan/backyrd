// mobile/app/(tabs)/decision-onboarding.tsx

import React, { useCallback, useEffect, useMemo, useState } from "react";
import {
  ActivityIndicator,
  Alert,
  KeyboardAvoidingView,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from "react-native";
import * as Location from "expo-location";
import { Stack, useRouter } from "expo-router";
import { SafeAreaView } from "react-native-safe-area-context";

import { supabase } from "@/lib/supabase";

type SpotRow = {
  id: string;
  name: string;
  city: string | null;
  address?: string | null;
  categories?: { name?: string | null } | null;
};

type CompleteOnboardingRow = {
  ok: boolean;
  user_id: string;
  city: string;
  selected_count: number;
  event_count: number;
  message: string;
};

const MIN_SELECTION = 3;
const MAX_SELECTION = 8;

function clean(value: string | null | undefined) {
  return String(value ?? "").trim().replace(/\s+/g, " ");
}

function normalizeCity(value: string | null | undefined) {
  const city = clean(value);
  if (!city) return "Basel";
  return city;
}

function getCityFromGeocode(item: Location.LocationGeocodedAddress | null | undefined) {
  return clean(item?.city) || clean(item?.subregion) || clean(item?.region) || null;
}

function categoryName(spot: SpotRow) {
  return clean(spot.categories?.name);
}

export default function DecisionOnboardingScreen() {
  const router = useRouter();

  const [city, setCity] = useState("Basel");
  const [query, setQuery] = useState("");

  const [detectingLocation, setDetectingLocation] = useState(false);
  const [locationStatus, setLocationStatus] = useState<"idle" | "detected" | "denied" | "failed">("idle");

  const [loadingSuggestions, setLoadingSuggestions] = useState(false);
  const [searching, setSearching] = useState(false);
  const [submitting, setSubmitting] = useState(false);

  const [results, setResults] = useState<SpotRow[]>([]);
  const [suggestions, setSuggestions] = useState<SpotRow[]>([]);
  const [selected, setSelected] = useState<SpotRow[]>([]);

  const selectedIds = useMemo(() => new Set(selected.map((spot) => spot.id)), [selected]);
  const canSubmit = selected.length >= MIN_SELECTION && selected.length <= MAX_SELECTION && !submitting;
  const remainingCount = Math.max(0, MIN_SELECTION - selected.length);

  const loadSuggestions = useCallback(async (nextCity: string) => {
    const c = normalizeCity(nextCity);

    try {
      setLoadingSuggestions(true);

      const { data, error } = await supabase
        .from("spots")
        .select("id,name,city,address,categories(name)")
        .eq("status", "approved")
        .or(`city.ilike.%${c}%,address.ilike.%${c}%`)
        .order("created_at", { ascending: false })
        .limit(18);

      if (error) throw error;

      setSuggestions((data ?? []) as SpotRow[]);
    } catch (error) {
      console.log("load onboarding suggestions failed", error);
      setSuggestions([]);
    } finally {
      setLoadingSuggestions(false);
    }
  }, []);

  const searchSpots = useCallback(async (nextQuery: string, nextCity: string) => {
    const q = clean(nextQuery);
    const c = normalizeCity(nextCity);

    if (q.length < 2) {
      setResults([]);
      return;
    }

    try {
      setSearching(true);

      const { data, error } = await supabase
        .from("spots")
        .select("id,name,city,address,categories(name)")
        .eq("status", "approved")
        .or(`city.ilike.%${c}%,address.ilike.%${c}%`)
        .ilike("name", `%${q}%`)
        .limit(14);

      if (error) throw error;

      setResults((data ?? []) as SpotRow[]);
    } catch (error) {
      console.log("onboarding spot search failed", error);
      setResults([]);
    } finally {
      setSearching(false);
    }
  }, []);

  const detectLocation = useCallback(async () => {
    try {
      setDetectingLocation(true);
      setLocationStatus("idle");

      const permission = await Location.requestForegroundPermissionsAsync();

      if (permission.status !== "granted") {
        setLocationStatus("denied");
        return;
      }

      const position = await Location.getCurrentPositionAsync({
        accuracy: Location.Accuracy.Balanced,
      });

      const geocoded = await Location.reverseGeocodeAsync({
        latitude: position.coords.latitude,
        longitude: position.coords.longitude,
      });

      const detectedCity = getCityFromGeocode(geocoded[0]);

      if (!detectedCity) {
        setLocationStatus("failed");
        return;
      }

      setCity(detectedCity);
      setQuery("");
      setResults([]);
      setLocationStatus("detected");
      loadSuggestions(detectedCity);
    } catch (error) {
      console.log("location detection failed", error);
      setLocationStatus("failed");
    } finally {
      setDetectingLocation(false);
    }
  }, [loadSuggestions]);

  useEffect(() => {
    let alive = true;

    const run = async () => {
      const { data } = await supabase.auth.getUser();

      if (!alive) return;

      if (!data.user?.id) {
        router.replace("/gate" as any);
        return;
      }

      loadSuggestions(city);
      detectLocation();
    };

    run();

    return () => {
      alive = false;
    };
    // Only on first mount. User can manually edit city or re-detect.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    const handle = setTimeout(() => {
      searchSpots(query, city);
    }, 250);

    return () => clearTimeout(handle);
  }, [query, city, searchSpots]);

  useEffect(() => {
    const handle = setTimeout(() => {
      loadSuggestions(city);
    }, 350);

    return () => clearTimeout(handle);
  }, [city, loadSuggestions]);

  const addSelected = useCallback(
    (spot: SpotRow) => {
      if (selectedIds.has(spot.id)) return;

      if (selected.length >= MAX_SELECTION) {
        Alert.alert("Genug Ankerpunkte", `Für den Start reichen maximal ${MAX_SELECTION} Spots.`);
        return;
      }

      setSelected((prev) => [...prev, spot]);
      setQuery("");
      setResults([]);
    },
    [selected.length, selectedIds]
  );

  const removeSelected = useCallback((id: string) => {
    setSelected((prev) => prev.filter((spot) => spot.id !== id));
  }, []);

  const submit = useCallback(async () => {
    if (!canSubmit) {
      Alert.alert("Noch nicht ganz", `Wähle mindestens ${MIN_SELECTION} echte Backyrd-Spots aus.`);
      return;
    }

    try {
      setSubmitting(true);

      const { data: sessionData } = await supabase.auth.getSession();

      if (!sessionData.session?.user?.id) {
        router.replace("/gate" as any);
        return;
      }

      const spotIds = selected.map((spot) => spot.id);

      const { data, error } = await supabase.rpc("complete_decision_onboarding_v1", {
        p_city: normalizeCity(city),
        p_spot_ids: spotIds,
      });

      if (error) throw error;

      const row = Array.isArray(data)
        ? (data[0] as CompleteOnboardingRow | undefined)
        : (data as CompleteOnboardingRow | undefined);

      if (!row?.ok) {
        throw new Error("Onboarding konnte nicht abgeschlossen werden.");
      }

      router.replace("/(tabs)" as any);
    } catch (error: any) {
      console.log("complete decision onboarding failed", error);
      Alert.alert("Fehler", error?.message ?? "Konnte deinen Start-Geschmack nicht speichern.");
    } finally {
      setSubmitting(false);
    }
  }, [canSubmit, city, router, selected]);

  const visibleSpots = query.trim().length >= 2 ? results : suggestions;
  const visibleTitle = query.trim().length >= 2 ? "Gefundene Spots" : "Vorschläge in deiner Stadt";
  const showLoadingList = query.trim().length >= 2 ? searching : loadingSuggestions;

  return (
    <SafeAreaView style={styles.safe} edges={["top", "left", "right"]}>
      <Stack.Screen
        options={{
          title: "Dein Startgeschmack",
          headerStyle: { backgroundColor: theme.bg },
          headerTintColor: "#fff",
          headerShadowVisible: false,
        }}
      />

      <KeyboardAvoidingView style={{ flex: 1 }} behavior={Platform.OS === "ios" ? "padding" : undefined}>
        <ScrollView
          keyboardShouldPersistTaps="handled"
          contentContainerStyle={styles.content}
          showsVerticalScrollIndicator={false}
        >
          <View style={styles.hero}>
            <Text style={styles.kicker}>DECISION</Text>
            <Text style={styles.title}>Lass uns deinen Geschmack starten.</Text>
            <Text style={styles.subtitle}>
              Wähle 3 Orte, die du wirklich magst. Backyrd nutzt sie als erste Ankerpunkte
              für deine persönlichen Empfehlungen.
            </Text>
          </View>

          <View style={styles.card}>
            <View style={styles.cityRow}>
              <View style={{ flex: 1 }}>
                <Text style={styles.label}>Aktuelle Stadt</Text>
                <TextInput
                  value={city}
                  onChangeText={(text) => {
                    setCity(text);
                    setQuery("");
                    setResults([]);
                  }}
                  placeholder="Basel"
                  placeholderTextColor="rgba(255,255,255,0.35)"
                  autoCapitalize="words"
                  style={styles.input}
                />
              </View>

              <Pressable
                onPress={detectLocation}
                disabled={detectingLocation}
                style={({ pressed }) => [styles.detectButton, pressed && styles.pressed]}
              >
                {detectingLocation ? (
                  <ActivityIndicator size="small" />
                ) : (
                  <Text style={styles.detectButtonText}>Erkennen</Text>
                )}
              </Pressable>
            </View>

            {locationStatus === "detected" && (
              <Text style={styles.successText}>Stadt erkannt. Du kannst sie trotzdem manuell ändern.</Text>
            )}

            {locationStatus === "denied" && (
              <Text style={styles.infoText}>Standort wurde nicht freigegeben. Kein Problem — gib deine Stadt manuell ein.</Text>
            )}

            {locationStatus === "failed" && (
              <Text style={styles.infoText}>Ich konnte deine Stadt nicht sicher erkennen. Du kannst sie manuell setzen.</Text>
            )}
          </View>

          <View style={styles.card}>
            <Text style={styles.label}>Lieblingsspot suchen</Text>
            <TextInput
              value={query}
              onChangeText={setQuery}
              placeholder="z.B. 1777, Café Frühling, Volta Bräu …"
              placeholderTextColor="rgba(255,255,255,0.35)"
              autoCorrect={false}
              style={styles.input}
            />

            <View style={styles.listHeader}>
              <Text style={styles.listTitle}>{visibleTitle}</Text>
              {showLoadingList ? <ActivityIndicator size="small" /> : null}
            </View>

            {visibleSpots.length <= 0 ? (
              <View style={styles.emptyBox}>
                <Text style={styles.emptyText}>
                  Keine Spots gefunden. Prüfe die Stadt oder suche nach einem anderen Namen.
                  Für das Startprofil zählen nur Orte, die bereits in Backyrd existieren.
                </Text>
              </View>
            ) : (
              <View style={styles.spotList}>
                {visibleSpots.map((spot) => {
                  const isSelected = selectedIds.has(spot.id);

                  return (
                    <Pressable
                      key={spot.id}
                      onPress={() => addSelected(spot)}
                      disabled={isSelected}
                      style={({ pressed }) => [
                        styles.spotRow,
                        isSelected && styles.spotRowSelected,
                        pressed && !isSelected && styles.spotRowPressed,
                      ]}
                    >
                      <View style={{ flex: 1 }}>
                        <Text style={styles.spotName}>{spot.name}</Text>
                        <Text style={styles.spotMeta} numberOfLines={1}>
                          {[categoryName(spot), spot.city, spot.address].filter(Boolean).join(" · ")}
                        </Text>
                      </View>

                      <Text style={[styles.addText, isSelected && styles.addTextSelected]}>
                        {isSelected ? "Drin" : "+"}
                      </Text>
                    </Pressable>
                  );
                })}
              </View>
            )}
          </View>

          <View style={styles.selectedSection}>
            <View style={styles.selectedHeader}>
              <Text style={styles.selectedTitle}>Deine 3 Ankerpunkte</Text>
              <Text style={[styles.selectedCount, remainingCount <= 0 && styles.selectedCountDone]}>
                {selected.length}/{MIN_SELECTION} Minimum
              </Text>
            </View>

            {selected.length === 0 ? (
              <Text style={styles.selectedEmpty}>
                Noch nichts ausgewählt. Starte mit Orten, bei denen du sofort sagen würdest:
                „Ja, sowas mag ich.“
              </Text>
            ) : (
              <View style={styles.selectedList}>
                {selected.map((spot, index) => (
                  <View key={spot.id} style={styles.selectedRow}>
                    <View style={styles.selectedNumber}>
                      <Text style={styles.selectedNumberText}>{index + 1}</Text>
                    </View>

                    <View style={{ flex: 1 }}>
                      <Text style={styles.selectedName}>{spot.name}</Text>
                      <Text style={styles.selectedMeta}>
                        {[categoryName(spot), spot.city ?? city].filter(Boolean).join(" · ")}
                      </Text>
                    </View>

                    <Pressable onPress={() => removeSelected(spot.id)} style={styles.removeButton}>
                      <Text style={styles.removeText}>Entfernen</Text>
                    </Pressable>
                  </View>
                ))}
              </View>
            )}
          </View>

          <Pressable
            onPress={submit}
            disabled={!canSubmit}
            style={({ pressed }) => [
              styles.submitButton,
              !canSubmit && styles.submitButtonDisabled,
              pressed && canSubmit && styles.pressed,
            ]}
          >
            {submitting ? (
              <ActivityIndicator />
            ) : (
              <Text style={[styles.submitText, !canSubmit && styles.submitTextDisabled]}>
                Meinen Geschmack starten
              </Text>
            )}
          </Pressable>

          <Text style={styles.footerText}>
            Diese Auswahl ist nur der Start. Danach lernt Backyrd über Swipes, Öffnen und Speichern
            weiter, welche Art Orte du wirklich suchst.
          </Text>
        </ScrollView>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}

const theme = {
  bg: "#0B0B0C",
  card: "rgba(255,255,255,0.055)",
  cardStrong: "rgba(255,255,255,0.085)",
  border: "rgba(255,255,255,0.115)",
  borderStrong: "rgba(255,255,255,0.22)",
  text: "#fff",
  muted: "rgba(255,255,255,0.68)",
  faint: "rgba(255,255,255,0.42)",
  cream: "#F4EBDD",
  black: "#050506",
  green: "#BBF7D0",
};

const styles = StyleSheet.create({
  safe: {
    flex: 1,
    backgroundColor: theme.bg,
  },
  content: {
    paddingHorizontal: 16,
    paddingTop: 10,
    paddingBottom: 36,
  },
  hero: {
    marginBottom: 18,
  },
  kicker: {
    color: "rgba(255,255,255,0.46)",
    fontSize: 12,
    fontWeight: "950",
    letterSpacing: 5,
    marginBottom: 12,
  },
  title: {
    color: theme.text,
    fontSize: 34,
    lineHeight: 38,
    fontWeight: "950",
    letterSpacing: -1.1,
  },
  subtitle: {
    color: theme.muted,
    marginTop: 10,
    lineHeight: 21,
    fontSize: 15,
  },
  card: {
    marginTop: 14,
    backgroundColor: theme.card,
    borderColor: theme.border,
    borderWidth: 1,
    borderRadius: 24,
    padding: 14,
  },
  cityRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    gap: 10,
  },
  label: {
    color: theme.muted,
    fontWeight: "850",
    marginBottom: 7,
  },
  input: {
    color: "#fff",
    paddingVertical: 12,
    paddingHorizontal: 13,
    borderRadius: 16,
    backgroundColor: "rgba(255,255,255,0.07)",
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.12)",
    fontWeight: "850",
  },
  detectButton: {
    marginTop: 24,
    paddingHorizontal: 13,
    height: 45,
    borderRadius: 999,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: "rgba(244,235,221,0.12)",
    borderWidth: 1,
    borderColor: "rgba(244,235,221,0.28)",
  },
  detectButtonText: {
    color: theme.cream,
    fontWeight: "950",
  },
  successText: {
    color: theme.green,
    marginTop: 9,
    fontWeight: "800",
    fontSize: 12,
  },
  infoText: {
    color: theme.faint,
    marginTop: 9,
    lineHeight: 18,
    fontSize: 12,
  },
  listHeader: {
    marginTop: 14,
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    gap: 10,
  },
  listTitle: {
    color: "#fff",
    fontWeight: "950",
    fontSize: 15,
  },
  emptyBox: {
    marginTop: 10,
    borderRadius: 16,
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.08)",
    backgroundColor: "rgba(255,255,255,0.035)",
    padding: 12,
  },
  emptyText: {
    color: theme.muted,
    lineHeight: 19,
  },
  spotList: {
    marginTop: 10,
    gap: 8,
  },
  spotRow: {
    paddingVertical: 12,
    paddingHorizontal: 12,
    borderRadius: 16,
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.10)",
    backgroundColor: "rgba(255,255,255,0.045)",
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    gap: 12,
  },
  spotRowSelected: {
    borderColor: "rgba(187,247,208,0.42)",
    backgroundColor: "rgba(187,247,208,0.10)",
  },
  spotRowPressed: {
    borderColor: theme.borderStrong,
    backgroundColor: "rgba(255,255,255,0.09)",
  },
  spotName: {
    color: "#fff",
    fontWeight: "950",
    fontSize: 15,
  },
  spotMeta: {
    color: theme.muted,
    marginTop: 3,
    fontSize: 12,
  },
  addText: {
    color: theme.cream,
    fontWeight: "950",
    fontSize: 18,
  },
  addTextSelected: {
    color: theme.green,
    fontSize: 13,
  },
  selectedSection: {
    marginTop: 16,
  },
  selectedHeader: {
    flexDirection: "row",
    alignItems: "baseline",
    justifyContent: "space-between",
  },
  selectedTitle: {
    color: "#fff",
    fontSize: 18,
    fontWeight: "950",
  },
  selectedCount: {
    color: theme.faint,
    fontWeight: "900",
    fontSize: 12,
  },
  selectedCountDone: {
    color: theme.green,
  },
  selectedEmpty: {
    color: theme.muted,
    marginTop: 9,
    lineHeight: 20,
  },
  selectedList: {
    marginTop: 10,
    gap: 9,
  },
  selectedRow: {
    backgroundColor: theme.cardStrong,
    borderRadius: 18,
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.10)",
    padding: 12,
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    gap: 12,
  },
  selectedNumber: {
    width: 28,
    height: 28,
    borderRadius: 999,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: "rgba(244,235,221,0.13)",
    borderWidth: 1,
    borderColor: "rgba(244,235,221,0.25)",
  },
  selectedNumberText: {
    color: theme.cream,
    fontWeight: "950",
    fontSize: 12,
  },
  selectedName: {
    color: "#fff",
    fontWeight: "950",
  },
  selectedMeta: {
    color: theme.muted,
    marginTop: 2,
    fontSize: 12,
  },
  removeButton: {
    paddingHorizontal: 11,
    paddingVertical: 8,
    borderRadius: 999,
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.14)",
  },
  removeText: {
    color: "#fff",
    fontWeight: "900",
    fontSize: 12,
  },
  submitButton: {
    marginTop: 18,
    height: 56,
    borderRadius: 18,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: "#fff",
  },
  submitButtonDisabled: {
    backgroundColor: "rgba(255,255,255,0.14)",
  },
  submitText: {
    color: "#000",
    fontWeight: "950",
    fontSize: 16,
  },
  submitTextDisabled: {
    color: "rgba(255,255,255,0.48)",
  },
  footerText: {
    color: theme.faint,
    marginTop: 11,
    lineHeight: 18,
    fontSize: 12,
  },
  pressed: {
    opacity: 0.86,
    transform: [{ scale: 0.99 }],
  },
});
