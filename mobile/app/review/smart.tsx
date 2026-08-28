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
  Linking,
} from "react-native";
import * as ImagePicker from "expo-image-picker";
import { useLocalSearchParams, useRouter } from "expo-router";
import { SafeAreaView } from "react-native-safe-area-context";
import { Ionicons } from "@expo/vector-icons";
import { supabase } from "../../lib/supabase";
import {
  getPrivacySafeLocation,
  type PrivacyLocationFailureReason,
} from "../../lib/locationPrivacy";
import { safeDevelopmentWarning } from "../../lib/privacySanitize";
import { reverseGeocode } from "../../lib/geocode";
import { awardAchievementsForUser } from "../../lib/achievementEngine";
import { AchievementUnlockModal } from "../../components/AchievementUnlockModal";
import { trackAnalyticsEvent, reportAnalyticsError } from "../../lib/analytics";
import { registerSafetySnapshot } from "../../lib/safety-content";
import { getSafetyRestrictionMessage } from "../../lib/safety-enforcement";
import { userFacingError } from "../../lib/userFacingError";

const theme = {
  colors: {
    background: "#050506",
    surface: "#111113",
    card: "rgba(255,255,255,0.045)",
    border: "rgba(255,255,255,0.09)",
    text: "#fff",
    textMuted: "rgba(255,255,255,0.56)",
    textSoft: "rgba(255,255,255,0.72)",
    primary: "#FF4F91",
    pinkSoft: "#FFC5DA",
    ink: "#111113",
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

type SmartReviewGateFailure = {
  reason:
    | PrivacyLocationFailureReason
    | "login_required";
  title: string;
  body: string;
};

function smartReviewGateCopy(
  reason: SmartReviewGateFailure["reason"],
): SmartReviewGateFailure {
  switch (reason) {
    case "login_required":
      return {
        reason,
        title: "Login erforderlich",
        body:
          "Smart Reviews sind mit deinem Backyrd-Konto verbunden. Melde dich an, bevor du einen Moment vor Ort erstellst.",
      };

    case "consent_not_granted":
      return {
        reason,
        title: "Standort für Smart Review aktivieren",
        body:
          "Smart Review erkennt den Spot über deinen aktuellen Standort. Aktiviere dafür den präzisen Standort unter Datenschutz & Einwilligungen. Backyrd speichert keinen Standortverlauf.",
      };

    case "services_disabled":
      return {
        reason,
        title: "Ortungsdienste sind ausgeschaltet",
        body:
          "Aktiviere die Ortungsdienste auf deinem Gerät. Ohne aktuelle Position kann Backyrd keinen Smart Review erstellen.",
      };

    case "permission_denied":
      return {
        reason,
        title: "Standortzugriff nicht erlaubt",
        body:
          "Erlaube Backyrd den Standortzugriff in den Geräteeinstellungen. Die Berechtigung wird nur für aktive standortbezogene Funktionen verwendet.",
      };

    case "position_unavailable":
      return {
        reason,
        title: "Standort gerade nicht verfügbar",
        body:
          "Deine aktuelle Position konnte nicht zuverlässig bestimmt werden. Prüfe Empfang und Ortungsdienste und versuche es nochmals.",
      };

    case "web_unsupported":
      return {
        reason,
        title: "Smart Review nur in der App",
        body:
          "Die Standort- und Kamerafunktion für Smart Review ist in dieser Webansicht nicht verfügbar.",
      };

    default:
      return {
        reason,
        title: "Smart Review konnte nicht starten",
        body:
          "Der Standortcheck ist fehlgeschlagen. Bitte versuche es nochmals.",
      };
  }
}

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
  const [gateFailure, setGateFailure] =
    useState<SmartReviewGateFailure | null>(null);
  const [bootstrapNonce, setBootstrapNonce] = useState(0);
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
    void trackAnalyticsEvent({ eventName: "review_started", screenName: "review_smart", decisionId: decisionId ?? null, properties: { source: source ?? "smart" } });
  }, [decisionId, source]);

  useEffect(() => {
    let active = true;

    (async () => {
      setSearching(true);
      setGateFailure(null);
      setPhotoUri(null);
      setCoords(null);
      setNearest(null);

      try {
        const { data: userData } = await supabase.auth.getUser();

        if (!userData.user?.id) {
          if (active) {
            setGateFailure(smartReviewGateCopy("login_required"));
          }
          return;
        }

        const locationResult = await getPrivacySafeLocation({
          purpose: "smart_review_match",
          requestPermission: true,
          forceConsentRefresh: true,
          timeoutMs: 8_000,
          allowLastKnown: false,
        });

        if (!locationResult.ok) {
          if (active) {
            setGateFailure(smartReviewGateCopy(locationResult.reason));
          }

          void trackAnalyticsEvent({
            eventName: "smart_review_location_blocked",
            screenName: "review_smart",
            decisionId: decisionId ?? null,
            properties: {
              reason: locationResult.reason,
              source: source ?? "smart",
            },
          });
          return;
        }

        const cam = await ImagePicker.requestCameraPermissionsAsync();

        if (cam.status !== "granted") {
          Alert.alert(
            "Kamera erforderlich",
            "Smart Review benötigt ein aktuelles Foto. Erlaube Backyrd den Kamerazugriff in den Geräteeinstellungen.",
            [
              { text: "Zurück", style: "cancel", onPress: () => router.back() },
              {
                text: "Einstellungen öffnen",
                onPress: () => void Linking.openSettings(),
              },
            ],
          );
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

        if (!active) return;

        setPhotoUri(result.assets[0].uri);

        void trackAnalyticsEvent({
          eventName: "review_photo_added",
          screenName: "review_smart",
          decisionId: decisionId ?? null,
          properties: { source: "camera" },
        });

        const lat = locationResult.location.coords.latitude;
        const lon = locationResult.location.coords.longitude;
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

        if (!active) return;

        if (nearestSpot && nearestDist <= 0.12) {
          setNearest(nearestSpot);
        } else {
          setNearest(null);
        }
      } catch (e: any) {
        safeDevelopmentWarning("[smart-review] bootstrap failed", e);

        if (active) {
          setGateFailure(smartReviewGateCopy("unexpected_error"));
        }
      } finally {
        if (active) setSearching(false);
      }
    })();

    return () => {
      active = false;
    };
  }, [bootstrapNonce, decisionId, router, source]);

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
          // The database bridge only treats this explicit Smart Review origin plus
          // its user-owned photo as qualified Experience evidence.
          product_evidence_origin: "smart_review_v1",
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

      await registerSafetySnapshot({
        entityType: "review",
        entityId: reviewId,
        contentType: "review",
        actorUserId: user.id,
        spotId: nearest.id,
        textContent: [
          text.trim() || null,
          moodA.trim() || null,
          moodB.trim() || null,
        ].filter(Boolean).join("\n"),
        imageUrls: [photoUrl],
        sourceSurface: "review_smart",
        sourceContext: {
          source: source ?? "smart",
          decision_id: decisionId ?? null,
        },
      });

      await linkDecisionReview(reviewId);
      void trackAnalyticsEvent({ eventName: "review_submitted", screenName: "review_smart", entityType: "review", entityId: reviewId, spotId: nearest.id, decisionId: decisionId ?? null, properties: { photo_count: 1, has_text: Boolean(text.trim()), source: source ?? "smart" } });

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
      const errorMessage = String(e?.message ?? e ?? "");
      const isOwnerSelfReview = errorMessage.includes("SAFETY_OWNER_SELF_REVIEW");
      const safetyMessage = getSafetyRestrictionMessage(e);

      if (isOwnerSelfReview) {
        void trackAnalyticsEvent({
          eventName: "review_blocked_owner_self_review",
          screenName: "review_smart",
          spotId: nearest?.id ?? null,
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
          screenName: "review_smart",
          spotId: nearest?.id ?? null,
          decisionId: decisionId ?? null,
        });
        console.info("Smart Review publishing blocked by Safety enforcement.");
        Alert.alert(
          "Veröffentlichen eingeschränkt",
          safetyMessage,
          [{ text: "OK", onPress: () => router.replace("/") }],
        );
      } else {
        void reportAnalyticsError({
          error: e,
          screenName: "review_smart",
          errorType: "review_submit_failed",
          context: { spot_id: nearest?.id ?? null },
        });
        void trackAnalyticsEvent({
          eventName: "review_failed",
          screenName: "review_smart",
          spotId: nearest?.id ?? null,
          decisionId: decisionId ?? null,
        });
        console.error("submitSmartReview error:", e);
        Alert.alert("Review nicht gespeichert", userFacingError(e, "Deine Review konnte gerade nicht gespeichert werden. Bitte versuche es noch einmal."));
      }
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
      safeDevelopmentWarning("[smart-review] reverse geocode failed", e);
      Alert.alert("Spot nicht vorbereitet", userFacingError(e, "Der neue Spot konnte gerade nicht vorbereitet werden. Bitte versuche es noch einmal."));
    }
  }

  if (gateFailure) {
    const consentMissing = gateFailure.reason === "consent_not_granted";
    const loginRequired = gateFailure.reason === "login_required";
    const canOpenDeviceSettings =
      gateFailure.reason === "services_disabled" ||
      gateFailure.reason === "permission_denied";

    return (
      <SafeAreaView style={styles.gateSafe}>
        <View style={styles.header}>
          <Pressable onPress={() => router.back()} hitSlop={10}>
            <Ionicons name="chevron-back" size={26} color="#fff" />
          </Pressable>
          <Text style={styles.headerTitle}>Smart Review</Text>
          <View style={{ width: 26 }} />
        </View>

        <View style={styles.gateContent}>
          <View style={styles.gateIcon}>
            <Ionicons
              name={
                loginRequired
                  ? "person-outline"
                  : consentMissing
                    ? "location-outline"
                    : "navigate-outline"
              }
              size={34}
              color={theme.colors.primary}
            />
          </View>

          <Text style={styles.gateKicker}>SMART REVIEW</Text>
          <Text style={styles.gateTitle}>{gateFailure.title}</Text>
          <Text style={styles.gateBody}>{gateFailure.body}</Text>

          <View style={styles.gatePrivacyCard}>
            <Ionicons
              name="shield-checkmark-outline"
              size={21}
              color={theme.colors.pinkSoft}
            />
            <Text style={styles.gatePrivacyText}>
              Backyrd verwendet deinen Standort nur während der aktiven
              Spot-Erkennung. Es wird kein Standortverlauf gespeichert.
            </Text>
          </View>

          {consentMissing ? (
            <Pressable
              style={[styles.btn, styles.btnPrimary]}
              onPress={() => router.push("/privacy-consents" as any)}
            >
              <Text style={styles.btnPrimaryText}>
                Privacy Center öffnen
              </Text>
            </Pressable>
          ) : loginRequired ? (
            <Pressable
              style={[styles.btn, styles.btnPrimary]}
              onPress={() => router.push("/login" as any)}
            >
              <Text style={styles.btnPrimaryText}>Anmelden</Text>
            </Pressable>
          ) : canOpenDeviceSettings ? (
            <Pressable
              style={[styles.btn, styles.btnPrimary]}
              onPress={() => void Linking.openSettings()}
            >
              <Text style={styles.btnPrimaryText}>
                Geräteeinstellungen öffnen
              </Text>
            </Pressable>
          ) : null}

          {!loginRequired && !consentMissing ? (
            <Pressable
              style={[styles.btn, styles.btnGhost]}
              onPress={() => setBootstrapNonce((value) => value + 1)}
            >
              <Text style={styles.btnGhostText}>Erneut versuchen</Text>
            </Pressable>
          ) : null}

          <Pressable
            style={styles.gateBack}
            onPress={() => router.back()}
          >
            <Text style={styles.gateBackText}>
              Backyrd ohne Smart Review weiter nutzen
            </Text>
          </Pressable>
        </View>
      </SafeAreaView>
    );
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
          <View style={styles.hero}>
            <Text style={styles.kicker}>SMART REVIEW</Text>
            <Text style={styles.heroTitle}>Moment erkennen</Text>
            <Text style={styles.heroText}>Backyrd erkennt den Spot über dein aktuelles Foto und deinen Standort.</Text>
          </View>

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

                <Text style={styles.label}>Text</Text>
                <TextInput
                  style={[styles.input, { minHeight: 88, textAlignVertical: "top" }]}
                  placeholder="Was sollte man wissen?"
                  placeholderTextColor="rgba(255,255,255,0.34)"
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
                    <ActivityIndicator color={theme.colors.ink} />
                  ) : (
                    <Text style={styles.btnPrimaryText}>Moment speichern</Text>
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
  gateSafe: {
    flex: 1,
    backgroundColor: theme.colors.background,
  },
  gateContent: {
    flex: 1,
    paddingHorizontal: 24,
    paddingTop: 52,
    paddingBottom: 32,
  },
  gateIcon: {
    width: 68,
    height: 68,
    borderRadius: 24,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: "rgba(255,125,167,0.10)",
    borderWidth: 1,
    borderColor: "rgba(255,125,167,0.24)",
    marginBottom: 25,
  },
  gateKicker: {
    color: theme.colors.pinkSoft,
    fontSize: 12,
    fontWeight: "900",
    letterSpacing: 2.6,
    marginBottom: 12,
  },
  gateTitle: {
    color: theme.colors.text,
    fontSize: 34,
    lineHeight: 38,
    fontWeight: "900",
    letterSpacing: -0.8,
  },
  gateBody: {
    color: theme.colors.textSoft,
    fontSize: 16,
    lineHeight: 24,
    fontWeight: "600",
    marginTop: 14,
    marginBottom: 22,
  },
  gatePrivacyCard: {
    flexDirection: "row",
    alignItems: "flex-start",
    gap: 11,
    padding: 15,
    borderRadius: 18,
    backgroundColor: "rgba(255,255,255,0.045)",
    borderWidth: 1,
    borderColor: theme.colors.border,
    marginBottom: 22,
  },
  gatePrivacyText: {
    flex: 1,
    color: theme.colors.textMuted,
    fontSize: 13,
    lineHeight: 19,
    fontWeight: "600",
  },
  gateBack: {
    minHeight: 50,
    alignItems: "center",
    justifyContent: "center",
    marginTop: 6,
  },
  gateBackText: {
    color: theme.colors.textMuted,
    fontSize: 14,
    fontWeight: "700",
  },
  header: {
    minHeight: 58,
    paddingHorizontal: 20,
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
    paddingHorizontal: 20,
    paddingBottom: 120,
  },
  hero: {
    marginTop: 4,
    marginBottom: 20,
  },
  kicker: {
    color: theme.colors.pinkSoft,
    fontSize: 12,
    fontWeight: "900",
    letterSpacing: 3,
    marginBottom: 12,
  },
  heroTitle: {
    color: theme.colors.text,
    fontSize: 40,
    lineHeight: 42,
    fontWeight: "900",
    letterSpacing: -1,
  },
  heroText: {
    color: theme.colors.textMuted,
    fontSize: 15,
    lineHeight: 22,
    fontWeight: "600",
    marginTop: 10,
    maxWidth: 330,
  },
  photo: {
    width: "100%",
    height: 260,
    borderRadius: 28,
    backgroundColor: "#111",
    marginBottom: 16,
  },
  photoPlaceholder: {
    borderWidth: 1,
    borderColor: theme.colors.border,
    alignItems: "center",
    justifyContent: "center",
  },
  card: {
    backgroundColor: theme.colors.card,
    borderRadius: 28,
    padding: 16,
    borderWidth: 1,
    borderColor: theme.colors.border,
  },
  title: {
    color: "#fff",
    fontSize: 15,
    fontWeight: "800",
    marginBottom: 8,
  },
  spotName: {
    color: "#fff",
    fontSize: 26,
    lineHeight: 30,
    fontWeight: "900",
    marginBottom: 4,
    letterSpacing: -0.55,
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
    color: theme.colors.textMuted,
    fontSize: 12,
    fontWeight: "800",
    marginTop: 12,
    marginBottom: 7,
    marginLeft: 2,
  },
  input: {
    borderWidth: 1,
    borderColor: theme.colors.border,
    borderRadius: 18,
    paddingHorizontal: 15,
    paddingVertical: 14,
    color: "#fff",
    backgroundColor: theme.colors.surface,
    marginBottom: 8,
    fontSize: 15,
    fontWeight: "700",
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
    color: theme.colors.ink,
    fontWeight: "900",
    fontSize: 15,
  },
  btnGhost: {
    borderWidth: 1,
    borderColor: theme.colors.border,
  },
  btnGhostText: {
    color: theme.colors.text,
    fontWeight: "800",
  },
});
