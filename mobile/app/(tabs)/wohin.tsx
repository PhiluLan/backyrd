import { DecisionProductClarification, DecisionProductDialogueRoute } from "@backyrd/product-decision-contract";
import { useAuth } from "@/hooks/useAuth";
import { clearRecentDecisionSearches, hasUnsavedRecentDecisionSearches, readRecentDecisionSearches, retryRecentDecisionSearches, recordRecentDecisionRequest, rememberRecentDecisionSearch, removeRecentDecisionSearch, type RecentDecisionHistoryEntry } from "@/lib/decision/recentDecisionSearch";
import { WohinHistorySheet, WohinRecentRequests } from "@/components/WohinHistory";
import { clearJourneySelection, rememberJourneySelection, canCarryPlaceRecommendation } from "@/lib/discovery-journey";
import React, { useCallback, useEffect, useRef, useState } from "react";
import { type LayoutChangeEvent, ActivityIndicator, FlatList, Keyboard, KeyboardAvoidingView, Modal, Platform, Pressable, ScrollView, StyleSheet, useColorScheme, useWindowDimensions, View } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { useIsFocused } from "@react-navigation/native";
import type { NuknukMotionState } from "@/lib/nuknuk-motion";
import { Stack, useFocusEffect, useLocalSearchParams, useRouter } from "expo-router";
import { LinearGradient } from "expo-linear-gradient";
import { SafeAreaView, useSafeAreaInsets } from "react-native-safe-area-context";
import * as Crypto from "expo-crypto";
import type { DecisionProductCandidate, DecisionProductRequest, DecisionProductResponse } from "@backyrd/product-decision-contract";

import { AppText, HomeTypographyProvider, ProductText as Text, ProductTextInput as TextInput } from "@/components/foundation/AppText";
import { NuknukAvatar } from "@/components/NuknukAvatar";
import { WohinWaitCard } from "@/components/WohinWaitCard";
import { DecisionFeedbackCard } from "@/components/DecisionFeedbackCard";
import { eventImageUrl } from "@/lib/events-v1";
import { Image } from "expo-image";
import { SpotArtwork } from "@/components/spot/SpotArtwork";
import { invokeDecisionProduct, recordDecisionProductInteraction } from "@/lib/decision/productDecision";
import { createWohinRequest, wohinAvailability as availabilityText, visibleWohinCandidates, wohinConsiderations, wohinRecommendation, wohinClarificationQuery, wohinDiscoveryCategories, wohinDiscoveryDirections, wohinIsDiscoveryPlaceholder, wohinFollowUp, wohinLimitations, wohinPlaceMeta, wohinMessageKind, wohinOffTopicMessage } from "@/lib/decision/wohinModel";
import { recordDecisionFailure, type DecisionFailurePhase } from "@/lib/decision/productDecisionDiagnostics";
import { deduplicatePhysicalDiscoverySpots, loadCanonicalSpotHeaders, loadDiscoverySpots, type DiscoverySpot } from "@/lib/spot-images";
import { supabase } from "@/lib/supabase";
import { userFacingError } from "@/lib/userFacingError";
import { backyrdTheme, usesFixedDarkAppearance } from "@/theme/backyrd";
import { homeDaypart } from "@/lib/home-daypart";

const showNuknukCharacter = backyrdTheme.nuknuk.showCharacter;

let greetedActor: string | null = null;

type SearchIdea = { icon: React.ComponentProps<typeof Ionicons>["name"]; title: string; detail: string; wish: string };

type SearchConversation = {
  wish: string;
  turns: { question: string | null; answer: string }[];
};

const darkColors = {
  background: "#1D222B", card: "#242B35", text: "#F5F6F6", muted: "#B3BAC3",
  border: "#4A5361", pink: "#F24D86", warning: "#F7C65C", onAccent: "#11151D",
  gradient: ["#3A2936", "#252731", "#1D222B"] as readonly [string, string, string],
  panel: "#242B35", tint: "#392E3A", dock: "#222934", dockBorder: "#4A5361",
  disabled: "#303843", message: "#2B323D", prompt: "#2B323D",
  focusBorder: "#8B4A65", subButton: "#2B323D", question: "#392E3A", artwork: "#303843",
  detailText: "#DDE1E5", chat: "#1D222B", brief: "#242B35",
};

