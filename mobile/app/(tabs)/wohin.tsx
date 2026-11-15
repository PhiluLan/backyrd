import { DecisionProductClarification, DecisionProductDialogueRoute } from "@backyrd/product-decision-contract";
import { useAuth } from "@/hooks/useAuth";
import { readRecentDecisionSearch, rememberRecentDecisionSearch } from "@/lib/decision/recentDecisionSearch";
import { clearJourneySelection, rememberJourneySelection, canCarryPlaceRecommendation } from "@/lib/discovery-journey";
import React, { useCallback, useEffect, useRef, useState } from "react";
import { ActivityIndicator, FlatList, Keyboard, Linking, KeyboardAvoidingView, Modal, Platform, Pressable, ScrollView, StyleSheet, useColorScheme, View } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { Stack, useFocusEffect, useLocalSearchParams, useRouter } from "expo-router";
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
import { homeDaypart } from "@/lib/home-daypart";

type SearchIdea = { icon: React.ComponentProps<typeof Ionicons>["name"]; title: string; wish: string };

type SearchConversation = {
  wish: string;
  turns: { question: string | null; answer: string }[];
};

const darkColors = {
  background: "#050505", card: "#1D171A", text: "#F6F0E8", muted: "#B6A5AC",
  border: "#47323C", pink: "#FF4F91", warning: "#FFC878", onAccent: "#170A11",
  gradient: ["#422034", "#1E101B", "#050505"] as readonly [string, string, string],
  panel: "#2B1B26", tint: "#472737", dock: "#33202B", dockBorder: "#785367",
  icon: "#583346", disabled: "#252528", message: "#291C24", prompt: "#1F161C",
  focusBorder: "#63344C", subButton: "#372333", question: "#492938", artwork: "#3C2934",
  detailText: "#E2D3D6", chat: "#160E15", brief: "#342233",
};

