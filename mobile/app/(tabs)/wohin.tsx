import { DecisionProductClarification, DecisionProductDialogueRoute } from "@backyrd/product-decision-contract";
import { useAuth } from "@/hooks/useAuth";
import { readRecentDecisionSearch, rememberRecentDecisionSearch } from "@/lib/decision/recentDecisionSearch";
import { clearJourneySelection, rememberJourneySelection, canCarryPlaceRecommendation } from "@/lib/discovery-journey";
import React, { useCallback, useEffect, useRef, useState } from "react";
import { ActivityIndicator, FlatList, Keyboard, KeyboardAvoidingView, Modal, Platform, Pressable, ScrollView, StyleSheet, useColorScheme, View } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { Stack, useFocusEffect, useLocalSearchParams, useRouter } from "expo-router";
import { LinearGradient } from "expo-linear-gradient";
import { SafeAreaView, useSafeAreaInsets } from "react-native-safe-area-context";
import * as Crypto from "expo-crypto";
import type { DecisionProductCandidate, DecisionProductRequest, DecisionProductResponse } from "@backyrd/product-decision-contract";

import { AppText, HomeTypographyProvider, ProductText as Text, ProductTextInput as TextInput } from "@/components/foundation/AppText";
import { NuknukAvatar } from "@/components/NuknukAvatar";
import { WohinWaitCard } from "@/components/WohinWaitCard";
import { eventImageUrl } from "@/lib/events-v1";
import { Image } from "expo-image";
import { SpotArtwork } from "@/components/spot/SpotArtwork";
import { invokeDecisionProduct, recordDecisionProductInteraction } from "@/lib/decision/productDecision";
import { createWohinRequest, wohinAvailability as availabilityText, visibleWohinCandidates, wohinConsiderations, wohinRecommendation, wohinClarificationQuery, wohinDiscoveryCategories, wohinDiscoveryDirections, wohinIsDiscoveryPlaceholder, wohinFollowUp, wohinLimitations, wohinPlaceMeta, wohinMessageKind, wohinOffTopicMessage } from "@/lib/decision/wohinModel";
import { recordDecisionFailure, type DecisionFailurePhase } from "@/lib/decision/productDecisionDiagnostics";
import { loadCanonicalSpotHeaders, loadDiscoverySpots, type DiscoverySpot } from "@/lib/spot-images";
import { supabase } from "@/lib/supabase";
import { userFacingError } from "@/lib/userFacingError";
import { backyrdTheme, usesFixedDarkAppearance } from "@/theme/backyrd";
import { homeDaypart } from "@/lib/home-daypart";

type SearchIdea = { icon: React.ComponentProps<typeof Ionicons>["name"]; title: string; wish: string };

type SearchConversation = {
  wish: string;
  turns: { question: string | null; answer: string }[];
};

const darkColors = {
  background: "#050505", card: "#101010", text: "#F6F0E8", muted: "#9B9B9F",
  border: "#FFFFFF24", pink: "#FF4F91", warning: "#F7C65C", onAccent: "#08080A",
  gradient: ["#21131B", "#0D090B", "#050505"] as readonly [string, string, string],
  panel: "#101010", tint: "#29151F", dock: "#171719", dockBorder: "#FFFFFF33",
  disabled: "#252528", message: "#171719", prompt: "#171719",
  focusBorder: "#63344C", subButton: "#171719", question: "#20141B", artwork: "#171719",
  detailText: "#D7D7DB", chat: "#050505", brief: "#101010",
};

const lightColors: typeof darkColors = {
  background: "#F7F7F5", card: "#FFFFFF", text: "#19191C", muted: "#53535A",
  border: "#19191C21", pink: "#C71559", warning: "#8C5700", onAccent: "#FFFFFF",
  gradient: ["#F3E7ED", "#F7F4F5", "#F7F7F5"],
  panel: "#FFFFFF", tint: "#F5E5EC", dock: "#FFFFFF", dockBorder: "#19191C47",
  disabled: "#EEEEF0", message: "#FFFFFF", prompt: "#FFFFFF",
  focusBorder: "#D6A6BE", subButton: "#EEEEF0", question: "#F5E5EC", artwork: "#EEEEF0",
  detailText: "#53535A", chat: "#F7F7F5", brief: "#FFFFFF",
};

