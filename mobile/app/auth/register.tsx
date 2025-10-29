// mobile/app/auth/register.tsx
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
import { useRouter } from "expo-router";
import { Ionicons } from "@expo/vector-icons";
import { supabase } from "../../lib/supabase";

export default function RegisterScreen() {
  const router = useRouter();
  const [first, setFirst] = useState("");
  const [last, setLast] = useState("");
  const [email, setEmail] = useState("");
  const [pw, setPw] = useState("");
  const [loading, setLoading] = useState(false);

  async function onRegister() {
    if (!first.trim() || !last.trim() || !email.trim() || !pw.trim()) {
      Alert.alert("Fehlende Angaben", "Bitte alle Felder ausfüllen.");
      return;
    }
    try {
      setLoading(true);
      const { error } = await supabase.auth.signUp({
        email,
        password: pw,
        options: {
          data: { first_name: first.trim(), last_name: last.trim() },
        },
      });
      if (error) throw error;

      Alert.alert(
        "Code gesendet",
        "Wir haben dir einen Bestätigungscode per E-Mail geschickt.",
        [
          {
            text: "OK",
            onPress: () =>
              router.push({ pathname: "/auth/verify", params: { email } }),
          },
        ]
      );
    } catch (e: any) {
      Alert.alert("Registrierung fehlgeschlagen", e.message ?? String(e));
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
            <Text style={styles.headerTitle}>Account erstellen</Text>
          </View>

          <ScrollView
            contentContainerStyle={{ paddingBottom: 40 }}
            keyboardShouldPersistTaps="handled"
          >
            <View style={styles.formBox}>
              <TextInput
                placeholder="Vorname"
                placeholderTextColor="#777"
                value={first}
                onChangeText={setFirst}
                style={styles.input}
              />
              <TextInput
                placeholder="Nachname"
                placeholderTextColor="#777"
                value={last}
                onChangeText={setLast}
                style={styles.input}
              />
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
                onPress={onRegister}
                disabled={loading}
                style={({ pressed }) => [
                  styles.submitBtn,
                  pressed && { opacity: 0.8 },
                ]}
              >
                <Text style={styles.submitText}>
                  {loading ? "Erstelle…" : "Registrieren"}
                </Text>
              </Pressable>
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
});
