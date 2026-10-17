import React, { useCallback, useEffect, useRef, useState } from "react";
import { ActivityIndicator, FlatList, Keyboard, KeyboardAvoidingView, Modal, Platform, Pressable, ScrollView, StyleSheet, View } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { Stack, useLocalSearchParams, useRouter } from "expo-router";
import { LinearGradient } from "expo-linear-gradient";
import { SafeAreaView, useSafeAreaInsets } from "react-native-safe-area-context";
import * as Crypto from "expo-crypto";
import type { DecisionProductCandidate, DecisionProductResponse } from "@backyrd/product-decision-contract";

import { AppText, ProductText as Text, ProductTextInput as TextInput } from "@/components/foundation/AppText";
import { SpotArtwork } from "@/components/spot/SpotArtwork";
import { invokeDecisionProduct, recordDecisionProductInteraction } from "@/lib/decision/productDecision";
import { createWohinRequest, visibleWohinCandidates, wohinConsiderations, wohinFitLabel, wohinHighlights, wohinLimitations, wohinPlaceMeta } from "@/lib/decision/wohinModel";
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

function DecisionResultCard({ candidate, personalizationActive, compact, onOpen, onDetails }: {
  candidate: DecisionProductCandidate;
  personalizationActive: boolean;
  compact: boolean;
  onOpen: () => void;
  onDetails: () => void;
}) {
  const highlights = wohinHighlights(candidate, personalizationActive);
  return (
    <View style={styles.resultCard} testID="wohin-result-card">
      <SpotArtwork imageUrl={candidate.presentation.imageUrl} spotId={candidate.spotId} spotName={candidate.presentation.name} showFallbackName={false} attributionPosition="top" style={StyleSheet.absoluteFill} />
      <LinearGradient pointerEvents="none" colors={["transparent", "rgba(5,5,6,0.45)", "rgba(5,5,6,0.97)"]} locations={[0, 0.35, 1]} style={StyleSheet.absoluteFill} />
      <View style={[styles.cardBottom, compact && styles.compactBottom]}>
        <ScrollView style={styles.cardSummary} contentContainerStyle={styles.cardSummaryContent}>
          <AppText role="caption" style={[styles.fitLabel, candidate.tier !== "ELIGIBLE_CONFIRMED" && { color: color.warning }]}>{wohinFitLabel(candidate)}</AppText>
          <AppText role="screenTitle" numberOfLines={2} style={styles.resultTitle}>{candidate.presentation.name}</AppText>
          <AppText role="meta" numberOfLines={1} style={styles.resultMeta}>{wohinPlaceMeta(candidate)}</AppText>
          {highlights.slice(0, compact ? 1 : 2).map((reason) => <View key={reason} style={styles.reasonRow}>
            <Ionicons name="checkmark" size={17} color={color.lime} />
            <AppText role="meta" numberOfLines={2} style={styles.reasonText}>{reason}</AppText>
          </View>)}
        </ScrollView>
        <Pressable accessibilityRole="button" onPress={onDetails} style={styles.detailsToggle}>
          <AppText role="meta" style={styles.detailsText}>Details & Hinweise</AppText>
          <Ionicons name="information-circle-outline" size={19} color={color.text} />
        </Pressable>
        <Pressable accessibilityRole="button" accessibilityLabel={`${candidate.presentation.name} entdecken`} onPress={onOpen} style={styles.openSpotButton}>
          <AppText role="label" style={styles.openSpotText}>Spot entdecken</AppText>
          <Ionicons name="arrow-forward" size={20} color={color.background} />
        </Pressable>
      </View>
    </View>
  );
}

