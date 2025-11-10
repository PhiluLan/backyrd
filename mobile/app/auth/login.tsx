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
import { BlurView } from "expo-blur";
import { LinearGradient } from "expo-linear-gradient";
import { useRouter, Link } from "expo-router";
import { Ionicons } from "@expo/vector-icons";
import { supabase } from "../../lib/supabase";
import * as AppleAuthentication from "expo-apple-authentication";
import * as WebBrowser from "expo-web-browser";
import * as AuthSession from "expo-auth-session";
import * as Device from "expo-device";

WebBrowser.maybeCompleteAuthSession();

const iosClientId =
  "729608339021-dl4pqthrguti9o8sfat336kuae4s358q.apps.googleusercontent.com";
const androidClientId = "<YOUR_ANDROID_CLIENT_ID>";
const webClientId =
  "729608339021-u22np8gnlld09a248ovjtrj1n61q6kgt.apps.googleusercontent.com";

const isSimulator = !Device.isDevice;

export default function LoginScreen() {
  const router = useRouter();

  const [email, setEmail] = useState("");
  const [pw, setPw] = useState("");
  const [loading, setLoading] = useState(false);
  const [socialLoading, setSocialLoading] = useState(false);

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
      router.replace("/(tabs)");
    } catch (e: any) {
      Alert.alert("Login fehlgeschlagen", e.message ?? String(e));
    } finally {
      setLoading(false);
    }
  }

  async function onGoogleLogin() {
    try {
      setSocialLoading(true);

      const redirectUri = AuthSession.makeRedirectUri({
        scheme: "backyrd",
        path: "auth/callback",
      });

      const authUrl =
        `https://accounts.google.com/o/oauth2/v2/auth?` +
        `client_id=${
          Platform.select({
            ios: iosClientId,
            android: androidClientId,
            web: webClientId,
          })!
        }` +
        `&redirect_uri=${encodeURIComponent(redirectUri)}` +
        `&response_type=code&scope=openid%20email%20profile`;

      const result = await AuthSession.startAsync({ authUrl });

      if (result.type === "success" && result.params.code) {
        const { error } = await supabase.auth.exchangeCodeForSession(
          result.params.code
        );
        if (error) throw error;

        router.replace("/(tabs)");
      }
    } catch (e: any) {
      Alert.alert("Google Login fehlgeschlagen", e.message);
    } finally {
      setSocialLoading(false);
    }
  }

  async function onAppleLogin() {
    try {
      if (isSimulator) {
        Alert.alert(
          "Nicht im Simulator",
          "Apple Login funktioniert nur auf echtem Gerät."
        );
        return;
      }

      const response = await AppleAuthentication.signInAsync({
        requestedScopes: [
          AppleAuthentication.AppleAuthenticationScope.FULL_NAME,
          AppleAuthentication.AppleAuthenticationScope.EMAIL,
        ],
      });

      const { error } = await supabase.auth.signInWithIdToken({
        provider: "apple",
        token: response.identityToken!,
        nonce: response.nonce!,
      });
      if (error) throw error;

      router.replace("/(tabs)");
    } catch (e: any) {
      if (e.code === "ERR_CANCELED") return;
      Alert.alert("Apple Login fehlgeschlagen", e.message);
    }
  }

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
          {/* HEADER */}
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
            keyboardShouldPersistTaps="handled"
            contentContainerStyle={{ paddingBottom: 60 }}
          >
            {/* FORM CONTAINER (GLASS CARD) */}
            <BlurView intensity={60} tint="dark" style={styles.card}>
              <Text style={styles.cardTitle}>Willkommen zurück 👋</Text>
              <Text style={styles.cardSubtitle}>
                Melde dich an, um deine Backyrd-Journey fortzusetzen
              </Text>

              {/* INPUTS */}
              <TextInput
                placeholder="E-Mail"
                placeholderTextColor="#7D8086"
                value={email}
                onChangeText={setEmail}
                keyboardType="email-address"
                autoCapitalize="none"
                style={styles.input}
              />

              <TextInput
                placeholder="Passwort"
                placeholderTextColor="#7D8086"
                value={pw}
                onChangeText={setPw}
                secureTextEntry
                style={styles.input}
              />

              {/* LOGIN BUTTON */}
              <Pressable
                onPress={onLogin}
                disabled={loading}
                style={({ pressed }) => [
                  styles.primaryBtn,
                  pressed && { opacity: 0.85 },
                ]}
              >
                <Text style={styles.primaryBtnText}>
                  {loading ? "Logge ein…" : "Login"}
                </Text>
              </Pressable>

              {/* DIVIDER */}
              <View style={styles.dividerRow}>
                <View style={styles.divider} />
                <Text style={styles.dividerLabel}>oder</Text>
                <View style={styles.divider} />
              </View>

              {/* GOOGLE */}
              <Pressable
                onPress={onGoogleLogin}
                disabled={socialLoading}
                style={({ pressed }) => [
                  styles.googleBtn,
                  pressed && { opacity: 0.9 },
                ]}
              >
                <Ionicons name="logo-google" size={18} color="#111" />
                <Text style={styles.googleText}>Mit Google anmelden</Text>
              </Pressable>

              {/* APPLE */}
              {Platform.OS === "ios" && !isSimulator && (
                <View style={{ marginTop: 12 }}>
                  <AppleAuthentication.AppleAuthenticationButton
                    buttonType={
                      AppleAuthentication.AppleAuthenticationButtonType.SIGN_IN
                    }
                    buttonStyle={
                      AppleAuthentication.AppleAuthenticationButtonStyle.BLACK
                    }
                    cornerRadius={14}
                    style={{ width: "100%", height: 48 }}
                    onPress={onAppleLogin}
                  />
                </View>
              )}

              {/* LINKS */}
              <View style={styles.linkRow}>
                <Link href="/auth/register" asChild>
                  <Pressable>
                    <Text style={styles.link}>Neu registrieren</Text>
                  </Pressable>
                </Link>

                <Link href="/auth/verify" asChild>
                  <Pressable>
                    <Text style={styles.link}>Code eingeben</Text>
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

/* ======================================================
 ✅ STYLES IM BACKYRD DESIGN
====================================================== */
const styles = StyleSheet.create({
  container: {
    flex: 1,
    paddingHorizontal: 18,
  },

  header: {
    flexDirection: "row",
    alignItems: "center",
    paddingTop: Platform.select({ ios: 54, android: 32 }),
    paddingBottom: 16,
  },
  backBtn: { marginRight: 8 },
  headerTitle: {
    color: "#fff",
    fontSize: 22,
    fontWeight: "800",
    letterSpacing: 0.3,
  },

  /* Glass Card */
  card: {
    marginTop: 20,
    padding: 22,
    borderRadius: 26,
    backgroundColor: "rgba(255,255,255,0.06)",
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.08)",
    overflow: "hidden",
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

  /* Input */
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

  /* Primary Button */
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

  /* Divider */
  dividerRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
    marginVertical: 16,
  },
  divider: { flex: 1, height: 1, backgroundColor: "rgba(255,255,255,0.12)" },
  dividerLabel: { color: "#8E9198", fontSize: 12, fontWeight: "700" },

  /* Google */
  googleBtn: {
    backgroundColor: "#fff",
    paddingVertical: 14,
    borderRadius: 14,
    alignItems: "center",
    justifyContent: "center",
    flexDirection: "row",
    gap: 8,
  },
  googleText: { color: "#111", fontWeight: "700", fontSize: 15 },

  /* Links */
  linkRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    marginTop: 18,
  },
  link: {
    color: "#A6A8AD",
    fontSize: 14,
    fontWeight: "600",
  },
});
