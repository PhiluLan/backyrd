import React, { useState } from "react";
import { Pressable, View } from "react-native";
import { useLocalSearchParams, useRouter } from "expo-router";

import { AppText } from "../../components/foundation/AppText";
import { AuthField, AuthScreen, AuthSubmit, authStyles } from "../../components/auth/AuthScreen";
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
  const [formError, setFormError] = useState<string | null>(null);
  const [resendStatus, setResendStatus] = useState(false);

  async function onVerify() {
    const normalizedEmail = cleanEmail(email);
    const token = code.trim();
    let verified = false;
    if (!normalizedEmail || !token) {
      setFormError("Gib bitte E-Mail und Bestätigungscode ein.");
      return;
    }

    try {
      setLoading(true);
      setFormError(null);
      const { data, error } = await supabase.auth.verifyOtp({ email: normalizedEmail, token, type: "signup" });
      if (error) throw error;
      if (!data.session) {
        setFormError("Die Bestätigung ist noch nicht abgeschlossen. Bitte melde dich erneut an.");
        return;
      }
      verified = true;
      await ensureProfile();
      router.replace("/gate" as never);
    } catch {
      setFormError(verified
        ? "Deine E-Mail ist bestätigt, aber dein Profil konnte noch nicht fertig eingerichtet werden. Bitte melde dich erneut an."
        : "Der Code konnte nicht bestätigt werden. Prüfe ihn und versuche es erneut.");
    } finally {
      setLoading(false);
    }
  }

  async function resendCode() {
    const normalizedEmail = cleanEmail(email);
    if (!normalizedEmail) {
      setFormError("Gib bitte zuerst deine E-Mail ein.");
      return;
    }

    try {
      setResending(true);
      setFormError(null);
      setResendStatus(false);
      const { error } = await supabase.auth.resend({
        type: "signup",
        email: normalizedEmail,
        options: { emailRedirectTo: "backyrd://auth/callback" },
      });
      if (error) throw error;
      setResendStatus(true);
    } catch {
      setFormError("Eine neue Bestätigung konnte gerade nicht angefordert werden. Versuch es später erneut.");
    } finally {
      setResending(false);
    }
  }

  return (
    <AuthScreen
      backTo="/auth/login"
      eyebrow="BACKYRD · E-MAIL BESTÄTIGEN"
      title="Nur noch ein Schritt."
      description="Gib den Code aus deiner E-Mail ein. Hast du einen Bestätigungslink erhalten, kannst du auch diesen öffnen."
    >
      {formError ? <AppText accessibilityLiveRegion="polite" role="meta" style={authStyles.error}>{formError}</AppText> : null}
      {resendStatus ? (
        <View accessibilityLiveRegion="polite" style={authStyles.notice}>
          <AppText role="label" tone="pink">ANFRAGE ERHALTEN</AppText>
          <AppText role="body">Falls für diese Adresse eine Bestätigung offen ist, wurde eine weitere E-Mail angefordert. Prüfe auch den Spam-Ordner.</AppText>
        </View>
      ) : null}
      <View style={authStyles.form}>
        <AuthField label="E-Mail" placeholder="deine@email.ch" value={email} onChangeText={(value) => { setEmail(value); setFormError(null); setResendStatus(false); }} keyboardType="email-address" autoCapitalize="none" autoCorrect={false} textContentType="emailAddress" />
        <AuthField label="Bestätigungscode" placeholder="Code aus deiner E-Mail" value={code} onChangeText={(value) => { setCode(value); setFormError(null); }} keyboardType="number-pad" textContentType="oneTimeCode" autoCapitalize="none" autoCorrect={false} returnKeyType="done" onSubmitEditing={() => void onVerify()} />
      </View>
      <AuthSubmit label="E-Mail bestätigen" loading={loading} disabled={loading || resending} onPress={() => void onVerify()} />
      <Pressable accessibilityRole="button" accessibilityState={{ disabled: loading || resending, busy: resending }} disabled={loading || resending} style={authStyles.secondaryAction} onPress={() => void resendCode()}>
        <AppText role="bodyStrong">{resending ? "Wird angefordert …" : "Code erneut anfordern"}</AppText>
      </Pressable>
      <View style={authStyles.footer}>
        <Pressable accessibilityRole="link" style={authStyles.footerLink} onPress={() => router.replace("/auth/login" as never)}>
          <AppText role="label" tone="pink">Schon bestätigt? Einloggen</AppText>
        </Pressable>
      </View>
    </AuthScreen>
  );
}
