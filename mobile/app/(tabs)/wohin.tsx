import React, { useCallback, useEffect, useRef, useState } from "react";
import { ActivityIndicator, FlatList, KeyboardAvoidingView, Platform, Pressable, Text, TextInput, View } from "react-native";
import { Stack, useLocalSearchParams, useRouter } from "expo-router";
import { SafeAreaView } from "react-native-safe-area-context";
import * as Crypto from "expo-crypto";
import type { DecisionProductCandidate, DecisionProductResponse } from "@backyrd/product-decision-contract";

import { AppText } from "@/components/foundation/AppText";
import { SpotArtwork } from "@/components/spot/SpotArtwork";
import { invokeDecisionProduct, recordDecisionProductInteraction } from "@/lib/decision/productDecision";
import { createWohinRequest, visibleWohinCandidates, wohinEvidenceState, wohinRankingEvidence } from "@/lib/decision/wohinModel";
import { supabase } from "@/lib/supabase";
import { userFacingError } from "@/lib/userFacingError";

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

function availabilityLabel(value: DecisionProductCandidate["actualAvailability"]): string {
  if (value === "open") return "Geöffnet";
  if (value === "closed") return "Geschlossen";
  if (value === "not_requested") return "Öffnung für diesen Wunsch nicht geprüft";
  return "Öffnungszeiten nicht sicher bestätigt";
}

function interpretationLabel(response: DecisionProductResponse): string {
  const intent = response.interpretation.primaryIntent;
  const intentLabel = intent === "COFFEE" ? "Kaffee" : intent === "EAT" ? "Essen" : intent === "DRINKS" ? "Drinks" : typeof intent === "string" ? intent : "Absicht ungeklärt";
  const dateTime = response.interpretation.dateTime;
  const date = dateTime && typeof dateTime === "object" && "localDate" in dateTime && typeof dateTime.localDate === "string" ? dateTime.localDate : null;
  return date ? `Verstanden: ${intentLabel} · ${date}` : `Verstanden: ${intentLabel}`;
}

