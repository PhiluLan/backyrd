import React, { useCallback, useEffect, useRef, useState } from "react";
import { ActivityIndicator, FlatList, KeyboardAvoidingView, Platform, Pressable, StyleSheet, View } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { Stack, useLocalSearchParams, useRouter } from "expo-router";
import { SafeAreaView } from "react-native-safe-area-context";
import * as Crypto from "expo-crypto";
import type { DecisionProductCandidate, DecisionProductResponse } from "@backyrd/product-decision-contract";

import { AppText, ProductText as Text, ProductTextInput as TextInput } from "@/components/foundation/AppText";
import { SpotArtwork } from "@/components/spot/SpotArtwork";
import { invokeDecisionProduct, recordDecisionProductInteraction } from "@/lib/decision/productDecision";
import { createWohinRequest, visibleWohinCandidates, wohinConsiderations, wohinFitLabel, wohinHighlights, wohinLimitations } from "@/lib/decision/wohinModel";
import { supabase } from "@/lib/supabase";
import { userFacingError } from "@/lib/userFacingError";
import { backyrdTheme } from "@/theme/backyrd";

const color = {
  background: "#050506",
  card: "#1B1B1D",
  text: "#FFFFFF",
  muted: "#A5A5AA",
  border: "#36363B",
  pink: "#FF4F91",
  lime: "#D8FF3E",
  warning: "#FFC878",
};

async function withinIdentityDeadline<T>(operation: PromiseLike<T>): Promise<T> {
  let timer: ReturnType<typeof setTimeout> | undefined;
  try {
    return await Promise.race([
      Promise.resolve(operation),
      new Promise<never>((_, reject) => {
        timer = setTimeout(() => reject(new Error("wohin_identity_timeout")), 8_000);
      }),
    ]);
  } finally {
    if (timer !== undefined) clearTimeout(timer);
  }
}

function availabilityLabel(candidate: DecisionProductCandidate): { text: string; color: string } {
  const requestedDay = candidate.reasons.find((reason) => ["requested-day-opening-hours", "requested-day-closed", "requested-day-opening-unknown"].includes(reason.code));
  if (requestedDay?.code === "requested-day-opening-hours") return { text: requestedDay.statement, color: backyrdTheme.color.openGreen };
  if (requestedDay?.code === "requested-day-closed") return { text: "Am gewünschten Tag geschlossen", color: backyrdTheme.color.warning };
  if (requestedDay?.code === "requested-day-opening-unknown") return { text: "Öffnungszeiten für den gewünschten Tag nicht bestätigt", color: color.muted };
  const value = candidate.actualAvailability;
  if (value === "open") return { text: "Laut Angaben geöffnet", color: backyrdTheme.color.openGreen };
  if (value === "closed") return { text: "Laut Angaben geschlossen", color: backyrdTheme.color.warning };
  if (value === "not_requested") return { text: "Öffnungszeiten vor Besuch prüfen", color: color.muted };
  return { text: "Öffnungszeiten nicht bestätigt", color: color.muted };
}

function interpretationLabel(response: DecisionProductResponse): string {
  const intent = response.interpretation.primaryIntent;
  const intentLabel = intent === "COFFEE" ? "Kaffee" : intent === "EAT" ? "Essen" : intent === "DRINKS" ? "Drinks" : null;
  const dateTime = response.interpretation.dateTime;
  const localDate = dateTime && typeof dateTime === "object" && "localDate" in dateTime && typeof dateTime.localDate === "string" ? dateTime.localDate : null;
  const date = localDate && /^\d{4}-\d{2}-\d{2}$/.test(localDate)
    ? new Intl.DateTimeFormat("de-CH", { weekday: "long", day: "numeric", month: "long", timeZone: "Europe/Zurich" }).format(new Date(`${localDate}T12:00:00Z`))
    : null;
  return [intentLabel ?? "Dein Wunsch", response.interpretation.targetCity, date].filter(Boolean).join(" · ");
}

