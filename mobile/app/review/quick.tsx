import React, { useEffect, useRef, useState } from "react";
import {
  View,
  Text,
  StyleSheet,
  ActivityIndicator,
  Pressable,
  Alert,
  ScrollView,
  AccessibilityInfo,
} from "react-native";
import { useRouter, useLocalSearchParams } from "expo-router";
import { CameraView, useCameraPermissions } from "expo-camera";
import * as Crypto from "expo-crypto";
import { SafeAreaView } from "react-native-safe-area-context";
import { Image } from "expo-image";
import { Ionicons } from "@expo/vector-icons";
import { supabase } from "../../lib/supabase";
import { trackAnalyticsEvent, reportAnalyticsError } from "../../lib/analytics";
import { registerSafetySnapshot } from "../../lib/safety-content";
import { getSafetyRestrictionMessage } from "../../lib/safety-enforcement";
import { userFacingError } from "../../lib/userFacingError";
import { MoodExpressionInput } from "../../components/MoodExpressionInput";
import { ReviewSubmissionStatus } from "../../components/reviews/ReviewMediaField";
import {
  discardReviewMediaAttempt,
  finalizeReviewWithMedia,
  reviewMediaErrorContext,
  reviewMediaUserMessage,
  ReviewMediaError,
  type ReviewMediaAsset,
  type ReviewMediaProgress,
  uploadReservedReviewMedia,
} from "../../lib/review-media-upload";

const theme = {
  bg: "#050506",
  surface: "#111113",
  card: "rgba(255,255,255,0.045)",
  border: "rgba(255,255,255,0.09)",
  text: "#FFFFFF",
  muted: "rgba(255,255,255,0.56)",
  soft: "rgba(255,255,255,0.72)",
  pink: "#FF4F91",
  pinkSoft: "#FFC5DA",
  ink: "#111113",
};

