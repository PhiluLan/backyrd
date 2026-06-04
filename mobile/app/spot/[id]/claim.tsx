// mobile/app/spot/[id]/claim.tsx

import React, { useEffect, useMemo, useState } from "react";
import {
  View,
  Text,
  TextInput,
  Pressable,
  ActivityIndicator,
  Alert,
  KeyboardAvoidingView,
  Platform,
  ScrollView,
  StyleSheet,
} from "react-native";
import { Stack, useLocalSearchParams, useRouter } from "expo-router";
import { Ionicons } from "@expo/vector-icons";
import { supabase } from "@/lib/supabase";

const FUNCTION_URL =
  "https://hjgcrrzfjchzqoegcywn.supabase.co/functions/v1/send-spot-claim-code";

const SUPABASE_ANON_KEY = process.env.EXPO_PUBLIC_SUPABASE_ANON_KEY ?? "";

type OwnerContext = {
  spot_id: string;
  spot_name: string;
  city: string | null;
  address: string | null;
  website: string | null;
  phone: string | null;
  email: string | null;
  claim_status: string | null;
  is_verified_owner: boolean;
};

type Step = "email" | "code" | "done";

function normalizeEmail(value: string) {
  return value.trim().toLowerCase();
}

function isValidEmail(value: string) {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value.trim());
}

function errorMessage(err: any) {
  const raw =
    err?.message ||
    err?.error_description ||
    err?.details ||
    err?.hint ||
    String(err ?? "");

  if (raw.includes("business_domain_does_not_match_spot_name")) {
    return "Diese E-Mail-Domain passt nicht eindeutig zum Namen des Spots. Verwende bitte eine offizielle Unternehmens-Mailadresse.";
  }

  if (raw.includes("public_email_domain_not_allowed")) {
    return "Private Maildomains wie Gmail, Yahoo oder iCloud sind für Betreiber-Claims nicht erlaubt.";
  }

  if (raw.includes("invalid_code")) {
    return "Der Code stimmt nicht. Bitte prüfe die Mail und versuche es erneut.";
  }

  if (raw.includes("verification_expired")) {
    return "Der Code ist abgelaufen. Bitte fordere einen neuen Code an.";
  }

  if (raw.includes("too_many_attempts")) {
    return "Zu viele Fehlversuche. Bitte fordere einen neuen Code an.";
  }

  if (raw.includes("verification_not_found")) {
    return "Für diese E-Mail wurde kein aktiver Code gefunden. Bitte fordere zuerst einen neuen Code an.";
  }

  if (raw.includes("not_authenticated")) {
    return "Bitte melde dich erneut an.";
  }

  return raw || "Etwas ist schiefgelaufen.";
}

