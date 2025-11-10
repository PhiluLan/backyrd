// mobile/app/auth/verify.tsx
import React, { useState } from "react";
import {
  Alert,
  View,
  Text,
  TextInput,
  Pressable,
  StyleSheet,
  ScrollView,
  KeyboardAvoidingView,
  TouchableWithoutFeedback,
  Keyboard,
  Platform,
} from "react-native";
import { BlurView } from "expo-blur";
import { LinearGradient } from "expo-linear-gradient";
import { useLocalSearchParams, useRouter } from "expo-router";
import { Ionicons } from "@expo/vector-icons";
import { supabase } from "../../lib/supabase";

export default function Verify() {
  const router = useRouter();
  const { email: emailParam } = useLocalSearchParams<{ email?: string }>();

  const [email, setEmail] = useState(emailParam ?? "");
  const [code, setCode] = useState("");
  const [loading, setLoading] = useState(false);

  /* ======================================================
     ✅ CODE VERIFY
  ====================================================== */
  async function onVerify() {
    if (!email.trim() || !code.trim()) {
      Alert.alert("Angaben fehlen", "Bitte E-Mail und Code eingeben.");
      return;
    }
    try {
      setLoading(true);

      const { error } = await supabase.auth.verifyOtp({
        email,
        token: code.trim(),
        type: "signup",
      });

      if (error) throw error;

      Alert.alert("Erfolg", "Dein Account wurde bestätigt.", [
        { text: "OK", onPress: () => router.replace("/(tabs)") },
      ]);
    } catch (e: any) {
      Alert.alert("Verifizierung fehlgeschlagen", e.message);
    } finally {
      setLoading(false);
    }
  }

  /* ======================================================
     ✅ RESEND CODE
  ====================================================== */
  async function resendCode() {
    try {
      if (!email.trim()) {
        Alert.alert("E-Mail fehlt", "Bitte gib deine E-Mail ein.");
        return;
      }

      const { error } = await supabase.auth.signInWithOtp({ email });

      if (error) throw error;

      Alert.alert("Gesendet", "Wir haben dir erneut einen Code geschickt.");
    } catch (e: any) {
      Alert.alert("Fehler", e.message);
    }
  }

  /* ======================================================
     ✅ UI
  ====================================================== */
  return (
    <KeyboardAvoidingView
      style={{ flex: 1 }}
      behavior={Platform.OS === "ios" ? "padding" : undefined}
    >
      <TouchableWithoutFeedback onPress={Keyboard.dismiss}>
        <LinearGradient
          colors={["#0A0A0B", "#0A0A0B", "#191A22"]}
          style={styles.container}
        >
          {/* Header */}
          <View style={styles.header}>
            <Pressable onPress={() => router.back()} style={styles.backBtn}>
              <Ionicons name="chevron-back" size={28} color="#fff" />
            </Pressable>
            <Text style={styles.headerTitle}>E-Mail bestätigen</Text>
          </View>

          <ScrollView
            keyboardShouldPersistTaps="handled"
            contentContainerStyle={{ paddingBottom: 60 }}
          >
            <BlurView intensity={60} tint="dark" style={styles.card}>
              <Text style={styles.cardTitle}>Code eingeben</Text>
              <Text style={styles.cardSubtitle}>
                Gib den 6-stelligen Bestätigungscode ein, den wir dir gemailt
                haben.
              </Text>

              {/* Email */}
              <TextInput
                placeholder="E-Mail"
                placeholderTextColor="#7D8086"
                value={email}
                onChangeText={setEmail}
                keyboardType="email-address"
                autoCapitalize="none"
                style={styles.input}
              />

              {/* Code */}
              <TextInput
                placeholder="Bestätigungscode"
                placeholderTextColor="#7D8086"
                value={code}
                onChangeText={setCode}
                keyboardType="number-pad"
                style={styles.input}
              />

              {/* Verify Btn */}
              <Pressable
                onPress={onVerify}
                disabled={loading}
                style={({ pressed }) => [
                  styles.primaryBtn,
                  pressed && { opacity: 0.85 },
                ]}
              >
                <Text style={styles.primaryBtnText}>
                  {loading ? "Prüfe…" : "Code bestätigen"}
                </Text>
              </Pressable>

              {/* Resend */}
              <Pressable
                onPress={resendCode}
                style={({ pressed }) => [
                  styles.ghostBtn,
                  pressed && { opacity: 0.8 },
                ]}
              >
                <Text style={styles.ghostBtnText}>Code erneut senden</Text>
              </Pressable>
            </BlurView>
          </ScrollView>
        </LinearGradient>
      </TouchableWithoutFeedback>
    </KeyboardAvoidingView>
  );
}

/* ======================================================
 ✅ STYLES — BACKYRD DESIGN
====================================================== */
const styles = StyleSheet.create({
  container: {
    flex: 1,
    paddingHorizontal: 18,
  },

  /* Header */
  header: {
    flexDirection: "row",
    alignItems: "center",
    paddingTop: Platform.select({ ios: 54, android: 32 }),
    paddingBottom: 16,
  },
  backBtn: {
    marginRight: 12,
  },
  headerTitle: {
    color: "#fff",
    fontSize: 22,
    fontWeight: "800",
  },

  /* Card */
  card: {
    marginTop: 20,
    padding: 22,
    borderRadius: 26,
    backgroundColor: "rgba(255,255,255,0.06)",
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.08)",
  },
  cardTitle: {
    color: "#fff",
    fontSize: 26,
    fontWeight: "800",
    marginBottom: 6,
  },
  cardSubtitle: {
    color: "#A6A8AD",
    fontSize: 14,
    marginBottom: 18,
  },

  /* Inputs */
  input: {
    backgroundColor: "rgba(255,255,255,0.08)",
    borderColor: "rgba(255,255,255,0.14)",
    borderWidth: 1,
    paddingHorizontal: 14,
    paddingVertical: 12,
    borderRadius: 14,
    marginBottom: 12,
    color: "#fff",
    fontSize: 16,
  },

  /* Buttons */
  primaryBtn: {
    backgroundColor: "#000",
    paddingVertical: 14,
    borderRadius: 14,
    alignItems: "center",
    marginTop: 6,
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.15)",
  },
  primaryBtnText: {
    color: "#fff",
    fontSize: 16,
    fontWeight: "800",
  },

  ghostBtn: {
    marginTop: 14,
    paddingVertical: 12,
    alignItems: "center",
  },
  ghostBtnText: {
    color: "#A6A8AD",
    fontSize: 14,
    fontWeight: "600",
  },
});