// Same disclosure as web/app/legal/page.tsx#decision. Kept readable in-app,
// including offline; opening it never records or changes consent.
const searchPrivacy = [
  "Wenn du nach Orten suchst, übermittelt Backyrd deinen Suchwunsch und die gewählten Suchangaben, zum Beispiel Stadt, Budget oder Begleitung, an OpenAI. Dazu kommen das Bezugsdatum und die Zeitzone, damit Angaben wie „morgen“ verstanden werden. Die KI hilft, deine Anfrage zu verstehen; passende Orte wählt Backyrd anhand seiner Spot- und Eventangaben aus.",
  "Deine Konto-ID und E-Mail-Adresse werden dabei nicht an OpenAI gesendet. Angaben, die du selbst in das Suchfeld schreibst, sind Teil der Anfrage. Bitte gib deshalb keine vertraulichen Daten oder Namen anderer Personen ein. Backyrd fordert keine dauerhafte Speicherung der Modellantwort bei OpenAI an. Technische Protokolle beim Anbieter sind davon getrennt.",
  "Die Verarbeitung durch OpenAI kann ausserhalb der Schweiz stattfinden. Persönliche Vorlieben berücksichtigt Backyrd nur mit deiner entsprechenden Einwilligung. Du kannst sie im Privacy Center verwalten. Fragen oder Anliegen zum Datenschutz: hello@backyrd.ch.",
];

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


function DecisionResultCard({ candidate, recommendation, imageUrl, onOpen, onDetails }: {
  candidate: DecisionProductCandidate;
  recommendation: string;
  imageUrl: string | null;
  onOpen: () => void;
  onDetails: () => void;
}) {
  const { styles, color } = useWohinPresentation();
  const meta = wohinPlaceMeta(candidate);
  const hasVisitNotes = wohinConsiderations(candidate, false).length > 0 || candidate.actualAvailability === "unknown";
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
          {candidate.tier === "UNCONFIRMED_FALLBACK" ? <AppText role="caption" style={styles.provisional}>Vor Besuch klären</AppText> : null}
          {candidate.tier !== "UNCONFIRMED_FALLBACK" && hasVisitNotes ? <AppText role="caption" style={styles.provisional}>Hinweise zum Besuch</AppText> : null}
          <AppText role="body" style={styles.cardReason}>{recommendation}</AppText>
        </View>
      </View>
      <View style={styles.cardActions}>
        <Pressable accessibilityRole="button" accessibilityLabel={`${candidate.presentation.name} entdecken`} onPress={onOpen} style={({ pressed }) => [styles.cardAction, pressed && styles.pressed]}>
          <AppText role="label" tone="pink">{openLabel}</AppText>
          <Ionicons name="arrow-forward" size={16} color={color.pink} />
        </Pressable>
        <Pressable accessibilityRole="button" accessibilityLabel={`Vor deinem Besuch bei ${candidate.presentation.name}`} onPress={onDetails} style={({ pressed }) => [styles.cardAction, pressed && styles.pressed]}>
          <AppText role="label" style={styles.detailsText}>Vor deinem Besuch</AppText>
        </Pressable>
      </View>
    </View>
  );
}

export default function WohinScreen() {
  return <HomeTypographyProvider><WohinExperience /></HomeTypographyProvider>;
}