const lightColors: typeof darkColors = {
  background: "#F5F7FA", card: "#F8F9FB", text: "#171B22", muted: "#65707B",
  border: "#D6DCE3", pink: "#D63C70", warning: "#8C5700", onAccent: "#FFFFFF",
  gradient: ["#F0E7ED", "#F8F9FB", "#F5F7FA"],
  panel: "#F8F9FB", tint: "#F0E7ED", dock: "#F8F9FB", dockBorder: "#B8C1CC",
  disabled: "#E7EAF0", message: "#FFFFFF", prompt: "#FFFFFF",
  focusBorder: "#D39BB0", subButton: "#E7EAF0", question: "#F0E7ED", artwork: "#E7EAF0",
  detailText: "#65707B", chat: "#F5F7FA", brief: "#F8F9FB",
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


function DecisionResultCard({ candidate, recommendation, imageUrl, width, onOpen, onDetails }: {
  candidate: DecisionProductCandidate; recommendation: string; imageUrl: string | null;
  width: number; onOpen: () => void; onDetails: () => void;
}) {
  const { styles, color } = useWohinPresentation();
  const provisional = candidate.tier === "UNCONFIRMED_FALLBACK" || candidate.actualAvailability === "unknown";
  return <View style={[styles.resultCard, { width }]} testID="wohin-result-card">
    <Pressable accessibilityRole="button" accessibilityLabel={`${candidate.presentation.name} entdecken`} onPress={onOpen} style={({ pressed }) => [styles.cardArtwork, { height: Math.round(width * 0.86) }, pressed && styles.pressed]}>
      {candidate.presentation.event
        ? imageUrl ? <Image source={{ uri: imageUrl }} style={StyleSheet.absoluteFill} contentFit="cover" /> : <View style={styles.eventArtwork}><Ionicons name="calendar-outline" size={50} color={color.pink} /></View>
        : <SpotArtwork imageUrl={imageUrl} spotId={candidate.spotId} spotName={candidate.presentation.name} showFallbackName={false} attributionPosition="top" style={StyleSheet.absoluteFill} />}
      <LinearGradient pointerEvents="none" colors={["transparent", "rgba(0,0,0,0.15)", "rgba(0,0,0,0.9)"]} style={StyleSheet.absoluteFill} />
      <View style={styles.photoCopy}>
        <AppText role="caption" style={styles.photoMeta}>{wohinPlaceMeta(candidate)}</AppText>
        <AppText role="screenTitle" accessibilityRole="header" style={styles.photoTitle}>{candidate.presentation.name}</AppText>
        <View style={styles.cardOpen}><AppText role="label" style={styles.photoMeta}>{candidate.presentation.event ? "Event ansehen" : "Ort ansehen"}</AppText><Ionicons name="arrow-forward" style={{ transform: [{ rotate: "-45deg" }] }} size={19} color="#FFFFFF" /></View>
      </View>
    </Pressable>
    <AppText role="body" style={styles.cardReason}>{recommendation}</AppText>
    <Pressable accessibilityRole="button" accessibilityLabel={`Vor deinem Besuch bei ${candidate.presentation.name}`} onPress={onDetails} style={styles.cardNote}>
      <Ionicons name={provisional ? "alert-circle-outline" : "information-circle-outline"} size={17} color={provisional ? color.warning : color.muted} />
      <AppText role="caption" style={{ color: provisional ? color.warning : color.muted }}>{provisional ? "Vor Besuch klären" : "Gut zu wissen"}</AppText><Ionicons name="chevron-forward" size={14} color={color.muted} />
    </Pressable>
  </View>;
}

export default function WohinScreen() {
  return <HomeTypographyProvider><WohinExperience /></HomeTypographyProvider>;
}

function WohinExperience() {
  const { styles, color } = useWohinPresentation();
  const router = useRouter();
  const focused = useIsFocused();
  const { user } = useAuth();
  const insets = useSafeAreaInsets();
  const [conversation, setConversation] = useState<SearchConversation | null>(null);
  const [offTopic, setOffTopic] = useState(false);
  const [newPlan, setNewPlan] = useState<string | null>(null);
  const [editing, setEditing] = useState(false);
  const [selectedDetails, setSelectedDetails] = useState<DecisionProductCandidate | null>(null);
  const searchInputRef = useRef<React.ElementRef<typeof TextInput>>(null);
  const searchScrollRef = useRef<FlatList<DecisionProductCandidate>>(null);
  const resultTop = useRef(0);
  const revealResults = useRef(false);
  const { width: viewportWidth } = useWindowDimensions();
  const cardWidth = Math.max(240, Math.min(420, viewportWidth - 48));
  const [keyboardVisible, setKeyboardVisible] = useState(false);
  const [inputHeight, setInputHeight] = useState(44);
  const params = useLocalSearchParams<{ query?: string; auto?: string; launch?: string }>();
  const [query, setQuery] = useState("");
  const [submittedQuery, setSubmittedQuery] = useState("");
  const [clarificationAnswer, setClarificationAnswer] = useState("");
  const [city, setCity] = useState<string | null>(null);
  const [daypart, setDaypart] = useState(() => homeDaypart(new Date()));
  const [firstName, setFirstName] = useState<string | null>(null);
  const [recentHistory, setRecentHistory] = useState<{ actorId: string; entries: RecentDecisionHistoryEntry[] } | null>(null);
  const [historyLoaded, setHistoryLoaded] = useState(false);
  const [historyUnavailable, setHistoryUnavailable] = useState(false);
  const [historyOpen, setHistoryOpen] = useState(false);
  const [historyBusy, setHistoryBusy] = useState(false);
  const historyOwner = useRef(user?.id ?? null);
  historyOwner.current = user?.id ?? null;
  const historyMounted = useRef(true);
  useEffect(() => { historyMounted.current = true; return () => { historyMounted.current = false; }; }, []);
  const [identityReady, setIdentityReady] = useState(false);
  const [authenticated, setAuthenticated] = useState(false);
  const [verifiedActorId, setVerifiedActorId] = useState<string | null>(null);
  const [identityError, setIdentityError] = useState(false);
  const [identityAttempt, setIdentityAttempt] = useState(0);
  const [pendingSearch, setPendingSearch] = useState<{ message: string; isReply: boolean } | null>(null);
  const loading = pendingSearch !== null;
  const [response, setResponse] = useState<DecisionProductResponse | null>(null);
  const [candidates, setCandidates] = useState<DecisionProductCandidate[]>([]);
  const [discovery, setDiscovery] = useState<DiscoverySpot[]>([]);
  const [discoveryLoading, setDiscoveryLoading] = useState(false);
  const [coverImages, setCoverImages] = useState<Map<string, string | null>>(new Map());
  const [standaloneQuestion, setStandaloneQuestion] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [retryRequest, setRetryRequest] = useState<{request: DecisionProductRequest; conversation?: SearchConversation} | null>(null);
  const autoRunKey = useRef<string | null>(null);
  const seenImpressions = useRef(new Set<string>());
  const responseRef = useRef<DecisionProductResponse | null>(null);
  const requestGeneration = useRef(0);
  const requestInFlight = useRef(false);
  const viewabilityConfig = useRef({ itemVisiblePercentThreshold: 70, minimumViewTime: 250 }).current;
  const onViewableItemsChanged = useRef(({ viewableItems }: { viewableItems: { item: DecisionProductCandidate; isViewable: boolean; index: number | null }[] }) => {
    const current = responseRef.current;
    if (!current) return;
    for (const { item, isViewable } of viewableItems) {
      if (!isViewable) continue;
      if (item.presentation.event) continue;
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
    ++requestGeneration.current;
    requestInFlight.current = false;
    autoRunKey.current = null;
    clearJourneySelection();
    responseRef.current = null;
    setStandaloneQuestion(null);
    setSubmittedQuery("");
    setClarificationAnswer("");
    setConversation(null);
    setSelectedDetails(null);
    setOffTopic(false);
    setNewPlan(null);
    setEditing(false);
    setResponse(null);
    setCandidates([]);
    setDiscovery([]);
    setPendingSearch(null);
    setError(null);
    setRetryRequest(null);
    setFirstName(null);
    setRecentHistory(null);
    setHistoryLoaded(false);
    setHistoryUnavailable(false);
    setHistoryOpen(false);
    setHistoryBusy(false);
    setVerifiedActorId(null);
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
      setVerifiedActorId(data.user.id);
      const { data: profile, error: profileError } = await withinIdentityDeadline(
        supabase.from("profiles").select("city,first_name,display_name").eq("id", data.user.id).maybeSingle(),
      );
      if (!active) return;
      if (profileError) throw profileError;
      setCity(typeof profile?.city === "string" ? profile.city.trim() : null);
      const name = [profile?.first_name, profile?.display_name].find(value => typeof value === "string" && value.trim());
      setFirstName(typeof name === "string" ? name.trim().split(/\s+/)[0] : null);
      setIdentityReady(true);
    })().catch(() => { if (active) { setIdentityError(true); setIdentityReady(true); } });
    return () => { active = false; };
  }, [identityAttempt, user?.id]);

  useFocusEffect(useCallback(() => {
    const refreshDaypart = () => setDaypart(homeDaypart(new Date()));
    refreshDaypart();
    const timer = setInterval(refreshDaypart, 60_000);
    return () => clearInterval(timer);
  }, []));
  const refreshHistory = useCallback(async (retrySave = false) => {
    const id = verifiedActorId;
    if (!id || id !== user?.id) return;
    setHistoryLoaded(false);
    try {
      if (retrySave) await retryRecentDecisionSearches(id);
      const entries = await readRecentDecisionSearches(id);
      if (!historyMounted.current || historyOwner.current !== id) return;
      setRecentHistory({ actorId: id, entries });
      setHistoryUnavailable(hasUnsavedRecentDecisionSearches(id));
    } catch { if (historyMounted.current && historyOwner.current === id) setHistoryUnavailable(true); }
    finally { if (historyMounted.current && historyOwner.current === id) setHistoryLoaded(true); }
  }, [user?.id, verifiedActorId]);
  useFocusEffect(useCallback(() => { void refreshHistory(); }, [refreshHistory]));

  const saveRecentRequest = useCallback(async (text: string, visible: readonly DecisionProductCandidate[], completed = false) => {
    const id = verifiedActorId;
    if (!id || id !== user?.id) return;
    try {
      const saved = completed ? await rememberRecentDecisionSearch(id, text, visible) : await recordRecentDecisionRequest(id, text);
      if (!historyMounted.current || historyOwner.current !== id) return;
      setHistoryUnavailable(!saved);
      const entries = await readRecentDecisionSearches(id);
      if (historyMounted.current && historyOwner.current === id) setRecentHistory({ actorId: id, entries });
    } catch { if (historyMounted.current && historyOwner.current === id) setHistoryUnavailable(true); }
  }, [user?.id, verifiedActorId]);
  const changeHistory = async (id?: string) => {
    const owner = verifiedActorId;
    if (!owner || owner !== user?.id || historyBusy) return false;
    setHistoryBusy(true);
    const saved = id ? await removeRecentDecisionSearch(owner, id) : await clearRecentDecisionSearches(owner);
    if (!historyMounted.current || historyOwner.current !== owner) return false;
    await refreshHistory();
    setHistoryUnavailable(!saved);
    setHistoryBusy(false);
    return saved;
  };

  useEffect(() => {
    if (typeof params.query === "string") setQuery(params.query);
  }, [params.query]);

  useEffect(() => {
    setCoverImages(new Map());
    if (!candidates.length) return;
    let active = true;
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), 8_000);
    void loadCanonicalSpotHeaders(candidates.filter(candidate => !candidate.presentation.event).map(candidate => candidate.spotId), controller.signal)
      .then(headers => { if (active) setCoverImages(headers); })
      .catch(() => undefined) // Keep the sealed presentation/fallback when the cover service is unavailable.
      .finally(() => clearTimeout(timer));
    return () => { active = false; controller.abort(); clearTimeout(timer); };
  }, [candidates]);

  const run = useCallback(async (text: string, retry?: DecisionProductRequest, nextConversation?: SearchConversation) => {
    if (!identityReady || identityError || !authenticated || !city || requestInFlight.current || !verifiedActorId || verifiedActorId !== user?.id) return;
    requestInFlight.current = true;
    clearJourneySelection();
    const generation = ++requestGeneration.current;
    const placeholder = !nextConversation && wohinIsDiscoveryPlaceholder(text);
    if (!nextConversation) {
      setSubmittedQuery(text.trim());
      if (!retry) setConversation({ wish: text.trim(), turns: [] });
    }
    setOffTopic(false);
    setNewPlan(null);
    setClarificationAnswer("");
    if (!nextConversation) setStandaloneQuestion(null);
    Keyboard.dismiss();
    setEditing(false);
    setSelectedDetails(null);
    const userReply = nextConversation?.turns.at(-1)?.answer;
    setPendingSearch(placeholder ? null : { message: userReply ?? text.trim(), isReply: Boolean(userReply) });
    setError(null);
    setRetryRequest(null);
    if (!nextConversation) {
      responseRef.current = null;
      setResponse(null);
      setCandidates([]);
      setDiscovery([]);
    }
    void saveRecentRequest(text, []);
    if (placeholder) {
      requestInFlight.current = false;
      return;
    }
    let failurePhase: DecisionFailurePhase = "REQUEST";
    let request: DecisionProductRequest | undefined;
    try {
      request = retry ?? createWohinRequest({ query: text, city, requestId: Crypto.randomUUID() });
      failurePhase = "LOAD";
      const result = await invokeDecisionProduct({ supabase, request, supportsDialogueChoice: Boolean(nextConversation) });
      failurePhase = "DISPLAY";
      const visible = visibleWohinCandidates(result);
      if (generation !== requestGeneration.current) return;
      if (nextConversation) {
        setSubmittedQuery(text.trim());
        setConversation(nextConversation);
        setStandaloneQuestion(null);
      }
      responseRef.current = result;
      setResponse(result);
      revealResults.current = true;
      setCandidates(visible);
      void saveRecentRequest(text, visible, true);
    } catch (cause) {
      if (generation !== requestGeneration.current) return;
      if (cause instanceof DecisionProductDialogueRoute && userReply) {
        if (cause.route === "NEW_PLAN") setNewPlan(userReply);
        else setOffTopic(true);
        return;
      }
      if (cause instanceof DecisionProductClarification) {
        if (nextConversation) {
          setSubmittedQuery(text.trim());
          setConversation(nextConversation);
          responseRef.current = null;
          setResponse(null);
          setCandidates([]);
          setDiscovery([]);
        }
        setStandaloneQuestion(cause.question);
        return;
      }
      void recordDecisionFailure(cause, failurePhase).catch(() => undefined);
      if (generation === requestGeneration.current) {
        setError(userFacingError(cause, "Wohin kann gerade keine verlässlichen Vorschläge zeigen."));
        if (request) setRetryRequest({request, conversation: nextConversation});
      }
    } finally {
      if (generation === requestGeneration.current) {
        requestInFlight.current = false;
        setPendingSearch(null);
      }
    }
  }, [authenticated, city, identityError, identityReady, saveRecentRequest, user?.id, verifiedActorId]);

  useEffect(() => {
    const incoming = typeof params.query === "string" ? params.query.trim() : "";
    if (!identityReady || identityError || !authenticated || !city || params.auto !== "1" || incoming.length < 3) return;
    const launch = typeof params.launch === "string" ? params.launch : "";
    const key = launch ? `${city}:${launch}` : `${city}:${incoming}`;
    if (autoRunKey.current === key) return;
    autoRunKey.current = key;
    void run(incoming);
  }, [authenticated, city, identityError, identityReady, params.auto, params.launch, params.query, run]);

  const openSpot = (candidate: DecisionProductCandidate) => {
    if (response && !candidate.presentation.event) {
      const actionId = Crypto.randomUUID();
      void recordDecisionProductInteraction({
        supabase,
        request: { contractVersion: "backyrd.decision-vnext.product-interaction-request@1.0", actionId, idempotencyKey: actionId, decisionId: response.decisionId, eventType: "candidate_opened", candidateId: candidate.spotId },
      }).catch(() => undefined);
    }
    if (response && user && user.id === verifiedActorId && canCarryPlaceRecommendation(candidate)) {
      rememberJourneySelection({ actorId: user.id, decisionId: response.decisionId, spotId: candidate.spotId,
        wish: [conversation?.wish ?? submittedQuery, ...(conversation?.turns ?? []).map(({ question, answer }) => question ? `${question} ${answer}` : answer)].join("\n"), recommendation: wohinRecommendation(candidate, response.interpretation), notes: [availabilityText(candidate), ...wohinConsiderations(candidate, response.personalization.state === "ACTIVE")], selectedAt: Date.now() });
    }
    const event=candidate.presentation.event;
    router.push((event ? `/events/${event.eventId}?occurrenceId=${event.occurrenceId}` : `/spot/${candidate.spotId}?entrySource=decision`) as never);
  };

  const clarificationQuestion = response?.clarification ?? standaloneQuestion;
  const refinedQuery = wohinClarificationQuery(submittedQuery, clarificationQuestion, clarificationAnswer);
  const submitReply = () => {
    if (!refinedQuery || !conversation) return;
    const message = clarificationAnswer.trim();
    const kind = wohinMessageKind(message, conversation.wish);
    if (kind === "OFF_TOPIC") {
      Keyboard.dismiss();
      setOffTopic(true);
      setClarificationAnswer("");
      return;
    }
    if (kind === "NEW_PLAN") {
      Keyboard.dismiss();
      setNewPlan(message);
      return;
    }
    void run(refinedQuery, undefined, {
      ...conversation,
      turns: [...conversation.turns, { question: clarificationQuestion, answer: clarificationAnswer.trim() }],
    });
  };
  const replyPrefixLength = clarificationQuestion ? clarificationQuestion.length + "\nRückfrage: \nAntwort: ".length : "\nErgänzung: ".length;
  const replyLimit = Math.max(0, 2000 - submittedQuery.length - replyPrefixLength);
  const replyLabel = clarificationQuestion ? "Antwort senden" : "Nachricht senden";
  const replyEnabled = Boolean(refinedQuery && !loading);

  const conversationPrompt = newPlan ? (
    <View style={styles.questionCard} accessibilityLiveRegion="polite">
      <AppText role="body">Das klingt nach einem zweiten Plan. Möchtest du hier weitermachen oder soll ich für den neuen Plan suchen?</AppText>
      <Pressable accessibilityRole="button" accessibilityLabel="Für den neuen Plan suchen" onPress={() => void run(newPlan)} style={styles.primaryButton}>
        <AppText role="label" style={styles.primaryLabel}>Für den neuen Plan suchen</AppText>
      </Pressable>
      <Pressable accessibilityRole="button" accessibilityLabel="Bei dieser Suche bleiben" onPress={() => {
        setNewPlan(null);
        setClarificationAnswer("");
      }} style={styles.followUpButton}>
        <AppText role="label" tone="pink">Bei dieser Suche bleiben</AppText>
      </Pressable>
    </View>
  ) : <>
    {offTopic ? <AppText role="body" accessibilityLiveRegion="polite">{wohinOffTopicMessage}</AppText> : null}
    {clarificationQuestion ? <View style={styles.chatQuestion} accessibilityLiveRegion="polite">
      <AppText role="caption" tone="pink">NukNuk</AppText>
      <AppText role="cardTitle">{clarificationQuestion}</AppText>
    </View> : null}
  </>;

  const conversationHistory = conversation ? <View style={styles.history}>
    <View style={styles.userMessage}><AppText role="body">{conversation.wish}</AppText></View>
    {conversation.turns.map(({ question, answer }, index) => <View key={index} style={styles.history}>
      {question ? <AppText role="body" style={styles.assistantMessage}>{question}</AppText> : null}
      <View style={styles.userMessage}><AppText role="body">{answer}</AppText></View>
    </View>)}
  </View> : null;
  const leaveSearch = () => {
    ++requestGeneration.current;
    requestInFlight.current = false;
    const reply = pendingSearch?.isReply ? pendingSearch.message : null;
    setPendingSearch(null);
    setClarificationAnswer(reply ?? "");
    if (!reply || !response) {
      setQuery(conversation?.wish ?? submittedQuery);
      setEditing(true);
    }
    searchInputRef.current?.focus();
  };
  const searchProgress = pendingSearch ? <>
    {pendingSearch.isReply ? <View style={styles.userMessage}><AppText role="caption" tone="pink">Deine Ergänzung</AppText><AppText role="body">{pendingSearch.message}</AppText></View> : null}
    <View style={styles.assistantPresence} onLayout={showNuknukCharacter ? event => setAssistantTop(event.nativeEvent.layout.y) : undefined}><WohinWaitCard key={requestGeneration.current} isReply={pendingSearch.isReply} onLeave={leaveSearch} /></View>
  </> : null;
  const discoveryPlaceholder = !editing && wohinIsDiscoveryPlaceholder(submittedQuery);
  const needsDiscovery = Boolean(city && authenticated && conversation && !editing && !loading && !clarificationQuestion
    && !candidates.length && (discoveryPlaceholder || response || standaloneQuestion || error));
  const discoveryDirections = React.useMemo(() => wohinDiscoveryDirections(submittedQuery), [submittedQuery]);
  useEffect(() => {
    setDiscovery([]);
    if (!needsDiscovery || !city || !discoveryDirections.length) {
      setDiscoveryLoading(false);
      return;
    }
    let active = true;
    const excluded = new Set(response?.candidates.filter(candidate => candidate.contextualReject
      || candidate.failedHardConstraints.length || candidate.actualAvailability === "closed").map(candidate => candidate.spotId));
    const discoveryCity = response?.interpretation.targetCity ?? city;
    setDiscoveryLoading(true);
    void (async () => {
      // Use one direction for catalog cards. Other directions need a fresh search.
      const [direction] = discoveryDirections;
      const results = await Promise.allSettled(direction.terms.map(term => loadDiscoverySpots(discoveryCity, 12, term)));
      const matches = results.flatMap(result => result.status === "fulfilled" ? result.value : [])
        .filter(spot => !excluded.has(spot.id) && direction.category.test(spot.category_name ?? ""));
      const spots = new Map(matches.map(spot => [spot.id, spot]));
      if (active) setDiscovery(deduplicatePhysicalDiscoverySpots([...spots.values()]).slice(0, 3));
    })().finally(() => {
      if (active) setDiscoveryLoading(false);
    });
    return () => { active = false; };
  }, [city, discoveryDirections, needsDiscovery, response]);

  const followUp = !editing && response && !candidates.length && !clarificationQuestion ? wohinFollowUp(response) : null;
  const followUpNotes = response && followUp
    ? wohinLimitations(response.limitations.filter(code => code !== followUp.explainedLimitation), 0)
    : [];

  const showingResults = Boolean(response && candidates.length && !loading && !editing && !newPlan && !offTopic);
  // Presentation state follows real request/UI events; it never drives Decision.
  const [welcomeGreeting, setWelcomeGreeting] = useState(false);
  const [acknowledged, setAcknowledged] = useState(false);
  const [heroHeight, setHeroHeight] = useState(168);
  const [threadWidth, setThreadWidth] = useState(cardWidth);
  const [assistantTop, setAssistantTop] = useState(0);
  const [presenceVisible, setPresenceVisible] = useState(true);
  const scrollMetrics = useRef({ offset: 0, height: 0 });
  useEffect(() => {
    if (!showNuknukCharacter) return;
    if (!user) greetedActor = null;
    if (focused && identityReady && verifiedActorId && greetedActor !== verifiedActorId) {
      greetedActor = verifiedActorId;
      setWelcomeGreeting(true);
    }
    if (conversation) setWelcomeGreeting(false);
  }, [focused, identityReady, verifiedActorId, user, conversation]);
  useEffect(() => {
    setAcknowledged(false);
    if (!showNuknukCharacter || !loading || !focused) return;
    const timer = setTimeout(() => setAcknowledged(true), 720);
    return () => clearTimeout(timer);
  }, [loading, focused, pendingSearch]);
  const presenceShown = (!editing || !conversation) && (!conversation || loading || showingResults || Boolean(clarificationQuestion || newPlan || offTopic || error || followUp || needsDiscovery));
  const presenceHeight = conversation ? 66 : 156;
  const presenceLeft = conversation ? 0 : threadWidth - 45 - 156 * .65 / 2;
  const presenceTop = conversation ? assistantTop : 8 + (heroHeight - 156) / 2;
  const checkPresenceVisibility = useCallback(() => {
    if (!showNuknukCharacter) return;
    const { offset, height } = scrollMetrics.current;
    const top = 20 + presenceTop;
    setPresenceVisible(height === 0 || (top + presenceHeight > offset && top < offset + height));
  }, [presenceTop, presenceHeight]);
  useEffect(checkPresenceVisibility, [checkPresenceVisibility]);
  const presenceState: NuknukMotionState = loading ? acknowledged ? "considering" : "received"
    : showingResults ? "results" : !error && (clarificationQuestion || newPlan || offTopic || followUp || needsDiscovery) ? "clarification"
      : welcomeGreeting && !conversation ? "greeting" : "listening";
  const assistantLayout = (event: LayoutChangeEvent) => setAssistantTop(event.nativeEvent.layout.y);

  useEffect(() => {
    const show = Keyboard.addListener(Platform.OS === "ios" ? "keyboardWillShow" : "keyboardDidShow", event => {
      if (Platform.OS === "ios") Keyboard.scheduleLayoutAnimation(event);
      setKeyboardVisible(true);
    });
    const hide = Keyboard.addListener(Platform.OS === "ios" ? "keyboardWillHide" : "keyboardDidHide", event => {
      if (Platform.OS === "ios") Keyboard.scheduleLayoutAnimation(event);
      setKeyboardVisible(false);
    });
    return () => { show.remove(); hide.remove(); };
  }, []);
  const canSearch = !loading && identityReady && !identityError && authenticated && Boolean(city) && query.trim().length >= 3;
  const editQuery = () => {
    if (conversation) setQuery(conversation.wish);
    setError(null);
    setRetryRequest(null);
    setEditing(true);
    searchInputRef.current?.focus();
  };
  const startNewSearch = () => {
    if (loading) return;
    clearJourneySelection();
    responseRef.current = null;
    setResponse(null);
    setCandidates([]);
    setDiscovery([]);
    setConversation(null);
    setSelectedDetails(null);
    setStandaloneQuestion(null);
    setSubmittedQuery("");
    setClarificationAnswer("");
    setNewPlan(null);
    setOffTopic(false);
    setError(null);
    setRetryRequest(null);
    setQuery("");
    searchScrollRef.current?.scrollToOffset({ offset: 0, animated: false });
    Keyboard.dismiss();
    setEditing(false);
  };
  const personal = response?.personalization.state === "ACTIVE";
  const canCompose = !loading && identityReady && !identityError && authenticated && Boolean(city);
  const submitWish = () => {
    if (!canSearch) return;
    if (wohinMessageKind(query) === "OFF_TOPIC") {
      Keyboard.dismiss();
      setOffTopic(true);
      void saveRecentRequest(query, []);
    } else void run(query);
  };
  const evening = daypart === "Abend" || daypart === "Nacht";
  const morning = daypart === "Morgen" || daypart === "Vormittag";
  const localIdea: SearchIdea | null = !city ? null : evening
    ? { icon: "wine-outline", title: daypart === "Nacht" ? "Noch auf einen Drink?" : "Auf einen Drink", detail: "Anstossen. Runterkommen.", wish: `Wo kann ich jetzt in ${city} gemütlich etwas trinken?` }
    : morning
      ? { icon: "cafe-outline", title: "Erst mal Kaffee", detail: "Deine kleine Pause vom Alltag.", wish: `Wo kann ich heute Vormittag in ${city} gemütlich Kaffee trinken?` }
      : daypart === "Mittag"
        ? { icon: "restaurant-outline", title: "Zeit für was Feines", detail: "Eine Pause, die gut tut.", wish: `Wo kann ich heute Mittag in ${city} etwas essen?` }
        : { icon: "compass-outline", title: "Heute noch was erleben", detail: "Einfach mal anders abbiegen.", wish: `Was kann ich heute Nachmittag in ${city} unternehmen?` };
  const tomorrowIdea: SearchIdea | null = city ? { icon: "sunny-outline", title: "Morgen was Neues", detail: "Etwas, das hängen bleibt.", wish: `Was kann ich morgen in ${city} unternehmen?` } : null;
  const nearbyIdea: SearchIdea | null = city ? { icon: "compass-outline", title: `${city} mal anders`, detail: "Raus aus der üblichen Runde.", wish: `Zeig mir etwas Besonderes in ${city}.` } : null;
  const ideasReady = identityReady;
  const ideas = [localIdea, tomorrowIdea, nearbyIdea].flatMap(idea => idea ? [idea] : []);
  const recentRequests = recentHistory?.actorId === verifiedActorId && verifiedActorId === user?.id ? recentHistory.entries : [];
  const greetingName = verifiedActorId === user?.id ? firstName : null;
  const greeting = greetingName ? `Hey ${greetingName}.` : "Hey. Schön, bist du da.";
  const replyMode = Boolean(conversation && !editing && !discoveryPlaceholder);
  const draft = replyMode ? clarificationAnswer : query;
  const sendEnabled = replyMode ? replyEnabled : canSearch;
  const dockPadding = keyboardVisible ? 8 : Math.max(8, insets.bottom - 2) + backyrdTheme.control.tabBarVisual + 12;
  const selectIdea = (wish: string, focus = true) => {
    setQuery(wish); setEditing(true); setOffTopic(false); setError(null); setRetryRequest(null);
    if (focus) searchInputRef.current?.focus();
  };
  const usePreviousRequest = (entry: RecentDecisionHistoryEntry) => {
    setHistoryOpen(false);
    // Leave the keyboard down while the history sheet closes. Reusing a wish
    // fills the composer; only an explicit send requests current suggestions.
    selectIdea(entry.query, false);
  };
  const openHistory = () => { Keyboard.dismiss(); setHistoryOpen(true); void refreshHistory(); };
  const scrollToResults = () => {
    if (!revealResults.current || clarificationQuestion) return;
    revealResults.current = false;
    searchScrollRef.current?.scrollToOffset({ offset: conversation?.turns.length ? Math.max(0, resultTop.current - 220) : 0, animated: false });
  };
  return <SafeAreaView style={styles.screen} edges={["top", "left", "right"]}>
    <Stack.Screen options={{ title: "Wohin", headerShown: false }} />
    <LinearGradient pointerEvents="none" colors={color.gradient} style={styles.ambient} />
    <View style={styles.header}>
      {showNuknukCharacter ? <NuknukAvatar height={38} appearance="outline" /> : null}
      <View style={styles.headerCopy}><AppText role="cardTitle">Wohin<AppText role="cardTitle" tone="pink">?</AppText></AppText><AppText role="caption" tone="secondary">Mit NukNuk · {city ?? (identityReady ? "Deine Stadt" : "Stadt wird geladen")}</AppText></View>
      {!conversation && authenticated ? <Pressable accessibilityRole="button" accessibilityLabel="Letzte Anfragen öffnen" onPress={openHistory} style={styles.iconButton}><Ionicons name="time-outline" size={23} color={color.text} /></Pressable> : null}
      {conversation ? <Pressable accessibilityRole="button" accessibilityLabel="Neue Suche" disabled={loading} onPress={startNewSearch} style={styles.iconButton}><Ionicons name="create-outline" size={21} color={loading ? color.muted : color.text} /></Pressable> : null}
    </View>
    <KeyboardAvoidingView style={styles.screenBody} behavior={Platform.OS === "ios" ? "padding" : undefined}>
      <FlatList
        ref={searchScrollRef}
        data={showingResults ? candidates : []}
        contentContainerStyle={styles.thread}
        keyboardShouldPersistTaps="handled"
        keyboardDismissMode="interactive"
        viewabilityConfig={viewabilityConfig}
        onViewableItemsChanged={onViewableItemsChanged}
        extraData={coverImages}
        scrollEventThrottle={100}
        onScroll={showNuknukCharacter ? event => { scrollMetrics.current.offset = event.nativeEvent.contentOffset.y; checkPresenceVisibility(); } : undefined}
        onLayout={showNuknukCharacter ? event => { scrollMetrics.current.height = event.nativeEvent.layout.height; checkPresenceVisibility(); } : undefined}
        keyExtractor={candidate => `${response?.decisionId}:${candidate.spotId}`}
        onContentSizeChange={() => { if (showingResults) requestAnimationFrame(scrollToResults); }}
        ItemSeparatorComponent={() => <View style={{ height: 28 }} />}
        ListHeaderComponent={<View style={styles.threadHeader} onLayout={event => { resultTop.current = event.nativeEvent.layout.height; if (showNuknukCharacter) setThreadWidth(event.nativeEvent.layout.width); }}>
        {!conversation ? <View style={styles.welcome}>
          <View style={styles.welcomeHero} testID="wohin-welcome-hero" onLayout={showNuknukCharacter ? event => setHeroHeight(event.nativeEvent.layout.height) : undefined}>
            <View style={styles.welcomeCopy}>
              <AppText role="bodyStrong" tone="secondary" style={styles.welcomeGreeting}>{greeting}</AppText>
              <AppText role="displayXL" accessibilityRole="header" style={styles.welcomeTitle}>Zeit für{"\n"}<AppText role="displayXL" tone="pink" style={styles.welcomeTitle}>was Gutes.</AppText></AppText>
              <AppText role="body" tone="secondary" style={styles.welcomeText}>Ein guter Drink. Zeit zusammen.{"\n"}Oder einfach mal was anderes.</AppText>
            </View>
            {showNuknukCharacter ? <View style={styles.welcomeCharacter}>
              <LinearGradient colors={[color.tint, color.background]} style={styles.characterGlow} />
            </View> : null}
          </View>
          <View style={styles.welcomeIdeas}>
            <AppText role="caption" tone="secondary" style={styles.ideaIntro}>Ein kleiner Anstoss</AppText>
            <ScrollView horizontal showsHorizontalScrollIndicator={false} style={styles.ideaRailViewport} contentContainerStyle={styles.ideaRail} keyboardShouldPersistTaps="handled">
            {ideasReady ? ideas.map(({ icon, title, detail, wish }, index) => <Pressable key={title} accessibilityRole="button" accessibilityLabel={title} accessibilityHint={detail} disabled={!canCompose} onPress={() => selectIdea(wish)} style={({ pressed }) => [styles.welcomeIdea, { width: Math.min(224, viewportWidth * 0.57), backgroundColor: index === 0 ? color.tint : color.card }, pressed && styles.pressed, !canCompose && styles.unavailableIdea]}>
              <View style={styles.ideaTop}><Ionicons name={icon} size={24} color={color.pink} /><Ionicons name="arrow-forward" style={styles.ideaArrow} size={19} color={color.pink} /></View>
              <View style={styles.welcomeIdeaCopy}><AppText role="cardTitle" style={styles.welcomeIdeaTitle}>{title}</AppText><AppText role="caption" tone="secondary" style={styles.welcomeIdeaDetail}>{detail}</AppText></View>
            </Pressable>) : <ActivityIndicator color={color.pink} />}
            </ScrollView>
          </View>
          {authenticated && (recentRequests.length > 0 || !historyLoaded || historyUnavailable) ? <WohinRecentRequests entries={recentRequests} color={color} loading={!historyLoaded} unavailable={historyUnavailable} onSelect={usePreviousRequest} disabled={!canCompose} onOpen={openHistory} width={Math.max(180, Math.min(240, viewportWidth * 0.62))} /> : null}
        </View> : <>
          {conversationHistory}
          {searchProgress}
          {!loading && (clarificationQuestion || newPlan || offTopic) ? <View style={styles.assistantPresence} onLayout={showNuknukCharacter ? assistantLayout : undefined}>{conversationPrompt}</View> : null}
          {editing ? <View style={styles.inlineActions}><AppText role="meta" tone="secondary">Unten kannst du deine Idee anpassen.</AppText><Pressable accessibilityRole="button" accessibilityLabel={candidates.length ? "Zurück zu deinen Vorschlägen" : "Zurück zum Gespräch"} onPress={() => { setEditing(false); Keyboard.dismiss(); }} style={styles.followUpButton}><AppText role="label" tone="pink">{candidates.length ? "Vorschläge behalten" : "Beim Gespräch bleiben"}</AppText></Pressable></View> : null}
        </>}
        {offTopic && !conversation ? conversationPrompt : null}
        {identityError ? <View style={styles.emptyState}><Text style={{ color: color.warning }}>Dein Profil konnte gerade nicht geprüft werden. Wohin ist vorübergehend nicht verfügbar.</Text><Pressable accessibilityRole="button" onPress={() => setIdentityAttempt(value => value + 1)} style={styles.followUpButton}><AppText role="label" tone="pink">Erneut prüfen</AppText></Pressable></View> : null}
        {identityReady && !identityError && !authenticated ? <AppText role="body" tone="secondary">Bitte melde dich an, um Wohin zu nutzen.</AppText> : null}
        {identityReady && !identityError && authenticated && !city ? <AppText role="body" tone="secondary">Deine Stadt fehlt noch im Profil. Ergänze sie, damit ich in deiner Nähe suchen kann.</AppText> : null}
        {error ? <View style={[styles.emptyState, styles.assistantPresence]} onLayout={showNuknukCharacter ? assistantLayout : undefined} accessibilityLiveRegion="polite"><AppText role="body" tone="error">{error}</AppText>{retryRequest ? <Pressable accessibilityRole="button" disabled={!canCompose} onPress={() => void run(retryRequest.request.naturalLanguage, retryRequest.request, retryRequest.conversation)} style={styles.followUpButton}><AppText role="label" tone="pink">Dieselbe Suche erneut versuchen</AppText></Pressable> : null}</View> : null}
        {showingResults ? <View style={[styles.results, styles.assistantPresence]} onLayout={showNuknukCharacter ? assistantLayout : undefined}>
          <AppText role="sectionTitle" accessibilityRole="header">Wie wär’s hier?</AppText>
          <AppText role="meta" tone="secondary">{candidates.length === 1 ? "Eine Idee für dich." : `${candidates.length} Ideen für dich. Welche spricht dich an?`}</AppText>
          {candidates.some(candidate => candidate.tier === "UNCONFIRMED_FALLBACK") ? <AppText role="meta" tone="secondary">Bei den markierten Orten sind noch Angaben offen. Die Hinweise stehen direkt am Vorschlag.</AppText> : null}
        </View> : null}
        {followUp ? <View style={[styles.emptyState, !error && styles.assistantPresence]} onLayout={showNuknukCharacter && !error ? assistantLayout : undefined} accessibilityLiveRegion={followUp.isAlert ? "assertive" : "polite"} accessibilityRole={followUp.isAlert ? "alert" : undefined}>
          {followUp.isAlert ? <View style={styles.alertHeading}><Ionicons name="alert-circle-outline" size={20} color={color.warning} /><AppText role="bodyStrong">Noch nicht sicher bestätigt</AppText></View> : null}
          <AppText role="body">{followUp.message}</AppText>{followUpNotes.map(note => <AppText key={note} role="meta" tone="secondary">{note}</AppText>)}</View> : null}
        {needsDiscovery ? <View style={[styles.emptyState, !error && !followUp && styles.assistantPresence]} onLayout={showNuknukCharacter && !error && !followUp ? assistantLayout : undefined}>
          {discoveryPlaceholder ? <AppText role="body">Da brauche ich noch eine kleine Idee von dir. Worauf hast du Lust?</AppText> : null}
          {discovery.length ? <AppText role="bodyStrong">Orte zum Entdecken</AppText> : null}
          {discovery.length ? <AppText role="body" tone="secondary">Diese Orte kannst du unabhängig von deiner Suche entdecken. Ob dein ganzer Plan dort klappt, ist noch offen.</AppText> : null}
          {discovery.map(spot => <Pressable key={spot.id} accessibilityRole="button" onPress={() => router.push(`/spot/${spot.id}` as never)} style={styles.discoverySpot}><View style={styles.headerCopy}><AppText role="bodyStrong">{spot.name}</AppText><AppText role="caption" tone="secondary">{[spot.category_name, spot.city].filter(Boolean).join(" · ")}</AppText></View><Ionicons name="arrow-forward" size={18} color={color.pink} /></Pressable>)}
          {discoveryLoading ? <ActivityIndicator color={color.pink} /> : <View style={styles.ideas}>{(discovery.length ? discoveryDirections.slice(1) : discoveryDirections.length ? discoveryDirections : wohinDiscoveryCategories()).map(direction => <Pressable key={direction.label} accessibilityRole="button" onPress={() => selectIdea(direction.query)} style={styles.idea}><AppText role="label">{direction.label}</AppText></Pressable>)}</View>}
        </View> : null}
        {showNuknukCharacter ? <View pointerEvents="none" style={StyleSheet.absoluteFill}>
          <NuknukAvatar visible={presenceShown} height={presenceHeight} placement={{ left: presenceLeft, top: presenceTop }} animate active={focused && presenceShown && presenceVisible && !historyOpen && !selectedDetails && identityReady} state={presenceState} motionKey={loading ? requestGeneration.current : response?.decisionId ?? "welcome"} />
        </View> : null}
        </View>}
        ListFooterComponent={<View style={styles.threadFooter}>
          {showingResults && response?.decisionId ? <DecisionFeedbackCard key={response.decisionId} decisionId={response.decisionId} color={color} /> : null}
          {showingResults ? <AppText role="body" tone="secondary">Noch nicht dein Ding? Sag mir unten einfach, was anders sein soll.</AppText> : null}
        {conversation && !loading && !editing ? <Pressable accessibilityRole="button" accessibilityLabel="Suche ändern" onPress={editQuery} style={styles.followUpButton}><AppText role="caption" tone="secondary">Ursprünglichen Wunsch bearbeiten</AppText></Pressable> : null}
        </View>}
        renderItem={({ item: candidate }) => <DecisionResultCard candidate={candidate} width={cardWidth} recommendation={wohinRecommendation(candidate, response?.interpretation, false)} imageUrl={coverImages.has(candidate.spotId) ? coverImages.get(candidate.spotId)! : (candidate.presentation.event ? eventImageUrl(candidate.presentation.event.imageStoragePath) ?? candidate.presentation.imageUrl : candidate.presentation.imageUrl)} onOpen={() => openSpot(candidate)} onDetails={() => setSelectedDetails(candidate)} />}
      />
      <View style={[styles.dock, { paddingBottom: dockPadding }]} testID="wohin-composer-dock">
        {editing && conversation ? <AppText role="caption" tone="secondary" style={styles.editLabel}>Wunsch bearbeiten</AppText> : null}
        <View style={[styles.chatDock, keyboardVisible && styles.chatDockFocused]}>
          <View style={styles.inputColumn}>
          {/* Measure the same wrapped text independently: a sized input's scroll
              height cannot reliably shrink again on every platform. */}
          <Text accessible={false} accessibilityElementsHidden importantForAccessibility="no-hide-descendants" pointerEvents="none" style={[styles.inputText, styles.inputMeasure]} onLayout={event => setInputHeight(Math.max(44, Math.min(120, Math.ceil(event.nativeEvent.layout.height))))}>{draft}{"\u200b"}</Text>
          <TextInput ref={searchInputRef} accessibilityLabel={replyMode ? clarificationQuestion ? "Antwort auf NukNuks Rückfrage" : "Nachricht an NukNuk" : "Dein Suchwunsch"} placeholder={replyMode ? clarificationQuestion ? "Deine Antwort …" : "Was darf anders sein?" : "Worauf hast du Lust?"} placeholderTextColor={color.muted} style={[styles.inputText, styles.searchInput, { height: inputHeight }]} autoCapitalize="sentences" multiline scrollEnabled={inputHeight >= 120} maxLength={replyMode ? replyLimit : 2000} editable={!loading && (!replyMode || replyLimit > 0)} value={draft}
            onChangeText={value => { if (replyMode) setClarificationAnswer(value); else setQuery(value); setOffTopic(false); setError(null); setRetryRequest(null); }}
          />
          </View>
          <Pressable accessibilityRole="button" accessibilityLabel={loading ? "Suche stoppen und Wunsch bearbeiten" : replyMode ? replyLabel : "Orte finden"} accessibilityState={{ disabled: !loading && !sendEnabled }} disabled={!loading && !sendEnabled} onPress={loading ? leaveSearch : replyMode ? submitReply : submitWish} style={({ pressed }) => [styles.sendButton, !loading && !sendEnabled && styles.primaryDisabled, pressed && styles.pressed]}><Ionicons name={loading ? "stop" : "arrow-up"} size={21} color={loading || sendEnabled ? color.onAccent : color.muted} /></Pressable>
        </View>
        {replyMode && replyLimit === 0 ? <AppText role="caption" tone="secondary">Dein Wunsch ist sehr lang. Bearbeite ihn, um etwas zu ergänzen.</AppText> : null}
      </View>
    </KeyboardAvoidingView>
      <WohinHistorySheet visible={historyOpen && verifiedActorId === user?.id} onClose={() => setHistoryOpen(false)} entries={recentRequests} color={color} loading={!historyLoaded} unavailable={historyUnavailable} disabled={!canCompose} onSelect={usePreviousRequest} onRetry={() => void refreshHistory(true)} onRemove={id => changeHistory(id)} onClear={() => changeHistory()} busy={historyBusy} />
      <Modal visible={selectedDetails !== null && showingResults} transparent animationType="slide" onRequestClose={() => setSelectedDetails(null)}>
        <View style={styles.modalBackdrop}>
          <SafeAreaView style={styles.detailSheet} edges={["top", "bottom"]} accessibilityViewIsModal>
            <View style={styles.sheetHeader}>
              <AppText role="sectionTitle" style={{ flex: 1 }}>Vor deinem Besuch</AppText>
              <Pressable accessibilityRole="button" accessibilityLabel="Hinweise schliessen" onPress={() => setSelectedDetails(null)} style={styles.pagerButton}><Ionicons name="close" size={24} color={color.text} /></Pressable>
            </View>
            <ScrollView contentContainerStyle={styles.sheetContent}>
              {selectedDetails ? <>
                <AppText role="screenTitle">{selectedDetails.presentation.name}</AppText>
                <AppText role="meta" tone="secondary">{wohinPlaceMeta(selectedDetails)}</AppText>
                <AppText role="caption" tone="pink">Für deinen geplanten Besuch</AppText>
                <AppText role="bodyStrong">{availabilityText(selectedDetails)}</AppText>
                {wohinConsiderations(selectedDetails, personal).map(note => <View key={note} style={styles.visitNote}><Ionicons name="information-circle-outline" size={19} color={color.warning} /><AppText role="body" tone="secondary" style={styles.querySummary}>{note}</AppText></View>)}
              </> : null}
              {selectedDetails ? <Pressable accessibilityRole="button" onPress={() => { const candidate = selectedDetails; setSelectedDetails(null); openSpot(candidate); }} style={styles.primaryButton}><AppText role="label" style={styles.primaryLabel}>{selectedDetails.presentation.event ? "Event entdecken" : "Ort entdecken"}</AppText><Ionicons name="arrow-forward" size={18} color={color.onAccent} /></Pressable> : null}
            </ScrollView>
          </SafeAreaView>
        </View>
      </Modal>
    </SafeAreaView>;
}