const lightColors: typeof darkColors = {
  background: "#FAF5F0", card: "#FFFCF9", text: "#321E26", muted: "#725862",
  border: "#DBC5C9", pink: "#9E2153", warning: "#8A4C1D", onAccent: "#FFFFFF",
  gradient: ["#F4DEE6", "#FAF0F0", "#FAF5F0"],
  panel: "#FFF9F6", tint: "#F4DFE5", dock: "#FFF8F6", dockBorder: "#CEAAB8",
  icon: "#F1D9E2", disabled: "#EDE0E4", message: "#F5E3E9", prompt: "#F9ECEF",
  focusBorder: "#D6A6BE", subButton: "#F1E3E9", question: "#F1DDE6", artwork: "#EEDFE3",
  detailText: "#543744", chat: "#FCF6F4", brief: "#F2E2E9",
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

function availabilityText(candidate: DecisionProductCandidate): string {
  const requestedDay = candidate.reasons.find((reason) => ["requested-day-opening-hours", "requested-day-closed", "requested-day-opening-unknown"].includes(reason.code));
  if (requestedDay?.code === "requested-day-opening-hours") return requestedDay.statement;
  if (requestedDay?.code === "requested-day-closed") return "Am gewünschten Tag geschlossen";
  if (requestedDay?.code === "requested-day-opening-unknown") return "Für deinen geplanten Tag fehlen uns noch die Öffnungszeiten";
  if (candidate.reasons.some(reason => reason.code === "librarian-visit-time-unconfirmed")) return "Ob du zur gewünschten Zeit vorbeikommen und das Angebot nutzen kannst, ist noch offen.";
  const value = candidate.actualAvailability;
  if (value === "open") return "Laut Angaben geöffnet";
  if (value === "closed") return "Laut Angaben geschlossen";
  if (value === "not_requested") return "Öffnungszeiten vor Besuch prüfen";
  return "Die Öffnungszeiten kennen wir noch nicht";
}

function DecisionResultCard({ candidate, recommendation, imageUrl, onOpen, onDetails }: {
  candidate: DecisionProductCandidate;
  recommendation: string;
  imageUrl: string | null;
  onOpen: () => void;
  onDetails: () => void;
}) {
  const { styles, color } = useWohinPresentation();
  const meta = wohinPlaceMeta(candidate);
  const openLabel = candidate.presentation.event ? "Event entdecken" : "Ort entdecken";

  return (
    <View style={styles.resultCard} testID="wohin-result-card">
      <View style={styles.cardMain}>
        <View style={styles.cardArtwork}>
          {candidate.presentation.event
            ? imageUrl
              ? <Image source={{ uri: imageUrl }} accessibilityLabel={candidate.presentation.name} style={StyleSheet.absoluteFill} contentFit="cover" />
              : <Ionicons name="calendar-outline" size={30} color={color.muted} />
            : <SpotArtwork imageUrl={imageUrl} spotId={candidate.spotId} spotName={candidate.presentation.name} showFallbackName={false} attributionPosition="top" style={StyleSheet.absoluteFill} />}
        </View>
        <View style={styles.cardBody}>
          {meta ? <AppText role="caption" style={styles.resultMeta}>{meta}</AppText> : null}
          <AppText role="cardTitle" accessibilityRole="header">{candidate.presentation.name}</AppText>
          {candidate.tier === "UNCONFIRMED_FALLBACK" ? <AppText role="caption" style={styles.provisional}>Noch abzuklären</AppText> : null}
          <AppText role="body" style={styles.cardReason}>{recommendation}</AppText>
        </View>
      </View>
      <View style={styles.cardActions}>
        <Pressable accessibilityRole="button" accessibilityLabel={`${candidate.presentation.name} entdecken`} onPress={onOpen} style={({ pressed }) => [styles.cardAction, pressed && styles.pressed]}>
          <AppText role="label" tone="pink">{openLabel}</AppText>
          <Ionicons name="arrow-forward" size={16} color={color.pink} />
        </Pressable>
        <Pressable accessibilityRole="button" accessibilityLabel={`Details & Hinweise zu ${candidate.presentation.name}`} onPress={onDetails} style={({ pressed }) => [styles.cardAction, pressed && styles.pressed]}>
          <AppText role="label" style={styles.detailsText}>Details &amp; Hinweise</AppText>
        </Pressable>
      </View>
    </View>
  );
}

export default function WohinScreen() {
  const { styles, color } = useWohinPresentation();
  const router = useRouter();
  const { user } = useAuth();
  const insets = useSafeAreaInsets();
  const [conversation, setConversation] = useState<SearchConversation | null>(null);
  const [conversationOpen, setConversationOpen] = useState(false);
  const [offTopic, setOffTopic] = useState(false);
  const [newPlan, setNewPlan] = useState<string | null>(null);
  const [editing, setEditing] = useState(false);
  const [trace, setTrace] = useState<PersonalDecisionTrace | null>(null);
  const [traceOpen, setTraceOpen] = useState(false);
  const [selectedDetails, setSelectedDetails] = useState<DecisionProductCandidate | null>(null);
  const searchInputRef = useRef<React.ElementRef<typeof TextInput>>(null);
  const searchScrollRef = useRef<ScrollView>(null);
  const conversationScrollRef = useRef<ScrollView>(null);
  const params = useLocalSearchParams<{ query?: string; auto?: string }>();
  const [query, setQuery] = useState("");
  const [submittedQuery, setSubmittedQuery] = useState("");
  const [clarificationAnswer, setClarificationAnswer] = useState("");
  const [city, setCity] = useState<string | null>(null);
  const [daypart, setDaypart] = useState(() => homeDaypart(new Date()));
  const [recentWish, setRecentWish] = useState<{ actorId: string; query: string } | null>(null);
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
    setRecentWish(null);
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

  useFocusEffect(useCallback(() => {
    const refreshDaypart = () => setDaypart(homeDaypart(new Date()));
    refreshDaypart();
    const timer = setInterval(refreshDaypart, 60_000);
    return () => clearInterval(timer);
  }, []));
  useFocusEffect(useCallback(() => {
    if (!verifiedActorId || verifiedActorId !== user?.id) return;
    let active = true;
    void readRecentDecisionSearch(verifiedActorId).then(recent => {
      if (active) setRecentWish(recent ? { actorId: verifiedActorId, query: recent.query } : null);
    });
    return () => { active = false; };
  }, [user?.id, verifiedActorId]));

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
    setSelectedDetails(null);
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
      setRecentWish({ actorId: verifiedActorId, query: text.trim() });
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
        wish: submittedQuery, recommendation: wohinRecommendation(candidate, response.interpretation), notes: [availabilityText(candidate), ...wohinConsiderations(candidate, response.personalization.state === "ACTIVE")], selectedAt: Date.now() });
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
  const replyComposer = replyLimit > 0 ? (
    <View style={styles.chatDock}>
      <TextInput
        style={styles.searchInput}
        accessibilityLabel={clarificationQuestion ? "Antwort auf NukNuks Rückfrage" : "Nachricht an NukNuk"}
        placeholder={clarificationQuestion ? "Deine Antwort …" : "Was soll ich bei der Suche ändern?"}
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
      <Pressable accessibilityRole="button" accessibilityLabel={replyLabel}
        disabled={!replyEnabled} accessibilityState={{ disabled: !replyEnabled }}
        onPress={submitReply} style={({ pressed }) => [styles.sendButton, !replyEnabled && styles.primaryDisabled, pressed && styles.pressed]}>
        <Ionicons name="arrow-up" size={21} color={replyEnabled ? color.onAccent : color.muted} />
      </Pressable>
    </View>
  ) : <AppText role="body" tone="secondary">Dein Suchwunsch ist schon sehr lang. Passe deine ursprüngliche Anfrage an, um die Antwort zu ergänzen.</AppText>;

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

  const conversationHistory = (fullScreen = false) => conversation ? (
    <View style={styles.history}>
      <View style={fullScreen ? styles.chatBrief : styles.userMessage}>
        <AppText role="caption" tone="pink">{fullScreen ? "Dein Plan" : "Deine Anfrage"}</AppText>
        <AppText role={fullScreen ? "sectionTitle" : "body"}>{conversation.wish}</AppText>
        {fullScreen ? <Pressable accessibilityRole="button" onPress={() => setConversationOpen(false)} style={styles.followUpButton}>
          <AppText role="label" tone="pink">{candidates.length === 1 ? "Zum Vorschlag" : `Zu den ${candidates.length} Vorschlägen`}</AppText>
        </Pressable> : null}
      </View>
      {conversation.turns.map(({ question, answer }, index) => (
        <View key={index} style={styles.history}>
          {question ? <View style={fullScreen ? styles.chatQuestion : styles.assistantMessage}>
            <View style={styles.guideRow}>
              <View style={styles.querySummary}>
                <AppText role="caption" tone="pink">NukNuk</AppText>
                <AppText role="body">{question}</AppText>
              </View>
            </View>
          </View> : null}
          <View style={fullScreen ? styles.chatTurn : styles.userMessage}>
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
          <Ionicons name="chatbubble-ellipses-outline" size={17} color={color.pink} />
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
  const showConversation = Boolean(conversation && !editing && (loading || discoveryPlaceholder || clarificationQuestion || followUp || error || newPlan || offTopic));
  useEffect(() => {
    if (!showConversation || (!clarificationQuestion && !loading)) return;
    const frame = requestAnimationFrame(() => searchScrollRef.current?.scrollToEnd({ animated: true }));
    return () => cancelAnimationFrame(frame);
  }, [clarificationQuestion, conversation, loading, showConversation]);
  useEffect(() => {
    if (!conversationOpen || !showingResults) return;
    const frame = requestAnimationFrame(() => conversationScrollRef.current?.scrollToEnd({ animated: false }));
    return () => cancelAnimationFrame(frame);
  }, [clarificationQuestion, conversationOpen, loading, newPlan, offTopic, showingResults]);
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
  const traceButton = trace && verifiedActorId === user?.id ? (
    <Pressable accessibilityRole="button" onPress={() => setTraceOpen(true)} style={styles.followUpButton}>
      <AppText role="label" tone="pink">Übergabe &amp; Reihenfolge</AppText>
    </Pressable>
  ) : null;
  const personal = response?.personalization.state === "ACTIVE";
  const canCompose = !loading && identityReady && !identityError && authenticated && Boolean(city);
  const submitWish = () => {
    if (!canSearch) return;
    if (wohinMessageKind(query) === "OFF_TOPIC") {
      Keyboard.dismiss();
      setOffTopic(true);
    } else void run(query);
  };
  const evening = daypart === "Abend" || daypart === "Nacht";
  const morning = daypart === "Morgen" || daypart === "Vormittag";
  const localIdea: SearchIdea | null = !city ? null : evening
    ? { icon: "wine-outline", title: daypart === "Nacht" ? "Noch etwas trinken" : "Gemütlich ausgehen", wish: `Wo kann ich jetzt in ${city} gemütlich etwas trinken?` }
    : morning
      ? { icon: "cafe-outline", title: "Kaffee am Vormittag", wish: `Wo kann ich heute Vormittag in ${city} gemütlich Kaffee trinken?` }
      : daypart === "Mittag"
        ? { icon: "restaurant-outline", title: "Etwas zum Mittagessen", wish: `Wo kann ich heute Mittag in ${city} etwas essen?` }
        : { icon: "compass-outline", title: "Eine Idee für den Nachmittag", wish: `Was kann ich heute Nachmittag in ${city} unternehmen?` };
  const personalIdea = recentWish && recentWish.actorId === verifiedActorId && verifiedActorId === user?.id
    ? { icon: "time-outline", title: "Dein letzter Suchwunsch", wish: recentWish.query } as const : null;
  const nearbyIdea = city ? { icon: "location-outline", title: `${city} entdecken`, wish: `Zeig mir etwas Besonderes in ${city}.` } as const : null;
  const ideas = [localIdea, personalIdea, nearbyIdea].flatMap(idea => idea ? [idea] : []);
  const resultHeader = (
    <View style={styles.resultHeader}>
      <View style={styles.resultHeading}>
        <AppText role="displayM" accessibilityRole="header" style={styles.querySummary}>
          {candidates.every(candidate => candidate.tier === "UNCONFIRMED_FALLBACK") ? "Orte zum Abklären" : "Deine Vorschläge"}
        </AppText>
        <Pressable accessibilityRole="button" accessibilityLabel="Suche ändern" onPress={editQuery} style={({ pressed }) => [styles.iconButton, pressed && styles.pressed]}>
          <Ionicons name="create-outline" size={20} color={color.text} />
        </Pressable>
      </View>
      {clarificationQuestion ? <Pressable
        accessibilityRole="button" accessibilityLabel={`NukNuk fragt: ${clarificationQuestion} Gespräch öffnen`}
        onPress={() => setConversationOpen(true)} style={({ pressed }) => [styles.conversationLink, pressed && styles.pressed]}
      >
        <Ionicons name="chatbubble-outline" size={18} color={color.pink} />
        <AppText role="meta" style={styles.querySummary}>{clarificationQuestion}</AppText>
        <Ionicons name="chevron-forward" size={16} color={color.muted} />
      </Pressable> : null}
    </View>
  );
  const dockPadding = { paddingBottom: Math.max(8, insets.bottom - 2) + backyrdTheme.control.tabBarVisual + 12 };

  return (
    <SafeAreaView style={styles.screen} edges={["top", "left", "right"]}>
      <Stack.Screen options={{ title: "Wohin", headerShown: false }} />
      <LinearGradient pointerEvents="none" colors={color.gradient} style={styles.ambient} />
      {showingResults ? <View style={styles.screenBody}>
        <FlatList
          key={response!.decisionId}
          data={candidates}
          ListHeaderComponent={resultHeader}
          contentContainerStyle={styles.results}
          viewabilityConfig={viewabilityConfig}
          onViewableItemsChanged={onViewableItemsChanged}
          extraData={coverImages}
          keyExtractor={(candidate) => candidate.spotId}
          renderItem={({ item: candidate }) => <DecisionResultCard
            candidate={candidate}
            recommendation={wohinRecommendation(candidate, response?.interpretation)}
            imageUrl={coverImages.has(candidate.spotId) ? coverImages.get(candidate.spotId)! : (candidate.presentation.event ? eventImageUrl(candidate.presentation.event.imageStoragePath) ?? candidate.presentation.imageUrl : candidate.presentation.imageUrl)}
            onOpen={() => openSpot(candidate)}
            onDetails={() => setSelectedDetails(candidate)}
          />}
        />
        <View style={[styles.dock, dockPadding]}>
          <Pressable accessibilityRole="button" accessibilityLabel="Mit NukNuk chatten"
            onPress={() => setConversationOpen(true)} style={({ pressed }) => [styles.chatDock, pressed && styles.pressed]}>
            <View style={styles.dockAvatar}><Ionicons name="chatbubble-ellipses-outline" size={18} color={color.pink} /></View>
            <AppText role="bodyStrong" style={styles.querySummary}>{clarificationQuestion ? "NukNuk antworten" : "Frag NukNuk weiter …"}</AppText>
            <Ionicons name="chevron-forward" size={19} color={color.pink} />
          </Pressable>
        </View>
      </View> : <KeyboardAvoidingView style={styles.screenBody} behavior={Platform.OS === "ios" ? "padding" : undefined}>
        <ScrollView ref={searchScrollRef} keyboardShouldPersistTaps="handled" contentContainerStyle={{ paddingHorizontal: backyrdTheme.layout.pageGutter, paddingTop: backyrdTheme.spacing.lg, paddingBottom: showConversation ? backyrdTheme.control.tabBar + insets.bottom + backyrdTheme.spacing.xl : backyrdTheme.spacing.sm }}>
          {editing && conversation ? <Pressable accessibilityRole="button" onPress={() => { setEditing(false); Keyboard.dismiss(); }} style={styles.backToResults}>
            <Ionicons name="arrow-back" size={18} color={color.pink} />
            <AppText role="label" tone="pink">{candidates.length ? "Zurück zu deinen Vorschlägen" : "Zurück zum Gespräch"}</AppText>
          </Pressable> : null}
          <View style={styles.searchHeader}>
            <AppText role="displayXL" accessibilityRole="header">Wohin?</AppText>
            {city ? <View style={styles.location}>
              <Ionicons name="location-outline" size={16} color={color.pink} />
              <AppText role="meta" style={styles.resultMeta}>{city}</AppText>
            </View> : null}
          </View>

          {showConversation ? <View style={styles.searchFlow}>
            {conversationHistory()}
            {searchProgress ?? (clarificationQuestion || newPlan || offTopic ? <>
              {conversationPrompt}
              {!newPlan ? replyComposer : null}
            </> : null)}
          </View> : <>
            {!editing ? <>
              <View style={styles.welcome}>
                <View style={styles.querySummary}>
                  <AppText role="displayM" style={styles.welcomeTitle}>Worauf hast du Lust?</AppText>
                  <AppText role="body" style={styles.welcomeText}>Erzähl mir, was du vorhast. Ich finde Orte, die zu deinem Plan passen.</AppText>
                </View>
              </View>
              <View style={styles.ideas}>
                {ideas.map(({ icon, title, wish }) => (
                  <Pressable key={title} accessibilityRole="button" disabled={!canCompose}
                    onPress={() => { setQuery(wish); setOffTopic(false); setError(null); setRetryRequest(null); searchInputRef.current?.focus(); }}
                    style={({ pressed }) => [styles.idea, pressed && styles.pressed]}>
                    <View style={styles.ideaIcon}><Ionicons name={icon} color={color.pink} size={21} /></View>
                    <View style={styles.querySummary}>
                      <AppText role="bodyStrong">{title}</AppText>
                      <AppText role="caption" style={styles.resultMeta} numberOfLines={2}>{wish}</AppText>
                    </View>
                    <Ionicons name="chevron-forward" size={17} color={color.muted} />
                  </Pressable>
                ))}
              </View>
            </> : <AppText role="body">Was möchtest du suchen?</AppText>}
            {offTopic ? <AppText role="body" accessibilityLiveRegion="polite" style={styles.offTopic}>{wohinOffTopicMessage}</AppText> : null}
          </>}
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
        {!showConversation ? <View style={[styles.dock, dockPadding]}>
          <View style={styles.chatDock}>
            <TextInput
              ref={searchInputRef}
              accessibilityLabel="Dein Suchwunsch"
              autoCapitalize="sentences"
              multiline
              maxLength={2000}
              onChangeText={(value) => { setQuery(value); setOffTopic(false); setError(null); setRetryRequest(null); }}
              placeholder="Frag NukNuk …"
              placeholderTextColor={color.muted}
              style={styles.searchInput}
              value={query}
            />
            <Pressable accessibilityRole="button" accessibilityLabel="Orte finden"
              accessibilityState={{ disabled: !canSearch }} disabled={!canSearch} onPress={submitWish}
              style={({ pressed }) => [styles.sendButton, !canSearch && styles.primaryDisabled, pressed && styles.pressed]}>
              <Ionicons name="arrow-up" size={21} color={canSearch ? color.onAccent : color.muted} />
            </Pressable>
          </View>
        </View> : null}
      </KeyboardAvoidingView>}
      <Modal visible={conversationOpen && showingResults && !traceOpen} animationType="slide" onShow={() => {
        conversationScrollRef.current?.scrollToEnd({ animated: false });
      }} onRequestClose={() => setConversationOpen(false)}>
        <SafeAreaView style={styles.conversationScreen} edges={["top", "bottom", "left", "right"]} accessibilityViewIsModal>
          <KeyboardAvoidingView style={styles.screenBody} behavior={Platform.OS === "ios" ? "padding" : undefined}>
            <View style={styles.conversationHeader}>
              <Pressable accessibilityRole="button" accessibilityLabel="Gespräch schliessen" onPress={() => setConversationOpen(false)} style={styles.iconButton}>
                <Ionicons name="arrow-back" size={21} color={color.text} />
              </Pressable>
              <View style={styles.querySummary}>
                <AppText role="cardTitle" accessibilityRole="header">Dein Gespräch mit NukNuk</AppText>
                {city ? <AppText role="caption" style={styles.resultMeta}>{response?.interpretation.targetCity ?? city}</AppText> : null}
              </View>
            </View>
            <ScrollView ref={conversationScrollRef} keyboardShouldPersistTaps="handled" contentContainerStyle={styles.conversationBody}>
              {conversationHistory(true)}
              {conversationPrompt}
              {searchProgress}
              {traceButton}
            </ScrollView>
            {!newPlan ? <View style={styles.conversationComposer}>{replyComposer}</View> : null}
          </KeyboardAvoidingView>
        </SafeAreaView>
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
      <Modal visible={selectedDetails !== null && showingResults} transparent animationType="slide" onRequestClose={() => setSelectedDetails(null)}>
        <View style={styles.modalBackdrop}>
          <SafeAreaView style={styles.detailSheet} edges={["top", "bottom"]} accessibilityViewIsModal>
            <View style={styles.sheetHeader}>
              <AppText role="sectionTitle" style={{ flex: 1 }}>Details & Hinweise</AppText>
              <Pressable accessibilityRole="button" accessibilityLabel="Hinweise schließen" onPress={() => setSelectedDetails(null)} style={styles.pagerButton}><Ionicons name="close" size={24} color={color.text} /></Pressable>
            </View>
            <ScrollView contentContainerStyle={styles.sheetContent}>
              {selectedDetails ? <>
                <AppText role="screenTitle">{selectedDetails.presentation.name}</AppText>
                <AppText role="meta" tone="secondary">{wohinPlaceMeta(selectedDetails)}</AppText>
                <AppText role="body" style={styles.recommendation}>{wohinRecommendation(selectedDetails, response?.interpretation)}</AppText>
                {selectedDetails.actualAvailability !== "not_requested" ? <AppText role="body" tone="secondary">{availabilityText(selectedDetails)}</AppText> : null}
                {wohinConsiderations(selectedDetails, personal).map(note => <AppText key={note} role="body" tone="secondary">{note}</AppText>)}
              </> : null}
              <AppText role="caption" tone="muted">{personal ? "Nach deinen Vorlieben ausgewählt" : "Auswahl ohne persönliche Vorlieben"}</AppText>
            </ScrollView>
          </SafeAreaView>
        </View>
      </Modal>
    </SafeAreaView>
  );
}

const createStyles = (color: typeof darkColors) => StyleSheet.create({
  screen: { flex: 1, backgroundColor: color.background },
  ambient: { position: "absolute", left: 0, right: 0, top: 0, height: 560 },
  screenBody: { flex: 1 },
  searchHeader: { flexDirection: "row", flexWrap: "wrap", alignItems: "center", justifyContent: "space-between", gap: 12, marginBottom: 22 },
  guideRow: { flexDirection: "row", alignItems: "center", gap: 10 },
  location: { flexDirection: "row", alignItems: "center", gap: 5 },
  welcome: { flexDirection: "row", alignItems: "center", gap: 15, borderRadius: 26, backgroundColor: "#F5E1D5", padding: 22 },
  welcomeTitle: { color: "#412035", fontSize: 31, lineHeight: 35 },
  welcomeText: { color: "#634053", marginTop: 8 },
  ideas: { marginTop: 22, gap: 9 },
  idea: { flexDirection: "row", alignItems: "center", gap: 12, paddingHorizontal: 13, paddingVertical: 10, minHeight: 64, borderRadius: 18, backgroundColor: color.panel, borderWidth: StyleSheet.hairlineWidth, borderColor: color.border },
  ideaIcon: { width: 40, height: 40, borderRadius: 13, alignItems: "center", justifyContent: "center", backgroundColor: color.tint },
  offTopic: { marginTop: 16 },
  dock: { paddingHorizontal: 18, paddingTop: 9, backgroundColor: color.background, borderTopWidth: StyleSheet.hairlineWidth, borderColor: color.border },
  chatDock: { minHeight: 56, flexDirection: "row", alignItems: "center", gap: 10, borderWidth: StyleSheet.hairlineWidth, borderColor: color.dockBorder, backgroundColor: color.dock, borderRadius: 27, paddingHorizontal: 13, paddingVertical: 5 },
  dockAvatar: { width: 36, height: 36, borderRadius: 18, alignItems: "center", justifyContent: "center", backgroundColor: color.icon },
  searchInput: { flex: 1, color: color.text, fontSize: 16, lineHeight: 23, minHeight: 44, maxHeight: 112, paddingHorizontal: 3, paddingVertical: 10, textAlignVertical: "top" },
  sendButton: { width: 44, height: 44, borderRadius: 22, backgroundColor: color.pink, alignItems: "center", justifyContent: "center" },
  primaryButton: { minHeight: 52, paddingVertical: 12, paddingHorizontal: 18, borderRadius: 999, backgroundColor: color.pink, flexDirection: "row", gap: 8, alignItems: "center", justifyContent: "center" },
  primaryLabel: { color: color.onAccent, flexShrink: 1 },
  primaryDisabled: { backgroundColor: color.disabled },
  pressed: { opacity: 0.75 },
  privacy: { marginTop: 16, paddingHorizontal: 4 },
  searchFlow: { gap: 18 },
  history: { gap: 12 },
  userMessage: { maxWidth: "92%", alignSelf: "flex-end", gap: 5, backgroundColor: color.message, borderRadius: 18, borderBottomRightRadius: 6, padding: 14 },
  assistantMessage: { gap: 5, backgroundColor: backyrdTheme.color.surfaceElevated, borderRadius: 18, borderBottomLeftRadius: 6, padding: 14 },
  searchProgress: { gap: 8, padding: 16, borderRadius: 22, borderBottomLeftRadius: 6, borderWidth: 1, borderColor: color.border, backgroundColor: backyrdTheme.color.surfaceElevated },
  progressHeader: { flexDirection: "row", alignItems: "center", gap: 10, marginBottom: 2 },
  progressAvatar: { width: 36, height: 36, borderRadius: 18, alignItems: "center", justifyContent: "center", backgroundColor: color.message },
  questionCard: { padding: 16, gap: 12, borderWidth: 1, borderColor: color.focusBorder, borderRadius: 22, backgroundColor: color.prompt },
  searchActions: { flexDirection: "row", flexWrap: "wrap", gap: 16, marginTop: 10 },
  results: { paddingHorizontal: 18, paddingTop: 18, paddingBottom: 16, gap: 12 },
  resultHeader: { gap: 12, paddingBottom: 6 },
  resultHeading: { flexDirection: "row", alignItems: "center", gap: 12 },
  querySummary: { flex: 1, gap: 2 },
  iconButton: { width: 44, height: 44, borderRadius: 22, alignItems: "center", justifyContent: "center", backgroundColor: color.subButton },
  editSearch: { flexDirection: "row", gap: 6, alignItems: "center", minHeight: 44, paddingHorizontal: 10, borderRadius: 22, backgroundColor: color.card },
  conversationLink: { minHeight: 56, flexDirection: "row", alignItems: "center", gap: 12, paddingHorizontal: 14, paddingVertical: 8, borderRadius: 18, backgroundColor: color.question },
  resultCard: { gap: 10, paddingHorizontal: 13, paddingTop: 13, paddingBottom: 3, borderRadius: 22, backgroundColor: color.panel, borderWidth: StyleSheet.hairlineWidth, borderColor: color.border },
  cardMain: { flexDirection: "row", alignItems: "flex-start", gap: 12 },
  cardArtwork: { width: 78, height: 88, flexShrink: 0, borderRadius: 13, overflow: "hidden", alignItems: "center", justifyContent: "center", backgroundColor: color.artwork },
  cardBody: { flex: 1, gap: 3 },
  cardReason: { marginTop: 3, color: color.detailText },
  resultMeta: { color: color.muted },
  provisional: { color: color.warning },
  cardActions: { flexDirection: "row", flexWrap: "wrap", justifyContent: "space-between", columnGap: 12, borderTopWidth: StyleSheet.hairlineWidth, borderColor: color.border },
  cardAction: { flexDirection: "row", alignItems: "center", gap: 5, minHeight: 44 },
  detailsText: { color: color.detailText, flexShrink: 1 },
  recommendation: { fontSize: 22, lineHeight: 31, color: color.text },
  pagerButton: { minWidth: 44, minHeight: 44, borderRadius: 22, alignItems: "center", justifyContent: "center", backgroundColor: color.card },
  backToResults: { minHeight: 44, flexDirection: "row", alignItems: "center", gap: 8, marginBottom: 16 },
  discoverySpot: { flexDirection: "row", alignItems: "center", gap: 12, padding: 14, minHeight: 52, borderRadius: 16, backgroundColor: color.card },
  emptyState: { marginTop: 28, gap: 12 },
  followUpButton: { minHeight: 44, justifyContent: "center", alignSelf: "flex-start" },
  conversationScreen: { flex: 1, backgroundColor: color.chat },
  conversationHeader: { flexDirection: "row", alignItems: "center", gap: 12, paddingHorizontal: 18, paddingVertical: 12, borderBottomWidth: StyleSheet.hairlineWidth, borderColor: color.border },
  conversationBody: { flexGrow: 1, padding: 22, gap: 18 },
  chatBrief: { padding: 20, borderRadius: 18, backgroundColor: color.brief, gap: 9 },
  chatTurn: { paddingVertical: 10, borderBottomWidth: StyleSheet.hairlineWidth, borderColor: color.border, gap: 6 },
  chatQuestion: { paddingVertical: 10, paddingLeft: 15, borderLeftWidth: 2, borderColor: color.pink, gap: 6 },
  conversationComposer: { paddingHorizontal: 18, paddingTop: 10, paddingBottom: 8, borderTopWidth: StyleSheet.hairlineWidth, borderColor: color.border },
  modalBackdrop: { flex: 1, justifyContent: "flex-end", backgroundColor: "rgba(0,0,0,0.7)" },
  detailSheet: { maxHeight: "88%", backgroundColor: color.card, borderTopLeftRadius: 28, borderTopRightRadius: 28, paddingHorizontal: 24, paddingTop: 18, paddingBottom: 20 },
  sheetHeader: { flexDirection: "row", alignItems: "center", gap: 16 },
  sheetContent: { gap: 16, paddingTop: 18, paddingBottom: 24 },
});

const darkPresentation = { color: darkColors, styles: createStyles(darkColors) };
const lightPresentation = { color: lightColors, styles: createStyles(lightColors) };

function useWohinPresentation() {
  return useColorScheme() === "light" ? lightPresentation : darkPresentation;
}