function WohinExperience() {
  const { styles, color } = useWohinPresentation();
  const router = useRouter();
  const { user } = useAuth();
  const insets = useSafeAreaInsets();
  const [conversation, setConversation] = useState<SearchConversation | null>(null);
  const [conversationOpen, setConversationOpen] = useState(false);
  const [offTopic, setOffTopic] = useState(false);
  const [newPlan, setNewPlan] = useState<string | null>(null);
  const [editing, setEditing] = useState(false);
  const [privacyOpen, setPrivacyOpen] = useState(false);
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
  const [recentWishLoaded, setRecentWishLoaded] = useState(false);
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
    setConversationOpen(false);
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
    setRecentWish(null);
    setRecentWishLoaded(false);
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
    }).catch(() => undefined).finally(() => { if (active) setRecentWishLoaded(true); });
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
      const result = await invokeDecisionProduct({ supabase, request, supportsDialogueChoice: Boolean(nextConversation) });
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
        editable={!loading}
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
  const leaveSearch = () => {
    // Invalidate local delivery; an already sent request may finish on the server.
    ++requestGeneration.current;
    requestInFlight.current = false;
    setPendingSearch(null);
    setQuery(conversation?.wish ?? submittedQuery);
    setClarificationAnswer("");
    setConversationOpen(false);
    setEditing(true);
  };
  const searchProgress = pendingSearch ? <>
    {pendingSearch.isReply ? <View style={styles.userMessage}><AppText role="caption" tone="pink">Deine Ergänzung</AppText><AppText role="body">{pendingSearch.message}</AppText></View> : null}
    <WohinWaitCard key={requestGeneration.current} isReply={pendingSearch.isReply} onLeave={leaveSearch} />
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
      if (active) setDiscovery([...spots.values()].slice(0, 3));
    })().finally(() => {
      if (active) setDiscoveryLoading(false);
    });
    return () => { active = false; };
  }, [city, discoveryDirections, needsDiscovery, response]);

  const followUp = !editing && response && !candidates.length && !clarificationQuestion ? wohinFollowUp(response) : null;
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
    setError(null);
    setRetryRequest(null);
    setConversationOpen(false);
    setEditing(true);
  };
  const startNewSearch = () => {
    if (loading) return;
    clearJourneySelection();
    responseRef.current = null;
    setResponse(null);
    setCandidates([]);
    setDiscovery([]);
    setConversation(null);
    setConversationOpen(false);
    setSelectedDetails(null);
    setStandaloneQuestion(null);
    setSubmittedQuery("");
    setClarificationAnswer("");
    setNewPlan(null);
    setOffTopic(false);
    setError(null);
    setRetryRequest(null);
    setQuery("");
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
  const ideasReady = identityReady && (!authenticated || recentWishLoaded);
  const ideas = [localIdea, personalIdea, nearbyIdea].flatMap(idea => idea ? [idea] : []);
  const resultHeader = (
    <View style={styles.resultHeader}>
      <View style={styles.resultHeading}>
        <AppText role="screenTitle" accessibilityRole="header" style={styles.querySummary}>
          {candidates.every(candidate => candidate.tier === "UNCONFIRMED_FALLBACK") ? "Zum Entdecken" : "Das könnte dein Moment sein"}
        </AppText>
        <Pressable accessibilityRole="button" accessibilityLabel="Suche ändern" onPress={editQuery} style={({ pressed }) => [styles.iconButton, pressed && styles.pressed]}>
          <Ionicons name="create-outline" size={20} color={color.text} />
        </Pressable>
      </View>
      <View style={styles.planSummary}>
        <View style={styles.guideRow}>
          <NuknukAvatar height={30} appearance="outline" />
          <AppText role="caption" tone="pink">Dein Plan · {response?.interpretation.targetCity ?? city}</AppText>
        </View>
        <AppText role="bodyStrong">{conversation?.wish ?? submittedQuery}</AppText>
        {conversation?.turns.map(({ answer }, index) => <AppText key={index} role="meta" tone="secondary">{answer}</AppText>)}
        <View style={styles.searchActions}>
          <Pressable accessibilityRole="button" onPress={editQuery} style={styles.followUpButton}><AppText role="label" tone="pink">Wunsch anpassen</AppText></Pressable>
          <Pressable accessibilityRole="button" onPress={startNewSearch} style={styles.followUpButton}><AppText role="label">Neue Suche</AppText></Pressable>
        </View>
      </View>
      {candidates.some(candidate => candidate.tier === "UNCONFIRMED_FALLBACK") ? <AppText role="meta" tone="secondary">Bei den markierten Orten sind noch Angaben offen. Unter «Vor deinem Besuch» erfährst du mehr.</AppText> : null}
      <AppText role="caption" tone="secondary">{candidates.length === 1 ? "1 Möglichkeit für deinen Plan" : `${candidates.length} Möglichkeiten für deinen Plan`}</AppText>
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
            recommendation={wohinRecommendation(candidate, response?.interpretation, false)}
            imageUrl={coverImages.has(candidate.spotId) ? coverImages.get(candidate.spotId)! : (candidate.presentation.event ? eventImageUrl(candidate.presentation.event.imageStoragePath) ?? candidate.presentation.imageUrl : candidate.presentation.imageUrl)}
            onOpen={() => openSpot(candidate)}
            onDetails={() => setSelectedDetails(candidate)}
          />}
        />
        <View style={[styles.dock, dockPadding]}>
          <Pressable accessibilityRole="button" accessibilityLabel="Mit NukNuk chatten"
            onPress={() => setConversationOpen(true)} style={({ pressed }) => [styles.chatDock, pressed && styles.pressed]}>
            <NuknukAvatar height={32} appearance="outline" />
            <AppText role="bodyStrong" style={styles.querySummary}>{clarificationQuestion ? "NukNuk antworten" : "Was darf noch anders sein?"}</AppText>
            <Ionicons name="chevron-forward" size={19} color={color.pink} />
          </Pressable>
        </View>
      </View> : <KeyboardAvoidingView style={styles.screenBody} behavior={Platform.OS === "ios" ? "padding" : undefined}>
        <ScrollView ref={searchScrollRef} keyboardShouldPersistTaps="handled" contentContainerStyle={{ paddingHorizontal: backyrdTheme.layout.pageGutter, paddingTop: backyrdTheme.spacing.lg, paddingBottom: showConversation ? backyrdTheme.control.tabBar + insets.bottom + backyrdTheme.spacing.xl : backyrdTheme.spacing.sm }}>
          {editing && conversation ? <Pressable accessibilityRole="button" accessibilityLabel={candidates.length ? "Zurück zu deinen Vorschlägen" : "Zurück zum Gespräch"} onPress={() => { setEditing(false); Keyboard.dismiss(); }} style={styles.backToResults}>
            <Ionicons name="arrow-back" size={18} color={color.pink} />
            <AppText role="label" tone="pink">{candidates.length ? "Zurück zu deinen Vorschlägen" : "Zurück zum Gespräch"}</AppText>
          </Pressable> : null}
          <View style={styles.searchHeader}>
            <AppText role="screenTitle" style={styles.pageTitle} accessibilityRole="header">Wohin<AppText role="screenTitle" style={styles.pageTitle} tone="pink">?</AppText></AppText>
            <View style={styles.location}>
              <Ionicons name="location-outline" size={16} color={color.pink} />
              <AppText role="meta" style={styles.resultMeta}>{city ?? (identityReady ? "Deine Stadt" : "Stadt wird geladen")}</AppText>
            </View>
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
                  <View style={styles.guideRow}><NuknukAvatar height={36} appearance="outline" /><AppText role="label" tone="pink">Hey, ich bin NukNuk.</AppText></View>
                  <AppText role="screenTitle" style={styles.welcomeTitle}>Was würde dir guttun?</AppText>
                  <AppText role="body" style={styles.welcomeText}>Erzähl mir, worauf du Lust hast. Mit wem du losziehst. Oder einfach, wie sich dein nächster Moment anfühlen soll.</AppText>
                  <AppText role="meta" tone="secondary" style={styles.welcomeText}>Du musst noch keinen fertigen Plan haben.</AppText>
                </View>
              </View>
              <View style={styles.ideas}>
                <AppText role="caption" tone="secondary">Ein Gedanke zum Loslegen</AppText>
                {!ideasReady ? <View style={styles.idea}><ActivityIndicator color={color.pink} /><AppText role="meta" tone="secondary">Ein paar Ideen für dich …</AppText></View> : ideas.map(({ icon, title, wish }) => (
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
            </> : <View style={styles.emptyState}><AppText role="sectionTitle">Was darf anders sein?</AppText><AppText role="body" tone="secondary">Dein Wunsch darf sich ändern. Erzähl mir, was dir jetzt wichtig ist.</AppText></View>}
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
          </> : null}
          {!showConversation ? <View style={styles.privacy}>
            <Pressable accessibilityRole="link" accessibilityLabel="Datenschutz zur KI-Suche öffnen" onPress={() => setPrivacyOpen(true)} style={styles.followUpButton}>
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
              placeholder="Was hast du im Kopf?"
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
      <Modal visible={conversationOpen && showingResults} animationType="slide" onShow={() => {
        conversationScrollRef.current?.scrollToEnd({ animated: false });
      }} onRequestClose={() => setConversationOpen(false)}>
        <SafeAreaView style={styles.conversationScreen} edges={["top", "bottom", "left", "right"]} accessibilityViewIsModal>
          <KeyboardAvoidingView style={styles.screenBody} behavior={Platform.OS === "ios" ? "padding" : undefined}>
            <View style={styles.conversationHeader}>
              <Pressable accessibilityRole="button" accessibilityLabel="Gespräch schliessen" onPress={() => setConversationOpen(false)} style={styles.iconButton}>
                <Ionicons name="arrow-back" size={21} color={color.text} />
              </Pressable>
              <View style={styles.querySummary}>
                <AppText role="cardTitle" accessibilityRole="header">Dein Plan mit NukNuk</AppText>
                {city ? <AppText role="caption" style={styles.resultMeta}>{response?.interpretation.targetCity ?? city}</AppText> : null}
              </View>
            </View>
            <ScrollView ref={conversationScrollRef} keyboardShouldPersistTaps="handled" contentContainerStyle={styles.conversationBody}>
              {conversationHistory(true)}
              {!clarificationQuestion && !newPlan && !offTopic && !loading ? <View style={styles.chatQuestion}><AppText role="label" tone="pink">NukNuk</AppText><AppText role="body">Was würde deinen Plan noch besser machen? Mehr Ruhe, ein anderer Zeitpunkt oder etwas ganz anderes? Sag mir, was dir wichtig ist.</AppText></View> : null}
              {conversationPrompt}
              {searchProgress}
            </ScrollView>
            {!newPlan ? <View style={styles.conversationComposer}>{replyComposer}</View> : null}
          </KeyboardAvoidingView>
        </SafeAreaView>
      </Modal>
      <Modal visible={privacyOpen} transparent animationType="slide" onRequestClose={() => setPrivacyOpen(false)}>
        <View style={styles.modalBackdrop}>
          <SafeAreaView style={styles.detailSheet} edges={["bottom"]} accessibilityViewIsModal>
            <View style={styles.sheetHeader}>
              <AppText role="sectionTitle" style={{ flex: 1 }}>Dein Wunsch. Deine Daten.</AppText>
              <Pressable accessibilityRole="button" accessibilityLabel="Datenschutz schliessen" onPress={() => setPrivacyOpen(false)} style={styles.pagerButton}><Ionicons name="close" size={24} color={color.text} /></Pressable>
            </View>
            <ScrollView contentContainerStyle={styles.sheetContent}>
              <AppText role="label" tone="pink">Datenschutz zur KI-Suche</AppText>
              {searchPrivacy.map(paragraph => <AppText key={paragraph} role="body" tone="secondary">{paragraph}</AppText>)}
              <Pressable accessibilityRole="button" onPress={() => { setPrivacyOpen(false); router.push("/settings/privacy"); }} style={styles.followUpButton}><AppText role="label" tone="pink">Zum Privacy Center</AppText></Pressable>
            </ScrollView>
          </SafeAreaView>
        </View>
      </Modal>
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
    </SafeAreaView>
  );
}

const createStyles = (color: typeof darkColors) => StyleSheet.create({
  screen: { flex: 1, backgroundColor: color.background },
  ambient: { position: "absolute", left: 0, right: 0, top: 0, height: 560 },
  screenBody: { flex: 1 },
  pageTitle: { fontSize: 46, lineHeight: 52, letterSpacing: -1.8 },
  planSummary: { padding: 18, gap: 12, borderRadius: 24, backgroundColor: color.card, borderWidth: StyleSheet.hairlineWidth, borderColor: color.border },
  searchHeader: { flexDirection: "row", flexWrap: "wrap", alignItems: "center", justifyContent: "space-between", gap: 12, marginBottom: 22 },
  guideRow: { flexDirection: "row", alignItems: "center", gap: 10 },
  visitNote: { flexDirection: "row", alignItems: "flex-start", gap: 10 },
  location: { flexDirection: "row", alignItems: "center", gap: 5 },
  welcome: { flexDirection: "row", alignItems: "center", gap: 15, borderRadius: 26, backgroundColor: color.card, borderWidth: StyleSheet.hairlineWidth, borderColor: color.border, padding: 22 },
  welcomeTitle: { color: color.text, fontSize: 30, lineHeight: 35, marginTop: 20, letterSpacing: -1 },
  welcomeText: { color: color.muted, marginTop: 12 },
  ideas: { marginTop: 28, gap: 12, minHeight: 270 },
  idea: { flexDirection: "row", alignItems: "center", gap: 12, paddingHorizontal: 13, paddingVertical: 10, minHeight: 64, borderRadius: 18, backgroundColor: color.panel, borderWidth: StyleSheet.hairlineWidth, borderColor: color.border },
  ideaIcon: { width: 40, height: 40, borderRadius: 13, alignItems: "center", justifyContent: "center", backgroundColor: color.tint },
  offTopic: { marginTop: 16 },
  dock: { paddingHorizontal: 18, paddingTop: 9, backgroundColor: color.background, borderTopWidth: StyleSheet.hairlineWidth, borderColor: color.border },
  chatDock: { minHeight: 56, flexDirection: "row", alignItems: "center", gap: 10, borderWidth: StyleSheet.hairlineWidth, borderColor: color.dockBorder, backgroundColor: color.dock, borderRadius: 27, paddingHorizontal: 13, paddingVertical: 5 },
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
  assistantMessage: { gap: 5, backgroundColor: color.card, borderRadius: 18, borderBottomLeftRadius: 6, padding: 14 },
  questionCard: { padding: 16, gap: 12, borderWidth: 1, borderColor: color.focusBorder, borderRadius: 22, backgroundColor: color.prompt },
  searchActions: { flexDirection: "row", flexWrap: "wrap", gap: 16, marginTop: 10 },
  results: { paddingHorizontal: 18, paddingTop: 18, paddingBottom: 16, gap: 12 },
  resultHeader: { gap: 18, paddingBottom: 12 },
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
  return useColorScheme() === "light" && !usesFixedDarkAppearance ? lightPresentation : darkPresentation;
}
