import React, { useEffect, useState } from "react";
import {
  View,
  Text,
  StyleSheet,
  ActivityIndicator,
  Pressable,
  TextInput,
  Alert,
  ScrollView,
} from "react-native";
import { useRouter, useLocalSearchParams } from "expo-router";
import { CameraView, useCameraPermissions } from "expo-camera";
import { SafeAreaView } from "react-native-safe-area-context";
import { Image } from "expo-image";
import * as ImageManipulator from "expo-image-manipulator";
import { Ionicons } from "@expo/vector-icons";
import { supabase } from "../../lib/supabase";
import { trackAnalyticsEvent, reportAnalyticsError } from "../../lib/analytics";

const theme = {
  bg: "#050506",
  surface: "#111113",
  card: "rgba(255,255,255,0.045)",
  border: "rgba(255,255,255,0.09)",
  text: "#FFFFFF",
  muted: "rgba(255,255,255,0.56)",
  soft: "rgba(255,255,255,0.72)",
  pink: "#FF7DA7",
  pinkSoft: "#FFD4E0",
  ink: "#171214",
};

/* ======================================================
   🔧 Helper: Filter anwenden
====================================================== */
async function applyFilter(
  uri: string,
  filter: "none" | "bw" | "dark"
): Promise<string> {
  if (filter === "none") return uri;

  const actions: ImageManipulator.Action[] = [];

  if (filter === "bw") {
    actions.push({ adjust: { saturation: 0 } }); // Entsättigen
  } else if (filter === "dark") {
    actions.push({ adjust: { brightness: -0.2, contrast: 1.1 } }); // dunkler & kontrastreicher
  }

  const result = await ImageManipulator.manipulateAsync(uri, actions, {
    compress: 0.9,
    format: ImageManipulator.SaveFormat.JPEG,
  });

  return result.uri;
}

