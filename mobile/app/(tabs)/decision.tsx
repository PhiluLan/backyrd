import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { ActivityIndicator, Alert, KeyboardAvoidingView, Platform, Pressable, ScrollView, Text, TextInput, View } from "react-native";
import { Stack, useFocusEffect, useLocalSearchParams, useRouter } from "expo-router";
import { SafeAreaView } from "react-native-safe-area-context";
import * as Crypto from "expo-crypto";

import { AppText } from "@/components/foundation/AppText";
import { SpotArtwork } from "@/components/spot/SpotArtwork";
import { getMyProductEntryStatus } from "@/lib/onboardingStatus";
import { invokeDecisionProduct, recordDecisionProductInteraction } from "@/lib/decision/productDecision";
import { supabase } from "@/lib/supabase";
import { userFacingError } from "@/lib/userFacingError";
import {
  DECISION_PRODUCT_CONTRACT,
  type DecisionProductResponse,
  type DecisionProductRequest,
} from "@backyrd/product-decision-contract";

type DecisionStatus = "idle" | "checking" | "deciding" | "success" | "empty" | "error";
type DecisionInputMode = "guided" | "free";
type DecisionCitySource = "empty" | "profile" | "manual";
type Choice = { key: string; label: string; placeTypes: string[]; queryHint: string };

const theme = {
  bg: "#050506",
  card: "rgba(255,255,255,0.065)",
  border: "rgba(255,255,255,0.13)",
  text: "#FFFFFF",
  muted: "rgba(255,255,255,0.66)",
  pink: "#FF4F91",
  pinkSoft: "#FFC5DA",
  acid: "#D8FF3E",
  red: "#E95050",
};

const DIRECTIONS: Choice[] = [
  { key: "restaurant", label: "Essen", placeTypes: ["restaurant"], queryHint: "Restaurant oder Essen" },
  { key: "cafe", label: "Café", placeTypes: ["cafe"], queryHint: "Café oder Kaffee" },
  { key: "bar", label: "Drinks", placeTypes: ["bar"], queryHint: "Bar, Drinks oder Wein" },
  { key: "culture", label: "Kultur", placeTypes: ["culture"], queryHint: "Kultur, Museum oder Kunst" },
  { key: "activity", label: "Aktivität", placeTypes: ["activity", "experience"], queryHint: "Aktivität oder Erlebnis" },
  { key: "outing", label: "Ausflug", placeTypes: ["outing", "experience"], queryHint: "Ausflug oder Entdeckung" },
];
const AUDIENCES: Choice[] = [
  { key: "kids", label: "Mit Kind", placeTypes: ["activity", "culture", "outing", "cafe"], queryHint: "mit Kind oder Familie" },
  { key: "date", label: "Date", placeTypes: ["restaurant", "bar", "cafe", "culture"], queryHint: "für ein Date" },
  { key: "friends", label: "Freunde", placeTypes: ["bar", "restaurant", "activity", "cafe"], queryHint: "mit Freunden" },
  { key: "solo", label: "Allein", placeTypes: ["cafe", "culture", "outing"], queryHint: "allein" },
];
const MOODS: Choice[] = [
  { key: "cozy", label: "Cozy", placeTypes: [], queryHint: "cozy und gemütlich" },
  { key: "quiet", label: "Ruhig", placeTypes: [], queryHint: "ruhig und entspannt" },
  { key: "inspiring", label: "Inspirierend", placeTypes: [], queryHint: "inspirierend" },
  { key: "urban", label: "Urban", placeTypes: [], queryHint: "urban" },
  { key: "chic", label: "Chic", placeTypes: [], queryHint: "chic und stilvoll" },
  { key: "lively", label: "Lebhaft", placeTypes: [], queryHint: "lebhaft" },
];

const clean = (value: string | null | undefined) => (value ?? "").trim().replace(/\s+/g, " ");
const unique = <T,>(values: T[]) => [...new Set(values)];
const toggle = (values: string[], value: string) => values.includes(value) ? values.filter((item) => item !== value) : [...values, value];

