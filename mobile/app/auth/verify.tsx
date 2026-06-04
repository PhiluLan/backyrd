// mobile/app/auth/verify.tsx

import React, { useState } from "react";
import {
  ActivityIndicator,
  Alert,
  Keyboard,
  KeyboardAvoidingView,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  TouchableWithoutFeedback,
  View,
} from "react-native";
import { BlurView } from "expo-blur";
import { LinearGradient } from "expo-linear-gradient";
import { useLocalSearchParams, useRouter } from "expo-router";
import { Ionicons } from "@expo/vector-icons";

import { supabase } from "../../lib/supabase";
import { ensureProfile } from "../../lib/profile";

function cleanEmail(value: string) {
  return value.trim().toLowerCase();
}

export default function VerifyScreen() {
  const router = useRouter();
  const { email: emailParam } = useLocalSearchParams<{ email?: string }>();

  const [email, setEmail] = useState(cleanEmail(emailParam ?? ""));
  const [code, setCode] = useState("");
  const [loading, setLoading] = useState(false);
  const [resending, setResending] = useState(false);

  async function onVerify() {
    const normalizedEmail = cleanEmail(email);
    const token = code.trim();

    if (!normalizedEmail || !token) {
      Alert.alert("Angaben fehlen", "Bitte E-Mail und Code eingeben.");
      return;
    }

    try {
      setLoading(true);

      const { error } = await supabase.auth.verifyOtp({
        email: normalizedEmail,
        token,
        type: "signup",
      });

      if (error) throw error;

      await ensureProfile();

      Alert.alert("Bestätigt", "Dein Account wurde bestätigt. Wir richten jetzt dein Profil ein.", [
        { text: "OK", onPress: () => router.replace("/gate" as any) },
      ]);
    } catch (e: any) {
      Alert.alert("Verifizierung fehlgeschlagen", e?.message ?? String(e));
    } finally {
      setLoading(false);
    }
  }

  async function resendCode() {
    const normalizedEmail = cleanEmail(email);

    if (!normalizedEmail) {
      Alert.alert("E-Mail fehlt", "Bitte gib deine E-Mail ein.");
      return;
    }

    try {
      setResending(true);

      const { error } = await supabase.auth.resend({
        type: "signup",
        email: normalizedEmail,
      });

      if (error) throw error;

      Alert.alert("Gesendet", "Wir haben dir die Bestätigungs-E-Mail nochmals geschickt.");
    } catch (e: any) {
      Alert.alert("Senden fehlgeschlagen", e?.message ?? String(e));
    } finally {
      setResending(false);
    }
  }

  return (
    <KeyboardAvoidingView style={styles.keyboardRoot} behavior={Platform.OS === "ios" ? "padding" : undefined}>
      <TouchableWithoutFeedback onPress={Keyboard.dismiss}>
        <LinearGradient colors={["#050506", "#0A0A0B", "#191A22"]} style={styles.container}>
          <View style={styles.header}>
            <Pressable onPress={() => router.replace("/auth/login" as any)} hitSlop={10} style={styles.backBtn}>
              <Ionicons name="chevron-back" size={32} color="#fff" />
            </Pressable>
            <Text style={styles.headerTitle}>E-Mail bestätigen</Text>
          </View>

          <ScrollView keyboardShouldPersistTaps="handled" contentContainerStyle={{ paddingBottom: 60 }}>
            <BlurView intensity={62} tint="dark" style={styles.card}>
              <Text style={styles.cardTitle}>Bestätigungscode</Text>
              <Text style={styles.cardSubtitle}>
                Gib den Code aus deiner E-Mail ein. Falls du einen Bestätigungslink erhalten hast,
                kannst du auch einfach den Link öffnen und danach einloggen.
              </Text>

              <TextInput
                placeholder="E-Mail"
                placeholderTextColor="#7D8086"
                value={email}
                onChangeText={setEmail}
                keyboardType="email-address"
                autoCapitalize="none"
                autoCorrect={false}
                textContentType="emailAddress"
                style={styles.input}
              />

              <TextInput
                placeholder="Code"
                placeholderTextColor="#7D8086"
                value={code}
                onChangeText={setCode}
                keyboardType="number-pad"
                autoCapitalize="none"
                autoCorrect={false}
                style={styles.input}
              />

              <Pressable
                onPress={onVerify}
                disabled={loading || resending}
                style={({ pressed }) => [
                  styles.primaryBtn,
                  (loading || resending) && styles.disabled,
                  pressed && { opacity: 0.85 },
                ]}
              >
                {loading ? <ActivityIndicator /> : <Text style={styles.primaryBtnText}>Bestätigen</Text>}
              </Pressable>

              <Pressable
                onPress={resendCode}
                disabled={loading || resending}
                style={({ pressed }) => [
                  styles.secondaryBtn,
                  (loading || resending) && styles.disabled,
                  pressed && { opacity: 0.85 },
                ]}
              >
                <Text style={styles.secondaryBtnText}>
                  {resending ? "Sendet..." : "Code nochmals senden"}
                </Text>
              </Pressable>
            </BlurView>
          </ScrollView>
        </LinearGradient>
      </TouchableWithoutFeedback>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  keyboardRoot: {
    flex: 1,
    backgroundColor: "#050506",
  },
  container: {
    flex: 1,
    paddingHorizontal: 18,
  },
  header: {
    flexDirection: "row",
    alignItems: "center",
    paddingTop: Platform.select({ ios: 56, android: 34, default: 34 }),
    paddingBottom: 18,
  },
  backBtn: {
    width: 58,
    height: 58,
    borderRadius: 999,
    backgroundColor: "rgba(255,255,255,0.07)",
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.11)",
    alignItems: "center",
    justifyContent: "center",
    marginRight: 14,
  },
  headerTitle: {
    color: "#fff",
    fontSize: 29,
    fontWeight: "950",
    letterSpacing: 0.2,
    flexShrink: 1,
  },
  card: {
    marginTop: 92,
    padding: 24,
    borderRadius: 30,
    backgroundColor: "rgba(255,255,255,0.065)",
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.11)",
    overflow: "hidden",
  },
  cardTitle: {
    color: "#fff",
    fontSize: 38,
    lineHeight: 42,
    fontWeight: "950",
    letterSpacing: -0.9,
    marginBottom: 10,
  },
  cardSubtitle: {
    color: "#A6A8AD",
    fontSize: 17,
    lineHeight: 25,
    marginBottom: 24,
  },
  input: {
    backgroundColor: "rgba(255,255,255,0.08)",
    borderColor: "rgba(255,255,255,0.16)",
    borderWidth: 1,
    paddingHorizontal: 16,
    paddingVertical: 15,
    borderRadius: 17,
    marginBottom: 12,
    color: "#fff",
    fontSize: 17,
    fontWeight: "700",
  },
  primaryBtn: {
    backgroundColor: "#000",
    paddingVertical: 17,
    borderRadius: 17,
    alignItems: "center",
    marginTop: 8,
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.14)",
  },
  primaryBtnText: {
    color: "#fff",
    fontSize: 17,
    fontWeight: "950",
  },
  secondaryBtn: {
    backgroundColor: "rgba(255,255,255,0.08)",
    paddingVertical: 17,
    borderRadius: 17,
    alignItems: "center",
    marginTop: 12,
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.14)",
  },
  secondaryBtnText: {
    color: "#fff",
    fontSize: 16,
    fontWeight: "900",
  },
  disabled: {
    opacity: 0.58,
  },
});