/* ======================================================
   📸 Quick Review Screen
====================================================== */
export default function QuickReviewScreen() {
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
  const [photo, setPhoto] = useState<ReviewMediaAsset | null>(null);
  const photoUri = photo?.uri ?? null;
  const pendingMediaReviewId = useRef<string | null>(null);
  const pendingUploadedPaths = useRef<string[]>([]);
  const submittingRef = useRef(false);
  const [moodA, setMoodA] = useState("");
  const [moodB, setMoodB] = useState("");
  const [loading, setLoading] = useState(false);
  const [progress, setProgress] = useState<ReviewMediaProgress | null>(null);
  const [submitError, setSubmitError] = useState<string | null>(null);

  const [permission, requestPermission] = useCameraPermissions();
  const [cameraReady, setCameraReady] = useState(false);
  const [cameraRef, setCameraRef] = useState<CameraView | null>(null);
  const router = useRouter();

  useEffect(() => {
    if (!permission) requestPermission();
  }, [permission, requestPermission]);

  useEffect(() => {
    void trackAnalyticsEvent({ eventName: "review_started", screenName: "review_quick", spotId, decisionId: decisionId ?? null, properties: { source: source ?? "spot" } });
  }, [decisionId, source, spotId]);

  /* ======= Foto aufnehmen ======= */
  async function takePhoto() {
    if (!cameraRef) return;
    try {
      const photo = await cameraRef.takePictureAsync({ quality: 0.8 });
      setPhoto({ uri: photo.uri, fileName: "camera.jpg", mimeType: "image/jpeg" });
      setSubmitError(null);
      void trackAnalyticsEvent({ eventName: "review_photo_added", screenName: "review_quick", spotId, properties: { source: "camera" } });
    } catch (err) {
      Alert.alert("Fehler", "Kamera konnte kein Bild aufnehmen.");
      console.error(err);
    }
  }

  async function retakePhoto() {
    if (pendingMediaReviewId.current) {
      try {
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
        return;
      }
      pendingMediaReviewId.current = null;
      pendingUploadedPaths.current = [];
    }
    setPhoto(null);
    setProgress(null);
    setSubmitError(null);
  }

  /* ======= Hochladen & Review speichern ======= */
  async function submitReview() {
    if (submittingRef.current) return;
    submittingRef.current = true;
    try {
      await submitReviewOnce();
    } finally {
      submittingRef.current = false;
    }
  }

  async function submitReviewOnce() {
    if (!spotId) {
      Alert.alert("Fehler", "Spot-ID fehlt.");
      return;
    }

    const { data: userData } = await supabase.auth.getUser();
    const user = userData?.user;
    if (!user) {
      Alert.alert("Login erforderlich", "Bitte melde dich zuerst an.");
      return;
    }

    const { data: ownerSpot, error: ownerCheckError } = await supabase
      .from("spots")
      .select("owner_id")
      .eq("id", spotId)
      .maybeSingle();

    if (!ownerCheckError && ownerSpot?.owner_id === user.id) {
      void trackAnalyticsEvent({
        eventName: "review_blocked_owner_self_review",
        screenName: "review_quick",
        spotId,
        decisionId: decisionId ?? null,
      });

      Alert.alert(
        "Eigenen Spot bewerten nicht möglich",
        "Als verifizierter Owner kannst du deinen eigenen Spot nicht bewerten. So bleiben Reviews und Empfehlungen auf Backyrd unabhängig.",
        [{ text: "Verstanden", onPress: () => router.back() }],
      );
      return;
    }

    if (!photo) {
      Alert.alert("Fehler", "Bitte zuerst ein Foto aufnehmen.");
      return;
    }

    setLoading(true);
    setSubmitError(null);
    setProgress({ stage: "auth", completed: 0, total: 1 });
    try {
      const reviewId = pendingMediaReviewId.current ?? Crypto.randomUUID();
      pendingMediaReviewId.current = reviewId;
      const media = await uploadReservedReviewMedia({
        reviewId, spotId, smartReview: false, assets: [photo], onProgress: setProgress,
      });
      pendingUploadedPaths.current = media.storagePaths;
      await finalizeReviewWithMedia({
        reviewId, spotId, text: null, moodA: moodA || null,
        moodB: moodB || null, ...media, smartReview: false, onProgress: setProgress,
      });
      const publicUrl = media.publicUrls[0];
      const reviewData = { id: reviewId };

      if (reviewData?.id) {
        await registerSafetySnapshot({
          entityType: "review",
          entityId: reviewData.id,
          contentType: "review",
          actorUserId: user.id,
          spotId,
          textContent: [
            moodA || null,
            moodB || null,
          ].filter(Boolean).join("\n"),
          imageUrls: [publicUrl],
          sourceSurface: "review_quick",
          sourceContext: {
            source: source ?? "spot",
            decision_id: decisionId ?? null,
          },
        });
      }

      if (isDecisionReview && reviewData?.id) {
        const { error: linkError } = await supabase.rpc("link_decision_review_v1", {
          p_review_id: reviewData.id,
          p_decision_id: decisionId || null,
          p_source_context: {
            source: "review_quick",
            source_type: "decision_review",
            decision_id: decisionId || null,
            decision_rank: decisionRank ? Number(decisionRank) : null,
            decision_query: decisionQuery || null,
            input_mode: inputMode || null,
            model_version: modelVersion || null,
            linked_from_client: true,
          },
        });

        if (linkError) console.log("link_decision_review_v1 failed", linkError);
      }

      pendingMediaReviewId.current = null;
      pendingUploadedPaths.current = [];
      setProgress(null);
      void trackAnalyticsEvent({ eventName: "review_submitted", screenName: "review_quick", entityType: "review", entityId: reviewData.id, spotId, decisionId: decisionId ?? null, properties: { photo_count: 1, source: source ?? "spot" } });
      router.replace(`/spot/${spotId}`);
    } catch (e: any) {
      const errorMessage = String(e?.message ?? e ?? "");
      const isOwnerSelfReview = errorMessage.includes("SAFETY_OWNER_SELF_REVIEW");
      const safetyMessage = getSafetyRestrictionMessage(e);
      const mediaError = reviewMediaErrorContext(e);

      if (isOwnerSelfReview) {
        void trackAnalyticsEvent({
          eventName: "review_blocked_owner_self_review",
          screenName: "review_quick",
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
          screenName: "review_quick",
          spotId,
          decisionId: decisionId ?? null,
        });
        console.info("Quick Review publishing blocked by Safety enforcement.");
        Alert.alert(
          "Veröffentlichen eingeschränkt",
          safetyMessage,
          [{ text: "OK", onPress: () => router.replace("/") }],
        );
      } else if (mediaError) {
        pendingUploadedPaths.current = e instanceof ReviewMediaError ? e.uploadedPaths : [];
        console.warn("[review-media] publish failed", {
          surface: "review_quick",
          spot_id: spotId,
          ...mediaError,
        });
        void reportAnalyticsError({
          error: new Error(`${mediaError.stage}:${mediaError.code}`),
          screenName: "review_quick",
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
          screenName: "review_quick",
          errorType: "review_submit_failed",
          context: { spot_id: spotId },
        });
        void trackAnalyticsEvent({
          eventName: "review_failed",
          screenName: "review_quick",
          spotId,
          decisionId: decisionId ?? null,
        });
        console.error("submitQuickReview error:", e);
        Alert.alert("Review nicht gespeichert", userFacingError(e, "Deine Review konnte gerade nicht gespeichert werden. Bitte versuche es noch einmal."));
      }
    } finally {
      setLoading(false);
    }
  }

  /* ======= Kamera-Berechtigung ======= */
  if (!permission?.granted) {
    return (
      <SafeAreaView style={styles.center}>
        <Text style={styles.permissionTitle}>Kamera freigeben</Text>
        <Text style={styles.permissionBody}>Für eine schnelle Review mit Bild brauchen wir Zugriff auf deine Kamera.</Text>
        <Pressable
          accessibilityRole="button"
          accessibilityLabel="Kamerazugriff erlauben"
          style={styles.permissionBtn}
          onPress={() => requestPermission()}
        >
          <Text style={styles.permissionText}>Erlauben</Text>
        </Pressable>
      </SafeAreaView>
    );
  }

  /* ======= Kamera-Ansicht ======= */
  if (!photoUri) {
    return (
      <SafeAreaView style={styles.cameraContainer}>
        <CameraView
          style={{ flex: 1 }}
          facing="back"
          ref={setCameraRef}
          onCameraReady={() => setCameraReady(true)}
        />
        <View style={styles.cameraTop}>
          <Pressable accessibilityRole="button" accessibilityLabel="Kamera schließen" onPress={() => router.back()} style={styles.iconButton}>
            <Ionicons name="chevron-back" size={24} color={theme.text} />
          </Pressable>
          <View style={styles.cameraTitlePill}>
            <Text style={styles.cameraTitle}>Bild aufnehmen</Text>
          </View>
          <View style={styles.iconButtonPlaceholder} />
        </View>
        <View style={styles.cameraOverlay}>
          <Text style={styles.cameraHint}>Foto machen. Moods danach ergänzen.</Text>
          <Pressable
            accessibilityRole="button"
            accessibilityLabel="Foto aufnehmen"
            accessibilityState={{ disabled: !cameraReady }}
            onPress={takePhoto}
            style={[styles.captureBtn, { opacity: cameraReady ? 1 : 0.5 }]}
            disabled={!cameraReady}
          >
            <View style={styles.innerCircle} />
          </Pressable>
        </View>
      </SafeAreaView>
    );
  }

  /* ======= Foto + Review-Eingabe ======= */
  return (
    <SafeAreaView style={styles.container}>
      <ScrollView contentContainerStyle={styles.content}>
        <View style={styles.reviewHeader}>
          <Pressable accessibilityRole="button" accessibilityLabel="Review schließen" onPress={() => router.back()} style={styles.iconButton}>
            <Ionicons name="chevron-back" size={24} color={theme.text} />
          </Pressable>
          <Text style={styles.reviewHeaderTitle}>Schnelle Review</Text>
          <Pressable accessibilityRole="button" accessibilityLabel="Bild ersetzen" onPress={() => void retakePhoto()} style={styles.iconButton}>
            <Ionicons name="camera-outline" size={21} color={theme.text} />
          </Pressable>
        </View>

        <Image
          source={{ uri: photoUri }}
          style={styles.photoPreview}
          contentFit="cover"
        />

        {/* Mood Inputs */}
        <View style={styles.card}>
          <Text style={styles.cardTitle}>Moods</Text>
          <Text style={{ color: theme.soft }}>Welche zwei Moods beschreiben diesen Ort am besten?</Text>
          <MoodExpressionInput label="Erster Mood (optional)" placeholder="z. B. gemütlich" value={moodA} onChangeText={setMoodA} />
          <MoodExpressionInput label="Zweiter Mood (optional)" placeholder="z. B. lebhaft" value={moodB} onChangeText={setMoodB} />
        </View>

        <ReviewSubmissionStatus
          progress={progress}
          error={submitError}
          onRetry={() => void submitReview()}
        />

        <Pressable
          accessibilityRole="button"
          accessibilityLabel="Review veröffentlichen"
          accessibilityState={{ disabled: loading, busy: loading }}
          onPress={submitReview}
          style={[styles.submitBtn, loading && { opacity: 0.6 }]}
          disabled={loading}
        >
          {loading ? (
            <ActivityIndicator color={theme.ink} />
          ) : (
            <Text style={styles.submitText}>Review veröffentlichen</Text>
          )}
        </Pressable>
      </ScrollView>
    </SafeAreaView>
  );
}