function DecisionResultCard({ candidate, personalizationActive, onOpen }: {
  candidate: DecisionProductCandidate;
  personalizationActive: boolean;
  onOpen: () => void;
}) {
  const [detailsOpen, setDetailsOpen] = useState(false);
  const highlights = wohinHighlights(candidate, personalizationActive);
  const considerations = wohinConsiderations(candidate, personalizationActive);
  const availability = availabilityLabel(candidate);
  const placeMeta = [candidate.presentation.categoryLabel, candidate.presentation.locality].filter(Boolean).join(" · ");

  return (
    <View style={styles.resultCard}>
      <View style={styles.resultImageWrap}>
        <SpotArtwork imageUrl={candidate.presentation.imageUrl} spotId={candidate.spotId} spotName={candidate.presentation.name} showFallbackName={false} style={styles.resultImage} />
      </View>
      <View style={styles.resultContent}>
        <AppText role="label" tone={candidate.coreIntentCoverage === "CONFIRMED" ? "pink" : "secondary"}>{wohinFitLabel(candidate)}</AppText>
        <AppText role="screenTitle" style={styles.resultTitle}>{candidate.presentation.name}</AppText>
        {placeMeta ? <AppText role="meta" tone="secondary" style={styles.resultMeta}>{placeMeta}</AppText> : null}
        <View style={styles.availabilityRow}>
          <Ionicons name="time-outline" size={16} color={availability.color} />
          <AppText role="meta" style={{ color: availability.color, flex: 1 }}>{availability.text}</AppText>
        </View>
        <View style={styles.reasonSection}>
          <AppText role="label" style={styles.reasonHeading}>Warum dieser Ort?</AppText>
          {highlights.length ? highlights.map((reason) => (
            <View key={reason} style={styles.reasonRow}>
              <View style={styles.reasonDot} />
              <AppText role="body" style={styles.reasonText}>{reason}</AppText>
            </View>
          )) : <AppText role="body" tone="secondary">Zur genauen Passung fehlen noch Angaben.</AppText>}
          {candidate.tier !== "ELIGIBLE_CONFIRMED" ? considerations.slice(0, 2).map((note) => <AppText key={note} role="meta" tone="secondary" style={styles.detailNote}>{note}</AppText>) : null}
          {considerations.length ? <>
            <Pressable accessibilityRole="button" accessibilityState={{ expanded: detailsOpen }} onPress={() => setDetailsOpen((open) => !open)} style={styles.detailsToggle}>
              <AppText role="meta" tone="pink">Was du noch wissen solltest</AppText>
              <Ionicons name={detailsOpen ? "chevron-up" : "chevron-down"} size={16} color={color.pink} />
            </Pressable>
            {detailsOpen ? considerations.slice(candidate.tier !== "ELIGIBLE_CONFIRMED" ? 2 : 0).map((note) => <AppText key={note} role="meta" tone="secondary" style={styles.detailNote}>{note}</AppText>) : null}
          </> : null}
        </View>
        <Pressable accessibilityRole="button" accessibilityLabel={`${candidate.presentation.name} ansehen`} onPress={onOpen} style={styles.openSpotButton}>
          <AppText role="label" style={styles.openSpotText}>Spot ansehen</AppText>
          <Ionicons name="arrow-forward" size={18} color={color.background} />
        </Pressable>
      </View>
    </View>
  );
}