function naturalLanguageInput({
  city, freeText, directions, audiences, moods, customMoods,
}: {
  city: string; freeText: string; directions: string[]; audiences: string[]; moods: string[]; customMoods: string[];
}) {
  const selected = [...DIRECTIONS, ...AUDIENCES, ...MOODS]
    .filter((option) => [...directions, ...audiences, ...moods].includes(option.key))
    .map((option) => option.queryHint);
  return unique([clean(freeText), ...selected, ...customMoods.map(clean).filter(Boolean), `in ${clean(city)}`]).filter(Boolean).join(", ");
}

function availabilityColor(state: DecisionProductResponse["candidates"][number]["actualAvailability"]) {
  if (state === "open") return theme.acid;
  if (state === "closed") return theme.red;
  return theme.muted;
}

function availabilityLabel(state: DecisionProductResponse["candidates"][number]["actualAvailability"]) {
  if (state === "open") return "Jetzt geöffnet";
  if (state === "closed") return "Geschlossen";
  if (state === "not_authorized") return "Öffnungsstatus nicht freigegeben";
  if (state === "expired") return "Öffnungsstatus veraltet";
  if (state === "disputed") return "Öffnungsstatus ungeklärt";
  return "Öffnungszeiten unbekannt";
}

const asIdentifier = (value: string) => clean(value).normalize("NFKD").replace(/[\u0300-\u036f]/g, "").replace(/[^A-Za-z0-9._:-]+/g, "-").replace(/^-+|-+$/g, "").slice(0, 160);

