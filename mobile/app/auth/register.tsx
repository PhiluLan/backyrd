// mobile/app/auth/register.tsx

import React, { useState } from "react";
import { Alert, Platform, Pressable, View } from "react-native";
import { AppText } from "../../components/foundation/AppText";
import { Link, useRouter } from "expo-router";
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
    const password = pw;

    if (!firstName || !lastName || !normalizedEmail || !password) {
      setFormError("Fülle bitte alle Angaben aus.");
      return;
    }
    if (password.length < 8) {
      setFormError("Das Passwort braucht mindestens 8 Zeichen.");
      return;
    }

    try {
      setLoading(true);

      const { data, error } = await supabase.auth.signUp({
        email: normalizedEmail,
        password,
        options: {
          emailRedirectTo: "backyrd://auth/callback",
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

      if (!(await signInWithGoogle())) return;

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
    <AuthScreen eyebrow="BACKYRD · ACCOUNT ERSTELLEN" title="Hier beginnt dein Backyrd." description="Ein Account, viele Möglichkeiten für deinen nächsten Moment.">
      {formError ? <AppText accessibilityLiveRegion="polite" role="meta" style={authStyles.error}>{formError}</AppText> : null}
      <View style={authStyles.form}>
        <AuthField label="Vorname" placeholder="Dein Vorname" value={first} onChangeText={(value) => { setFirst(value); setFormError(null); }} autoCapitalize="words" textContentType="givenName" />
        <AuthField label="Nachname" placeholder="Dein Nachname" value={last} onChangeText={(value) => { setLast(value); setFormError(null); }} autoCapitalize="words" textContentType="familyName" />
        <AuthField label="E-Mail" placeholder="deine@email.ch" value={email} onChangeText={(value) => { setEmail(value); setFormError(null); }} keyboardType="email-address" autoCapitalize="none" autoCorrect={false} textContentType="emailAddress" />
        <AuthField label="Passwort" placeholder="Mindestens 8 Zeichen" value={pw} onChangeText={(value) => { setPw(value); setFormError(null); }} secureTextEntry textContentType="newPassword" returnKeyType="go" onSubmitEditing={() => void onRegister()} />
      </View>
      <AuthSubmit label="Account erstellen" loading={loading} disabled={loading || socialLoading} onPress={() => void onRegister()} />
      <AuthDivider />
      <View style={authStyles.providerGroup}>
        {Platform.OS === "ios" ? <AuthProviderButton provider="apple" label="Mit Apple registrieren" disabled={loading || socialLoading} onPress={() => void onAppleRegister()} /> : null}
        <AuthProviderButton provider="google" label="Mit Google registrieren" disabled={loading || socialLoading} onPress={() => void onGoogleRegister()} />
      </View>
      <View style={authStyles.footer}>
        <Link href="/auth/login" asChild><Pressable accessibilityRole="link" style={authStyles.footerLink}><AppText role="label" tone="pink">Schon dabei? Einloggen</AppText></Pressable></Link>
        <Link href="/auth/verify" asChild><Pressable accessibilityRole="link" style={authStyles.footerLink}><AppText role="label" tone="secondary">E-Mail bestätigen</AppText></Pressable></Link>
      </View>
    </AuthScreen>
  );
}
