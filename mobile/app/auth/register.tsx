// mobile/app/auth/register.tsx

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
import { Link, useRouter } from "expo-router";
import { Ionicons } from "@expo/vector-icons";
import * as AppleAuthentication from "expo-apple-authentication";
import * as AuthSession from "expo-auth-session";
import * as Device from "expo-device";
import * as WebBrowser from "expo-web-browser";
import Constants from "expo-constants";
import * as Crypto from "expo-crypto";

import { supabase } from "../../lib/supabase";
import { ensureProfile } from "../../lib/profile";

WebBrowser.maybeCompleteAuthSession();

const iosClientId = Constants.expoConfig?.extra?.googleIosClientId as string | undefined;
const androidClientId = Constants.expoConfig?.extra?.googleAndroidClientId as string | undefined;
const webClientId = Constants.expoConfig?.extra?.googleWebClientId as string | undefined;

const isExpoGo = Constants.appOwnership === "expo";
const isSimulator = !Device.isDevice;

function cleanEmail(value: string) {
  return value.trim().toLowerCase();
}

function getAuthErrorMessage(error: any) {
  const message = error?.message ?? String(error);

  if (message.toLowerCase().includes("user already registered")) {
    return "Für diese E-Mail existiert bereits ein Account. Bitte logge dich ein.";
  }

  if (message.toLowerCase().includes("password")) {
    return "Bitte verwende ein stärkeres Passwort.";
  }

  if (message.toLowerCase().includes("unacceptable audience")) {
    return "Apple Registrierung kann in Expo Go nicht korrekt getestet werden. Bitte nutze dafür einen Development Build.";
  }

  return "Registrieren ist gerade nicht möglich. Bitte versuche es erneut.";
}

