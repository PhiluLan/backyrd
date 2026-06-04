import React, { useEffect, useMemo, useState } from "react";
import {
  View,
  Text,
  Pressable,
  StyleSheet,
  ActivityIndicator,
  Image,
  Alert,
  TextInput,
  ScrollView,
  KeyboardAvoidingView,
  Platform,
} from "react-native";
import * as ImagePicker from "expo-image-picker";
import * as Location from "expo-location";
import { useLocalSearchParams, useRouter } from "expo-router";
import { SafeAreaView } from "react-native-safe-area-context";
import { Ionicons } from "@expo/vector-icons";
import { supabase } from "../../lib/supabase";
import { reverseGeocode } from "../../lib/geocode";
import { awardAchievementsForUser } from "../../lib/achievementEngine";
import { AchievementUnlockModal } from "../../components/AchievementUnlockModal";

const theme = {
  colors: {
    background: "#0A0A0B",
    surface: "#131316",
    card: "#15151A",
    border: "#2A2A33",
    text: "#fff",
    textMuted: "#A6A8AD",
    primary: "#0EA5E9",
  },
  radius: { lg: 16, pill: 999 },
  spacing: (n: number) => n * 8,
};

type SpotRow = {
  id: string;
  name: string;
  address?: string | null;
  lat: number;
  lng: number;
  status: "approved" | "pending";
};

function haversineKm(lat1: number, lon1: number, lat2: number, lon2: number) {
  const R = 6371;
  const dLat = ((lat2 - lat1) * Math.PI) / 180;
  const dLon = ((lon2 - lon1) * Math.PI) / 180;
  const a =
    Math.sin(dLat / 2) ** 2 +
    Math.cos((lat1 * Math.PI) / 180) *
      Math.cos((lat2 * Math.PI) / 180) *
      Math.sin(dLon / 2) ** 2;
  return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
}

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