export default function DecisionScreen() {
  const router = useRouter();
  const homeParams = useLocalSearchParams<{ query?: string; city?: string; auto?: string }>();
  const autoRunKey = useRef<string | null>(null);
  const recordedImpressions = useRef(new Set<string>());
  const presentedCandidateIds = useRef<string[]>([]);
  const [authenticated, setAuthenticated] = useState(false);
  const [city, setCity] = useState("");
  const [citySource, setCitySource] = useState<DecisionCitySource>("empty");
  const [inputMode, setInputMode] = useState<DecisionInputMode>("guided");
  const [freeText, setFreeText] = useState("");
  const [directions, setDirections] = useState<string[]>([]);
  const [audiences, setAudiences] = useState<string[]>([]);
  const [moods, setMoods] = useState<string[]>([]);
  const [customMoodA, setCustomMoodA] = useState("");
  const [customMoodB, setCustomMoodB] = useState("");
  const [result, setResult] = useState<DecisionProductResponse | null>(null);
  const [status, setStatus] = useState<DecisionStatus>("idle");
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  const placeTypes = useMemo(() => unique([...directions, ...audiences].flatMap((key) => [...DIRECTIONS, ...AUDIENCES].find((item) => item.key === key)?.placeTypes ?? [])), [directions, audiences]);
  const requestText = useMemo(() => naturalLanguageInput({ city, freeText: inputMode === "free" ? freeText : "", directions, audiences, moods, customMoods: [customMoodA, customMoodB] }), [audiences, city, customMoodA, customMoodB, directions, freeText, inputMode, moods]);
  const canRun = clean(city).length > 1 && requestText.length >= 3 && (inputMode === "free" ? clean(freeText).length >= 3 : directions.length + audiences.length + moods.length > 0 || clean(customMoodA).length > 0 || clean(customMoodB).length > 0);
  const loading = status === "checking" || status === "deciding";

  const loadIdentityAndCity = useCallback(async () => {
    const { data } = await supabase.auth.getUser();
    const userId = data.user?.id ?? null;
    setAuthenticated(Boolean(userId));
    if (!userId) return;
    const { data: profile } = await supabase.from("profiles").select("city").eq("id", userId).maybeSingle();
    const profileCity = clean(profile?.city);
    if (profileCity) setCity((current) => {
      if (clean(current)) return current;
      setCitySource("profile");
      return profileCity;
    });
  }, []);

  useEffect(() => {
    void loadIdentityAndCity();
    const { data } = supabase.auth.onAuthStateChange(() => { void loadIdentityAndCity(); });
    return () => data.subscription.unsubscribe();
  }, [loadIdentityAndCity]);

  useFocusEffect(useCallback(() => {
    let cancelled = false;
    void getMyProductEntryStatus().then((entry) => {
      if (!cancelled && entry.needsDecisionOnboarding) router.push("/(tabs)/decision-onboarding");
    }).catch(() => undefined);
    return () => { cancelled = true; };
  }, [router]));

  useEffect(() => {
    const query = clean(homeParams.query);
    const incomingCity = clean(homeParams.city);
    if (!query) return;
    setInputMode("free");
    setFreeText(query);
    if (incomingCity) { setCity(incomingCity); setCitySource("manual"); }
  }, [homeParams.city, homeParams.query]);

  const runDecision = useCallback(async ({ alternativeRequested = false, previouslyPresentedCandidateIds = [], rejectedCandidateIds = [] }: { alternativeRequested?: boolean; previouslyPresentedCandidateIds?: string[]; rejectedCandidateIds?: string[] } = {}) => {
    if (!authenticated) { Alert.alert("Login nötig", "Bitte logge dich ein, um Decision zu nutzen."); router.push("/auth/login"); return; }
    if (!canRun) { Alert.alert("Fehlt noch was", "Bitte gib einen Ort und deinen aktuellen Wunsch an."); return; }
    const requestId = Crypto.randomUUID();
    const request: DecisionProductRequest = {
      contractVersion: DECISION_PRODUCT_CONTRACT.request,
      requestId,
      idempotencyKey: requestId,
      naturalLanguage: requestText,
      explicit: {
        ...(directions[0] ? { primaryIntent: asIdentifier(directions[0]) } : {}),
        ...(audiences[0] ? { secondaryIntent: asIdentifier(audiences[0]) } : {}),
        moods: unique([customMoodA, customMoodB, ...moods].map(asIdentifier).filter(Boolean)),
        targetCity: asIdentifier(city),
        softPreferences: unique(placeTypes.map(asIdentifier).filter(Boolean)),
      },
      alternativeRequested,
      previouslyPresentedCandidateIds,
      rejectedCandidateIds,
    };
    try {
      setErrorMessage(null);
      setStatus(alternativeRequested || rejectedCandidateIds.length ? "deciding" : "checking");
      const response = await invokeDecisionProduct({ supabase, request });
      setResult(response);
      if (!alternativeRequested && rejectedCandidateIds.length === 0) presentedCandidateIds.current = [];
      const primary = response.candidates.find((candidate) => candidate.spotId === response.primaryCandidateId && candidate.rank !== null && !candidate.contextualReject);
      if (primary && !presentedCandidateIds.current.includes(primary.spotId)) presentedCandidateIds.current = [...presentedCandidateIds.current, primary.spotId];
      setStatus(primary ? "success" : "empty");
    } catch (error) {
      setResult(null);
      setStatus("error");
      setErrorMessage(userFacingError(error, "Deine Vorschläge sind gerade nicht verfügbar. Bitte versuche es später erneut."));
    }
  }, [authenticated, audiences, canRun, city, customMoodA, customMoodB, directions, moods, placeTypes, requestText, router]);

  useEffect(() => {
    const key = `${clean(homeParams.city)}:${clean(homeParams.query)}`;
    if (homeParams.auto !== "1" || !canRun || !authenticated || loading || autoRunKey.current === key) return;
    autoRunKey.current = key;
    router.setParams({ auto: "" });
    void runDecision();
  }, [authenticated, canRun, homeParams.auto, homeParams.city, homeParams.query, loading, router, runDecision]);

  const alternative = useCallback(() => {
    if (!result) return;
    void runDecision({ alternativeRequested: true, previouslyPresentedCandidateIds: presentedCandidateIds.current, rejectedCandidateIds: result.reject.candidateIds });
  }, [result, runDecision]);

  const reject = useCallback((candidateId: string) => {
    if (!result) return;
    void runDecision({ previouslyPresentedCandidateIds: presentedCandidateIds.current, rejectedCandidateIds: unique([...result.reject.candidateIds, candidateId]) });
  }, [result, runDecision]);

  useEffect(() => {
    if (!result || status !== "success") return;
    for (const candidate of result.candidates.filter((item) => item.spotId === result.primaryCandidateId && item.rank !== null && !item.contextualReject)) {
      const key = `${result.decisionId}:${candidate.spotId}`;
      if (recordedImpressions.current.has(key)) continue;
      recordedImpressions.current.add(key);
      const actionId = Crypto.randomUUID();
      void recordDecisionProductInteraction({
        supabase,
        request: { contractVersion: "backyrd.decision-vnext.product-interaction-request@1.0", actionId, idempotencyKey: actionId, decisionId: result.decisionId, eventType: "candidate_impression", candidateId: candidate.spotId },
      }).catch(() => undefined);
    }
  }, [result, status]);

  const openCandidate = useCallback((candidateId: string) => {
    if (result) {
      const actionId = Crypto.randomUUID();
      void recordDecisionProductInteraction({
        supabase,
        request: { contractVersion: "backyrd.decision-vnext.product-interaction-request@1.0", actionId, idempotencyKey: actionId, decisionId: result.decisionId, eventType: "candidate_opened", candidateId },
      }).catch(() => undefined);
    }
    router.push(`/spot/${candidateId}?entrySource=decision` as never);
  }, [result, router]);

  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: theme.bg }} edges={["top", "left", "right"]}>
      <Stack.Screen options={{ title: "Decision", headerShown: false }} />
      <KeyboardAvoidingView style={{ flex: 1 }} behavior={Platform.OS === "ios" ? "padding" : undefined}>
        <ScrollView contentContainerStyle={{ paddingHorizontal: 20, paddingTop: 18, paddingBottom: 48 }} keyboardShouldPersistTaps="handled">
          <AppText role="caption" tone="lime">DEIN MOMENT</AppText>
          <AppText role="screenTitle" style={{ color: theme.text, marginTop: 8 }}>Was passt jetzt?</AppText>
          <Text style={{ color: theme.muted, marginTop: 8, lineHeight: 21 }}>Ein klarer Wunsch genügt. Backyrd liefert eine serverseitig geprüfte Rangfolge mit nachvollziehbaren Gründen.</Text>

          <View style={{ marginTop: 24, padding: 18, borderRadius: 28, backgroundColor: theme.card, borderWidth: 1, borderColor: theme.border }}>
            <Text style={{ color: theme.muted, fontSize: 12, fontWeight: "800" }}>ORT</Text>
            <TextInput value={city} onChangeText={(value) => { setCity(value); setCitySource(value ? "manual" : "empty"); }} placeholder="Basel" placeholderTextColor="rgba(255,255,255,0.3)" style={{ color: theme.text, fontSize: 20, fontWeight: "800", marginTop: 6 }} />
            {citySource === "profile" ? <Text style={{ color: theme.muted, fontSize: 11, marginTop: 4 }}>Aus deinem Profil – jederzeit änderbar.</Text> : null}

            <View style={{ flexDirection: "row", gap: 8, marginTop: 20 }}>
              <ModeButton label="Geführt" active={inputMode === "guided"} onPress={() => setInputMode("guided")} />
              <ModeButton label="Freitext" active={inputMode === "free"} onPress={() => setInputMode("free")} />
            </View>

            {inputMode === "free" ? (
              <TextInput value={freeText} onChangeText={setFreeText} multiline placeholder="z. B. ein ruhiges Café zum Lesen" placeholderTextColor="rgba(255,255,255,0.3)" style={{ minHeight: 108, color: theme.text, marginTop: 18, padding: 14, borderRadius: 18, backgroundColor: "rgba(0,0,0,0.2)", textAlignVertical: "top" }} />
            ) : (
              <View style={{ marginTop: 18, gap: 18 }}>
                <ChoiceGroup title="Was hast du vor?" options={DIRECTIONS} selected={directions} onChange={setDirections} />
                <ChoiceGroup title="Mit wem?" options={AUDIENCES} selected={audiences} onChange={setAudiences} />
                <ChoiceGroup title="Wie soll es sich anfühlen?" options={MOODS} selected={moods} onChange={setMoods} />
                <View style={{ flexDirection: "row", gap: 10 }}>
                  <TextInput value={customMoodA} onChangeText={setCustomMoodA} placeholder="z. B. ruhig" placeholderTextColor="rgba(255,255,255,0.3)" style={moodInput} />
                  <TextInput value={customMoodB} onChangeText={setCustomMoodB} placeholder="z. B. urban" placeholderTextColor="rgba(255,255,255,0.3)" style={moodInput} />
                </View>
              </View>
            )}

            <Pressable disabled={!canRun || loading} onPress={() => void runDecision()} style={{ marginTop: 22, minHeight: 54, borderRadius: 999, alignItems: "center", justifyContent: "center", backgroundColor: canRun && !loading ? theme.pink : "rgba(255,255,255,0.12)" }}>
              {loading ? <ActivityIndicator color="#111" /> : <Text style={{ color: canRun ? "#111" : theme.muted, fontWeight: "900" }}>Vorschläge finden</Text>}
            </Pressable>
          </View>

          {status === "error" ? <StateCard title="Vorschläge nicht verfügbar" body={errorMessage ?? "Bitte versuche es später erneut."} tone="error" /> : null}
          {status === "empty" ? <StateCard title="Noch kein sicherer Treffer" body="Passe deinen Wunsch an und versuche es erneut." tone="empty" /> : null}

          {result && status === "success" ? (
            <View style={{ marginTop: 26 }}>
              <Text style={{ color: theme.text, fontSize: 25, fontWeight: "900" }}>Das passt zu deinem Moment</Text>
              <Text style={{ color: theme.muted, marginTop: 6 }}>Die Reihenfolge und Gründe stammen vollständig aus dem versionierten Decision-vNext-Serververtrag.</Text>
              {result.candidates.filter((candidate) => candidate.spotId === result.primaryCandidateId && candidate.rank !== null && !candidate.contextualReject).map((candidate) => (
                <View key={candidate.spotId} style={{ marginTop: 14, padding: 18, borderRadius: 24, backgroundColor: theme.card, borderWidth: 1, borderColor: theme.border }}>
                  <SpotArtwork spotId={candidate.spotId} spotName={candidate.presentation.name} style={{ height: 180, margin: -18, marginBottom: 18, borderTopLeftRadius: 24, borderTopRightRadius: 24 }} />
                  <View style={{ flexDirection: "row", justifyContent: "space-between", gap: 12 }}>
                    <View style={{ flex: 1 }}>
                      <Text style={{ color: theme.pinkSoft, fontSize: 12, fontWeight: "900" }}>#{candidate.rank}</Text>
                      <Text style={{ color: theme.text, fontSize: 22, fontWeight: "900", marginTop: 3 }}>{candidate.presentation.name}</Text>
                      <Text style={{ color: theme.muted, marginTop: 4 }}>{[candidate.presentation.categoryLabel, candidate.presentation.locality].filter(Boolean).join(" · ")}</Text>
                    </View>
                    <Text style={{ color: availabilityColor(candidate.actualAvailability), fontWeight: "800", fontSize: 12, textAlign: "right" }}>{availabilityLabel(candidate.actualAvailability)}</Text>
                  </View>
                  <View style={{ marginTop: 14, gap: 7 }}>
                    {candidate.reasons.map((reason) => <Text key={`${candidate.spotId}-reason-${reason.code}`} style={{ color: reason.confirmed ? theme.text : theme.muted, lineHeight: 21 }}>• {reason.statement}</Text>)}
                  </View>
                  <View style={{ flexDirection: "row", gap: 10, marginTop: 18 }}>
                    <Pressable onPress={() => openCandidate(candidate.spotId)} style={{ flex: 1, minHeight: 46, borderRadius: 999, alignItems: "center", justifyContent: "center", backgroundColor: theme.pink }}><Text style={{ color: "#111", fontWeight: "900" }}>Spot ansehen</Text></Pressable>
                    <Pressable disabled={loading} onPress={() => reject(candidate.spotId)} style={{ minHeight: 46, paddingHorizontal: 16, borderRadius: 999, alignItems: "center", justifyContent: "center", borderWidth: 1, borderColor: theme.border }}><Text style={{ color: theme.muted, fontWeight: "800" }}>Passt nicht</Text></Pressable>
                  </View>
                </View>
              ))}

              {result.limitations.some((item) => item !== "CANDIDATE_WINDOW_LIMITED") ? <View style={{ marginTop: 18, padding: 16, borderRadius: 20, backgroundColor: "rgba(255,255,255,0.04)" }}><Text style={{ color: theme.text, fontWeight: "900" }}>Was Backyrd noch nicht sicher weiss</Text>{result.limitations.filter((item) => item !== "CANDIDATE_WINDOW_LIMITED").map((item, index) => <Text key={`limitation-${index}`} style={{ color: theme.muted, marginTop: 7, lineHeight: 20 }}>• {item}</Text>)}</View> : null}
              {result.limitations.includes("CANDIDATE_WINDOW_LIMITED") || result.candidates.some((candidate) => candidate.rank !== null && !candidate.contextualReject && !presentedCandidateIds.current.includes(candidate.spotId)) ? <Pressable disabled={loading} onPress={alternative} style={{ marginTop: 18, minHeight: 52, borderRadius: 999, alignItems: "center", justifyContent: "center", backgroundColor: theme.acid }}><Text style={{ color: "#111", fontWeight: "900" }}>{loading ? "Sichere Alternative wird geprüft…" : "Andere Richtung zeigen"}</Text></Pressable> : null}
              {result.learning.eventCount > 0 ? <Text style={{ color: theme.muted, fontSize: 12, marginTop: 10, textAlign: "center" }}>{result.personalization.state === "ACTIVE" ? "Deine Auswahl wurde mit Einwilligung berücksichtigt." : "Diese Auswahl wurde nicht gespeichert."}</Text> : null}
            </View>
          ) : null}
        </ScrollView>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}