export default function RegisterScreen() {
  const router = useRouter();

  const [first, setFirst] = useState("");
  const [last, setLast] = useState("");
  const [email, setEmail] = useState("");
  const [pw, setPw] = useState("");
  const [loading, setLoading] = useState(false);
  const [socialLoading, setSocialLoading] = useState(false);
  const [formError, setFormError] = useState<string | null>(null);

  async function onRegister() {
    const firstName = first.trim();
    const lastName = last.trim();
    const normalizedEmail = cleanEmail(email);
    const password = pw.trim();

    if (!firstName || !lastName || !normalizedEmail || !password) {
      setFormError("Fülle bitte alle Angaben aus.");
      return;
    }

    try {
      setLoading(true);

      const { data, error } = await supabase.auth.signUp({
        email: normalizedEmail,
        password,
        options: {
          data: {
            first_name: firstName,
            last_name: lastName,
            display_name: firstName,
          },
        },
      });

      if (error) throw error;

      // Supabase may return a session immediately when email confirmations are disabled.
      if (data.session?.user) {
        await ensureProfile({
          email: normalizedEmail,
          firstName,
          lastName,
        });

        router.replace("/gate" as any);
        return;
      }

      Alert.alert(
        "Fast geschafft",
        "Wir haben dir eine Bestätigungs-E-Mail geschickt. Bestätige deine E-Mail und logge dich danach ein.",
        [
          {
            text: "OK",
            onPress: () =>
              router.replace({
                pathname: "/auth/verify",
                params: { email: normalizedEmail },
              } as any),
          },
        ]
      );
    } catch (e: any) {
      setFormError(getAuthErrorMessage(e));
    } finally {
      setLoading(false);
    }
  }

  async function onGoogleRegister() {
    try {
      setSocialLoading(true);

      const redirectUri = AuthSession.makeRedirectUri({
        scheme: "backyrd",
        path: "auth/callback",
      });

      const clientId = Platform.select({
        ios: iosClientId,
        android: androidClientId,
        web: webClientId,
        default: webClientId,
      });

      if (!clientId || clientId.includes("YOUR_ANDROID_CLIENT_ID")) {
        Alert.alert("Google Registrierung", "Google Login ist für diese Plattform noch nicht vollständig konfiguriert.");
        return;
      }

      const authUrl =
        "https://accounts.google.com/o/oauth2/v2/auth?" +
        `client_id=${encodeURIComponent(clientId)}` +
        `&redirect_uri=${encodeURIComponent(redirectUri)}` +
        "&response_type=code" +
        "&scope=openid%20email%20profile" +
        "&access_type=offline" +
        "&prompt=select_account";

      const result = await WebBrowser.openAuthSessionAsync(authUrl, redirectUri);

      if (result.type !== "success" || !result.url) return;

      const parsed = new URL(result.url);
      const code = parsed.searchParams.get("code");

      if (!code) {
        throw new Error("Kein Google-Code erhalten.");
      }

      const { error } = await supabase.auth.exchangeCodeForSession(code);
      if (error) throw error;

      await ensureProfile();
      router.replace("/gate" as any);
    } catch (e: any) {
      Alert.alert("Google Registrierung fehlgeschlagen", getAuthErrorMessage(e));
    } finally {
      setSocialLoading(false);
    }
  }

  async function onAppleRegister() {
    try {
      if (isSimulator) {
        Alert.alert("Nicht im Simulator", "Apple Registrierung funktioniert nur auf einem echten Gerät.");
        return;
      }

      if (isExpoGo) {
        Alert.alert(
          "Expo Go",
          "Apple Registrierung kann in Expo Go wegen der falschen Bundle-ID nicht sauber mit Supabase getestet werden. Nutze dafür einen Development Build."
        );
        return;
      }

      setSocialLoading(true);

      const rawNonce = Crypto.randomUUID();
      const appleNonce = await Crypto.digestStringAsync(
        Crypto.CryptoDigestAlgorithm.SHA256,
        rawNonce
      );

      const response = await AppleAuthentication.signInAsync({
        nonce: appleNonce,
        requestedScopes: [
          AppleAuthentication.AppleAuthenticationScope.FULL_NAME,
          AppleAuthentication.AppleAuthenticationScope.EMAIL,
        ],
      });

      if (!response.identityToken) {
        throw new Error("Apple hat kein identityToken zurückgegeben.");
      }

      const { error } = await supabase.auth.signInWithIdToken({
        provider: "apple",
        token: response.identityToken,
        nonce: rawNonce,
      });

      if (error) throw error;

      await ensureProfile({
        email: response.email ?? null,
        firstName: response.fullName?.givenName ?? null,
        lastName: response.fullName?.familyName ?? null,
      });

      router.replace("/gate" as any);
    } catch (e: any) {
      if (e?.code === "ERR_CANCELED") return;
      Alert.alert("Apple Registrierung fehlgeschlagen", getAuthErrorMessage(e));
    } finally {
      setSocialLoading(false);
    }
  }

  return (
    <KeyboardAvoidingView style={{ flex: 1 }} behavior={Platform.OS === "ios" ? "padding" : undefined}>
      <TouchableWithoutFeedback onPress={Keyboard.dismiss}>
        <LinearGradient colors={["#050506", "#050506", "#111113"]} style={styles.container}>
          <View style={styles.header}>
            <Pressable onPress={() => router.replace("/gate" as any)} hitSlop={10} style={styles.backBtn}>
              <Ionicons name="chevron-back" size={32} color="#fff" />
            </Pressable>
            <Text allowFontScaling={false} style={styles.headerTitle}>Account erstellen</Text>
          </View>

          <ScrollView keyboardShouldPersistTaps="handled" contentContainerStyle={{ paddingBottom: 60 }}>
            <BlurView intensity={62} tint="dark" style={styles.card}>
              <Text allowFontScaling={false} style={styles.cardTitle}>Registrieren</Text>
              <Text maxFontSizeMultiplier={1.4} style={styles.cardSubtitle}>Dein Backyrd beginnt hier.</Text>
              {formError ? <Text accessibilityLiveRegion="polite" maxFontSizeMultiplier={1.3} style={styles.formError}>{formError}</Text> : null}

              <TextInput
                maxFontSizeMultiplier={1.3}
                placeholder="Vorname"
                placeholderTextColor="#7D8086"
                value={first}
                onChangeText={(value) => { setFirst(value); setFormError(null); }}
                autoCapitalize="words"
                textContentType="givenName"
                style={styles.input}
              />

              <TextInput
                maxFontSizeMultiplier={1.3}
                placeholder="Nachname"
                placeholderTextColor="#7D8086"
                value={last}
                onChangeText={(value) => { setLast(value); setFormError(null); }}
                autoCapitalize="words"
                textContentType="familyName"
                style={styles.input}
              />

              <TextInput
                maxFontSizeMultiplier={1.3}
                placeholder="E-Mail"
                placeholderTextColor="#7D8086"
                value={email}
                onChangeText={(value) => { setEmail(value); setFormError(null); }}
                keyboardType="email-address"
                autoCapitalize="none"
                autoCorrect={false}
                textContentType="emailAddress"
                style={styles.input}
              />

              <TextInput
                maxFontSizeMultiplier={1.3}
                placeholder="Passwort"
                placeholderTextColor="#7D8086"
                value={pw}
                onChangeText={(value) => { setPw(value); setFormError(null); }}
                secureTextEntry
                textContentType="newPassword"
                returnKeyType="go"
                onSubmitEditing={() => void onRegister()}
                style={styles.input}
              />

              <Pressable
                onPress={onRegister}
                disabled={loading || socialLoading}
                style={({ pressed }) => [
                  styles.primaryBtn,
                  (loading || socialLoading) && styles.disabled,
                  pressed && { opacity: 0.85 },
                ]}
              >
                {loading ? <ActivityIndicator /> : <Text maxFontSizeMultiplier={1.3} style={styles.primaryBtnText}>Registrieren</Text>}
              </Pressable>

              <View style={styles.dividerRow}>
                <View style={styles.divider} />
                <Text maxFontSizeMultiplier={1.3} style={styles.dividerLabel}>oder</Text>
                <View style={styles.divider} />
              </View>

              <Pressable
                onPress={onGoogleRegister}
                disabled={loading || socialLoading}
                style={({ pressed }) => [styles.googleBtn, pressed && { opacity: 0.9 }]}
              >
                <Ionicons name="logo-google" size={20} color="#111" />
                <Text maxFontSizeMultiplier={1.25} style={styles.googleText}>Mit Google registrieren</Text>
              </Pressable>

              {Platform.OS === "ios" && (
                <Pressable
                  onPress={onAppleRegister}
                  disabled={loading || socialLoading}
                  style={({ pressed }) => [styles.appleBtn, pressed && { opacity: 0.9 }]}
                >
                  <Ionicons name="logo-apple" size={24} color="#fff" />
                  <Text maxFontSizeMultiplier={1.25} style={styles.appleText}>Mit Apple registrieren</Text>
                </Pressable>
              )}

              <View style={styles.linkRow}>
                <Link href="/auth/login" asChild>
                  <Pressable>
                    <Text maxFontSizeMultiplier={1.4} style={styles.link}>Schon registriert?</Text>
                  </Pressable>
                </Link>

                <Link href="/auth/verify" asChild>
                  <Pressable>
                    <Text maxFontSizeMultiplier={1.4} style={styles.link}>E-Mail bestätigen</Text>
                  </Pressable>
                </Link>
              </View>
            </BlurView>
          </ScrollView>
        </LinearGradient>
      </TouchableWithoutFeedback>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
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
    fontSize: 30,
    fontWeight: "900",
    letterSpacing: 0.2,
    flexShrink: 1,
  },
  card: {
    marginTop: 24,
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
    fontWeight: "900",
    letterSpacing: -0.9,
    marginBottom: 10,
  },
  cardSubtitle: {
    color: "#A6A8AD",
    fontSize: 17,
    lineHeight: 25,
    marginBottom: 24,
  },
  formError: {
    marginBottom: 16,
    padding: 12,
    borderRadius: 14,
    color: "#FFD1DF",
    backgroundColor: "rgba(255,79,145,0.13)",
    borderWidth: 1,
    borderColor: "rgba(255,79,145,0.34)",
    fontSize: 14,
    lineHeight: 20,
    fontWeight: "700",
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
  disabled: {
    opacity: 0.58,
  },
  primaryBtnText: {
    color: "#fff",
    fontSize: 17,
    fontWeight: "900",
  },
  dividerRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
    marginVertical: 18,
  },
  divider: {
    flex: 1,
    height: 1,
    backgroundColor: "rgba(255,255,255,0.13)",
  },
  dividerLabel: {
    color: "#8E9198",
    fontSize: 13,
    fontWeight: "900",
  },
  appleBtn: {
    backgroundColor: "#000",
    paddingVertical: 16,
    borderRadius: 17,
    alignItems: "center",
    justifyContent: "center",
    flexDirection: "row",
    gap: 10,
    marginTop: 12,
  },
  appleText: {
    color: "#fff",
    fontWeight: "900",
    fontSize: 17,
  },
  googleBtn: {
    backgroundColor: "#fff",
    paddingVertical: 16,
    borderRadius: 17,
    alignItems: "center",
    justifyContent: "center",
    flexDirection: "row",
    gap: 10,
  },
  googleText: {
    color: "#111",
    fontWeight: "900",
    fontSize: 17,
  },
  linkRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    marginTop: 22,
  },
  link: {
    color: "#A6A8AD",
    fontSize: 15,
    fontWeight: "800",
  },
});