export default function SmartReviewScreen() {
  const router = useRouter();
  const {
    decisionId,
    decisionRank,
    decisionQuery,
    inputMode,
    modelVersion,
    source,
  } = useLocalSearchParams<{
    decisionId?: string;
    decisionRank?: string;
    decisionQuery?: string;
    inputMode?: string;
    modelVersion?: string;
    source?: string;
  }>();

  const isDecisionReview = source === "decision" || Boolean(decisionId);

  const [photoUri, setPhotoUri] = useState<string | null>(null);
  const [coords, setCoords] = useState<{ lat: number; lon: number } | null>(null);
  const [nearest, setNearest] = useState<SpotRow | null>(null);

  const [searching, setSearching] = useState(true);
  const [saving, setSaving] = useState(false);

  const [moodA, setMoodA] = useState("");
  const [moodB, setMoodB] = useState("");
  const [text, setText] = useState("");

  const [unlockedAchievements, setUnlockedAchievements] = useState<any[]>([]);

  const canSubmit =
    !!nearest &&
    !!photoUri &&
    moodA.trim().length > 0 &&
    moodB.trim().length > 0;

  useEffect(() => {
    (async () => {
      try {
        const cam = await ImagePicker.requestCameraPermissionsAsync();
        if (cam.status !== "granted") {
          Alert.alert("Kamera nötig", "Bitte erlaube den Kamerazugriff.");
          router.back();
          return;
        }

        const locPerm = await Location.requestForegroundPermissionsAsync();
        if (locPerm.status !== "granted") {
          Alert.alert("Standort nötig", "Bitte erlaube den Standortzugriff.");
          router.back();
          return;
        }

        const result = await ImagePicker.launchCameraAsync({
          mediaTypes: ImagePicker.MediaTypeOptions.Images,
          quality: 0.85,
          allowsEditing: true,
          aspect: [4, 3],
        });

        if (result.canceled || result.assets.length === 0) {
          router.back();
          return;
        }

        setPhotoUri(result.assets[0].uri);

        const position = await Location.getCurrentPositionAsync({});
        const lat = position.coords.latitude;
        const lon = position.coords.longitude;
        setCoords({ lat, lon });

        const { data: spots, error } = await supabase
          .from("spots")
          .select("id,name,address,lat,lng,status")
          .eq("status", "approved")
          .limit(300);

        if (error) throw error;

        let nearestSpot: SpotRow | null = null;
        let nearestDist = Number.POSITIVE_INFINITY;

        for (const s of spots || []) {
          const d = haversineKm(lat, lon, s.lat, s.lng);
          if (d < nearestDist) {
            nearestDist = d;
            nearestSpot = s as SpotRow;
          }
        }

        if (nearestSpot && nearestDist <= 0.12) {
          setNearest(nearestSpot);
        } else {
          setNearest(null);
        }
      } catch (e: any) {
        console.log("Smart review bootstrap error:", e?.message || e);
        Alert.alert("Fehler", e?.message || "Smart Review konnte nicht gestartet werden.");
      } finally {
        setSearching(false);
      }
    })();
  }, [router]);

  const headerTitle = useMemo(() => {
    if (searching) return "Spot wird erkannt…";
    if (nearest) return "Smart Review";
    return "Kein Spot gefunden";
  }, [searching, nearest]);

  async function getMoodId(token: string | null) {
    if (!token || token.trim() === "") return null;

    const clean = token.trim().toLowerCase();

    const { data, error } = await supabase
      .from("mood_tokens")
      .select("id")
      .eq("token", clean)
      .single();

    if (error && error.code !== "PGRST116") {
      throw error;
    }

    if (!data) {
      const { data: newMood, error: insertErr } = await supabase
        .from("mood_tokens")
        .insert({
          token: clean,
          locale: "de-CH",
          valid: true,
        })
        .select()
        .single();

      if (insertErr) throw insertErr;
      return newMood?.id ?? null;
    }

    return data.id;
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
        source: "review_smart",
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
      console.log("link_decision_review_v1 failed", error);
    }
  }

  async function submitSmartReview() {
    if (!nearest?.id) {
      Alert.alert("Kein Spot", "Es wurde kein passender Spot erkannt.");
      return;
    }

    if (!photoUri) {
      Alert.alert("Kein Foto", "Bitte zuerst ein Foto aufnehmen.");
      return;
    }

    const { data: userData } = await supabase.auth.getUser();
    const user = userData?.user;

    if (!user?.id) {
      Alert.alert("Login nötig", "Bitte logge dich ein, um eine Review zu schreiben.");
      router.push("/login");
      return;
    }

    try {
      setSaving(true);

      const moodAId = await getMoodId(moodA);
      const moodBId = await getMoodId(moodB);

      const { data: reviewData, error: reviewErr } = await supabase
        .from("reviews")
        .insert({
          spot_id: nearest.id,
          user_id: user.id,
          text: text.trim() || null,
          mood_a: moodA.trim() || null,
          mood_b: moodB.trim() || null,
          mood_a_id: moodAId,
          mood_b_id: moodBId,
        })
        .select()
        .single();

      if (reviewErr) throw reviewErr;
      const reviewId = reviewData.id as string;

      const photoUrl = await uploadReviewImage(photoUri, reviewId);

      const { error: photoErr } = await supabase.from("review_photos").insert({
        review_id: reviewId,
        url: photoUrl,
        uploaded_by: user.id,
      });

      if (photoErr) throw photoErr;

      await linkDecisionReview(reviewId);

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
        router.replace(`/spot/${nearest.id}`);
      }
    } catch (e: any) {
      console.log("submitSmartReview error:", e);
      Alert.alert("Fehler", e?.message || "Review konnte nicht gespeichert werden.");
    } finally {
      setSaving(false);
    }
  }

  async function onConfirmCreate() {
    if (!coords) return;

    try {
      const meta = await reverseGeocode(coords.lon, coords.lat);

      const q = new URLSearchParams();
      if (meta.name) q.set("name", meta.name);
      if (meta.address) q.set("address", meta.address);
      q.set("lat", String(coords.lat));
      q.set("lng", String(coords.lon));
      if (photoUri) q.set("photo", photoUri);
      if (moodA.trim()) q.set("moodA", moodA.trim());
      if (moodB.trim()) q.set("moodB", moodB.trim());
      if (text.trim()) q.set("text", text.trim());

      router.replace(`/spot/new?${q.toString()}`);
    } catch (e: any) {
      console.log("reverse geocode error:", e);
      Alert.alert("Fehler", e?.message || "Neuer Spot konnte nicht vorbereitet werden.");
    }
  }

  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: theme.colors.background }}>
      <KeyboardAvoidingView
        style={{ flex: 1 }}
        behavior={Platform.OS === "ios" ? "padding" : undefined}
      >
        <View style={styles.header}>
          <Pressable onPress={() => router.back()} hitSlop={10}>
            <Ionicons name="chevron-back" size={26} color="#fff" />
          </Pressable>
          <Text style={styles.headerTitle}>{headerTitle}</Text>
          <View style={{ width: 26 }} />
        </View>

        <ScrollView contentContainerStyle={styles.container}>
          {photoUri ? (
            <Image source={{ uri: photoUri }} style={styles.photo} />
          ) : (
            <View style={[styles.photo, styles.photoPlaceholder]}>
              <Text style={{ color: theme.colors.textMuted }}>Kein Foto</Text>
            </View>
          )}

          <View style={styles.card}>
            {searching ? (
              <View style={{ alignItems: "center" }}>
                <ActivityIndicator color={theme.colors.primary} />
                <Text style={styles.muted}>Suche Spots in deiner Nähe…</Text>
              </View>
            ) : nearest ? (
              <>
                <Text style={styles.title}>Spot erkannt</Text>
                <Text style={styles.spotName}>{nearest.name}</Text>
                {!!nearest.address && <Text style={styles.address}>{nearest.address}</Text>}

                <Text style={styles.label}>Mood A</Text>
                <TextInput
                  style={styles.input}
                  placeholder="z. B. gemütlich"
                  placeholderTextColor="#777"
                  value={moodA}
                  onChangeText={setMoodA}
                />

                <Text style={styles.label}>Mood B</Text>
                <TextInput
                  style={styles.input}
                  placeholder="z. B. lebhaft"
                  placeholderTextColor="#777"
                  value={moodB}
                  onChangeText={setMoodB}
                />

                <Text style={styles.label}>Optionaler Text</Text>
                <TextInput
                  style={[styles.input, { minHeight: 88, textAlignVertical: "top" }]}
                  placeholder="Wie war dein Erlebnis?"
                  placeholderTextColor="#777"
                  value={text}
                  onChangeText={setText}
                  multiline
                  maxLength={100}
                />

                <Pressable
                  onPress={submitSmartReview}
                  disabled={!canSubmit || saving}
                  style={[
                    styles.btn,
                    styles.btnPrimary,
                    (!canSubmit || saving) && { opacity: 0.6 },
                  ]}
                >
                  {saving ? (
                    <ActivityIndicator color="#000" />
                  ) : (
                    <Text style={styles.btnPrimaryText}>Review speichern</Text>
                  )}
                </Pressable>

                <Pressable onPress={onConfirmCreate} style={[styles.btn, styles.btnGhost]}>
                  <Text style={styles.btnGhostText}>Das ist nicht der richtige Spot</Text>
                </Pressable>
              </>
            ) : (
              <>
                <Text style={styles.title}>Kein Spot in der Nähe gefunden</Text>
                <Text style={styles.muted}>
                  Wir haben in ca. 120 m Umkreis nichts Passendes gefunden.
                </Text>

                <Text style={styles.label}>Mood A</Text>
                <TextInput
                  style={styles.input}
                  placeholder="z. B. gemütlich"
                  placeholderTextColor="#777"
                  value={moodA}
                  onChangeText={setMoodA}
                />

                <Text style={styles.label}>Mood B</Text>
                <TextInput
                  style={styles.input}
                  placeholder="z. B. lebhaft"
                  placeholderTextColor="#777"
                  value={moodB}
                  onChangeText={setMoodB}
                />

                <Pressable onPress={onConfirmCreate} style={[styles.btn, styles.btnPrimary]}>
                  <Text style={styles.btnPrimaryText}>Neuen Spot anlegen / einreichen</Text>
                </Pressable>
              </>
            )}
          </View>
        </ScrollView>

        {unlockedAchievements.length > 0 && (
          <AchievementUnlockModal
            achievements={unlockedAchievements}
            onClose={() => {
              setUnlockedAchievements([]);
              if (nearest?.id) {
                router.replace(`/spot/${nearest.id}`);
              } else {
                router.back();
              }
            }}
          />
        )}
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  header: {
    height: 56,
    paddingHorizontal: 16,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
  },
  headerTitle: {
    color: "#fff",
    fontSize: 18,
    fontWeight: "800",
  },
  container: {
    padding: 16,
    paddingBottom: 120,
    gap: 16,
  },
  photo: {
    width: "100%",
    height: 220,
    borderRadius: 14,
    backgroundColor: "#111",
  },
  photoPlaceholder: {
    borderWidth: 1,
    borderColor: theme.colors.border,
    alignItems: "center",
    justifyContent: "center",
  },
  card: {
    backgroundColor: theme.colors.card,
    borderRadius: 16,
    padding: 16,
    borderWidth: 1,
    borderColor: theme.colors.border,
  },
  title: {
    color: "#fff",
    fontSize: 16,
    fontWeight: "800",
    marginBottom: 6,
  },
  spotName: {
    color: "#fff",
    fontSize: 20,
    fontWeight: "900",
    marginBottom: 4,
  },
  address: {
    color: theme.colors.textMuted,
    marginBottom: 10,
  },
  muted: {
    color: theme.colors.textMuted,
    marginBottom: 12,
    lineHeight: 20,
  },
  label: {
    color: "#fff",
    fontWeight: "700",
    marginTop: 10,
    marginBottom: 6,
  },
  input: {
    borderWidth: 1,
    borderColor: "#333",
    borderRadius: 10,
    padding: 12,
    color: "#fff",
    backgroundColor: theme.colors.surface,
    marginBottom: 8,
  },
  btn: {
    paddingVertical: 14,
    borderRadius: theme.radius.pill,
    alignItems: "center",
    justifyContent: "center",
    marginTop: 14,
  },
  btnPrimary: {
    backgroundColor: theme.colors.primary,
  },
  btnPrimaryText: {
    color: "#000",
    fontWeight: "900",
    fontSize: 15,
  },
  btnGhost: {
    borderWidth: 1,
    borderColor: theme.colors.border,
  },
  btnGhostText: {
    color: "#fff",
    fontWeight: "800",
  },
});