const createStyles = (color: typeof darkColors) => StyleSheet.create({
  screen: { flex: 1, backgroundColor: color.background },
  ambient: { position: "absolute", left: 0, right: 0, top: 0, height: 420 },
  screenBody: { flex: 1 },
  header: { flexDirection: "row", alignItems: "center", gap: 12, paddingHorizontal: 24, paddingTop: 10, paddingBottom: 14 },
  headerCopy: { flex: 1, gap: 3 },
  iconButton: { minWidth: 44, minHeight: 44, alignItems: "center", justifyContent: "center" },
  thread: { flexGrow: 1, paddingHorizontal: 24, paddingTop: 20, paddingBottom: 20 },
  threadHeader: { gap: 24, paddingBottom: 24 },
  threadFooter: { gap: 16, paddingTop: 20 },
  welcome: { paddingTop: 8, paddingBottom: 24, gap: 32 },
  welcomeHero: { flexDirection: "row", alignItems: "center", gap: 12, minHeight: showNuknukCharacter ? 168 : undefined },
  welcomeCopy: { flex: 1, gap: 16 },
  welcomeGreeting: { fontSize: 15, lineHeight: 22 },
  welcomeTitle: { fontSize: 56, lineHeight: 58, letterSpacing: -2.2 },
  welcomeText: { fontSize: 17, lineHeight: 25 },
  welcomeCharacter: { width: 90, height: 168, alignItems: "center", justifyContent: "center" },
  characterGlow: { position: "absolute", width: 110, height: 146, borderRadius: 55, right: -10, top: 12, opacity: 0.8 },
  welcomeIdeas: { gap: 14 },
  ideaIntro: { fontSize: 14, lineHeight: 20 },
  ideaRailViewport: { marginHorizontal: -24 },
  ideaRail: { gap: 12, paddingHorizontal: 24, paddingBottom: 2, alignItems: "stretch" },
  welcomeIdea: { minHeight: 168, borderRadius: 24, padding: 20, gap: 24, justifyContent: "space-between" },
  ideaTop: { flexDirection: "row", alignItems: "center", justifyContent: "space-between" },
  ideaArrow: { transform: [{ rotate: "-45deg" }] },
  welcomeIdeaCopy: { gap: 8 },
  welcomeIdeaTitle: { fontSize: 22, lineHeight: 26, letterSpacing: -0.4 },
  welcomeIdeaDetail: { fontSize: 13, lineHeight: 19 },
  unavailableIdea: { opacity: 0.5 },
  ideas: { flexDirection: "row", flexWrap: "wrap", gap: 10 },
  idea: { minHeight: 44, flexDirection: "row", alignItems: "center", gap: 9, paddingHorizontal: 15, paddingVertical: 10, borderWidth: StyleSheet.hairlineWidth, borderColor: color.border, borderRadius: 24 },
  history: { gap: 20 },
  userMessage: { alignSelf: "flex-end", maxWidth: "90%", paddingVertical: 12, paddingHorizontal: 16, borderRadius: 22, borderBottomRightRadius: 6, backgroundColor: color.message },
  assistantMessage: { lineHeight: 25, paddingVertical: 4 },
  questionCard: { gap: 12 },
  chatQuestion: { gap: 10, paddingVertical: 4 },
  inlineActions: { gap: 6 },
  dock: { paddingHorizontal: 18, paddingTop: 10, backgroundColor: color.background },
  editLabel: { marginBottom: 7, paddingHorizontal: 10 },
  chatDock: { minHeight: 56, flexDirection: "row", alignItems: "flex-end", gap: 10, backgroundColor: color.dock, borderWidth: StyleSheet.hairlineWidth, borderColor: color.dockBorder, borderRadius: 28, padding: 6 },
  chatDockFocused: { borderColor: color.pink },
  inputColumn: { flex: 1 },
  inputText: { color: color.text, fontSize: 17, lineHeight: 24, paddingHorizontal: 12, paddingVertical: 10 },
  inputMeasure: { position: "absolute", top: 0, left: 0, right: 0, opacity: 0 },
  searchInput: { minHeight: 44, maxHeight: 120, textAlignVertical: "top" },
  sendButton: { width: 44, height: 44, borderRadius: 22, backgroundColor: color.pink, alignItems: "center", justifyContent: "center" },
  primaryDisabled: { backgroundColor: color.disabled },
  pressed: { opacity: 0.75 },
  assistantPresence: { paddingLeft: showNuknukCharacter ? 62 : 0, minHeight: showNuknukCharacter ? 76 : undefined },
  results: { gap: 12 },
  resultCard: { gap: 12 },
  cardArtwork: { borderRadius: 26, overflow: "hidden", backgroundColor: color.artwork },
  eventArtwork: { flex: 1, alignItems: "center", justifyContent: "center" },
  photoCopy: { position: "absolute", left: 20, right: 20, bottom: 20, gap: 8 },
  photoMeta: { color: "#FFFFFF" },
  photoTitle: { color: "#FFFFFF", fontSize: 29, lineHeight: 33, letterSpacing: -0.7 },
  cardOpen: { flexDirection: "row", alignItems: "center", gap: 6, paddingTop: 4 },
  cardReason: { color: color.detailText, paddingHorizontal: 2 },
  cardNote: { alignSelf: "flex-start", minHeight: 44, flexDirection: "row", alignItems: "center", gap: 7 },
  emptyState: { gap: 14 },
  followUpButton: { minHeight: 44, alignSelf: "flex-start", justifyContent: "center" },
  alertHeading: { flexDirection: "row", alignItems: "center", gap: 8 },
  discoverySpot: { flexDirection: "row", alignItems: "center", gap: 12, minHeight: 60, paddingVertical: 12, borderBottomWidth: StyleSheet.hairlineWidth, borderColor: color.border },
  primaryButton: { minHeight: 52, paddingVertical: 12, paddingHorizontal: 18, borderRadius: 999, backgroundColor: color.pink, flexDirection: "row", gap: 8, alignItems: "center", justifyContent: "center" },
  primaryLabel: { color: color.onAccent, flexShrink: 1 },
  visitNote: { flexDirection: "row", alignItems: "flex-start", gap: 10 },
  querySummary: { flex: 1 },
  modalBackdrop: { flex: 1, justifyContent: "flex-end", backgroundColor: "rgba(0,0,0,0.7)" },
  detailSheet: { maxHeight: "88%", backgroundColor: color.card, borderTopLeftRadius: 28, borderTopRightRadius: 28, paddingHorizontal: 24, paddingTop: 18, paddingBottom: 20 },
  sheetHeader: { flexDirection: "row", alignItems: "center", gap: 16 },
  sheetContent: { gap: 16, paddingTop: 18, paddingBottom: 24 },
  pagerButton: { minWidth: 44, minHeight: 44, alignItems: "center", justifyContent: "center" },
});

const darkPresentation = { color: darkColors, styles: createStyles(darkColors) };
const lightPresentation = { color: lightColors, styles: createStyles(lightColors) };

function useWohinPresentation() {
  return useColorScheme() === "light" && !usesFixedDarkAppearance ? lightPresentation : darkPresentation;
}