/* ======================================================
   🎨 Styles
====================================================== */
const styles = StyleSheet.create({
  center: {
    flex: 1,
    justifyContent: "center",
    alignItems: "center",
    backgroundColor: theme.bg,
    paddingHorizontal: 28,
  },
  permissionTitle: {
    color: theme.text,
    fontSize: 30,
    lineHeight: 34,
    fontWeight: "900",
    letterSpacing: -0.8,
    marginBottom: 10,
    textAlign: "center",
  },
  permissionBody: {
    color: theme.muted,
    fontSize: 15,
    lineHeight: 22,
    fontWeight: "600",
    textAlign: "center",
    marginBottom: 20,
  },
  permissionBtn: {
    backgroundColor: theme.pink,
    paddingVertical: 13,
    paddingHorizontal: 24,
    borderRadius: 999,
  },
  permissionText: { color: theme.ink, fontWeight: "900" },
  cameraContainer: {
    flex: 1,
    backgroundColor: theme.bg,
    position: "relative",
  },
  cameraTop: {
    position: "absolute",
    top: 14,
    left: 18,
    right: 18,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
  },
  iconButton: {
    width: 44,
    height: 44,
    borderRadius: 22,
    backgroundColor: "rgba(5,5,6,0.68)",
    borderWidth: 1,
    borderColor: theme.border,
    alignItems: "center",
    justifyContent: "center",
  },
  iconButtonPlaceholder: {
    width: 44,
    height: 44,
  },
  cameraTitlePill: {
    minHeight: 38,
    paddingHorizontal: 15,
    borderRadius: 999,
    backgroundColor: "rgba(5,5,6,0.68)",
    borderWidth: 1,
    borderColor: theme.border,
    alignItems: "center",
    justifyContent: "center",
  },
  cameraTitle: {
    color: theme.text,
    fontSize: 14,
    fontWeight: "800",
  },
  cameraOverlay: {
    position: "absolute",
    bottom: 38,
    width: "100%",
    alignItems: "center",
  },
  cameraHint: {
    color: "rgba(255,255,255,0.82)",
    fontSize: 14,
    fontWeight: "700",
    marginBottom: 18,
    paddingHorizontal: 14,
    paddingVertical: 8,
    borderRadius: 999,
    backgroundColor: "rgba(5,5,6,0.58)",
    overflow: "hidden",
  },
  captureBtn: {
    width: 80,
    height: 80,
    borderRadius: 40,
    backgroundColor: "rgba(255,125,167,0.32)",
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.42)",
    justifyContent: "center",
    alignItems: "center",
  },
  innerCircle: {
    width: 60,
    height: 60,
    borderRadius: 30,
    backgroundColor: theme.pink,
  },
  container: { flex: 1, backgroundColor: theme.bg },
  content: {
    paddingHorizontal: 18,
    paddingBottom: 110,
  },
  reviewHeader: {
    minHeight: 58,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    marginBottom: 12,
  },
  reviewHeaderTitle: {
    color: theme.text,
    fontSize: 19,
    fontWeight: "800",
    letterSpacing: -0.3,
  },
  photoPreview: {
    width: "100%",
    height: 390,
    borderRadius: 28,
    marginBottom: 22,
    backgroundColor: theme.surface,
  },
  sectionTitle: {
    color: theme.text,
    fontSize: 22,
    lineHeight: 27,
    fontWeight: "800",
    letterSpacing: -0.45,
    marginBottom: 12,
  },
  filterRow: {
    flexDirection: "row",
    gap: 8,
    marginBottom: 18,
  },
  filterBtn: {
    flex: 1,
    borderRadius: 999,
    borderWidth: 1,
    borderColor: theme.border,
    backgroundColor: "rgba(255,255,255,0.055)",
    paddingVertical: 11,
    paddingHorizontal: 10,
    alignItems: "center",
  },
  filterBtnActive: {
    backgroundColor: theme.pink,
    borderColor: theme.pink,
  },
  filterText: {
    color: theme.soft,
    fontWeight: "800",
    fontSize: 12,
  },
  filterTextActive: {
    color: theme.ink,
  },
  card: {
    borderRadius: 28,
    padding: 16,
    backgroundColor: theme.card,
    borderWidth: 1,
    borderColor: theme.border,
  },
  cardTitle: {
    color: theme.text,
    fontSize: 22,
    lineHeight: 27,
    fontWeight: "800",
    letterSpacing: -0.45,
    marginBottom: 12,
  },
  label: {
    color: theme.muted,
    fontSize: 12,
    fontWeight: "800",
    letterSpacing: 0.2,
    marginBottom: 7,
    marginLeft: 2,
  },
  input: {
    borderWidth: 1,
    borderColor: theme.border,
    borderRadius: 18,
    paddingHorizontal: 15,
    paddingVertical: 14,
    color: theme.text,
    backgroundColor: theme.surface,
    fontSize: 15,
    fontWeight: "700",
    marginBottom: 12,
  },
  submitBtn: {
    marginTop: 24,
    backgroundColor: theme.pink,
    padding: 16,
    borderRadius: 999,
    alignItems: "center",
  },
  submitText: { color: theme.ink, fontWeight: "900", fontSize: 16 },
});
