import { NuknukAvatar } from "@/components/NuknukAvatar";
import { DecisionProductClarification, DecisionProductDialogueRoute } from "@backyrd/product-decision-contract";
import { useAuth } from "@/hooks/useAuth";
import { rememberRecentDecisionSearch } from "@/lib/decision/recentDecisionSearch";
import { clearJourneySelection, rememberJourneySelection, canCarryPlaceRecommendation } from "@/lib/discovery-journey";
import React, { useCallback, useEffect, useRef, useState } from "react";
import { ActivityIndicator, FlatList, Keyboard, Linking, KeyboardAvoidingView, Modal, Platform, Pressable, ScrollView, StyleSheet, View } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { Stack, useLocalSearchParams, useRouter } from "expo-router";
import { LinearGradient } from "expo-linear-gradient";
import { SafeAreaView, useSafeAreaInsets } from "react-native-safe-area-context";
import * as Crypto from "expo-crypto";
import type { DecisionProductCandidate, DecisionProductRequest, DecisionProductResponse } from "@backyrd/product-decision-contract";

import { AppText, ProductText as Text, ProductTextInput as TextInput } from "@/components/foundation/AppText";
import { eventImageUrl } from "@/lib/events-v1";
import { Image } from "expo-image";
import { SpotArtwork } from "@/components/spot/SpotArtwork";
import { invokeDecisionProduct, recordDecisionProductInteraction, type PersonalDecisionTrace } from "@/lib/decision/productDecision";
import { createWohinRequest, visibleWohinCandidates, wohinConsiderations, wohinRecommendation, wohinClarificationQuery, wohinDiscoveryCategories, wohinDiscoveryDirections, wohinIsDiscoveryPlaceholder, wohinFollowUp, wohinLimitations, wohinPlaceMeta, wohinMessageKind, wohinOffTopicMessage } from "@/lib/decision/wohinModel";
import { recordDecisionFailure, type DecisionFailurePhase } from "@/lib/decision/productDecisionDiagnostics";
import { loadCanonicalSpotHeaders, loadDiscoverySpots, type DiscoverySpot } from "@/lib/spot-images";
import { supabase } from "@/lib/supabase";
import { userFacingError } from "@/lib/userFacingError";
import { backyrdTheme } from "@/theme/backyrd";

type SearchConversation = {
  wish: string;
  turns: { question: string | null; answer: string }[];
};

const color = {
  background: "#050506",
  card: "#1B1B1D",
  text: "#FFFFFF",
  muted: "#A5A5AA",
  border: "#36363B",
  pink: "#FF4F91",
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
  if (requestedDay?.code === "requested-day-opening-unknown") return { text: "Für deinen geplanten Tag fehlen uns noch die Öffnungszeiten", color: color.muted };
  if (candidate.reasons.some(reason => reason.code === "librarian-visit-time-unconfirmed")) return { text: "Ob du zur gewünschten Zeit vorbeikommen und das Angebot nutzen kannst, ist noch offen.", color: color.muted };
  const value = candidate.actualAvailability;
  if (value === "open") return { text: "Laut Angaben geöffnet", color: backyrdTheme.color.openGreen };
  if (value === "closed") return { text: "Laut Angaben geschlossen", color: backyrdTheme.color.warning };
  if (value === "not_requested") return { text: "Öffnungszeiten vor Besuch prüfen", color: color.muted };
  return { text: "Die Öffnungszeiten kennen wir noch nicht", color: color.muted };
}

function DecisionResultCard({ candidate, recommendation, imageUrl, compact, onOpen, onDetails }: {
  candidate: DecisionProductCandidate;
  recommendation: string;
  imageUrl: string | null;
  compact: boolean;
  onOpen: () => void;
  onDetails: () => void;
}) {
  return (
    <View style={styles.resultCard} testID="wohin-result-card">
      {candidate.presentation.event ? <Image source={imageUrl ? {uri:imageUrl} : undefined} accessibilityLabel={candidate.presentation.name} style={StyleSheet.absoluteFill} contentFit="cover" /> : <SpotArtwork imageUrl={imageUrl} spotId={candidate.spotId} spotName={candidate.presentation.name} showFallbackName={false} attributionPosition="top" style={StyleSheet.absoluteFill} />}
      <LinearGradient pointerEvents="none" colors={["transparent", "rgba(5,5,6,0.45)", "rgba(5,5,6,0.97)"]} locations={[0, 0.35, 1]} style={StyleSheet.absoluteFill} />
      <View style={[styles.cardBottom, compact && styles.compactBottom]}>
        <ScrollView style={styles.cardSummary} contentContainerStyle={styles.cardSummaryContent}>
          <AppText role="displayM" style={styles.resultTitle}>{candidate.presentation.name}</AppText>
          <AppText role="meta" style={styles.resultMeta}>{wohinPlaceMeta(candidate)}</AppText>
          <AppText role="body" style={styles.cardReason}>{recommendation}</AppText>
        </ScrollView>
        <Pressable accessibilityRole="button" onPress={onDetails} style={styles.detailsToggle}>
          <AppText role="meta" style={styles.detailsText}>Details & Hinweise</AppText>
          <Ionicons name="add" size={19} color={color.pink} />
        </Pressable>
        <Pressable accessibilityRole="button" accessibilityLabel={`${candidate.presentation.name} entdecken`} onPress={onOpen} style={styles.openSpotButton}>
          <AppText role="label" style={styles.openSpotText}>{candidate.presentation.event ? "Event entdecken" : "Ort entdecken"}</AppText>
          <Ionicons name="arrow-forward" size={20} color={color.background} />
        </Pressable>
      </View>
    </View>
  );
}