function ModeButton({ label, active, onPress }: { label: string; active: boolean; onPress: () => void }) {
  return <Pressable onPress={onPress} style={{ flex: 1, minHeight: 42, borderRadius: 999, alignItems: "center", justifyContent: "center", backgroundColor: active ? theme.pinkSoft : "rgba(0,0,0,0.2)" }}><Text style={{ color: active ? "#111" : theme.muted, fontWeight: "900" }}>{label}</Text></Pressable>;
}

function ChoiceGroup({ title, options, selected, onChange }: { title: string; options: Choice[]; selected: string[]; onChange: (value: string[]) => void }) {
  return <View><Text style={{ color: theme.text, fontWeight: "900", marginBottom: 9 }}>{title}</Text><View style={{ flexDirection: "row", flexWrap: "wrap", gap: 8 }}>{options.map((option) => <Pressable key={option.key} onPress={() => onChange(toggle(selected, option.key))} style={{ paddingHorizontal: 14, minHeight: 40, borderRadius: 999, alignItems: "center", justifyContent: "center", backgroundColor: selected.includes(option.key) ? theme.pinkSoft : "rgba(0,0,0,0.2)", borderWidth: 1, borderColor: selected.includes(option.key) ? theme.pink : theme.border }}><Text style={{ color: selected.includes(option.key) ? "#111" : theme.text, fontWeight: "800" }}>{option.label}</Text></Pressable>)}</View></View>;
}

function StateCard({ title, body, tone }: { title: string; body: string; tone: "error" | "empty" }) {
  return <View style={{ marginTop: 18, padding: 16, borderRadius: 22, backgroundColor: tone === "error" ? "rgba(239,68,68,0.08)" : "rgba(251,191,36,0.08)", borderWidth: 1, borderColor: tone === "error" ? "rgba(239,68,68,0.25)" : "rgba(251,191,36,0.22)" }}><Text style={{ color: theme.text, fontWeight: "900" }}>{title}</Text><Text style={{ color: theme.muted, marginTop: 6 }}>{body}</Text></View>;
}

const moodInput = { flex: 1, minHeight: 46, paddingHorizontal: 14, borderRadius: 20, color: theme.text, backgroundColor: "rgba(0,0,0,0.2)", borderWidth: 1, borderColor: theme.border } as const;