export default function SpotClaimScreen() {
  const router = useRouter();
  const params = useLocalSearchParams<{ id?: string }>();

  const spotId = useMemo(() => {
    const raw = params?.id;
    return typeof raw === "string" && raw.length > 0 ? raw : null;
  }, [params?.id]);

  const [loading, setLoading] = useState(true);
  const [sending, setSending] = useState(false);
  const [verifying, setVerifying] = useState(false);

  const [ctx, setCtx] = useState<OwnerContext | null>(null);
  const [step, setStep] = useState<Step>("email");

  const [businessEmail, setBusinessEmail] = useState("");
  const [claimantName, setClaimantName] = useState("");
  const [claimantRole, setClaimantRole] = useState("");
  const [note, setNote] = useState("");
  const [code, setCode] = useState("");

  const [expiresAt, setExpiresAt] = useState<string | null>(null);

  useEffect(() => {
    let alive = true;

    async function load() {
      try {
        setLoading(true);

        if (!spotId) {
          Alert.alert("Fehler", "Spot-ID fehlt.");
          router.back();
          return;
        }

        const { data: sessionData } = await supabase.auth.getSession();
        const session = sessionData.session;

        if (!session?.user) {
          router.replace("/auth/login");
          return;
        }

        const { data, error } = await supabase.rpc("get_spot_owner_context_v1", {
          p_spot_id: spotId,
        });

        if (error) throw error;

        const row = Array.isArray(data) ? data[0] : data;
        if (!row) throw new Error("Spot nicht gefunden.");

        const normalized: OwnerContext = {
          spot_id: String(row.spot_id),
          spot_name: String(row.spot_name),
          city: row.city ? String(row.city) : null,
          address: row.address ? String(row.address) : null,
          website: row.website ? String(row.website) : null,
          phone: row.phone ? String(row.phone) : null,
          email: row.email ? String(row.email) : null,
          claim_status: row.claim_status ? String(row.claim_status) : null,
          is_verified_owner: row.is_verified_owner === true,
        };

        if (!alive) return;

        setCtx(normalized);

        if (normalized.is_verified_owner || normalized.claim_status === "approved") {
          setStep("done");
          return;
        }

        if (normalized.claim_status === "pending") {
          setStep("done");
          return;
        }

        const fullName =
          session.user.user_metadata?.first_name ||
          session.user.user_metadata?.name ||
          "";

        setClaimantName(String(fullName || ""));
      } catch (e: any) {
        Alert.alert("Fehler", errorMessage(e));
        router.back();
      } finally {
        if (alive) setLoading(false);
      }
    }

    load();

    return () => {
      alive = false;
    };
  }, [spotId, router]);

  async function sendCode() {
    try {
      if (!spotId || !ctx) return;

      const email = normalizeEmail(businessEmail);

      if (!isValidEmail(email)) {
        Alert.alert("E-Mail prüfen", "Bitte gib eine gültige Unternehmens-Mailadresse ein.");
        return;
      }

      if (!claimantName.trim()) {
        Alert.alert("Name fehlt", "Bitte gib deinen Namen ein.");
        return;
      }

      if (!claimantRole.trim()) {
        Alert.alert("Rolle fehlt", "Bitte gib deine Rolle im Betrieb ein.");
        return;
      }

      const { data: sessionData } = await supabase.auth.getSession();
      const token = sessionData.session?.access_token;

      if (!token) {
        router.replace("/auth/login");
        return;
      }

      setSending(true);

      const response = await fetch(FUNCTION_URL, {
        method: "POST",
        headers: {
          Authorization: `Bearer ${token}`,
          apikey: SUPABASE_ANON_KEY,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          spotId,
          businessEmail: email,
          claimantName: claimantName.trim(),
          claimantRole: claimantRole.trim(),
          note: note.trim() || null,
        }),
      });

      const payload = await response.json().catch(() => null);

      if (!response.ok || payload?.ok === false) {
        throw new Error(payload?.message || payload?.error || "Code konnte nicht gesendet werden.");
      }

      setBusinessEmail(email);
      setExpiresAt(payload?.expiresAt ?? null);
      setStep("code");

      Alert.alert(
        "Code gesendet",
        `Wir haben einen 6-stelligen Code an ${email} gesendet.`
      );
    } catch (e: any) {
      Alert.alert("Claim nicht möglich", errorMessage(e));
    } finally {
      setSending(false);
    }
  }

  async function verifyCode() {
    try {
      if (!spotId) return;

      const cleanedCode = code.trim();

      if (!/^[0-9]{6}$/.test(cleanedCode)) {
        Alert.alert("Code prüfen", "Bitte gib den 6-stelligen Code aus der Mail ein.");
        return;
      }

      setVerifying(true);

      const { data, error } = await supabase.rpc("verify_spot_claim_email_code_v1", {
        p_spot_id: spotId,
        p_business_email: normalizeEmail(businessEmail),
        p_code: cleanedCode,
      });

      if (error) throw error;

      const row = Array.isArray(data) ? data[0] : data;

      if (!row?.ok) {
        throw new Error("Code konnte nicht bestätigt werden.");
      }

      setStep("done");

      Alert.alert(
        "Anfrage eingereicht",
        "Deine E-Mail wurde bestätigt. Die Anfrage wird jetzt von backyrd geprüft.",
        [
          {
            text: "OK",
            onPress: () => router.back(),
          },
        ]
      );
    } catch (e: any) {
      Alert.alert("Code nicht bestätigt", errorMessage(e));
    } finally {
      setVerifying(false);
    }
  }

  if (loading) {
    return (
      <View style={styles.center}>
        <ActivityIndicator color="#fff" />
      </View>
    );
  }

  return (
    <View style={styles.screen}>
      <Stack.Screen options={{ headerShown: false }} />

      <KeyboardAvoidingView
        style={{ flex: 1 }}
        behavior={Platform.OS === "ios" ? "padding" : undefined}
      >
        <ScrollView contentContainerStyle={styles.content} keyboardShouldPersistTaps="handled">
          <View style={styles.header}>
            <Pressable onPress={() => router.back()} style={styles.iconButton} hitSlop={10}>
              <Ionicons name="chevron-back" size={22} color="#fff" />
            </Pressable>
            <Text style={styles.headerTitle}>Spot beanspruchen</Text>
            <View style={{ width: 42 }} />
          </View>

          <View style={styles.heroCard}>
            <View style={styles.badge}>
              <Ionicons name="shield-checkmark-outline" size={16} color="#D9F99D" />
              <Text style={styles.badgeText}>Betreiber-Verifizierung</Text>
            </View>

            <Text style={styles.title}>{ctx?.spot_name ?? "Spot"}</Text>

            <Text style={styles.subtitle}>
              Verwende eine offizielle Unternehmens-Mailadresse. Die Domain muss zum Spot
              passen. Danach prüfen wir deine Anfrage manuell.
            </Text>
          </View>

          {step === "done" ? (
            <View style={styles.card}>
              <Ionicons name="checkmark-circle" size={34} color="#22C55E" />
              <Text style={styles.cardTitle}>
                {ctx?.is_verified_owner || ctx?.claim_status === "approved"
                  ? "Du bist bereits verifiziert"
                  : "Anfrage in Prüfung"}
              </Text>
              <Text style={styles.cardText}>
                {ctx?.is_verified_owner || ctx?.claim_status === "approved"
                  ? "Du kannst diesen Spot bereits verwalten."
                  : "Deine Anfrage wurde eingereicht und wird von backyrd geprüft."}
              </Text>

              <Pressable
                onPress={() =>
                  ctx?.is_verified_owner || ctx?.claim_status === "approved"
                    ? router.replace(`/spot/${spotId}/manage`)
                    : router.back()
                }
                style={styles.primaryButton}
              >
                <Text style={styles.primaryButtonText}>
                  {ctx?.is_verified_owner || ctx?.claim_status === "approved"
                    ? "Spot verwalten"
                    : "Zurück zum Spot"}
                </Text>
              </Pressable>
            </View>
          ) : null}

          {step === "email" ? (
            <View style={styles.card}>
              <Text style={styles.cardTitle}>Offizielle Mailadresse</Text>
              <Text style={styles.cardText}>
                Beispiel: max@max-restaurant.ch oder hello@voltabraeu.ch.
                Private Adressen wie Gmail, Yahoo oder iCloud sind nicht erlaubt.
              </Text>

              <Text style={styles.label}>Unternehmens-Mail *</Text>
              <TextInput
                value={businessEmail}
                onChangeText={setBusinessEmail}
                autoCapitalize="none"
                autoCorrect={false}
                keyboardType="email-address"
                placeholder="name@unternehmen.ch"
                placeholderTextColor="rgba(255,255,255,0.35)"
                style={styles.input}
              />

              <Text style={styles.label}>Dein Name *</Text>
              <TextInput
                value={claimantName}
                onChangeText={setClaimantName}
                placeholder="z. B. Philipp Langer"
                placeholderTextColor="rgba(255,255,255,0.35)"
                style={styles.input}
              />

              <Text style={styles.label}>Rolle im Betrieb *</Text>
              <TextInput
                value={claimantRole}
                onChangeText={setClaimantRole}
                placeholder="z. B. Betreiber, Manager, Inhaber"
                placeholderTextColor="rgba(255,255,255,0.35)"
                style={styles.input}
              />

              <Text style={styles.label}>Notiz optional</Text>
              <TextInput
                value={note}
                onChangeText={setNote}
                multiline
                placeholder="Kurze Info für die Prüfung…"
                placeholderTextColor="rgba(255,255,255,0.35)"
                style={[styles.input, styles.textarea]}
              />

              <Pressable
                onPress={sendCode}
                disabled={sending}
                style={[styles.primaryButton, sending && styles.disabled]}
              >
                {sending ? (
                  <ActivityIndicator color="#000" />
                ) : (
                  <Text style={styles.primaryButtonText}>Code senden</Text>
                )}
              </Pressable>
            </View>
          ) : null}

          {step === "code" ? (
            <View style={styles.card}>
              <Text style={styles.cardTitle}>Code eingeben</Text>
              <Text style={styles.cardText}>
                Wir haben einen 6-stelligen Code an{" "}
                <Text style={{ color: "#fff", fontWeight: "800" }}>
                  {businessEmail}
                </Text>{" "}
                gesendet.
              </Text>

              {expiresAt ? (
                <Text style={styles.expiryText}>
                  Der Code ist nur kurze Zeit gültig.
                </Text>
              ) : null}

              <Text style={styles.label}>6-stelliger Code *</Text>
              <TextInput
                value={code}
                onChangeText={(v) => setCode(v.replace(/[^0-9]/g, "").slice(0, 6))}
                keyboardType="number-pad"
                placeholder="123456"
                placeholderTextColor="rgba(255,255,255,0.35)"
                maxLength={6}
                style={[styles.input, styles.codeInput]}
              />

              <Pressable
                onPress={verifyCode}
                disabled={verifying}
                style={[styles.primaryButton, verifying && styles.disabled]}
              >
                {verifying ? (
                  <ActivityIndicator color="#000" />
                ) : (
                  <Text style={styles.primaryButtonText}>Code bestätigen</Text>
                )}
              </Pressable>

              <Pressable onPress={sendCode} disabled={sending} style={styles.secondaryButton}>
                <Text style={styles.secondaryButtonText}>
                  {sending ? "Sende neuen Code…" : "Neuen Code senden"}
                </Text>
              </Pressable>

              <Pressable onPress={() => setStep("email")} style={styles.backLink}>
                <Text style={styles.backLinkText}>E-Mail ändern</Text>
              </Pressable>
            </View>
          ) : null}
        </ScrollView>
      </KeyboardAvoidingView>
    </View>
  );
}