export default function WohinScreen() {
  const router = useRouter();
  const { user } = useAuth();
  const insets = useSafeAreaInsets();
  const [conversation, setConversation] = useState<SearchConversation | null>(null);
  const [conversationOpen, setConversationOpen] = useState(false);
  const [offTopic, setOffTopic] = useState(false);
  const [newPlan, setNewPlan] = useState<string | null>(null);
  const [editing, setEditing] = useState(false);
  const [activeIndex, setActiveIndex] = useState(0);
  const [pageWidth, setPageWidth] = useState(0);
  const [pageHeight, setPageHeight] = useState(0);
  const [trace, setTrace] = useState<PersonalDecisionTrace | null>(null);
  const [traceOpen, setTraceOpen] = useState(false);
  const [detailsOpen, setDetailsOpen] = useState(false);
  const listRef = useRef<FlatList<DecisionProductCandidate>>(null);
  const searchScrollRef = useRef<ScrollView>(null);
  const conversationScrollRef = useRef<ScrollView>(null);
  const params = useLocalSearchParams<{ query?: string; auto?: string }>();
  const [query, setQuery] = useState("");
  const [submittedQuery, setSubmittedQuery] = useState("");
  const [clarificationAnswer, setClarificationAnswer] = useState("");
  const [city, setCity] = useState<string | null>(null);
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
    const visible = viewableItems.find((entry) => entry.isViewable && entry.index !== null);
    if (visible) setActiveIndex(visible.index!);
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
    setTrace(null);
    setTraceOpen(false);
    responseRef.current = null;
    setStandaloneQuestion(null);
    setSubmittedQuery("");
    setClarificationAnswer("");
    setConversation(null);
    setConversationOpen(false);
    setOffTopic(false);
    setNewPlan(null);
    setEditing(false);
    setResponse(null);
    setCandidates([]);
    setDiscovery([]);
    setPendingSearch(null);
    setError(null);
    setRetryRequest(null);
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
        supabase.from("profiles").select("city").eq("id", data.user.id).maybeSingle(),
      );
      if (!active) return;
      if (profileError) throw profileError;
      setCity(typeof profile?.city === "string" ? profile.city.trim() : null);
      setIdentityReady(true);
    })().catch(() => { if (active) { setIdentityError(true); setIdentityReady(true); } });
    return () => { active = false; };
  }, [identityAttempt, user?.id]);

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
      setConversationOpen(false);
    }
    setOffTopic(false);
    setNewPlan(null);
    setClarificationAnswer("");
    if (!nextConversation) setStandaloneQuestion(null);
    Keyboard.dismiss();
    setEditing(false);
    setDetailsOpen(false);
    setActiveIndex(0);
    const userReply = nextConversation?.turns.at(-1)?.answer;
    setPendingSearch(placeholder ? null : { message: userReply ?? text.trim(), isReply: Boolean(userReply) });
    setError(null);
    setRetryRequest(null);
    setTrace(null);
    setTraceOpen(false);
    if (!nextConversation) {
      responseRef.current = null;
      setResponse(null);
      setCandidates([]);
      setDiscovery([]);
    }
    if (placeholder) {
      requestInFlight.current = false;
      return;
    }
    let failurePhase: DecisionFailurePhase = "REQUEST";
    let request: DecisionProductRequest | undefined;
    try {
      request = retry ?? createWohinRequest({ query: text, city, requestId: Crypto.randomUUID() });
      failurePhase = "LOAD";
      const result = await invokeDecisionProduct({ supabase, request, supportsDialogueChoice: Boolean(nextConversation), onTrace(value) {
        if (generation === requestGeneration.current) setTrace(value);
      } });
      failurePhase = "DISPLAY";
      const visible = visibleWohinCandidates(result);
      if (generation !== requestGeneration.current) return;
      if (nextConversation) {
        setSubmittedQuery(text.trim());
        setConversation(nextConversation);
        setStandaloneQuestion(null);
        setConversationOpen(false);
      }
      responseRef.current = result;
      setResponse(result);
      setCandidates(visible);
      void rememberRecentDecisionSearch(verifiedActorId, text, visible);
    } catch (cause) {
      if (generation !== requestGeneration.current) return;
      if (cause instanceof DecisionProductDialogueRoute && userReply) {
        if (cause.route === "NEW_PLAN") setNewPlan(userReply);
        else setOffTopic(true);
        setConversationOpen(true);
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
  }, [authenticated, city, identityError, identityReady, user?.id, verifiedActorId]);

  useEffect(() => {
    const incoming = typeof params.query === "string" ? params.query.trim() : "";
    if (!identityReady || identityError || !authenticated || !city || params.auto !== "1" || incoming.length < 3) return;
    const key = `${city}:${incoming}`;
    if (autoRunKey.current === key) return;
    autoRunKey.current = key;
    void run(incoming);
  }, [authenticated, city, identityError, identityReady, params.auto, params.query, run]);

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
        wish: submittedQuery, recommendation: wohinRecommendation(candidate, response.interpretation), notes: [availabilityLabel(candidate).text, ...wohinConsiderations(candidate, response.personalization.state === "ACTIVE")], selectedAt: Date.now() });
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
  const conversationComposer = newPlan ? (
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
  ) : (
    <View style={styles.questionCard}>
      {offTopic ? <AppText role="body" accessibilityLiveRegion="polite">{wohinOffTopicMessage}</AppText> : null}
      {clarificationQuestion ? <View style={styles.guideRow}>
        <NuknukAvatar height={36} />
        <View style={styles.querySummary}>
          <AppText role="label" tone="pink">NukNuk fragt nach</AppText>
          <AppText role="cardTitle" accessibilityLiveRegion="polite">{clarificationQuestion}</AppText>
        </View>
      </View> : <AppText role="label" tone="pink">Suche mit NukNuk verfeinern</AppText>}
      {replyLimit > 0 ? <>
        <TextInput
          style={styles.clarificationInput}
          accessibilityLabel={clarificationQuestion ? "Antwort auf NukNuks Rückfrage" : "Nachricht an NukNuk"}
          placeholder={clarificationQuestion ? "Schreib deine Antwort …" : "Was möchtest du ergänzen?"}
          placeholderTextColor={color.muted}
          autoCapitalize="sentences"
          multiline
          value={clarificationAnswer}
          onChangeText={(text) => {
            setOffTopic(false);
            setClarificationAnswer(text);
          }}
          maxLength={replyLimit}
        />
        <Pressable accessibilityRole="button" accessibilityLabel={clarificationQuestion ? "Antwort senden" : "Nachricht senden"}
          disabled={!refinedQuery || loading}
          accessibilityState={{ disabled: !refinedQuery || loading }}
          onPress={submitReply} style={({ pressed }) => [styles.primaryButton, (!refinedQuery || loading) && styles.primaryDisabled, pressed && styles.pressed]}>
          <AppText role="label" style={refinedQuery && !loading ? styles.primaryLabel : styles.disabledLabel}>{clarificationQuestion ? "Antwort senden" : "Nachricht senden"}</AppText>
          <Ionicons name="arrow-up" size={18} color={refinedQuery && !loading ? color.background : color.muted} />
        </Pressable>
      </> : <AppText role="body" tone="secondary">Dein Suchwunsch ist schon sehr lang. Passe deine ursprüngliche Anfrage an, um die Antwort zu ergänzen.</AppText>}
    </View>
  );
  const conversationHistory = conversation ? (
    <View style={styles.history}>
      <View style={styles.userMessage}>
        <AppText role="caption" tone="pink">Deine Anfrage</AppText>
        <AppText role="body">{conversation.wish}</AppText>
      </View>
      {conversation.turns.map(({ question, answer }, index) => (
        <View key={index} style={styles.history}>
          {question ? <View style={styles.assistantMessage}>
            <View style={styles.guideRow}>
              <NuknukAvatar height={36} />
              <View style={styles.querySummary}>
                <AppText role="caption" tone="pink">NukNuk</AppText>
                <AppText role="body">{question}</AppText>
              </View>
            </View>
          </View> : null}
          <View style={styles.userMessage}>
            <AppText role="caption" tone="pink">{question ? "Deine Antwort" : "Deine Ergänzung"}</AppText>
            <AppText role="body">{answer}</AppText>
          </View>
        </View>
      ))}
    </View>
  ) : null;
  const searchProgress = pendingSearch ? (
    <View style={styles.searchProgress} accessibilityLiveRegion="polite">
      <View style={styles.progressHeader}>
        <View style={styles.progressAvatar} accessibilityElementsHidden importantForAccessibility="no-hide-descendants">
          <NuknukAvatar height={26} />
        </View>
        <AppText role="label" tone="pink" style={styles.querySummary}>NukNuk</AppText>
        <ActivityIndicator size="small" color={color.pink} accessibilityElementsHidden importantForAccessibility="no-hide-descendants" />
      </View>
      <AppText role="bodyStrong">{pendingSearch.isReply ? "Ich nehme das mit und schau noch mal." : "Ich schau mal, was zu deinem Wunsch passt."}</AppText>
      <AppText role="body" tone="secondary" numberOfLines={3}>{`«${pendingSearch.message}»`}</AppText>
    </View>
  ) : null;
  const discoveryPlaceholder = !editing && wohinIsDiscoveryPlaceholder(submittedQuery);
  const needsDiscovery = Boolean(city && authenticated && conversation && !editing && !loading
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
      if (active) setDiscovery([...spots.values()].slice(0, 3));
    })().finally(() => {
      if (active) setDiscoveryLoading(false);
    });
    return () => { active = false; };
  }, [city, discoveryDirections, needsDiscovery, response]);

  const followUp = response && !candidates.length && !clarificationQuestion ? wohinFollowUp(response) : null;
  const followUpNotes = response && followUp
    ? wohinLimitations(response.limitations.filter(code => code !== followUp.explainedLimitation), 0)
    : [];

  const showingResults = Boolean(response && candidates.length && !editing);
  const current = candidates[activeIndex];
  const showConversation = Boolean(conversation && !editing && (loading || discoveryPlaceholder || clarificationQuestion || followUp || error || newPlan || offTopic));
  useEffect(() => {
    if (!showConversation || (!clarificationQuestion && !loading)) return;
    const frame = requestAnimationFrame(() => searchScrollRef.current?.scrollToEnd({ animated: true }));
    return () => cancelAnimationFrame(frame);
  }, [clarificationQuestion, conversation, loading, showConversation]);
  useEffect(() => {
    if (!conversationOpen || !showingResults || !loading) return;
    const frame = requestAnimationFrame(() => conversationScrollRef.current?.scrollToEnd({ animated: false }));
    return () => cancelAnimationFrame(frame);
  }, [conversationOpen, loading, showingResults]);
  const canSearch = !loading && identityReady && !identityError && authenticated && Boolean(city) && query.trim().length >= 3;
  const editQuery = () => {
    if (conversation) setQuery(conversation.wish);
    setConversationOpen(false);
    setEditing(true);
  };
  const startNewSearch = () => {
    if (loading) return;
    setQuery("");
    setEditing(true);
  };
  const goTo = (index: number) => {
    if (index < 0 || index >= candidates.length || !pageWidth) return;
    listRef.current?.scrollToOffset({ offset: index * pageWidth, animated: true });
  };
  const traceButton = trace && verifiedActorId === user?.id ? (
    <Pressable accessibilityRole="button" onPress={() => setTraceOpen(true)} style={styles.followUpButton}>
      <AppText role="label" tone="pink">Übergabe &amp; Reihenfolge</AppText>
    </Pressable>
  ) : null;
  const personal = response?.personalization.state === "ACTIVE";
  return (
    <SafeAreaView style={styles.screen} edges={["top", "left", "right"]}>
      <Stack.Screen options={{ title: "Wohin", headerShown: false }} />
      {showingResults ? <View style={[styles.resultScreen, { paddingBottom: Math.max(8, insets.bottom - 2) + backyrdTheme.control.tabBarVisual + 10 }]}>
        <View style={styles.resultHeader}>
          <View style={styles.querySummary}>
            <AppText role="displayM" accessibilityRole="header">{current?.tier === "UNCONFIRMED_FALLBACK" ? "Orte zum Abklären" : "Vorschläge"}</AppText>
          </View>
          <Pressable accessibilityRole="button" accessibilityLabel="Suche ändern" onPress={editQuery} style={styles.editSearch}>
            <Ionicons name="create-outline" size={18} color={color.text} />
            <AppText role="label">Ändern</AppText>
          </Pressable>
        </View>
        <View style={styles.resultTools}>
          <Pressable accessibilityRole="button"
            accessibilityLabel={clarificationQuestion ? "NukNuks Rückfrage und Gespräch öffnen" : "Mit NukNuk chatten"}
            onPress={() => setConversationOpen(true)} style={({ pressed }) => [styles.conversationLink, pressed && styles.pressed]}>
            <Ionicons name="chatbubble-outline" size={19} color={color.pink} />
            <View style={styles.querySummary}>
              <AppText role="label" tone={clarificationQuestion ? "pink" : "primary"}>{clarificationQuestion ? "NukNuk fragt nach" : "Mit NukNuk chatten"}</AppText>
              <AppText role="caption" tone="secondary" numberOfLines={2}>{clarificationQuestion ?? conversation?.wish}</AppText>
            </View>
            <Ionicons name="chevron-forward" size={17} color={color.muted} />
          </Pressable>
          {traceButton}
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
            extraData={coverImages}
            keyExtractor={(candidate) => candidate.spotId}
            renderItem={({ item: candidate }) => <View style={[styles.cardPage, { width: pageWidth, height: pageHeight }]}>
              <DecisionResultCard candidate={candidate} recommendation={wohinRecommendation(candidate, response?.interpretation)} imageUrl={coverImages.has(candidate.spotId) ? coverImages.get(candidate.spotId)! : (candidate.presentation.event ? eventImageUrl(candidate.presentation.event.imageStoragePath) ?? candidate.presentation.imageUrl : candidate.presentation.imageUrl)} compact={pageHeight < 440} onOpen={() => openSpot(candidate)} onDetails={() => setDetailsOpen(true)} />
            </View>}
          /> : null}
        </View>
        <View style={styles.pager}>
          <Pressable accessibilityRole="button" accessibilityLabel="Vorheriger Vorschlag" disabled={activeIndex === 0} onPress={() => goTo(activeIndex - 1)} style={[styles.pagerButton, activeIndex === 0 && styles.disabled]}><Ionicons name="arrow-back" size={23} color={color.text} /></Pressable>
          <View style={styles.pagerLabel}>
            <AppText role="label" accessibilityLiveRegion="polite">{activeIndex + 1} / {candidates.length}</AppText>
            <AppText role="caption" tone="muted">{candidates.length === 1 ? "Vorschlag" : "Vorschläge"}</AppText>
          </View>
          <Pressable accessibilityRole="button" accessibilityLabel="Nächster Vorschlag" disabled={activeIndex === candidates.length - 1} onPress={() => goTo(activeIndex + 1)} style={[styles.pagerButton, activeIndex === candidates.length - 1 && styles.disabled]}><Ionicons name="arrow-forward" size={23} color={color.text} /></Pressable>
        </View>
      </View> : <KeyboardAvoidingView style={{ flex: 1 }} behavior={Platform.OS === "ios" ? "padding" : undefined}>
        <ScrollView ref={searchScrollRef} keyboardShouldPersistTaps="handled" contentContainerStyle={{ paddingHorizontal: backyrdTheme.layout.pageGutter, paddingTop: backyrdTheme.spacing.lg, paddingBottom: backyrdTheme.control.tabBar + insets.bottom + backyrdTheme.spacing.xl }}>
          {editing && conversation ? <Pressable accessibilityRole="button" onPress={() => { setEditing(false); Keyboard.dismiss(); }} style={styles.backToResults}>
            <Ionicons name="arrow-back" size={18} color={color.pink} />
            <AppText role="label" tone="pink">{candidates.length ? "Zurück zu deinen Vorschlägen" : "Zurück zum Gespräch"}</AppText>
          </Pressable> : null}
          <View style={styles.searchHeader}>
            <AppText role="label" tone="pink">NukNuk</AppText>
            <AppText role="displayXL" accessibilityRole="header">Wohin?</AppText>
            {!showConversation ? <AppText role="body" tone="secondary">Erzähl NukNuk, worauf du gerade Lust hast.</AppText> : null}
          </View>

          {showConversation ? <View style={styles.searchFlow}>
            {conversationHistory}
            {searchProgress ?? (clarificationQuestion || newPlan || offTopic ? conversationComposer : null)}
          </View> : <View style={styles.composer}>
            {city ? <View style={styles.location}>
              <Ionicons name="location-outline" size={16} color={color.pink} />
              <AppText role="meta" tone="secondary">{city}</AppText>
            </View> : !identityReady ? <AppText role="caption" tone="secondary">Dein Profilort wird geladen …</AppText> : null}
            <TextInput
              accessibilityLabel="Dein Suchwunsch"
              autoCapitalize="sentences"
              multiline
              maxLength={2000}
              onChangeText={(value) => { setQuery(value); setOffTopic(false); setError(null); setRetryRequest(null); }}
              placeholder="Z. B. Ein gemütliches Abendessen zu zweit"
              placeholderTextColor={color.muted}
              style={styles.searchInput}
              value={query}
            />
            <Pressable
              accessibilityRole="button"
              accessibilityState={{ disabled: !canSearch }}
              disabled={!canSearch}
              onPress={() => {
                if (wohinMessageKind(query) === "OFF_TOPIC") {
                  Keyboard.dismiss();
                  setOffTopic(true);
                } else void run(query);
              }}
              style={({ pressed }) => [styles.primaryButton, !canSearch && styles.primaryDisabled, pressed && styles.pressed]}
            >
              <AppText role="label" style={canSearch ? styles.primaryLabel : styles.disabledLabel}>Orte finden</AppText>
              <Ionicons name="arrow-forward" size={18} color={canSearch ? color.background : color.muted} />
            </Pressable>
            {offTopic ? <AppText role="body" accessibilityLiveRegion="polite">{wohinOffTopicMessage}</AppText> : null}
          </View>}
          {identityError ? <View style={{ marginTop: 20 }}><Text style={{ color: color.warning }}>Dein Profil konnte gerade nicht geprüft werden. Wohin ist vorübergehend nicht verfügbar.</Text><Pressable accessibilityRole="button" onPress={() => setIdentityAttempt((value) => value + 1)}><Text style={{ color: color.pink, marginTop: 12, fontWeight: "800" }}>Erneut prüfen</Text></Pressable></View> : null}
          {identityReady && !identityError && !authenticated ? <Text style={{ color: color.warning, marginTop: 20 }}>Bitte melde dich an, um Wohin zu nutzen.</Text> : null}
          {identityReady && !identityError && authenticated && !city ? <Text style={{ color: color.warning, marginTop: 20 }}>Deine Stadt fehlt noch im Profil. Ergänze sie, damit wir passende Orte in deiner Nähe finden können.</Text> : null}
          {error ? <View style={styles.emptyState} accessibilityLiveRegion="polite">
            <Text style={{ color: color.warning }}>{error}</Text>
            {retryRequest && identityReady && !identityError && authenticated && city ? (
              <Pressable accessibilityRole="button" disabled={loading} onPress={() => void run(retryRequest.request.naturalLanguage, retryRequest.request, retryRequest.conversation)} style={styles.followUpButton}>
                <AppText role="label" tone="pink">Dieselbe Suche erneut versuchen</AppText>
              </Pressable>
            ) : null}
          </View> : null}

          {followUp ? <View style={styles.emptyState} accessibilityLiveRegion="polite">
            <AppText role="sectionTitle">So können wir weitersuchen</AppText>
            <AppText role="body" tone="secondary">{followUp.message}</AppText>
            {followUpNotes.map(note => <AppText key={note} role="meta" tone="secondary">{note}</AppText>)}
          </View> : null}
          {needsDiscovery ? <View style={styles.emptyState} accessibilityLiveRegion="polite">
            <AppText role="sectionTitle">{discovery.length ? "Orte zum Entdecken" : "Worauf hast du Lust?"}</AppText>
            {discoveryPlaceholder ? <AppText role="body" tone="secondary">XYZ klingt nach einem Geheimcode. Gib mir eine Richtung, dann suche ich los.</AppText> : null}
            {discovery.length ? <AppText role="body" tone="secondary">Vielleicht ist hier etwas für dich dabei. Ob dein ganzer Plan dort klappt, ist noch offen.</AppText> : null}
            {discovery.map(spot => (
              <Pressable key={spot.id} accessibilityRole="button" onPress={() => router.push(`/spot/${spot.id}` as never)}
                style={styles.discoverySpot}>
                <View style={styles.querySummary}>
                  <AppText role="bodyStrong">{spot.name}</AppText>
                  <AppText role="caption" tone="secondary">{[spot.category_name, spot.city].filter(Boolean).join(" · ")}</AppText>
                </View>
                <Ionicons name="chevron-forward" size={18} color={color.muted} />
              </Pressable>
            ))}
            {discoveryLoading ? <ActivityIndicator color={color.pink} /> : null}
            {!discoveryLoading ? <View style={styles.searchActions}>
              {(discovery.length ? discoveryDirections.slice(1)
                : discoveryDirections.length ? discoveryDirections : wohinDiscoveryCategories()).map(direction => (
                <Pressable key={direction.label} accessibilityRole="button" onPress={() => {
                  setQuery(direction.query);
                  setEditing(true);
                }} style={styles.editSearch}>
                  <AppText role="label">{direction.label}</AppText>
                </Pressable>
              ))}
            </View> : null}
          </View> : null}
          {showConversation && !loading ? <>
            <View style={styles.searchActions}>
              <Pressable accessibilityRole="button" onPress={editQuery} style={styles.followUpButton}>
                <AppText role="label" tone="pink">{followUp?.actionLabel ?? "Anfrage ändern"}</AppText>
              </Pressable>
              <Pressable accessibilityRole="button" onPress={startNewSearch} style={styles.followUpButton}>
                <AppText role="label">Neue Suche</AppText>
              </Pressable>
            </View>
            {traceButton}
          </> : null}
          {!showConversation ? <View style={styles.privacy}>
            <Pressable accessibilityRole="link" accessibilityLabel="Datenschutz zur KI-Suche öffnen" onPress={() => { void Linking.openURL("https://www.backyrd.ch/legal#decision").catch(() => setError("Die Datenschutzinformation konnte nicht geöffnet werden. Versuche es erneut.")); }} style={styles.followUpButton}>
              <AppText role="caption" tone="pink">Datenschutz zur KI-Suche</AppText>
            </Pressable>
          </View> : null}
        </ScrollView>
      </KeyboardAvoidingView>}
      <Modal visible={conversationOpen && showingResults && !traceOpen} transparent animationType="slide" onShow={() => {
        conversationScrollRef.current?.scrollToEnd({ animated: false });
      }} onRequestClose={() => setConversationOpen(false)}>
        <KeyboardAvoidingView style={styles.modalBackdrop} behavior={Platform.OS === "ios" ? "padding" : undefined}>
          <SafeAreaView style={styles.detailSheet} edges={["top", "bottom"]} accessibilityViewIsModal>
            <View style={styles.sheetHeader}>
              <AppText role="sectionTitle" accessibilityRole="header" style={styles.querySummary}>Dein Gespräch mit NukNuk</AppText>
              <Pressable accessibilityRole="button" accessibilityLabel="Gespräch schliessen" onPress={() => setConversationOpen(false)} style={styles.pagerButton}>
                <Ionicons name="close" size={22} color={color.text} />
              </Pressable>
            </View>
            <ScrollView ref={conversationScrollRef} keyboardShouldPersistTaps="handled" contentContainerStyle={styles.sheetContent}>
              {conversationHistory}
              {conversationComposer}
              {searchProgress}
            </ScrollView>
          </SafeAreaView>
        </KeyboardAvoidingView>
      </Modal>
      <Modal visible={traceOpen && trace !== null && verifiedActorId === user?.id} transparent animationType="slide" onRequestClose={() => setTraceOpen(false)}>
        <View style={styles.modalBackdrop}>
          <SafeAreaView style={styles.detailSheet} edges={["top", "bottom"]} accessibilityViewIsModal>
            <View style={styles.sheetHeader}>
              <AppText role="sectionTitle" style={{ flex: 1 }}>Übergabe &amp; Reihenfolge</AppText>
              <Pressable accessibilityRole="button" accessibilityLabel="Übergabe schliessen" onPress={() => setTraceOpen(false)} style={styles.pagerButton}><Ionicons name="close" size={22} color={color.text} /></Pressable>
            </View>
            <ScrollView contentContainerStyle={styles.sheetContent}>
              <AppText role="sectionTitle">Suchauftrag</AppText>
              {trace?.handoff ? trace.handoff.facts.map(fact => (
                <View key={fact.id}>
                  <AppText role="label">{fact.key} · {fact.modality}</AppText>
                  <AppText role="body" tone="secondary">{JSON.stringify(fact.value)}</AppText>
                </View>
              )) : <AppText role="body">Für diese Antwort wurde keine Spot-Suche ausgeführt.</AppText>}
              {trace?.handoff ? <AppText selectable role="caption" tone="secondary">{JSON.stringify(trace.handoff, null, 2)}</AppText> : null}
              {trace?.ranked.length ? <AppText role="sectionTitle">Reihenfolge</AppText> : null}
              {trace?.ranked.map((candidate, index) => (
                <View key={index}>
                  <AppText role="label">{candidate.spot} · {candidate.rank === null ? "Vorläufig" : `Rang ${candidate.rank}`}</AppText>
                  {candidate.beforeNext ? <AppText role="body">Vor {trace.ranked[index + 1]?.spot} wegen {candidate.beforeNext}.</AppText> : null}
                  {candidate.facts.map((fact, factIndex) => (
                    <AppText key={factIndex} role="caption" tone="secondary">
                      {trace.handoff?.facts.find(item => item.id === fact.factId)?.key ?? fact.factId} · {fact.state} · {fact.reason}
                      {candidate.matchedPreferences.includes(fact.factId) ? " · erfüllte Präferenz" : ""}
                    </AppText>
                  ))}
                </View>
              ))}
            </ScrollView>
          </SafeAreaView>
        </View>
      </Modal>
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
                <AppText role="body" style={styles.recommendation}>{wohinRecommendation(current, response?.interpretation)}</AppText>
                {current.actualAvailability !== "not_requested" ? <AppText role="body" tone="secondary">{availabilityLabel(current).text}</AppText> : null}
                {wohinConsiderations(current, personal).map(note => <AppText key={note} role="body" tone="secondary">{note}</AppText>)}
              </> : null}
              <AppText role="caption" tone="muted">{personal ? "Nach deinen Vorlieben ausgewählt" : "Auswahl ohne persönliche Vorlieben"}</AppText>
            </ScrollView>
          </SafeAreaView>
        </View>
      </Modal>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: color.background },
  searchHeader: { gap: 8, marginBottom: 24 },
  guideRow: { flexDirection: "row", alignItems: "center", gap: 10 },
  composer: { padding: 18, gap: 14, borderRadius: 24, backgroundColor: backyrdTheme.color.surfaceElevated, borderWidth: 1, borderColor: color.border },
  location: { alignSelf: "flex-start", flexDirection: "row", alignItems: "center", gap: 6 },
  searchInput: { color: color.text, fontSize: 20, lineHeight: 28, minHeight: 108, maxHeight: 220, paddingVertical: 8, textAlignVertical: "top" },
  primaryButton: { minHeight: 52, paddingVertical: 12, paddingHorizontal: 18, borderRadius: 999, backgroundColor: color.pink, flexDirection: "row", gap: 8, alignItems: "center", justifyContent: "center" },
  primaryLabel: { color: color.background, flexShrink: 1 },
  primaryDisabled: { backgroundColor: "#252528" },
  disabledLabel: { color: color.muted, flexShrink: 1 },
  pressed: { opacity: 0.75 },
  privacy: { marginTop: 16, paddingHorizontal: 4 },
  searchFlow: { gap: 18 },
  history: { gap: 12 },
  userMessage: { maxWidth: "92%", alignSelf: "flex-end", gap: 5, backgroundColor: "#291C24", borderRadius: 18, borderBottomRightRadius: 6, padding: 14 },
  assistantMessage: { gap: 5, backgroundColor: backyrdTheme.color.surfaceElevated, borderRadius: 18, borderBottomLeftRadius: 6, padding: 14 },
  searchProgress: { gap: 8, padding: 16, borderRadius: 22, borderBottomLeftRadius: 6, borderWidth: 1, borderColor: color.border, backgroundColor: backyrdTheme.color.surfaceElevated },
  progressHeader: { flexDirection: "row", alignItems: "center", gap: 10, marginBottom: 2 },
  progressAvatar: { width: 36, height: 36, borderRadius: 18, alignItems: "center", justifyContent: "center", backgroundColor: "#291C24" },
  questionCard: { padding: 16, gap: 12, borderWidth: 1, borderColor: "#63344C", borderRadius: 22, backgroundColor: "#1F161C" },
  clarificationInput: { minHeight: 60, maxHeight: 145, padding: 12, borderRadius: 14, borderWidth: 1, borderColor: color.border, backgroundColor: color.background, color: color.text, fontSize: 16, textAlignVertical: "top" },
  searchActions: { flexDirection: "row", flexWrap: "wrap", gap: 16, marginTop: 10 },
  resultScreen: { flex: 1 },
  resultHeader: { paddingHorizontal: 20, paddingTop: 8, paddingBottom: 10, flexDirection: "row", alignItems: "center", gap: 10 },
  querySummary: { flex: 1, gap: 2 },
  editSearch: { flexDirection: "row", gap: 6, alignItems: "center", minHeight: 44, paddingHorizontal: 10, borderRadius: 22, backgroundColor: backyrdTheme.color.surfaceElevated },
  resultTools: { marginHorizontal: 16, marginBottom: 10 },
  conversationLink: { minHeight: 54, flexDirection: "row", alignItems: "center", gap: 10, paddingHorizontal: 10, paddingVertical: 8, borderRadius: 18, borderWidth: 1, borderColor: color.border, backgroundColor: backyrdTheme.color.surfaceElevated },
  deck: { flex: 1, minHeight: 0 },
  cardPage: { flex: 1, paddingHorizontal: 16 },
  resultCard: { flex: 1, borderRadius: 30, overflow: "hidden", backgroundColor: color.card, borderWidth: StyleSheet.hairlineWidth, borderColor: color.border },
  cardBottom: { position: "absolute", bottom: 0, left: 0, right: 0, maxHeight: "75%", padding: 20 },
  compactBottom: { maxHeight: "92%", padding: 16 },
  cardSummary: { flexShrink: 1 },
  cardSummaryContent: { gap: 10 },
  resultTitle: { color: color.text },
  cardReason: { color: "#F7F2F5" },
  resultMeta: { color: "#D1CDD1", marginBottom: 4 },
  detailsToggle: { minHeight: 44, flexDirection: "row", alignItems: "center", gap: 7, justifyContent: "space-between", borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: "#FFFFFF40", marginTop: 14, marginBottom: 10 },
  detailsText: { color: color.pink },
  recommendation: { fontSize: 22, lineHeight: 31, color: "#F7F2F5" },
  openSpotButton: { minHeight: 52, paddingVertical: 12, borderRadius: 999, backgroundColor: color.pink, flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 10 },
  openSpotText: { color: color.background },
  pager: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", paddingHorizontal: 24, paddingTop: 10, gap: 12 },
  pagerButton: { minWidth: 44, minHeight: 44, borderRadius: 22, alignItems: "center", justifyContent: "center", backgroundColor: color.card },
  disabled: { opacity: 0.3 },
  pagerLabel: { alignItems: "center", gap: 2, flex: 1 },
  backToResults: { minHeight: 44, flexDirection: "row", alignItems: "center", gap: 8, marginBottom: 16 },
  discoverySpot: { flexDirection: "row", alignItems: "center", gap: 12, padding: 14, minHeight: 52, borderRadius: 16, backgroundColor: color.card },
  emptyState: { marginTop: 28, gap: 12 },
  followUpButton: { minHeight: 44, justifyContent: "center", alignSelf: "flex-start" },
  modalBackdrop: { flex: 1, justifyContent: "flex-end", backgroundColor: "rgba(0,0,0,0.7)" },
  detailSheet: { maxHeight: "88%", backgroundColor: color.card, borderTopLeftRadius: 28, borderTopRightRadius: 28, paddingHorizontal: 24, paddingTop: 18, paddingBottom: 20 },
  sheetHeader: { flexDirection: "row", alignItems: "center", gap: 16 },
  sheetContent: { gap: 16, paddingTop: 18, paddingBottom: 24 },
});