export default function WohinScreen() {
  const router = useRouter();
  const params = useLocalSearchParams<{ query?: string; auto?: string }>();
  const [query, setQuery] = useState("");
  const [city, setCity] = useState<string | null>(null);
  const [identityReady, setIdentityReady] = useState(false);
  const [authenticated, setAuthenticated] = useState(false);
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
    void (async () => {
      const { data, error: authError } = await supabase.auth.getUser();
      if (!active) return;
      if (authError || !data.user) {
        setAuthenticated(false);
        setIdentityReady(true);
        return;
      }
      setAuthenticated(true);
      const { data: profile, error: profileError } = await supabase.from("profiles").select("city").eq("id", data.user.id).maybeSingle();
      if (!active) return;
      setCity(profileError ? null : typeof profile?.city === "string" ? profile.city.trim() : null);
      setIdentityReady(true);
    })().catch(() => { if (active) { setAuthenticated(false); setIdentityReady(true); } });
    return () => { active = false; };
  }, []);

  useEffect(() => {
    if (typeof params.query === "string") setQuery(params.query);
  }, [params.query]);

  const run = useCallback(async (text: string) => {
    if (!authenticated || !city || loading) return;
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
  }, [authenticated, city, loading]);

  useEffect(() => {
    const incoming = typeof params.query === "string" ? params.query.trim() : "";
    if (!identityReady || !authenticated || !city || params.auto !== "1" || incoming.length < 3) return;
    const key = `${city}:${incoming}`;
    if (autoRunKey.current === key) return;
    autoRunKey.current = key;
    void run(incoming);
  }, [authenticated, city, identityReady, params.auto, params.query, run]);

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
          <Text style={{ color: color.muted, marginTop: 10, lineHeight: 22 }}>Sag Backyrd, was du jetzt erleben möchtest. Decision vNext prüft die Orte und begründet ihre Reihenfolge.</Text>

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
              disabled={loading || !identityReady || !authenticated || !city || query.trim().length < 3}
              onPress={() => void run(query)}
              style={{ marginTop: 22, minHeight: 54, borderRadius: 999, backgroundColor: !loading && authenticated && city && query.trim().length >= 3 ? color.pink : "#48484C", alignItems: "center", justifyContent: "center" }}
            >
              {loading ? <ActivityIndicator color={color.background} /> : <Text style={{ color: color.background, fontWeight: "900", fontSize: 16 }}>Decision starten</Text>}
            </Pressable>
          </View>

          {identityReady && !authenticated ? <Text style={{ color: color.warning, marginTop: 20 }}>Bitte melde dich an, um Wohin zu nutzen.</Text> : null}
          {identityReady && authenticated && !city ? <Text style={{ color: color.warning, marginTop: 20 }}>Dein Profilort fehlt. Ergänze ihn im Profil, damit Decision sichere Orte prüfen kann.</Text> : null}
          {error ? <Text style={{ color: color.warning, marginTop: 20 }}>{error}</Text> : null}

          {response ? (
            <View style={{ marginTop: 34 }}>
              <Text style={{ color: color.text, fontSize: 25, fontWeight: "900" }}>Die Antwort von Decision</Text>
              <Text style={{ color: color.muted, marginTop: 8 }}>{interpretationLabel(response)}</Text>
              <Text style={{ color: color.muted, marginTop: 8 }}>{response.personalization.state === "ACTIVE" ? "Deine freigegebene Präferenz kann die Reihenfolge beeinflussen; Learning nur mit gültiger Einwilligung." : "Ohne gültige Einwilligung: neutrale Reihenfolge und kein Learning-Write."}</Text>
              <Text style={{ color: color.muted, marginTop: 8, lineHeight: 20 }}>Die App zeigt bis zu fünf Plätze der serverseitigen Rangfolge aus dem geprüften Kandidatenfenster. Sie sortiert keine Spots selbst und ergänzt keine unbelegten Gründe. Nicht jeder Katalog-Spot wurde dafür ausgewertet.</Text>
              {candidates.length < 5 ? <Text style={{ color: color.warning, marginTop: 12 }}>Nur {candidates.length} rangierbare Kandidaten geliefert – fehlende Plätze werden nicht erfunden.</Text> : null}
            </View>
          ) : null}
          </>}
          renderItem={({ item: candidate }) => (
                <View style={{ marginTop: 18, borderRadius: 24, overflow: "hidden", backgroundColor: color.card, borderWidth: 1, borderColor: color.border }}>
                  <SpotArtwork spotId={candidate.spotId} spotName={candidate.presentation.name} style={{ height: 140 }} />
                  <View style={{ padding: 18 }}>
                    <Text style={{ color: color.pink, fontSize: 12, fontWeight: "900" }}>PLATZ {candidate.rank} · {wohinEvidenceState(candidate)}</Text>
                    <Text style={{ color: color.text, fontSize: 23, fontWeight: "900", marginTop: 5 }}>{candidate.presentation.name}</Text>
                    <Text style={{ color: color.muted, marginTop: 4 }}>{[candidate.presentation.categoryLabel, candidate.presentation.locality].filter(Boolean).join(" · ")}</Text>
                    <Text style={{ color: color.muted, marginTop: 8 }}>{availabilityLabel(candidate.actualAvailability)}</Text>
                    <Text style={{ color: color.text, fontWeight: "900", marginTop: 18 }}>Warum dieser Platz?</Text>
                    {candidate.reasons.map((reason) => <Text key={`${candidate.spotId}:${reason.code}`} style={{ color: reason.confirmed ? color.text : color.muted, marginTop: 7, lineHeight: 21 }}>• {reason.statement}</Text>)}
                    {wohinRankingEvidence(candidate).map((statement) => <Text key={statement} style={{ color: color.muted, marginTop: 7, lineHeight: 21 }}>• {statement}</Text>)}
                    <Pressable onPress={() => openSpot(candidate)} style={{ marginTop: 18, minHeight: 46, borderRadius: 999, backgroundColor: color.pink, justifyContent: "center", alignItems: "center" }}><Text style={{ color: color.background, fontWeight: "900" }}>Spot ansehen</Text></Pressable>
                  </View>
                </View>
          )}
          ListFooterComponent={response ? <View>{response.limitations.filter((value) => value !== "CANDIDATE_WINDOW_LIMITED").map((value) => <Text key={value} style={{ color: color.warning, marginTop: 12 }}>Einschränkung: {value}</Text>)}</View> : null}
        />
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}
