import React, { useEffect, useRef, useState } from "react";
import {
  View,
  Text,
  TextInput,
  Pressable,
  StyleSheet,
  ActivityIndicator,
  Alert,
  AccessibilityInfo,
  KeyboardAvoidingView,
  ScrollView,
  TouchableWithoutFeedback,
  Keyboard,
  Platform,
} from "react-native";
import * as Crypto from "expo-crypto";
import { useLocalSearchParams, useRouter } from "expo-router";
import { SafeAreaView, useSafeAreaInsets } from "react-native-safe-area-context";
import { supabase } from "../../lib/supabase";
import { getSafetyRestrictionMessage } from "../../lib/safety-enforcement";
import type { User } from "@supabase/supabase-js";
import { Ionicons } from "@expo/vector-icons";
import { BlurView } from "expo-blur";
import { LinearGradient } from "expo-linear-gradient";
import { awardAchievementsForUser } from "../../lib/achievementEngine";
import { AchievementUnlockModal } from "../../components/AchievementUnlockModal";
import { trackAnalyticsEvent, reportAnalyticsError } from "../../lib/analytics";
import { registerSafetySnapshot } from "../../lib/safety-content";
import { userFacingError } from "../../lib/userFacingError";
import { MoodExpressionInput } from "../../components/MoodExpressionInput";
import {
  ReviewMediaField,
  ReviewSubmissionStatus,
} from "../../components/reviews/ReviewMediaField";
import {
  discardReviewMediaAttempt,
  finalizeReviewWithMedia,
  finalizeReviewWithoutMedia,
  reviewMediaErrorContext,
  reviewMediaUserMessage,
  ReviewMediaError,
  type ReviewMediaAsset,
  type ReviewMediaProgress,
  uploadReservedReviewMedia,
} from "../../lib/review-media-upload";

const theme = {
  colors: {
    background: "#050506",
    surface: "#111113",
    surfaceElevated: "rgba(255,255,255,0.045)",
    border: "rgba(255,255,255,0.09)",
    text: "#FFFFFF",
    textMuted: "rgba(255,255,255,0.56)",
    textSoft: "rgba(255,255,255,0.72)",
    primary: "#FF4F91",
    accent: "#FFC5DA",
    ink: "#111113",
  },
  radius: { md: 12, lg: 16, xl: 24, pill: 999 },
  spacing: (n: number) => n * 8,
};