/* ======================================================
   🔧 Helper: Sicherer Upload zu Supabase
====================================================== */
async function uploadImageToSupabase(uri: string, pathPrefix: string) {
  const ext = uri.split(".").pop()?.toLowerCase() || "jpg";
  const contentType =
    ext === "png"
      ? "image/png"
      : ext === "webp"
      ? "image/webp"
      : "image/jpeg";
  const fileName = `${pathPrefix}_${Date.now()}.${ext}`;

  const resp = await fetch(uri);
  const blob = await resp.blob();
  const file = new File([blob], fileName, { type: contentType });

  const { error: uploadErr } = await supabase.storage
    .from("spot-photos") // 👈 dein echter Bucket
    .upload(fileName, file, { contentType });

  if (uploadErr) throw uploadErr;

  const { data: publicUrlData } = supabase.storage
    .from("spot-photos")
    .getPublicUrl(fileName);

  return publicUrlData.publicUrl;
}

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
  const [photoUri, setPhotoUri] = useState<string | null>(null);
  const [filter, setFilter] = useState<"none" | "bw" | "dark">("none");
  const [moodA, setMoodA] = useState("");
  const [moodB, setMoodB] = useState("");
  const [loading, setLoading] = useState(false);

  const [permission, requestPermission] = useCameraPermissions();
  const [cameraReady, setCameraReady] = useState(false);
  const [cameraRef, setCameraRef] = useState<CameraView | null>(null);
  const router = useRouter();

  useEffect(() => {
    if (!permission) requestPermission();
  }, [permission]);

  useEffect(() => {
    void trackAnalyticsEvent({ eventName: "review_started", screenName: "review_quick", spotId, decisionId: decisionId ?? null, properties: { source: source ?? "spot" } });
  }, [decisionId, source, spotId]);

  /* ======= Foto aufnehmen ======= */
  async function takePhoto() {
    if (!cameraRef) return;
    try {
      const photo = await cameraRef.takePictureAsync({ quality: 0.8 });
      setPhotoUri(photo.uri);
      void trackAnalyticsEvent({ eventName: "review_photo_added", screenName: "review_quick", spotId, properties: { source: "camera" } });
    } catch (err) {
      Alert.alert("Fehler", "Kamera konnte kein Bild aufnehmen.");
      console.error(err);
    }
  }

  /* ======= Hochladen & Review speichern ======= */
  async function submitReview() {
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

    if (!photoUri) {
      Alert.alert("Fehler", "Bitte zuerst ein Foto aufnehmen.");
      return;
    }

    setLoading(true);
    try {
      const filteredUri = await applyFilter(photoUri, filter);
      const publicUrl = await uploadImageToSupabase(
        filteredUri,
        `review_${spotId}`
      );

      const { data: reviewData, error: insertError } = await supabase
        .from("reviews")
        .insert({
          spot_id: spotId,
          user_id: user.id,
          mood_a: moodA || null,
          mood_b: moodB || null,
          photo_path: publicUrl,
          text: null,
        })
        .select()
        .single();

      if (insertError) throw insertError;

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

      void trackAnalyticsEvent({ eventName: "review_submitted", screenName: "review_quick", entityType: "review", entityId: reviewData?.id ?? null, spotId, decisionId: decisionId ?? null, properties: { photo_count: 1, source: source ?? "spot" } });
      router.replace(`/spot/${spotId}`);
    } catch (e: any) {
      void reportAnalyticsError({ error: e, screenName: "review_quick", errorType: "review_submit_failed", context: { spot_id: spotId } });
      void trackAnalyticsEvent({ eventName: "review_failed", screenName: "review_quick", spotId, decisionId: decisionId ?? null });
      Alert.alert("Fehler", e.message ?? String(e));
    } finally {
      setLoading(false);
    }
  }

  /* ======= Kamera-Berechtigung ======= */
  if (!permission?.granted) {
    return (
      <SafeAreaView style={styles.center}>
        <Text style={styles.permissionTitle}>Kamera freigeben</Text>
        <Text style={styles.permissionBody}>Für einen schnellen Backyrd Moment brauchen wir kurz Zugriff auf deine Kamera.</Text>
        <Pressable
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
          <Pressable onPress={() => router.back()} style={styles.iconButton}>
            <Ionicons name="chevron-back" size={24} color={theme.text} />
          </Pressable>
          <View style={styles.cameraTitlePill}>
            <Text style={styles.cameraTitle}>Moment aufnehmen</Text>
          </View>
          <View style={styles.iconButtonPlaceholder} />
        </View>
        <View style={styles.cameraOverlay}>
          <Text style={styles.cameraHint}>Foto machen. Moods danach ergänzen.</Text>
          <Pressable
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
          <Pressable onPress={() => router.back()} style={styles.iconButton}>
            <Ionicons name="chevron-back" size={24} color={theme.text} />
          </Pressable>
          <Text style={styles.reviewHeaderTitle}>Neuer Moment</Text>
          <Pressable onPress={() => setPhotoUri(null)} style={styles.iconButton}>
            <Ionicons name="camera-outline" size={21} color={theme.text} />
          </Pressable>
        </View>

        <Image
          source={{ uri: photoUri }}
          style={styles.photoPreview}
          contentFit="cover"
        />

        {/* Filter Buttons */}
        <Text style={styles.sectionTitle}>Look</Text>
        <View style={styles.filterRow}>
          {["none", "bw", "dark"].map((f) => (
            <Pressable
              key={f}
              onPress={() => setFilter(f as "none" | "bw" | "dark")}
              style={[
                styles.filterBtn,
                filter === f && styles.filterBtnActive,
              ]}
            >
              <Text
                style={[styles.filterText, filter === f && styles.filterTextActive]}
              >
                {f === "none"
                  ? "Original"
                  : f === "bw"
                  ? "Schwarz-Weiß"
                  : "Dark-Ambiente"}
              </Text>
            </Pressable>
          ))}
        </View>

        {/* Mood Inputs */}
        <View style={styles.card}>
          <Text style={styles.cardTitle}>Moods</Text>
          <Text style={styles.label}>Erste Stimmung</Text>
          <TextInput
            style={styles.input}
            placeholder="z. B. gemütlich"
            placeholderTextColor="rgba(255,255,255,0.34)"
            value={moodA}
            onChangeText={setMoodA}
          />
          <Text style={styles.label}>Zweite Stimmung</Text>
          <TextInput
            style={styles.input}
            placeholder="z. B. lebhaft"
            placeholderTextColor="rgba(255,255,255,0.34)"
            value={moodB}
            onChangeText={setMoodB}
          />
        </View>

        <Pressable
          onPress={submitReview}
          style={[styles.submitBtn, loading && { opacity: 0.6 }]}
          disabled={loading}
        >
          {loading ? (
            <ActivityIndicator color={theme.ink} />
          ) : (
            <Text style={styles.submitText}>Moment speichern</Text>
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
