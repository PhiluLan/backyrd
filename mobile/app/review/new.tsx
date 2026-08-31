import React, { useEffect, useState } from "react";
import {
  View,
  Text,
  TextInput,
  Pressable,
  Image,
  StyleSheet,
  ActivityIndicator,
  Alert,
  KeyboardAvoidingView,
  ScrollView,
  TouchableWithoutFeedback,
  Keyboard,
  Platform,
} from "react-native";
import * as ImagePicker from "expo-image-picker";
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

function getSafeImageExtension(uri: string) {
  const cleanUri = uri.split("?")[0].toLowerCase();

  if (cleanUri.endsWith(".png")) return "png";
  if (cleanUri.endsWith(".webp")) return "webp";
  if (cleanUri.endsWith(".jpg")) return "jpg";
  if (cleanUri.endsWith(".jpeg")) return "jpeg";
  if (cleanUri.endsWith(".heic")) return "jpg";
  if (cleanUri.endsWith(".heif")) return "jpg";

  return "jpg";
}

function getContentTypeFromExtension(ext: string) {
  switch (ext) {
    case "png":
      return "image/png";
    case "webp":
      return "image/webp";
    case "jpg":
    case "jpeg":
    default:
      return "image/jpeg";
  }
}

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
  const [photos, setPhotos] = useState<string[]>([]);
  const [uploading, setUploading] = useState(false);
  const [unlockedAchievements, setUnlockedAchievements] = useState<any[]>([]);

  useEffect(() => {
    supabase.auth.getUser().then(({ data }) => setUser(data.user));
  }, []);
  useEffect(() => {
    void trackAnalyticsEvent({ eventName: "review_started", screenName: "review_new", spotId, decisionId: decisionId ?? null, properties: { source: source ?? "spot" } });
  }, [decisionId, source, spotId]);

  async function pickImage(fromCamera: boolean) {
    try {
      const options: any = {
        mediaTypes: ImagePicker.MediaTypeOptions.Images,
        allowsEditing: true,
        aspect: [4, 3],
        quality: 0.85,
      };

      const result = fromCamera
        ? await ImagePicker.launchCameraAsync(options)
        : await ImagePicker.launchImageLibraryAsync(options);

      if (!result.canceled && result.assets?.length) {
        if (photos.length >= 3) {
          Alert.alert("Limit erreicht", "Du kannst maximal 3 Fotos hochladen.");
          return;
        }

        setPhotos((prev) => [...prev, result.assets[0].uri]);
        void trackAnalyticsEvent({ eventName: "review_photo_added", screenName: "review_new", spotId, properties: { source: fromCamera ? "camera" : "library" } });
      }
    } catch (e: any) {
      console.error("pickImage error:", e);
      Alert.alert("Bild nicht ausgewählt", userFacingError(e, "Das Bild konnte gerade nicht ausgewählt werden."));
    }
  }

  async function uploadReviewImage(uri: string, reviewId: string) {
    const ext = getSafeImageExtension(uri);
    const contentType = getContentTypeFromExtension(ext);

    const objectPath = `${reviewId}/${Date.now()}-${Math.random()
      .toString(36)
      .slice(2)}.${ext}`;

    const response = await fetch(uri);
    if (!response.ok) {
      throw new Error(`Bild konnte nicht gelesen werden (${response.status})`);
    }

    const arrayBuffer = await response.arrayBuffer();
    if (!arrayBuffer || arrayBuffer.byteLength === 0) {
      throw new Error("Bilddatei ist leer (0 Bytes).");
    }

    const { error: uploadError } = await supabase.storage
      .from("review-photos")
      .upload(objectPath, arrayBuffer, {
        contentType,
        upsert: false,
      });

    if (uploadError) throw uploadError;

    const { data } = supabase.storage.from("review-photos").getPublicUrl(objectPath);

    if (!data?.publicUrl) {
      throw new Error("Public URL für Bild konnte nicht erzeugt werden.");
    }


    return data.publicUrl;
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

  async function submitReview() {
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

      const { data: reviewData, error: reviewErr } = await supabase
        .from("reviews")
        .insert({
          spot_id: spotId,
          user_id: user.id,
          text: text.trim() || null,
          mood_a: moodA.trim() || null,
          mood_b: moodB.trim() || null,
          mood_a_id: null,
          mood_b_id: null,
        })
        .select()
        .single();

      if (reviewErr) throw reviewErr;
      const reviewId = reviewData.id as string;

      const uploadedPhotoUrls: string[] = [];

      for (const uri of photos) {
        const photoUrl = await uploadReviewImage(uri, reviewId);
        uploadedPhotoUrls.push(photoUrl);

        const { error: photoErr } = await supabase.from("review_photos").insert({
          review_id: reviewId,
          url: photoUrl,
          uploaded_by: user.id,
        });

        if (photoErr) throw photoErr;
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

      void trackAnalyticsEvent({ eventName: "review_submitted", screenName: "review_new", entityType: "review", entityId: reviewId, spotId, decisionId: decisionId ?? null, properties: { photo_count: photos.length, has_text: Boolean(text.trim()), source: source ?? "spot" } });

      const newlyUnlocked = await awardAchievementsForUser(user.id);

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
              <Pressable onPress={() => router.back()} hitSlop={10} style={styles.headerBtn}>
                <Ionicons name="chevron-back" size={24} color="#fff" />
              </Pressable>
              <Text style={styles.headerTitle}>{isDecisionReview ? "Backyrd Treffer bewerten" : "Neue Review"}</Text>
              <View style={styles.headerBtn} />
            </BlurView>
          </View>

          <ScrollView contentContainerStyle={styles.container}>
            <View style={styles.hero}>
              <Text style={styles.kicker}>BACKYRD MOMENT</Text>
              <Text style={styles.title}>Wie war es?</Text>
              <Text style={styles.subtitle}>
                Zwei Moods reichen. Ein kurzer Satz und Foto machen den Moment wertvoller.
              </Text>
            </View>

            {isDecisionReview && (
              <View style={styles.decisionCard}>
                <Text style={styles.decisionKicker}>Gefunden mit Backyrd</Text>
                <Text style={styles.decisionTitle}>Mach aus deiner Decision einen echten Moment.</Text>
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
                placeholder="Was sollte man über diesen Moment wissen?"
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
              <Text style={styles.cardTitle}>Fotos</Text>
              <Text style={styles.cardHint}>Optional, maximal 3 Bilder.</Text>
              <View style={styles.photoContainer}>
                {photos.map((uri, idx) => (
                  <Image key={idx} source={{ uri }} style={styles.preview} />
                ))}
              </View>

              <View style={styles.photoButtons}>
                <LinearGradient
                  colors={["rgba(255,255,255,0.065)", "rgba(255,255,255,0.04)"]}
                  style={styles.photoBtnGradient}
                >
                  <Pressable onPress={() => pickImage(false)} style={styles.photoBtn}>
                    <Text style={styles.photoBtnText}>Galerie</Text>
                  </Pressable>
                </LinearGradient>

                <LinearGradient
                  colors={["rgba(255,125,167,0.18)", "rgba(255,125,167,0.1)"]}
                  style={styles.photoBtnGradient}
                >
                  <Pressable onPress={() => pickImage(true)} style={styles.photoBtn}>
                    <Text style={styles.photoBtnText}>Kamera</Text>
                  </Pressable>
                </LinearGradient>
              </View>
            </View>

            <BlurView intensity={30} tint="dark" style={styles.submitWrap}>
              <LinearGradient
                colors={[theme.colors.primary, theme.colors.primary]}
                style={styles.submitGradient}
              >
                <Pressable onPress={submitReview} style={styles.submitBtn} disabled={uploading}>
                  {uploading ? (
                    <ActivityIndicator color={theme.colors.ink} />
                  ) : (
                    <Text style={styles.submitText}>Moment speichern</Text>
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
