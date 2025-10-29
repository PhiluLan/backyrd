// mobile/app/login.tsx
import React, { useState } from "react";
import {
  Alert,
  View,
  Text,
  TextInput,
  Pressable,
  StyleSheet,
  KeyboardAvoidingView,
  ScrollView,
  TouchableWithoutFeedback,
  Keyboard,
  Platform,
} from "react-native";
import { useRouter, Link } from "expo-router";
import { Ionicons } from "@expo/vector-icons";
import { supabase } from "../lib/supabase";

export default function LoginScreen() {
  const router = useRouter();
  const [email, setEmail] = useState("");
  const [pw, setPw] = useState("");
  const [loading, setLoading] = useState(false);

  async function onLogin() {
    if (!email.trim() || !pw.trim()) {
      Alert.alert("Angaben fehlen", "Bitte E-Mail und Passwort eingeben.");
      return;
    }
    try {
      setLoading(true);
      const { error } = await supabase.auth.signInWithPassword({
        email,
        password: pw,
      });
      if (error) throw error;
      router.replace("/");
    } catch (e: any) {
      Alert.alert("Login fehlgeschlagen", e.message ?? String(e));
    } finally {
      setLoading(false);
    }
  }

  return (
    <KeyboardAvoidingView
      style={{ flex: 1 }}
      behavior={Platform.OS === "ios" ? "padding" : undefined}
    >
      <TouchableWithoutFeedback onPress={Keyboard.dismiss}>
        <View style={styles.container}>
          {/* Header */}
          <View style={styles.header}>
            <Pressable
              onPress={() => router.back()}
              hitSlop={10}
              style={styles.backBtn}
            >
              <Ionicons name="chevron-back" size={28} color="#fff" />
            </Pressable>
            <Text style={styles.headerTitle}>Login</Text>
          </View>

          <ScrollView
            contentContainerStyle={{ paddingBottom: 40 }}
            keyboardShouldPersistTaps="handled"
          >
            <View style={styles.formBox}>
              <TextInput
                placeholder="E-Mail"
                placeholderTextColor="#777"
                value={email}
                onChangeText={setEmail}
                keyboardType="email-address"
                autoCapitalize="none"
                style={styles.input}
              />
              <TextInput
                placeholder="Passwort"
                placeholderTextColor="#777"
                value={pw}
                onChangeText={setPw}
                secureTextEntry
                style={styles.input}
              />

              <Pressable
                onPress={onLogin}
                disabled={loading}
                style={({ pressed }) => [
                  styles.submitBtn,
                  pressed && { opacity: 0.8 },
                ]}
              >
                <Text style={styles.submitText}>
                  {loading ? "Logge ein…" : "Login"}
                </Text>
              </Pressable>

              <View style={styles.linkRow}>
                <Link href="/auth/register" asChild>
                  <Pressable>
                    <Text style={styles.linkText}>Neu registrieren</Text>
                  </Pressable>
                </Link>
                <Link href="/auth/verify" asChild>
                  <Pressable>
                    <Text style={styles.linkText}>Code eingeben</Text>
                  </Pressable>
                </Link>
              </View>
            </View>
          </ScrollView>
        </View>
      </TouchableWithoutFeedback>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: "#000",
  },
  header: {
    flexDirection: "row",
    alignItems: "center",
    paddingHorizontal: 16,
    paddingTop: Platform.select({ ios: 54, android: 24 }),
    paddingBottom: 16,
  },
  backBtn: {
    marginRight: 8,
    paddingVertical: 6,
    paddingHorizontal: 4,
  },
  headerTitle: {
    color: "#fff",
    fontSize: 22,
    fontWeight: "700",
  },
  formBox: {
    backgroundColor: "#F4E8E3",
    borderRadius: 20,
    padding: 20,
    marginHorizontal: 16,
    marginTop: 20,
  },
  input: {
    backgroundColor: "#fff",
    borderRadius: 12,
    paddingHorizontal: 12,
    paddingVertical: 10,
    color: "#000",
    marginBottom: 12,
  },
  submitBtn: {
    backgroundColor: "#000",
    paddingVertical: 14,
    borderRadius: 12,
    alignItems: "center",
    marginTop: 8,
  },
  submitText: {
    color: "#fff",
    fontSize: 16,
    fontWeight: "700",
  },
  linkRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    marginTop: 12,
  },
  linkText: {
    color: "#000",
    fontWeight: "600",
  },
});