export default function NewReviewScreen() {
  const {
    spotId,
    decisionId,
    decisionRank,
    decisionQuery,
    inputMode,
    modelVersion,
    source,
  } = useLocalSearchParams<{
    spotId: string;
    decisionId?: string;
    decisionRank?: string;
    decisionQuery?: string;
    inputMode?: string;
    modelVersion?: string;
    source?: string;
  }>();

  const isDecisionReview = source === "decision" || Boolean(decisionId);

  const router = useRouter();
  const insets = useSafeAreaInsets();

  const [user, setUser] = useState<User | null>(null);
  const [moodA, setMoodA] = useState("");
  const [moodB, setMoodB] = useState("");
  const [text, setText] = useState("");
  const [photos, setPhotos] = useState<ReviewMediaAsset[]>([]);
  const pendingMediaReviewId = useRef<string | null>(null);
  const pendingUploadedPaths = useRef<string[]>([]);
  const submittingRef = useRef(false);
  const [uploading, setUploading] = useState(false);
  const [progress, setProgress] = useState<ReviewMediaProgress | null>(null);
  const [submitError, setSubmitError] = useState<string | null>(null);
  const [unlockedAchievements, setUnlockedAchievements] = useState<any[]>([]);

  useEffect(() => {
    supabase.auth.getUser().then(({ data }) => setUser(data.user));
  }, []);
  useEffect(() => {
    void trackAnalyticsEvent({ eventName: "review_started", screenName: "review_new", spotId, decisionId: decisionId ?? null, properties: { source: source ?? "spot" } });
  }, [decisionId, source, spotId]);

  async function changePhotos(next: ReviewMediaAsset[]) {
    if (pendingMediaReviewId.current) {
      try {
        setSubmitError(null);
        await discardReviewMediaAttempt({
          reviewId: pendingMediaReviewId.current,
          storagePaths: pendingUploadedPaths.current,
          onProgress: setProgress,
        });
      } catch (error) {
        const message = reviewMediaUserMessage(error) ?? "Das vorherige Bild konnte noch nicht sicher entfernt werden.";
        setSubmitError(message);
        setProgress(null);
        AccessibilityInfo.announceForAccessibility(message);
        return false;
      }
      pendingMediaReviewId.current = null;
      pendingUploadedPaths.current = [];
    }
    setSubmitError(null);
    setProgress(null);
    setPhotos(next);
    return true;
  }

  async function submitReview() {
    if (submittingRef.current) return;
    submittingRef.current = true;
    try {
      await submitReviewOnce();
    } finally {
      submittingRef.current = false;
    }
  }

  async function linkDecisionReview(reviewId: string) {
    const shouldLink = source === "decision" || Boolean(decisionId);
    if (!shouldLink) return;

    const { error } = await supabase.rpc("link_decision_review_v1", {
      p_review_id: reviewId,
      p_decision_id: decisionId || null,
      p_source_context: {
        source: "review_new",
        source_type: "decision_review",
        decision_id: decisionId || null,
        decision_rank: decisionRank ? Number(decisionRank) : null,
        decision_query: decisionQuery || null,
        input_mode: inputMode || null,
        model_version: modelVersion || null,
        linked_from_client: true,
      },
    });

    if (error) {
      // Intelligence layer must never block the user.
      console.log("link_decision_review_v1 failed", error);
    }
  }

  async function submitReviewOnce() {
    if (!spotId) {
      Alert.alert("Fehler", "Kein Spot ausgewählt");
      return;
    }

    if (!user?.id) {
      Alert.alert("Login benötigt", "Bitte melde dich an, um eine Review zu schreiben.");
      return;
    }

    try {
      setUploading(true);
      setSubmitError(null);
      setProgress({ stage: "auth", completed: 0, total: photos.length });

      const uploadedPhotoUrls: string[] = [];
      const reviewId = pendingMediaReviewId.current ?? Crypto.randomUUID();
      pendingMediaReviewId.current = reviewId;
      if (photos.length > 0) {
        const media = await uploadReservedReviewMedia({
          reviewId, spotId, smartReview: false, assets: photos, onProgress: setProgress,
        });
        pendingUploadedPaths.current = media.storagePaths;
        uploadedPhotoUrls.push(...media.publicUrls);
        await finalizeReviewWithMedia({
          reviewId, spotId, text: text.trim() || null,
          moodA: moodA.trim() || null, moodB: moodB.trim() || null,
          ...media, smartReview: false, onProgress: setProgress,
        });
      } else {
        await finalizeReviewWithoutMedia({
          reviewId, spotId, text: text.trim() || null,
          moodA: moodA.trim() || null, moodB: moodB.trim() || null,
          smartReview: false, onProgress: setProgress,
        });
      }

      await linkDecisionReview(reviewId);

      await registerSafetySnapshot({
        entityType: "review",
        entityId: reviewId,
        contentType: "review",
        actorUserId: user.id,
        spotId,
        textContent: [
          text.trim() || null,
          moodA.trim() || null,
          moodB.trim() || null,
        ].filter(Boolean).join("\n"),
        imageUrls: uploadedPhotoUrls,
        sourceSurface: "review_new",
        sourceContext: {
          source: source ?? "spot",
          decision_id: decisionId ?? null,
        },
      });

      pendingMediaReviewId.current = null;
      pendingUploadedPaths.current = [];
      setProgress(null);
      void trackAnalyticsEvent({ eventName: "review_submitted", screenName: "review_new", entityType: "review", entityId: reviewId, spotId, decisionId: decisionId ?? null, properties: { photo_count: photos.length, has_text: Boolean(text.trim()), source: source ?? "spot" } });

      const newlyUnlocked = await awardAchievementsForUser(user.id).catch((error) => {
        console.info("Achievement sync after review publish failed", error);
        return [];
      });

      if (newlyUnlocked.length > 0) {
        setUnlockedAchievements(newlyUnlocked);
      } else {
        Alert.alert(
          "Danke!",
          isDecisionReview
            ? "Deine Review wurde als Backyrd Treffer gespeichert."
            : "Deine Review wurde gespeichert."
        );
        router.back();
      }
    } catch (e: any) {
      const errorMessage = String(e?.message ?? e ?? "");
      const isOwnerSelfReview = errorMessage.includes("SAFETY_OWNER_SELF_REVIEW");
      const safetyMessage = getSafetyRestrictionMessage(e);
      const mediaError = reviewMediaErrorContext(e);

      if (isOwnerSelfReview) {
        void trackAnalyticsEvent({
          eventName: "review_blocked_owner_self_review",
          screenName: "review_new",
          spotId,
          decisionId: decisionId ?? null,
        });

        console.info("Owner self-review blocked by Review Integrity.");

        Alert.alert(
          "Eigenen Spot bewerten nicht möglich",
          "Als verifizierter Owner kannst du deinen eigenen Spot nicht bewerten. So bleiben Reviews und Empfehlungen auf Backyrd unabhängig.",
          [{ text: "Verstanden", onPress: () => router.back() }],
        );
      } else if (safetyMessage) {
        void trackAnalyticsEvent({
          eventName: "review_blocked_by_safety",
          screenName: "review_new",
          spotId,
          decisionId: decisionId ?? null,
        });

        console.info(
          "Review publishing blocked by Safety enforcement.",
        );

        Alert.alert(
          "Veröffentlichen eingeschränkt",
          safetyMessage,
          [
            {
              text: "OK",
              onPress: () => router.replace("/"),
            },
          ],
        );
      } else if (mediaError) {
        pendingUploadedPaths.current = e instanceof ReviewMediaError ? e.uploadedPaths : [];
        console.warn("[review-media] publish failed", {
          surface: "review_new",
          spot_id: spotId,
          ...mediaError,
        });
        void reportAnalyticsError({
          error: new Error(`${mediaError.stage}:${mediaError.code}`),
          screenName: "review_new",
          errorType: "review_media_submit_failed",
          context: { spot_id: spotId, ...mediaError },
        });
        const message = reviewMediaUserMessage(e) ?? "Bitte versuche es nochmals.";
        setSubmitError(message);
        setProgress(null);
        AccessibilityInfo.announceForAccessibility(message);
      } else {
        void reportAnalyticsError({
          error: e,
          screenName: "review_new",
          errorType: "review_submit_failed",
          context: {
            spot_id: spotId,
            decision_id: decisionId ?? null,
          },
        });

        void trackAnalyticsEvent({
          eventName: "review_failed",
          screenName: "review_new",
          spotId,
          decisionId: decisionId ?? null,
        });

        console.error("submitReview error:", e);

        Alert.alert(
          "Review nicht gespeichert",
          userFacingError(e, "Deine Review konnte gerade nicht gespeichert werden. Bitte versuche es noch einmal."),
        );
      }
    } finally {
      setUploading(false);
    }
  }

  return (
    <KeyboardAvoidingView
      style={{ flex: 1, backgroundColor: theme.colors.background }}
      behavior={Platform.OS === "ios" ? "padding" : undefined}
    >
      <TouchableWithoutFeedback onPress={Keyboard.dismiss}>
        <SafeAreaView style={{ flex: 1 }} edges={["top", "left", "right"]}>
          <View style={[styles.headerWrap, { paddingTop: insets.top + 4 }]}>
            <BlurView intensity={40} tint="dark" style={styles.header}>
              <Pressable
                accessibilityRole="button"
                accessibilityLabel="Review schließen"
                onPress={() => router.back()}
                hitSlop={10}
                style={styles.headerBtn}
              >
                <Ionicons name="chevron-back" size={24} color="#fff" />
              </Pressable>
              <Text style={styles.headerTitle}>{isDecisionReview ? "Backyrd Treffer bewerten" : "Neue Review"}</Text>
              <View style={styles.headerBtn} />
            </BlurView>
          </View>

          <ScrollView contentContainerStyle={styles.container}>
            <View style={styles.hero}>
              <Text style={styles.kicker}>DEINE REVIEW</Text>
              <Text style={styles.title}>Wie war es?</Text>
              <Text style={styles.subtitle}>
                Zwei Moods reichen. Ein kurzer Satz oder Bild kann deine Erfahrung ergänzen.
              </Text>
            </View>

            {isDecisionReview && (
              <View style={styles.decisionCard}>
                <Text style={styles.decisionKicker}>Gefunden mit Backyrd</Text>
                <Text style={styles.decisionTitle}>Halte fest, wie der Backyrd Treffer für dich war.</Text>
                {!!decisionQuery && (
                  <Text style={styles.decisionText} numberOfLines={2}>
                    “{decisionQuery}”
                  </Text>
                )}
              </View>
            )}

            <View style={styles.card}>
              <Text style={styles.cardTitle}>Moods</Text>
              <Text style={{ color: theme.colors.textSoft }}>Welche zwei Moods beschreiben diesen Ort am besten?</Text>
              <MoodExpressionInput label="Erster Mood (optional)" placeholder="z. B. gemütlich" value={moodA} onChangeText={setMoodA} />
              <MoodExpressionInput label="Zweiter Mood (optional)" placeholder="z. B. authentisch" value={moodB} onChangeText={setMoodB} />

              <Text style={styles.label}>Text</Text>
              <TextInput
                placeholder="Was sollte man über deine Erfahrung wissen?"
                placeholderTextColor={theme.colors.textMuted}
                value={text}
                onChangeText={setText}
                maxLength={100}
                style={[styles.input, { minHeight: 100 }]}
                multiline
              />
              <Text style={styles.counter}>{text.length}/100</Text>
            </View>

            <View style={styles.card}>
              <ReviewMediaField
                assets={photos}
                maxAssets={3}
                disabled={uploading}
                onChange={changePhotos}
                onError={setSubmitError}
              />
            </View>

            <ReviewSubmissionStatus
              progress={progress}
              error={submitError}
              onRetry={() => void submitReview()}
            />

            <BlurView intensity={30} tint="dark" style={styles.submitWrap}>
              <LinearGradient
                colors={[theme.colors.primary, theme.colors.primary]}
                style={styles.submitGradient}
              >
                <Pressable
                  accessibilityRole="button"
                  accessibilityLabel="Review veröffentlichen"
                  accessibilityState={{ disabled: uploading, busy: uploading }}
                  onPress={submitReview}
                  style={styles.submitBtn}
                  disabled={uploading}
                >
                  {uploading ? (
                    <ActivityIndicator color={theme.colors.ink} />
                  ) : (
                    <Text style={styles.submitText}>Review veröffentlichen</Text>
                  )}
                </Pressable>
              </LinearGradient>
            </BlurView>
          </ScrollView>

          {unlockedAchievements.length > 0 && (
            <AchievementUnlockModal
              achievements={unlockedAchievements}
              onClose={() => {
                setUnlockedAchievements([]);
                router.back();
              }}
            />
          )}
        </SafeAreaView>
      </TouchableWithoutFeedback>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  hero: {
    marginBottom: theme.spacing(3),
  },
  kicker: {
    color: "#FF4F91",
    fontSize: 12,
    fontWeight: "900",
    letterSpacing: 3.4,
    marginBottom: 14,
  },
  title: {
    color: theme.colors.text,
    fontSize: 42,
    lineHeight: 44,
    fontWeight: "900",
    letterSpacing: -1.1,
  },
  subtitle: {
    color: theme.colors.textMuted,
    fontSize: 16,
    lineHeight: 23,
    fontWeight: "600",
    marginTop: 10,
    maxWidth: 340,
  },
  decisionCard: {
    backgroundColor: "rgba(255,125,167,0.1)",
    borderWidth: 1,
    borderColor: "rgba(255,125,167,0.22)",
    borderRadius: theme.radius.xl,
    padding: theme.spacing(2),
    marginBottom: theme.spacing(2),
  },
  decisionKicker: {
    color: theme.colors.accent,
    fontSize: 12,
    fontWeight: "900",
    letterSpacing: 1.1,
    textTransform: "uppercase",
  },
  decisionTitle: {
    marginTop: 8,
    color: theme.colors.text,
    fontSize: 21,
    fontWeight: "900",
    lineHeight: 26,
  },
  decisionText: {
    marginTop: 8,
    color: theme.colors.textSoft,
    fontSize: 15,
    fontWeight: "600",
    lineHeight: 21,
  },
  headerWrap: {
    paddingHorizontal: theme.spacing(2),
  },
  header: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    backgroundColor: "rgba(5,5,6,0.64)",
    borderRadius: theme.radius.xl,
    paddingVertical: 10,
    paddingHorizontal: 12,
    borderWidth: 1,
    borderColor: theme.colors.border,
  },
  headerBtn: {
    width: 36,
    height: 36,
    borderRadius: theme.radius.pill,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: "rgba(255,255,255,0.06)",
  },
  headerTitle: { color: "#fff", fontSize: 18, fontWeight: "800" },

  container: {
    padding: theme.spacing(2),
    paddingBottom: theme.spacing(12),
  },
  card: {
    backgroundColor: theme.colors.surfaceElevated,
    borderRadius: theme.radius.xl,
    padding: theme.spacing(2),
    marginBottom: theme.spacing(2),
    borderWidth: 1,
    borderColor: theme.colors.border,
  },
  cardTitle: {
    color: theme.colors.text,
    fontSize: 22,
    lineHeight: 27,
    fontWeight: "800",
    letterSpacing: -0.45,
    marginBottom: 12,
  },
  cardHint: {
    color: theme.colors.textMuted,
    fontSize: 14,
    lineHeight: 20,
    fontWeight: "600",
    marginTop: -6,
    marginBottom: 12,
  },
  label: {
    color: theme.colors.textMuted,
    fontSize: 12,
    fontWeight: "800",
    letterSpacing: 0.2,
    marginBottom: 7,
    marginLeft: 2,
  },
  input: {
    borderWidth: 1,
    borderColor: theme.colors.border,
    borderRadius: 18,
    paddingHorizontal: 15,
    paddingVertical: 14,
    color: theme.colors.text,
    marginBottom: 12,
    backgroundColor: theme.colors.surface,
    fontSize: 15,
    fontWeight: "700",
  },
  counter: {
    alignSelf: "flex-end",
    fontSize: 12,
    color: theme.colors.textMuted,
    marginTop: -8,
  },

  photoContainer: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 8,
    marginTop: 8,
  },
  preview: {
    width: 100,
    height: 100,
    borderRadius: 18,
    backgroundColor: "#1f1f1f",
  },
  photoButtons: {
    flexDirection: "row",
    gap: 12,
    marginTop: 12,
  },
  photoBtnGradient: {
    flex: 1,
    borderRadius: 18,
    borderWidth: 1,
    borderColor: theme.colors.border,
  },
  photoBtn: {
    paddingVertical: 14,
    alignItems: "center",
    borderRadius: 18,
  },
  photoBtnText: { color: theme.colors.text, fontWeight: "800" },

  submitWrap: {
    borderRadius: theme.radius.pill,
    overflow: "hidden",
    marginTop: theme.spacing(3),
  },
  submitGradient: {
    borderRadius: theme.radius.pill,
  },
  submitBtn: {
    paddingVertical: 16,
    alignItems: "center",
  },
  submitText: { color: theme.colors.ink, fontWeight: "900", fontSize: 16, letterSpacing: 0.1 },
});