export default function WohinScreen() {
  const router = useRouter();
  const params = useLocalSearchParams<{ query?: string; auto?: string }>();
  const [query, setQuery] = useState("");
  const [city, setCity] = useState<string | null>(null);
  const [identityReady, setIdentityReady] = useState(false);
  const [authenticated, setAuthenticated] = useState(false);
  const [identityError, setIdentityError] = useState(false);
  const [identityAttempt, setIdentityAttempt] = useState(0);
  const [loading, setLoading] = useState(false);
  const [response, setResponse] = useState<DecisionProductResponse | null>(null);
  const [candidates, setCandidates] = useState<DecisionProductCandidate[]>([]);
  const [error, setError] = useState<string | null>(null);
  const autoRunKey = useRef<string | null>(null);
  const seenImpressions = useRef(new Set<string>());
  const responseRef = useRef<DecisionProductResponse | null>(null);
  const requestGeneration = useRef(0);
  const viewabilityConfig = useRef({ itemVisiblePercentThreshold: 50 }).current;
  const onViewableItemsChanged = useRef(({ viewableItems }: { viewableItems: { item: DecisionProductCandidate; isViewable: boolean }[] }) => {
    const current = responseRef.current;
    if (!current) return;
    for (const { item, isViewable } of viewableItems) {
      if (!isViewable) continue;
      const key = `${current.decisionId}:${item.spotId}`;
      if (seenImpressions.current.has(key)) continue;
      seenImpressions.current.add(key);
      const actionId = Crypto.randomUUID();
      void recordDecisionProductInteraction({
        supabase,
        request: { contractVersion: "backyrd.decision-vnext.product-interaction-request@1.0", actionId, idempotencyKey: actionId, decisionId: current.decisionId, eventType: "candidate_impression", candidateId: item.spotId },
      }).catch(() => undefined);
    }
  }).current;

  useEffect(() => {
    let active = true;
    setIdentityReady(false);
    setIdentityError(false);
    setAuthenticated(false);
    setCity(null);
    void (async () => {
      const { data, error: authError } = await withinIdentityDeadline(supabase.auth.getUser());
      if (!active) return;
      if (authError) throw authError;
      if (!data.user) {
        setAuthenticated(false);
        setIdentityReady(true);
        return;
      }
      setAuthenticated(true);
      const { data: profile, error: profileError } = await withinIdentityDeadline(
        supabase.from("profiles").select("city").eq("id", data.user.id).maybeSingle(),
      );
      if (!active) return;
      if (profileError) throw profileError;
      setCity(typeof profile?.city === "string" ? profile.city.trim() : null);
      setIdentityReady(true);
    })().catch(() => { if (active) { setIdentityError(true); setIdentityReady(true); } });
    return () => { active = false; };
  }, [identityAttempt]);

  useEffect(() => {
    if (typeof params.query === "string") setQuery(params.query);
  }, [params.query]);

  const run = useCallback(async (text: string) => {
    if (!identityReady || identityError || !authenticated || !city || loading) return;
    const generation = ++requestGeneration.current;
    setLoading(true);
    setError(null);
    responseRef.current = null;
    setResponse(null);
    setCandidates([]);
    try {
      const request = createWohinRequest({ query: text, city, requestId: Crypto.randomUUID() });
      const result = await invokeDecisionProduct({ supabase, request });
      const visible = visibleWohinCandidates(result);
      if (generation !== requestGeneration.current) return;
      responseRef.current = result;
      setResponse(result);
      setCandidates(visible);
    } catch (cause) {
      if (generation === requestGeneration.current) setError(userFacingError(cause, "Wohin kann gerade keine verlässlichen Vorschläge zeigen."));
    } finally {
      setLoading(false);
    }
  }, [authenticated, city, identityError, identityReady, loading]);

  useEffect(() => {
    const incoming = typeof params.query === "string" ? params.query.trim() : "";
    if (!identityReady || identityError || !authenticated || !city || params.auto !== "1" || incoming.length < 3) return;
    const key = `${city}:${incoming}`;
    if (autoRunKey.current === key) return;
    autoRunKey.current = key;
    void run(incoming);
  }, [authenticated, city, identityError, identityReady, params.auto, params.query, run]);

  const openSpot = (candidate: DecisionProductCandidate) => {
    if (response) {
      const actionId = Crypto.randomUUID();
      void recordDecisionProductInteraction({
        supabase,
        request: { contractVersion: "backyrd.decision-vnext.product-interaction-request@1.0", actionId, idempotencyKey: actionId, decisionId: response.decisionId, eventType: "candidate_opened", candidateId: candidate.spotId },
      }).catch(() => undefined);
    }
    router.push(`/spot/${candidate.spotId}?entrySource=decision` as never);
  };

  const limitations = response ? wohinLimitations(response.limitations, candidates.length) : [];

  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: color.background }} edges={["top", "left", "right"]}>
      <Stack.Screen options={{ title: "Wohin", headerShown: false }} />
      <KeyboardAvoidingView style={{ flex: 1 }} behavior={Platform.OS === "ios" ? "padding" : undefined}>
        <FlatList
          data={candidates}
          keyExtractor={(candidate) => candidate.spotId}
          keyboardShouldPersistTaps="handled"
          contentContainerStyle={{ paddingHorizontal: 22, paddingTop: 28, paddingBottom: 130 }}
          viewabilityConfig={viewabilityConfig}
          onViewableItemsChanged={onViewableItemsChanged}
          ListHeaderComponent={<>
          <AppText role="caption" tone="lime">DEIN NÄCHSTER MOMENT</AppText>
          <AppText role="displayL" style={{ color: color.text, marginTop: 10 }}>Wohin?</AppText>
          <Text style={{ color: color.muted, marginTop: 10, lineHeight: 22 }}>Worauf hast du gerade Lust? Erzähl es uns in deinen Worten – wir zeigen dir passende Orte mit einem nachvollziehbaren Grund.</Text>

          <View style={{ marginTop: 32, padding: 20, borderRadius: 28, backgroundColor: color.card, borderWidth: 1, borderColor: color.border }}>
            <Text style={{ color: color.pink, fontSize: 14, fontWeight: "900" }}>Was jetzt?</Text>
            <TextInput
              accessibilityLabel="Was jetzt?"
              autoCapitalize="sentences"
              multiline
              maxLength={2000}
              onChangeText={(value) => { requestGeneration.current += 1; responseRef.current = null; setQuery(value); setResponse(null); setCandidates([]); setError(null); }}
              placeholder="z. B. Sonntag gemütlich Kaffee trinken"
              placeholderTextColor="#77777C"
              style={{ color: color.text, fontSize: 21, minHeight: 110, marginTop: 16, textAlignVertical: "top", lineHeight: 29 }}
              value={query}
            />
            <Text style={{ color: color.muted, fontSize: 12, marginTop: 8 }}>{city ? `Für ${city} · Ort aus deinem Profil` : "Dein Profilort wird geladen"}</Text>
            <Pressable
              accessibilityRole="button"
              disabled={loading || !identityReady || identityError || !authenticated || !city || query.trim().length < 3}
              onPress={() => void run(query)}
              style={{ marginTop: 22, minHeight: 54, borderRadius: 999, backgroundColor: !loading && authenticated && city && query.trim().length >= 3 ? color.pink : "#48484C", alignItems: "center", justifyContent: "center" }}
            >
              {loading ? <ActivityIndicator color={color.background} /> : <Text style={{ color: color.background, fontWeight: "900", fontSize: 16 }}>Orte finden</Text>}
            </Pressable>
          </View>

          {identityError ? <View style={{ marginTop: 20 }}><Text style={{ color: color.warning }}>Dein Profil konnte gerade nicht geprüft werden. Wohin ist vorübergehend nicht verfügbar.</Text><Pressable accessibilityRole="button" onPress={() => setIdentityAttempt((value) => value + 1)}><Text style={{ color: color.pink, marginTop: 12, fontWeight: "800" }}>Erneut prüfen</Text></Pressable></View> : null}
          {identityReady && !identityError && !authenticated ? <Text style={{ color: color.warning, marginTop: 20 }}>Bitte melde dich an, um Wohin zu nutzen.</Text> : null}
          {identityReady && !identityError && authenticated && !city ? <Text style={{ color: color.warning, marginTop: 20 }}>Deine Stadt fehlt noch im Profil. Ergänze sie, damit wir passende Orte in deiner Nähe finden können.</Text> : null}
          {error ? <Text style={{ color: color.warning, marginTop: 20 }}>{error}</Text> : null}

          {response ? (
            <View style={{ marginTop: 34 }}>
              <AppText role="caption" tone="pink">FÜR DEINEN MOMENT</AppText>
              <AppText role="sectionTitle" style={{ marginTop: 8 }}>Orte für deinen Wunsch</AppText>
              <AppText role="meta" tone="secondary" style={{ marginTop: 8 }}>{interpretationLabel(response)}</AppText>
              <AppText role="caption" tone="muted" style={{ marginTop: 10 }}>{response.personalization.state === "ACTIVE" ? "Mit deinen freigegebenen Vorlieben sortiert" : "Ohne persönliche Vorlieben sortiert"}</AppText>
              {candidates.length === 0 ? <Text style={{ color: color.warning, marginTop: 12 }}>Für diesen Wunsch haben wir gerade keinen ausreichend belegten Ort. Wenn dir einzelne Bedingungen wichtig sind, streiche sie nicht nur für einen Treffer.</Text> : null}
            </View>
          ) : null}
          </>}
          renderItem={({ item: candidate }) => <DecisionResultCard candidate={candidate} personalizationActive={response?.personalization.state === "ACTIVE"} onOpen={() => openSpot(candidate)} />}
          ListFooterComponent={limitations.length ? <View style={styles.resultFooter}>{limitations.map((note) => <AppText key={note} role="meta" tone="secondary" style={styles.limitationNote}>{note}</AppText>)}</View> : null}
        />
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  resultCard: { marginTop: backyrdTheme.spacing.lg, borderRadius: backyrdTheme.radius.lg, overflow: "hidden", backgroundColor: backyrdTheme.color.surfaceElevated },
  resultImageWrap: { position: "relative" },
  resultImage: { height: 160 },
  resultContent: { padding: backyrdTheme.spacing.lg },
  resultTitle: { marginTop: 6 },
  resultMeta: { marginTop: 4 },
  availabilityRow: { marginTop: backyrdTheme.spacing.md, flexDirection: "row", alignItems: "flex-start", gap: 8 },
  reasonSection: { marginTop: backyrdTheme.spacing.lg, paddingTop: backyrdTheme.spacing.lg, borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: backyrdTheme.color.border, gap: 10 },
  reasonHeading: { marginBottom: 2 },
  reasonRow: { flexDirection: "row", alignItems: "flex-start", gap: 10 },
  reasonDot: { width: 6, height: 6, marginTop: 9, borderRadius: 3, backgroundColor: backyrdTheme.color.pink },
  reasonText: { flex: 1 },
  detailsToggle: { minHeight: 44, flexDirection: "row", alignItems: "center", gap: 8, alignSelf: "flex-start" },
  detailNote: { paddingLeft: 16 },
  openSpotButton: { marginTop: backyrdTheme.spacing.lg, minHeight: backyrdTheme.control.standard, borderRadius: backyrdTheme.radius.pill, backgroundColor: backyrdTheme.color.pink, flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 10 },
  openSpotText: { color: backyrdTheme.color.background },
  resultFooter: { paddingTop: backyrdTheme.spacing.lg, paddingBottom: backyrdTheme.spacing.md },
  limitationNote: { marginBottom: backyrdTheme.spacing.sm },
});
