import React, { useEffect, useRef, useState } from "react";
import { Pressable, View } from "react-native";
import { useLocalSearchParams, useRouter } from "expo-router";

import { AppText } from "../../components/foundation/AppText";
import { AuthField, AuthScreen, AuthSubmit, authStyles } from "../../components/auth/AuthScreen";
import { supabase } from "../../lib/supabase";
import { accountAuthError } from "../../../packages/shared/src/auth-errors";
import { isAccountEmail, isConfirmationCode, normalizeConfirmationCode } from "../../../packages/shared/src/account-entry";
import { ensureProfile } from "../../lib/profile";

function cleanEmail(value: string) {
  return value.trim().toLowerCase();
}

export default function VerifyScreen() {
  const router = useRouter();
  const { email: emailParam } = useLocalSearchParams<{ email?: string }>();
  const [email, setEmail] = useState(cleanEmail(typeof emailParam === "string" ? emailParam : ""));
  const [code, setCode] = useState("");
  const [loading, setLoading] = useState(false);
  const [resending, setResending] = useState(false);
  const [formError, setFormError] = useState<string | null>(null);
  const [resendStatus, setResendStatus] = useState(false);

  const pending = useRef(false);
  const lastAutomaticAttempt = useRef("");
  const resendAfter = useRef(0);
  const [remaining, setRemaining] = useState(0);
  useEffect(() => {
    const timer = setInterval(() => setRemaining(Math.max(0, Math.ceil((resendAfter.current - Date.now()) / 1000))), 1000);
    return () => clearInterval(timer);
  }, []);

  function changeCode(value: string) {
    const normalized = normalizeConfirmationCode(value);
    setCode(normalized); setFormError(null);
    const attempt = `${cleanEmail(email)}:${normalized}`;
    if (isAccountEmail(email) && isConfirmationCode(normalized) && lastAutomaticAttempt.current !== attempt) {
      lastAutomaticAttempt.current = attempt;
      void onVerify(normalized);
    }
  }

  async function onVerify(value = code) {
    if (pending.current) return;
    const normalizedEmail = cleanEmail(email);
    const token = normalizeConfirmationCode(value);
    let verified = false;
    if (!isAccountEmail(normalizedEmail) || !isConfirmationCode(token)) {
      setFormError("Gib bitte eine gültige E-Mail-Adresse und den sechsstelligen Code ein.");
      return;
    }

    pending.current = true;
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
    } catch (cause: unknown) {
      setFormError(verified
        ? "Deine E-Mail ist bestätigt, aber dein Profil konnte noch nicht fertig eingerichtet werden. Bitte melde dich erneut an."
        : accountAuthError(cause, "Der Code konnte nicht bestätigt werden. Prüfe ihn oder fordere einen neuen Code an."));
    } finally {
      pending.current = false;
      setLoading(false);
    }
  }

  async function resendCode() {
    if (pending.current || Date.now() < resendAfter.current) return;
    const normalizedEmail = cleanEmail(email);
    if (!isAccountEmail(normalizedEmail)) {
      setFormError("Gib bitte zuerst deine gültige E-Mail-Adresse ein.");
      return;
    }

    pending.current = true;
    resendAfter.current = Date.now() + 60_000; setRemaining(60);
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
      setCode(""); lastAutomaticAttempt.current = "";
      setResendStatus(true);
    } catch {
      setFormError("Eine neue Bestätigung konnte gerade nicht angefordert werden. Versuch es später erneut.");
    } finally {
      pending.current = false;
      setResending(false);
    }
  }

  return (
    <AuthScreen
      backTo="/auth/login"
      eyebrow="BACKYRD · E-MAIL BESTÄTIGEN"
      title="Nur noch ein Schritt."
      description="Gib deine E-Mail-Adresse und den sechsstelligen Code aus deiner E-Mail ein."
    >
      {formError ? <AppText accessibilityLiveRegion="polite" role="meta" style={authStyles.error}>{formError}</AppText> : null}
      {resendStatus ? (
        <View accessibilityLiveRegion="polite" style={authStyles.notice}>
          <AppText role="label" tone="pink">ANFRAGE ERHALTEN</AppText>
          <AppText role="body">Falls für diese Adresse eine Bestätigung offen ist, wurde eine weitere E-Mail angefordert. Prüfe auch den Spam-Ordner.</AppText>
        </View>
      ) : null}
      <View style={authStyles.form}>
        <AuthField label="E-Mail" placeholder="deine@email.ch" value={email} onChangeText={(value) => { setEmail(value); setCode(""); setFormError(null); setResendStatus(false); }} keyboardType="email-address" autoCapitalize="none" autoCorrect={false} textContentType="emailAddress" autoComplete="email" editable={!loading && !resending} />
        <AuthField label="Bestätigungscode" placeholder="Code aus deiner E-Mail" value={code} onChangeText={changeCode} keyboardType="number-pad" textContentType="oneTimeCode" autoComplete="one-time-code" editable={!loading && !resending} autoCapitalize="none" autoCorrect={false} returnKeyType="done" onSubmitEditing={() => void onVerify()} />
      </View>
      <AuthSubmit label="E-Mail bestätigen" loading={loading} disabled={loading || resending} onPress={() => void onVerify()} />
      <Pressable accessibilityRole="button" accessibilityState={{ disabled: loading || resending || remaining > 0, busy: resending }} disabled={loading || resending || remaining > 0} style={authStyles.secondaryAction} onPress={() => void resendCode()}>
        <AppText role="bodyStrong">{resending ? "Wird angefordert …" : remaining > 0 ? `Neuer Code in ${remaining} s` : "Code erneut anfordern"}</AppText>
      </Pressable>
      <View style={authStyles.footer}>
        <Pressable accessibilityRole="link" style={authStyles.footerLink} onPress={() => router.replace("/auth/login" as never)}>
          <AppText role="label" tone="pink">Schon bestätigt? Einloggen</AppText>
        </Pressable>
      </View>
    </AuthScreen>
  );
}