export default function WohinScreen() {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const [editing, setEditing] = useState(false);
  const [activeIndex, setActiveIndex] = useState(0);
  const [pageWidth, setPageWidth] = useState(0);
  const [pageHeight, setPageHeight] = useState(0);
  const [detailsOpen, setDetailsOpen] = useState(false);
  const listRef = useRef<FlatList<DecisionProductCandidate>>(null);
  const params = useLocalSearchParams<{ query?: string; auto?: string }>();
  const [query, setQuery] = useState("");
  const [submittedQuery, setSubmittedQuery] = useState("");
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
  const viewabilityConfig = useRef({ itemVisiblePercentThreshold: 70, minimumViewTime: 250 }).current;
  const onViewableItemsChanged = useRef(({ viewableItems }: { viewableItems: { item: DecisionProductCandidate; isViewable: boolean; index: number | null }[] }) => {
    const current = responseRef.current;
    if (!current) return;
    const visible = viewableItems.find((entry) => entry.isViewable && entry.index !== null);
    if (visible) setActiveIndex(visible.index!);
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
    setSubmittedQuery(text.trim());
    Keyboard.dismiss();
    setEditing(false);
    setDetailsOpen(false);
    setActiveIndex(0);
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

  const showingResults = Boolean(response && candidates.length && !editing);
  const current = candidates[activeIndex];
  const goTo = (index: number) => {
    if (index < 0 || index >= candidates.length || !pageWidth) return;
    listRef.current?.scrollToOffset({ offset: index * pageWidth, animated: true });
  };
  const personal = response?.personalization.state === "ACTIVE";
  return (
    <SafeAreaView style={styles.screen} edges={["top", "left", "right"]}>
      <Stack.Screen options={{ title: "Wohin", headerShown: false }} />
      {showingResults ? <View style={[styles.resultScreen, { paddingBottom: Math.max(8, insets.bottom - 2) + backyrdTheme.control.tabBarVisual + 10 }]}>
        <View style={styles.resultHeader}>
          <View style={styles.querySummary}>
            <AppText role="caption" tone="pink">DEIN MOMENT</AppText>
            <AppText role="meta" numberOfLines={1} style={styles.queryText}>{submittedQuery}</AppText>
          </View>
          <Pressable accessibilityRole="button" accessibilityLabel="Suche ändern" onPress={() => setEditing(true)} style={styles.editSearch}>
            <Ionicons name="options-outline" size={19} color={color.text} />
            <AppText role="meta">Ändern</AppText>
          </Pressable>
        </View>
        <View style={styles.deck} onLayout={(event) => { setPageWidth(event.nativeEvent.layout.width); setPageHeight(event.nativeEvent.layout.height); }}>
          {pageWidth > 0 && pageHeight > 0 ? <FlatList
            key={`${response!.decisionId}:${pageWidth}:${pageHeight}`}
            ref={listRef}
            data={candidates}
            horizontal
            pagingEnabled
            showsHorizontalScrollIndicator={false}
            initialScrollIndex={Math.min(activeIndex, candidates.length - 1)}
            getItemLayout={(_, index) => ({ length: pageWidth, offset: pageWidth * index, index })}
            viewabilityConfig={viewabilityConfig}
            onViewableItemsChanged={onViewableItemsChanged}
            extraData={personal}
            keyExtractor={(candidate) => candidate.spotId}
            renderItem={({ item: candidate }) => <View style={[styles.cardPage, { width: pageWidth, height: pageHeight }]}>
              <DecisionResultCard candidate={candidate} personalizationActive={personal} compact={pageHeight < 440} onOpen={() => openSpot(candidate)} onDetails={() => setDetailsOpen(true)} />
            </View>}
          /> : null}
        </View>
        <View style={styles.pager}>
          <Pressable accessibilityRole="button" accessibilityLabel="Vorheriger Vorschlag" disabled={activeIndex === 0} onPress={() => goTo(activeIndex - 1)} style={[styles.pagerButton, activeIndex === 0 && styles.disabled]}><Ionicons name="arrow-back" size={23} color={color.text} /></Pressable>
          <View style={styles.pagerLabel}>
            <AppText role="label" accessibilityLiveRegion="polite">{activeIndex + 1} / {candidates.length}</AppText>
            <AppText role="caption" tone="muted">{candidates.length === 1 ? "Dein Vorschlag" : "Wischen zum Entdecken"}</AppText>
          </View>
          <Pressable accessibilityRole="button" accessibilityLabel="Nächster Vorschlag" disabled={activeIndex === candidates.length - 1} onPress={() => goTo(activeIndex + 1)} style={[styles.pagerButton, activeIndex === candidates.length - 1 && styles.disabled]}><Ionicons name="arrow-forward" size={23} color={color.text} /></Pressable>
        </View>
      </View> : <KeyboardAvoidingView style={{ flex: 1 }} behavior={Platform.OS === "ios" ? "padding" : undefined}>
        <ScrollView keyboardShouldPersistTaps="handled" contentContainerStyle={{ paddingHorizontal: 22, paddingTop: 28, paddingBottom: 130 }}>
          {response && candidates.length ? <Pressable accessibilityRole="button" onPress={() => { setEditing(false); Keyboard.dismiss(); }} style={styles.backToResults}><AppText role="label" tone="pink">Zurück zu deinen Vorschlägen</AppText></Pressable> : null}
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
              onChangeText={(value) => { setQuery(value); setError(null); }}
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


          {response && !candidates.length ? <View style={styles.emptyState}>
            <AppText role="sectionTitle">Gerade kein passender Vorschlag</AppText>
            <AppText role="body" tone="secondary">Für diesen Wunsch haben wir noch keinen ausreichend belegten Ort. Du kannst deine Suche ändern.</AppText>
            {limitations.map(note => <AppText key={note} role="meta" tone="secondary">{note}</AppText>)}
          </View> : null}
        </ScrollView>
      </KeyboardAvoidingView>}
      <Modal visible={detailsOpen && showingResults} transparent animationType="slide" onRequestClose={() => setDetailsOpen(false)}>
        <View style={styles.modalBackdrop}>
          <SafeAreaView style={styles.detailSheet} edges={["top", "bottom"]} accessibilityViewIsModal>
            <View style={styles.sheetHeader}>
              <AppText role="sectionTitle" style={{ flex: 1 }}>Details & Hinweise</AppText>
              <Pressable accessibilityRole="button" accessibilityLabel="Hinweise schließen" onPress={() => setDetailsOpen(false)} style={styles.pagerButton}><Ionicons name="close" size={24} color={color.text} /></Pressable>
            </View>
            <ScrollView contentContainerStyle={styles.sheetContent}>
              {current ? <>
                <AppText role="screenTitle">{current.presentation.name}</AppText>
                <AppText role="meta" tone="secondary">{wohinPlaceMeta(current)}</AppText>
                {wohinHighlights(current, personal).map(note => <AppText key={note} role="body">{note}</AppText>)}
                <AppText role="body" tone="secondary">{availabilityLabel(current).text}</AppText>
                {wohinConsiderations(current, personal).map(note => <AppText key={note} role="body" tone="secondary">{note}</AppText>)}
              </> : null}
              {limitations.map(note => <AppText key={note} role="meta" tone="secondary">{note}</AppText>)}
              <AppText role="caption" tone="muted">{personal ? "Mit deinen freigegebenen Vorlieben sortiert" : "Ohne persönliche Vorlieben sortiert"}</AppText>
            </ScrollView>
          </SafeAreaView>
        </View>
      </Modal>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: color.background },
  resultScreen: { flex: 1 },
  resultHeader: { paddingHorizontal: 20, paddingVertical: 12, flexDirection: "row", alignItems: "center", gap: 12 },
  querySummary: { flex: 1, gap: 5 },
  queryText: { color: color.text },
  editSearch: { flexDirection: "row", gap: 6, alignItems: "center", minHeight: 44, paddingHorizontal: 10 },
  deck: { flex: 1, minHeight: 0 },
  cardPage: { flex: 1, paddingHorizontal: 16 },
  resultCard: { flex: 1, borderRadius: 30, overflow: "hidden", backgroundColor: color.card, borderWidth: StyleSheet.hairlineWidth, borderColor: color.border },
  cardBottom: { position: "absolute", bottom: 0, left: 0, right: 0, maxHeight: "75%", padding: 20 },
  compactBottom: { maxHeight: "92%", padding: 16 },
  cardSummary: { flexShrink: 1 },
  cardSummaryContent: { gap: 10 },
  fitLabel: { color: color.lime },
  resultTitle: { color: color.text, fontSize: 30, lineHeight: 34 },
  resultMeta: { color: "#D1CDD1", marginBottom: 4 },
  reasonRow: { flexDirection: "row", alignItems: "flex-start", gap: 8 },
  reasonText: { flex: 1, color: "#F4F1F3" },
  detailsToggle: { minHeight: 44, flexDirection: "row", alignItems: "center", gap: 7, alignSelf: "flex-start", marginTop: 4 },
  detailsText: { color: color.text },
  openSpotButton: { minHeight: 52, paddingVertical: 12, borderRadius: 999, backgroundColor: color.pink, flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 10 },
  openSpotText: { color: color.background },
  pager: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", paddingHorizontal: 24, paddingTop: 10, gap: 12 },
  pagerButton: { minWidth: 44, minHeight: 44, borderRadius: 22, alignItems: "center", justifyContent: "center", backgroundColor: color.card },
  disabled: { opacity: 0.3 },
  pagerLabel: { alignItems: "center", gap: 2, flex: 1 },
  backToResults: { minHeight: 44, justifyContent: "center", marginBottom: 16 },
  emptyState: { marginTop: 28, gap: 12 },
  modalBackdrop: { flex: 1, justifyContent: "flex-end", backgroundColor: "rgba(0,0,0,0.7)" },
  detailSheet: { maxHeight: "88%", backgroundColor: color.card, borderTopLeftRadius: 28, borderTopRightRadius: 28, paddingHorizontal: 24, paddingTop: 18, paddingBottom: 20 },
  sheetHeader: { flexDirection: "row", alignItems: "center", gap: 16 },
  sheetContent: { gap: 16, paddingTop: 18, paddingBottom: 24 },
});
