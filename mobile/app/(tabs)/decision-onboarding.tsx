// mobile/app/(tabs)/decision-onboarding.tsx

import React, { useCallback, useEffect, useMemo, useState } from "react";
import { ActivityIndicator, Alert, KeyboardAvoidingView, Platform, Pressable, ScrollView, StyleSheet, View } from "react-native";
import { AppText as Text, ProductTextInput as TextInput } from "../../components/foundation/AppText";
import { Ionicons } from "@expo/vector-icons";
import { Stack, useRouter } from "expo-router";
import { SafeAreaView } from "react-native-safe-area-context";

import { supabase } from "@/lib/supabase";
import { hasActiveConsent, setMyConsent } from "@/lib/consent";
import { getMyProductEntryStatus } from "@/lib/onboardingStatus";
import {
  normalizeLocationCity,
  resolveLocationContext,
} from "../../lib/locationContext";
import { safeDevelopmentWarning } from "../../lib/privacySanitize";
import { backyrdTheme } from "../../theme/backyrd";

type SpotRow = {
  id: string;
  name: string;
  city: string | null;
  address?: string | null;
  categories?: { name?: string | null } | null;
};

type CompleteOnboardingRow = {
  ok: boolean;
  alreadyCompleted?: boolean;
  selectedCount?: number;
  declaredEvidenceCount?: number;
  semanticContractVersion?: string;
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
  const [personalizationConsent, setPersonalizationConsent] = useState(false);
  const [personalizationConsentPersisted, setPersonalizationConsentPersisted] = useState(false);

  const [results, setResults] = useState<SpotRow[]>([]);
  const [suggestions, setSuggestions] = useState<SpotRow[]>([]);
  const [selected, setSelected] = useState<SpotRow[]>([]);
  const [showAllSuggestions, setShowAllSuggestions] = useState(false);

  const selectedIds = useMemo(() => new Set(selected.map((spot) => spot.id)), [selected]);
  const canSubmit =
    selected.length >= MIN_SELECTION &&
    selected.length <= MAX_SELECTION &&
    personalizationConsent &&
    !submitting;
  const remainingCount = Math.max(0, MIN_SELECTION - selected.length);

  const loadSuggestions = useCallback(async (nextCity: string) => {
    const c = normalizeCity(nextCity);

    try {
      setLoadingSuggestions(true);

      const { data, error } = await supabase
        .from("spots")
        .select("id,name,city,address,categories(name)")
        .eq("status", "approved")
        .in("data_origin", ["REAL", "LEGACY", "IMPORT"])
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
        .in("data_origin", ["REAL", "LEGACY", "IMPORT"])
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

      const context = await resolveLocationContext({
        purpose: "city_detection",
        requestPermission: true,
        forceConsentRefresh: true,
        allowCityFallback: false,
        timeoutMs: 8_000,
      });

      if (!context.coordinates) {
        setLocationStatus(
          context.failureReason === "permission_denied" ||
            context.failureReason === "consent_not_granted"
            ? "denied"
            : "failed",
        );
        return;
      }

      const detectedCity = normalizeLocationCity(context.city);

      if (!detectedCity) {
        setLocationStatus("failed");
        return;
      }

      setCity(detectedCity);
      setQuery("");
      setResults([]);
      setShowAllSuggestions(false);
      setLocationStatus("detected");
      loadSuggestions(detectedCity);
    } catch (error) {
      safeDevelopmentWarning("[decision-onboarding] location detection failed", error);
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

      const entryStatus = await getMyProductEntryStatus();
      if (!alive) return;
      if (entryStatus.canEnterDecision) {
        router.replace("/(tabs)/wohin" as any);
        return;
      }

      const consentGranted = await hasActiveConsent("personalized_recommendations", {
        forceRefresh: true,
      });
      if (!alive) return;
      setPersonalizationConsent(consentGranted);
      setPersonalizationConsentPersisted(consentGranted);
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
    if (selected.length < MIN_SELECTION) {
      Alert.alert("Noch nicht ganz", `Wähle mindestens ${MIN_SELECTION} echte Backyrd-Spots aus.`);
      return;
    }
    if (!personalizationConsent) {
      Alert.alert(
        "Einwilligung fehlt",
        "Aktiviere persönliche Empfehlungen, damit Backyrd deine Auswahl als Start-Geschmack speichern darf."
      );
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

      if (!personalizationConsentPersisted) {
        await setMyConsent("personalized_recommendations", true);
        setPersonalizationConsentPersisted(true);
      }

      const { data, error } = await supabase.rpc("complete_decision_onboarding_v2", {
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
      Alert.alert(
        "Speichern fehlgeschlagen",
        "Dein Start-Geschmack konnte gerade nicht gespeichert werden. Versuch es bitte noch einmal."
      );
    } finally {
      setSubmitting(false);
    }
  }, [city, personalizationConsent, personalizationConsentPersisted, router, selected]);

  const isSearching = query.trim().length >= 2;
  const visibleSpots = isSearching ? results : showAllSuggestions ? suggestions : suggestions.slice(0, 6);
  const visibleTitle = isSearching ? "Gefundene Spots" : "Vorschläge in deiner Stadt";
  const showLoadingList = isSearching ? searching : loadingSuggestions;

  return (
    <SafeAreaView style={styles.safe} edges={["top", "left", "right"]}>
      <Stack.Screen
        options={{
          title: "Dein Startgeschmack",
          headerShown: false,
        }}
      />

      <KeyboardAvoidingView style={{ flex: 1 }} behavior={Platform.OS === "ios" ? "padding" : undefined}>
        <ScrollView
          keyboardShouldPersistTaps="handled"
          contentContainerStyle={styles.content}
          showsVerticalScrollIndicator={false}
        >
          <View style={styles.hero}>
            <View style={styles.brandMark}><Text role="cardTitle" style={styles.brandLetter}>B</Text></View>
            <Text role="label" tone="pink" style={styles.kicker}>DEIN BACKYRD</Text>
            <Text role="displayM" style={styles.title}>Was magst du wirklich?</Text>
            <Text role="body" tone="secondary" style={styles.subtitle}>
              Wähle drei Orte, an denen du gerne bist. So finden wir Erlebnisse, die zu dir passen.
            </Text>
            <View style={styles.progressTrack}><View style={[styles.progressFill, { width: `${Math.min(selected.length, MIN_SELECTION) / MIN_SELECTION * 100}%` }]} /></View>
            <Text role="caption" tone="secondary" style={styles.progressLabel}>
              {remainingCount > 0 ? `Noch ${remainingCount} ${remainingCount === 1 ? "Ort" : "Orte"} auswählen` : `${selected.length} Lieblingsorte ausgewählt`}
            </Text>
          </View>

          <View style={styles.citySection}>
            <Text role="label" style={styles.sectionEyebrow}>WO SUCHST DU?</Text>
            <View style={styles.cityRow}>
              <View style={{ flex: 1 }}>
                <TextInput
                  accessibilityLabel="Stadt"
                  value={city}
                  onChangeText={(text) => {
                    setCity(text);
                    setQuery("");
                    setResults([]);
                    setShowAllSuggestions(false);
                  }}
                  placeholder="Basel"
                  placeholderTextColor="rgba(255,255,255,0.35)"
                  autoCapitalize="words"
                  style={styles.input}
                />
              </View>

              <Pressable
                accessibilityRole="button"
                accessibilityLabel="Stadt über Standort erkennen"
                onPress={detectLocation}
                disabled={detectingLocation}
                style={({ pressed }) => [styles.detectButton, pressed && styles.pressed]}
              >
                {detectingLocation ? (
                  <ActivityIndicator size="small" color={backyrdTheme.color.pink} />
                ) : (
                  <Ionicons name="locate-outline" size={21} color={backyrdTheme.color.pink} />
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

          <View style={styles.searchSection}>
            <Text role="sectionTitle">Deine Lieblingsorte</Text>
            <Text role="meta" tone="secondary" style={styles.sectionHint}>Suche nach Orten, die du schon kennst und magst.</Text>
            <View style={styles.searchInputWrap}>
              <Ionicons name="search-outline" size={20} color={backyrdTheme.color.textSecondary} />
              <TextInput
                accessibilityLabel="Lieblingsort suchen"
                value={query}
                onChangeText={setQuery}
                placeholder="Spot suchen"
                placeholderTextColor={backyrdTheme.color.textMuted}
                autoCorrect={false}
                style={styles.searchInput}
              />
            </View>

            <View style={styles.listHeader}>
              <Text role="label" style={styles.listTitle}>{visibleTitle}</Text>
              {showLoadingList ? <ActivityIndicator size="small" color={backyrdTheme.color.pink} /> : null}
            </View>

            {visibleSpots.length <= 0 ? (
              <View style={styles.emptyBox}>
                <Text role="meta" tone="secondary" style={styles.emptyText}>
                  {showLoadingList ? "Orte werden geladen …" : "Hier ist noch kein passender Spot. Versuche einen anderen Namen oder eine andere Stadt."}
                </Text>
              </View>
            ) : (
              <View style={styles.spotList}>
                {visibleSpots.map((spot) => {
                  const isSelected = selectedIds.has(spot.id);

                  return (
                    <Pressable
                      key={spot.id}
                      accessibilityRole="button"
                      accessibilityLabel={`${spot.name} ${isSelected ? "bereits ausgewählt" : "als Lieblingsort hinzufügen"}`}
                      onPress={() => addSelected(spot)}
                      disabled={isSelected}
                      style={({ pressed }) => [
                        styles.spotRow,
                        isSelected && styles.spotRowSelected,
                        pressed && !isSelected && styles.spotRowPressed,
                      ]}
                    >
                      <View style={styles.spotRowCopy}>
                        <Text role="bodyStrong" style={styles.spotName} numberOfLines={1}>{spot.name}</Text>
                        <Text role="caption" tone="secondary" style={styles.spotMeta} numberOfLines={1}>
                          {[categoryName(spot), spot.city, spot.address].filter(Boolean).join(" · ")}
                        </Text>
                      </View>
                      <View style={[styles.addIcon, isSelected && styles.addIconSelected]}><Ionicons name={isSelected ? "checkmark" : "add"} size={19} color={isSelected ? backyrdTheme.color.background : backyrdTheme.color.pink} /></View>
                    </Pressable>
                  );
                })}
              </View>
            )}
            {!isSearching && suggestions.length > 6 && !showAllSuggestions ? (
              <Pressable accessibilityRole="button" onPress={() => setShowAllSuggestions(true)} style={styles.moreSuggestions}>
                <Text role="label" tone="pink">Weitere Orte anzeigen</Text>
                <Ionicons name="chevron-down" size={17} color={backyrdTheme.color.pink} />
              </Pressable>
            ) : null}
          </View>

          <View style={styles.selectedSection}>
            <View style={styles.selectedHeader}>
              <Text role="sectionTitle" style={styles.selectedTitle}>Deine Auswahl</Text>
              <Text role="label" style={[styles.selectedCount, remainingCount <= 0 && styles.selectedCountDone]}>
                {remainingCount > 0 ? `${selected.length} / ${MIN_SELECTION}` : `${selected.length} gewählt`}
              </Text>
            </View>

            {selected.length === 0 ? (
              <Text role="meta" tone="secondary" style={styles.selectedEmpty}>
                Noch nichts ausgewählt. Welche Orte würdest du Freunden sofort empfehlen?
              </Text>
            ) : (
              <View style={styles.selectedList}>
                {selected.map((spot, index) => (
                  <View key={spot.id} style={styles.selectedRow}>
                    <View style={styles.selectedNumber}>
                      <Text role="caption" style={styles.selectedNumberText}>{index + 1}</Text>
                    </View>

                    <View style={{ flex: 1 }}>
                      <Text role="bodyStrong" style={styles.selectedName}>{spot.name}</Text>
                      <Text role="caption" tone="secondary" style={styles.selectedMeta}>
                        {[categoryName(spot), spot.city ?? city].filter(Boolean).join(" · ")}
                      </Text>
                    </View>

                    <Pressable accessibilityRole="button" accessibilityLabel={`${spot.name} entfernen`} onPress={() => removeSelected(spot.id)} style={styles.removeButton}>
                      <Ionicons name="close" size={20} color={backyrdTheme.color.textSecondary} />
                    </Pressable>
                  </View>
                ))}
              </View>
            )}
          </View>

          <Pressable
            accessibilityRole="checkbox"
            accessibilityState={{ checked: personalizationConsent }}
            onPress={() => setPersonalizationConsent((current) => !current)}
            style={({ pressed }) => [styles.consentCard, pressed && styles.pressed]}
          >
            <View style={[styles.consentCheckbox, personalizationConsent && styles.consentCheckboxChecked]}>
              <Text style={styles.consentCheckmark}>{personalizationConsent ? "✓" : ""}</Text>
            </View>
            <View style={styles.consentCopy}>
              <Text role="bodyStrong" style={styles.consentTitle}>Persönliche Empfehlungen</Text>
              <Text role="caption" tone="secondary" style={styles.consentText}>
                Backyrd darf diese Auswahl nutzen, um deinen Start-Geschmack aufzubauen. Du kannst
                diese Einwilligung jederzeit im Privacy Center widerrufen.
              </Text>
            </View>
          </Pressable>

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
              <ActivityIndicator color={backyrdTheme.color.background} />
            ) : (
              <View style={styles.submitInner}><Text role="bodyStrong" style={[styles.submitText, !canSubmit && styles.submitTextDisabled]}>Mein Backyrd entdecken</Text><Ionicons name="arrow-forward" size={20} color={canSubmit ? backyrdTheme.color.background : backyrdTheme.color.textMuted} /></View>
            )}
          </Pressable>

          <Text role="caption" tone="secondary" style={styles.footerText}>
            Deine Auswahl ist nur der Anfang. Du kannst deinen Geschmack später weiterentwickeln.
          </Text>
        </ScrollView>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: backyrdTheme.color.background },
  content: { paddingHorizontal: backyrdTheme.layout.pageGutter, paddingTop: 28, paddingBottom: 80 },
  hero: { paddingBottom: 32 },
  brandMark: { width: 42, height: 42, borderRadius: 13, backgroundColor: backyrdTheme.color.pink, alignItems: "center", justifyContent: "center", marginBottom: 34 },
  brandLetter: { color: backyrdTheme.color.background },
  kicker: { letterSpacing: 3, marginBottom: 10 },
  title: { maxWidth: 310 },
  subtitle: { marginTop: 14, maxWidth: 340 },
  progressTrack: { height: 3, borderRadius: 2, backgroundColor: backyrdTheme.color.surfaceElevated, overflow: "hidden", marginTop: 28 },
  progressFill: { height: 3, borderRadius: 2, backgroundColor: backyrdTheme.color.pink },
  progressLabel: { marginTop: 10 },
  citySection: { borderTopWidth: 1, borderColor: backyrdTheme.color.border, paddingTop: 24 },
  sectionEyebrow: { color: backyrdTheme.color.pink, letterSpacing: 2, marginBottom: 14 },
  cityRow: { flexDirection: "row", alignItems: "center", gap: 10 },
  input: { color: backyrdTheme.color.textPrimary, fontSize: 16, minHeight: 54, paddingHorizontal: 18, borderRadius: backyrdTheme.radius.md, backgroundColor: backyrdTheme.color.surface, borderWidth: 1, borderColor: backyrdTheme.color.border },
  detectButton: { width: 54, height: 54, borderRadius: backyrdTheme.radius.md, borderWidth: 1, borderColor: backyrdTheme.color.border, backgroundColor: backyrdTheme.color.surface, alignItems: "center", justifyContent: "center" },
  successText: { color: backyrdTheme.color.success, marginTop: 10 },
  infoText: { color: backyrdTheme.color.textSecondary, marginTop: 10 },
  searchSection: { marginTop: 38 },
  sectionHint: { marginTop: 5 },
  searchInputWrap: { marginTop: 20, minHeight: 54, paddingHorizontal: 17, borderRadius: backyrdTheme.radius.pill, borderWidth: 1, borderColor: backyrdTheme.color.border, backgroundColor: backyrdTheme.color.surface, flexDirection: "row", alignItems: "center", gap: 11 },
  searchInput: { flex: 1, minHeight: 52, color: backyrdTheme.color.textPrimary, fontSize: 16 },
  listHeader: { marginTop: 28, flexDirection: "row", justifyContent: "space-between", alignItems: "center", gap: 10 },
  listTitle: { color: backyrdTheme.color.textSecondary },
  emptyBox: { marginTop: 14, paddingVertical: 18 },
  emptyText: { lineHeight: 21 },
  spotList: { marginTop: 8 },
  spotRow: { minHeight: 70, paddingVertical: 13, borderBottomWidth: 1, borderColor: backyrdTheme.color.border, flexDirection: "row", alignItems: "center", gap: 12 },
  spotRowCopy: { flex: 1, minWidth: 0 },
  spotRowSelected: { opacity: 0.52 },
  spotRowPressed: { opacity: 0.7 },
  spotName: { color: backyrdTheme.color.textPrimary },
  spotMeta: { marginTop: 3 },
  addIcon: { width: 36, height: 36, borderRadius: 18, alignItems: "center", justifyContent: "center", backgroundColor: "rgba(255,79,145,0.12)" },
  addIconSelected: { backgroundColor: backyrdTheme.color.pink },
  moreSuggestions: { minHeight: 50, flexDirection: "row", alignItems: "center", gap: 6 },
  selectedSection: { marginTop: 40, borderTopWidth: 1, borderColor: backyrdTheme.color.border, paddingTop: 26 },
  selectedHeader: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", gap: 12 },
  selectedTitle: { flex: 1 },
  selectedCount: { color: backyrdTheme.color.textSecondary },
  selectedCountDone: { color: backyrdTheme.color.success },
  selectedEmpty: { marginTop: 12 },
  selectedList: { marginTop: 14 },
  selectedRow: { minHeight: 70, borderBottomWidth: 1, borderColor: backyrdTheme.color.border, flexDirection: "row", alignItems: "center", gap: 12 },
  selectedNumber: { width: 30, height: 30, borderRadius: 15, alignItems: "center", justifyContent: "center", backgroundColor: "rgba(255,79,145,0.13)" },
  selectedNumberText: { color: backyrdTheme.color.pink },
  selectedName: { color: backyrdTheme.color.textPrimary },
  selectedMeta: { marginTop: 2 },
  removeButton: { width: 44, height: 44, alignItems: "center", justifyContent: "center" },
  consentCard: { marginTop: 40, paddingVertical: 20, borderTopWidth: 1, borderBottomWidth: 1, borderColor: backyrdTheme.color.border, flexDirection: "row", alignItems: "flex-start", gap: 14 },
  consentCheckbox: { width: 26, height: 26, borderRadius: 8, borderWidth: 1, borderColor: backyrdTheme.color.textSecondary, alignItems: "center", justifyContent: "center", marginTop: 1 },
  consentCheckboxChecked: { backgroundColor: backyrdTheme.color.pink, borderColor: backyrdTheme.color.pink },
  consentCheckmark: { color: backyrdTheme.color.background, fontSize: 17 },
  consentCopy: { flex: 1 },
  consentTitle: { color: backyrdTheme.color.textPrimary },
  consentText: { marginTop: 6, lineHeight: 19 },
  submitButton: { marginTop: 24, minHeight: 56, borderRadius: backyrdTheme.radius.pill, alignItems: "center", justifyContent: "center", backgroundColor: backyrdTheme.color.pink },
  submitButtonDisabled: { backgroundColor: backyrdTheme.color.surfaceElevated },
  submitInner: { flexDirection: "row", alignItems: "center", gap: 12 },
  submitText: { color: backyrdTheme.color.background },
  submitTextDisabled: { color: backyrdTheme.color.textMuted },
  footerText: { marginTop: 18, textAlign: "center" },
  pressed: { opacity: 0.86, transform: [{ scale: backyrdTheme.motion.pressScale }] },
});
