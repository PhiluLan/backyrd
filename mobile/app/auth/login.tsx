// mobile/app/auth/login.tsx

import React, { useEffect, useState } from "react";
import { Alert, Platform, Pressable, View } from "react-native";
import { AppText } from "../../components/foundation/AppText";
import { Link, useLocalSearchParams, useRouter } from "expo-router";
import * as AppleAuthentication from "expo-apple-authentication";
import * as Device from "expo-device";
import * as WebBrowser from "expo-web-browser";
import Constants from "expo-constants";
import * as Crypto from "expo-crypto";

import { supabase } from "../../lib/supabase";
import { ensureProfile } from "../../lib/profile";
import { signInWithGoogle } from "../../lib/googleSignIn";
import { AuthDivider, AuthField, AuthProviderButton, AuthScreen, AuthSubmit, authStyles } from "../../components/auth/AuthScreen";

WebBrowser.maybeCompleteAuthSession();

const isExpoGo = Constants.appOwnership === "expo";
const isSimulator = !Device.isDevice;

function cleanEmail(value: string) {
  return value.trim().toLowerCase();
}

function getAuthErrorMessage(error: any) {
  const message = error?.message ?? String(error);

  if (message.toLowerCase().includes("invalid login credentials")) {
    return "E-Mail oder Passwort ist nicht korrekt.";
  }

  if (message.toLowerCase().includes("email not confirmed")) {
    return "Bitte bestätige zuerst deine E-Mail-Adresse.";
  }

  if (message.toLowerCase().includes("unacceptable audience")) {
    return "Apple Login kann in Expo Go nicht korrekt getestet werden. Bitte nutze dafür einen Development Build oder eine echte App-Installation.";
  }

  return "Einloggen ist gerade nicht möglich. Bitte versuche es erneut.";
}

export default function LoginScreen() {
  const router = useRouter();
  const params = useLocalSearchParams<{ preview?: string }>();

  const [email, setEmail] = useState("");
  const [pw, setPw] = useState("");
  const [loading, setLoading] = useState(false);
  const [socialLoading, setSocialLoading] = useState(false);
  const [formError, setFormError] = useState<string | null>(null);

  useEffect(() => {
    if (__DEV__ && params.preview === "invalid") {
      setFormError("E-Mail oder Passwort ist nicht korrekt.");
    }
  }, [params.preview]);

  function goGate() {
    router.replace("/gate" as any);
  }

  async function onLogin() {
    const normalizedEmail = cleanEmail(email);
    const password = pw;

    if (!normalizedEmail || !password) {
      setFormError("Gib bitte E-Mail und Passwort ein.");
      return;
    }

    try {
      setLoading(true);

      const { error } = await supabase.auth.signInWithPassword({
        email: normalizedEmail,
        password,
      });

      if (error) throw error;

      await ensureProfile();
      goGate();
    } catch (e: any) {
      setFormError(getAuthErrorMessage(e));
    } finally {
      setLoading(false);
    }
  }

  async function onGoogleLogin() {
    try {
      setSocialLoading(true);

      if (!(await signInWithGoogle())) return;

      await ensureProfile();
      goGate();
    } catch (e: any) {
      Alert.alert("Google Login fehlgeschlagen", getAuthErrorMessage(e));
    } finally {
      setSocialLoading(false);
    }
  }

  async function onAppleLogin() {
    try {
      if (isSimulator) {
        Alert.alert("Nicht im Simulator", "Apple Login funktioniert nur auf einem echten Gerät.");
        return;
      }

      if (isExpoGo) {
        Alert.alert(
          "Expo Go",
          "Apple Login kann in Expo Go wegen der falschen Bundle-ID nicht sauber mit Supabase getestet werden. Nutze dafür einen Development Build."
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

      goGate();
    } catch (e: any) {
      if (e?.code === "ERR_CANCELED") return;
      Alert.alert("Apple Login fehlgeschlagen", getAuthErrorMessage(e));
    } finally {
      setSocialLoading(false);
    }
  }

  return (
    <AuthScreen eyebrow="BACKYRD · EINLOGGEN" title="Schön, dass du wieder da bist." description="Melde dich an und finde den nächsten Ort, der zu dir passt.">
      {formError ? <AppText accessibilityLiveRegion="polite" role="meta" style={authStyles.error}>{formError}</AppText> : null}
      <View style={authStyles.form}>
        <AuthField label="E-Mail" placeholder="deine@email.ch" value={email} onChangeText={(value) => { setEmail(value); setFormError(null); }} keyboardType="email-address" autoCapitalize="none" autoCorrect={false} textContentType="emailAddress" />
        <AuthField label="Passwort" placeholder="Dein Passwort" value={pw} onChangeText={(value) => { setPw(value); setFormError(null); }} secureTextEntry textContentType="password" returnKeyType="go" onSubmitEditing={() => void onLogin()} />
      </View>
      <AuthSubmit label="Einloggen" loading={loading} disabled={loading || socialLoading} onPress={() => void onLogin()} />
      <AuthDivider />
      <View style={authStyles.providerGroup}>
        {Platform.OS === "ios" ? <AuthProviderButton provider="apple" label="Mit Apple anmelden" disabled={loading || socialLoading} onPress={() => void onAppleLogin()} /> : null}
        {Platform.OS === "android" ? <AuthProviderButton provider="google" label="Mit Google anmelden" disabled={loading || socialLoading} onPress={() => void onGoogleLogin()} /> : null}
      </View>
      <View style={authStyles.footer}>
        <Link href="/auth/register" asChild><Pressable accessibilityRole="link" style={authStyles.footerLink}><AppText role="label" tone="pink">Noch kein Account? Registrieren</AppText></Pressable></Link>
        <Link href="/auth/forgot-password" asChild><Pressable accessibilityRole="link" style={authStyles.footerLink}><AppText role="label" tone="secondary">Passwort vergessen?</AppText></Pressable></Link>
        <Link href="/auth/verify" asChild><Pressable accessibilityRole="link" style={authStyles.footerLink}><AppText role="label" tone="secondary">E-Mail bestätigen</AppText></Pressable></Link>
      </View>
    </AuthScreen>
  );
}