const styles = StyleSheet.create({
  screen: {
    flex: 1,
    backgroundColor: "#0A0A0B",
  },
  center: {
    flex: 1,
    backgroundColor: "#0A0A0B",
    alignItems: "center",
    justifyContent: "center",
  },
  content: {
    padding: 18,
    paddingTop: 56,
    paddingBottom: 44,
  },
  header: {
    marginBottom: 20,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
  },
  iconButton: {
    width: 42,
    height: 42,
    borderRadius: 21,
    backgroundColor: "rgba(255,255,255,0.08)",
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.12)",
    alignItems: "center",
    justifyContent: "center",
  },
  headerTitle: {
    color: "#fff",
    fontSize: 16,
    fontWeight: "900",
  },
  heroCard: {
    borderRadius: 28,
    padding: 20,
    backgroundColor: "rgba(255,255,255,0.08)",
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.12)",
    marginBottom: 16,
  },
  badge: {
    alignSelf: "flex-start",
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    paddingHorizontal: 10,
    paddingVertical: 6,
    borderRadius: 999,
    backgroundColor: "rgba(132,204,22,0.12)",
    borderWidth: 1,
    borderColor: "rgba(217,249,157,0.18)",
    marginBottom: 14,
  },
  badgeText: {
    color: "#D9F99D",
    fontSize: 12,
    fontWeight: "900",
  },
  title: {
    color: "#fff",
    fontSize: 28,
    lineHeight: 32,
    fontWeight: "950",
    marginBottom: 10,
  },
  subtitle: {
    color: "rgba(255,255,255,0.68)",
    fontSize: 14,
    lineHeight: 20,
  },
  card: {
    borderRadius: 26,
    padding: 18,
    backgroundColor: "#1B1B21",
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.08)",
    marginTop: 12,
  },
  cardTitle: {
    color: "#fff",
    fontSize: 20,
    fontWeight: "900",
    marginTop: 8,
    marginBottom: 8,
  },
  cardText: {
    color: "rgba(255,255,255,0.68)",
    fontSize: 14,
    lineHeight: 20,
    marginBottom: 16,
  },
  expiryText: {
    color: "#FBBF24",
    fontSize: 13,
    fontWeight: "700",
    marginBottom: 12,
  },
  label: {
    color: "rgba(255,255,255,0.82)",
    fontSize: 13,
    fontWeight: "800",
    marginBottom: 8,
    marginTop: 10,
  },
  input: {
    minHeight: 52,
    borderRadius: 16,
    paddingHorizontal: 14,
    paddingVertical: 12,
    color: "#fff",
    backgroundColor: "rgba(255,255,255,0.08)",
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.12)",
    fontSize: 15,
    marginBottom: 8,
  },
  textarea: {
    minHeight: 96,
    textAlignVertical: "top",
  },
  codeInput: {
    textAlign: "center",
    fontSize: 28,
    letterSpacing: 8,
    fontWeight: "900",
  },
  primaryButton: {
    minHeight: 54,
    borderRadius: 999,
    backgroundColor: "#fff",
    alignItems: "center",
    justifyContent: "center",
    marginTop: 14,
  },
  primaryButtonText: {
    color: "#000",
    fontWeight: "950",
    fontSize: 15,
  },
  secondaryButton: {
    minHeight: 48,
    borderRadius: 999,
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.16)",
    alignItems: "center",
    justifyContent: "center",
    marginTop: 12,
  },
  secondaryButtonText: {
    color: "#fff",
    fontWeight: "850",
  },
  backLink: {
    alignItems: "center",
    marginTop: 16,
  },
  backLinkText: {
    color: "rgba(255,255,255,0.65)",
    fontWeight: "800",
    textDecorationLine: "underline",
  },
  disabled: {
    opacity: 0.55,
  },
});