import React, { useEffect, useRef, useState } from "react";
import { Pressable, StyleSheet } from "react-native";
import { ProductText as Text } from "./foundation/AppText";
import { AuthScreen, AuthField, AuthSubmit } from "./auth/AuthScreen";
import { useRouter } from "expo-router";
import { supabase } from "../lib/supabase";
import { isAccountEmail } from "../../packages/shared/src/account-entry";
import { compromisedPasswordMessage } from "../../packages/shared/src/auth-errors";

export function AuthPasswordScreen({ mode }: { mode: "forgot" | "reset" }) {
  const router = useRouter();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [confirm, setConfirm] = useState("");
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const pending = useRef(false);
  const [ready, setReady] = useState(mode === "forgot");
  const [checking, setChecking] = useState(mode === "reset");
  useEffect(() => {
    if (mode !== "reset") return;
    let active = true;
    void supabase.auth.getUser().then(({ data, error: authError }) => {
      if (!active) return;
      setReady(!authError && Boolean(data.user));
      if (authError || !data.user) setError("Der Link ist abgelaufen oder fehlt. Fordere bitte einen neuen Link an.");
    }).catch(() => { if (active) setError("Deine Anmeldung konnte nicht geprüft werden. Prüfe deine Verbindung und öffne den Link erneut."); })
      .finally(() => { if (active) setChecking(false); });
    return () => { active = false; };
  }, [mode]);
  async function submit() {
    if (pending.current || !ready) return;
    setError(null); setMessage(null);
    if (mode === "forgot" && !isAccountEmail(email)) { setError("Bitte gib eine gültige E-Mail-Adresse ein."); return; }
    if (mode === "reset" && password.length < 8) { setError("Das Passwort braucht mindestens 8 Zeichen."); return; }
    if (mode === "reset" && password !== confirm) { setError("Die Passwörter stimmen nicht überein."); return; }
    pending.current = true;
    setBusy(true);
    try {
      if (mode === "forgot") {
        const { error: authError } = await supabase.auth.resetPasswordForEmail(email.trim().toLowerCase(), { redirectTo: "backyrd://auth/recovery" });
        if (authError) throw authError;
        setMessage("Wenn ein Konto existiert, erhältst du gleich eine E-Mail.");
      } else {
        const { error: authError } = await supabase.auth.updateUser({ password });
        if (authError) throw authError;
        setPassword(""); setConfirm(""); setReady(false);
        setMessage("Dein Passwort ist gespeichert. Melde dich jetzt mit deinem neuen Passwort an.");
        try {
          const { error: signOutError } = await supabase.auth.signOut({ scope: "local" });
          if (signOutError) throw signOutError;
          router.replace({ pathname: "/auth/login", params: { status: "password-updated" } } as never);
        } catch { setMessage("Dein Passwort ist gespeichert. Deine Abmeldung konnte noch nicht bestätigt werden. Gehe zur Anmeldung, um dich mit deinem neuen Passwort anzumelden."); }
      }
    } catch (cause: unknown) {
      setError(compromisedPasswordMessage(cause) ?? (mode === "forgot" ? "Der Link konnte gerade nicht angefordert werden. Bitte versuche es später erneut." : "Das Passwort konnte nicht gespeichert werden. Fordere bitte einen neuen Link an."));
    } finally { pending.current = false; setBusy(false); }
  }
  return (
    <AuthScreen eyebrow="DEIN KONTO" title={mode === "forgot" ? "Passwort vergessen?" : "Neues Passwort"} description={mode === "forgot" ? "Wir schicken dir einen Link, mit dem du dein Passwort neu setzen kannst." : "Wähle ein neues Passwort mit mindestens acht Zeichen."} backTo="/auth/login">
      {checking ? <Text accessibilityLiveRegion="polite">Dein sicherer Link wird geprüft …</Text> : null}
      {mode === "forgot" ? <AuthField label="E-Mail" placeholder="deine@email.ch" keyboardType="email-address" autoCapitalize="none" autoCorrect={false} textContentType="emailAddress" value={email} onChangeText={setEmail} returnKeyType="go" onSubmitEditing={() => void submit()} editable={!busy} /> : ready ? <>
        <AuthField label="Neues Passwort" placeholder="Mindestens 8 Zeichen" secureTextEntry textContentType="newPassword" autoCapitalize="none" autoCorrect={false} value={password} onChangeText={setPassword} editable={!busy} />
        <AuthField label="Passwort bestätigen" placeholder="Noch einmal eingeben" secureTextEntry textContentType="newPassword" autoCapitalize="none" autoCorrect={false} value={confirm} onChangeText={setConfirm} editable={!busy} returnKeyType="go" onSubmitEditing={() => void submit()} />
      </> : null}
      {error ? <Text accessibilityRole="alert" accessibilityLiveRegion="polite" style={styles.error}>{error}</Text> : null}
      {message ? <Text accessibilityLiveRegion="polite" style={styles.success}>{message}</Text> : null}
      <AuthSubmit label={mode === "forgot" ? "Link senden" : "Passwort speichern"} loading={busy} disabled={busy || !ready} onPress={() => void submit()} />
      {mode === "reset" && !ready && !checking && !message ? <Pressable accessibilityRole="button" onPress={() => router.replace("/auth/forgot-password" as never)} style={{ minHeight: 52, justifyContent: "center" }}><Text style={styles.back}>Neuen Link anfordern</Text></Pressable> : null}
      <Pressable accessibilityRole="button" accessibilityLabel="Zur Anmeldung" onPress={() => router.replace("/auth/login" as never)} style={{ minHeight: 52, justifyContent: "center" }}><Text style={styles.back}>Zur Anmeldung</Text></Pressable>
    </AuthScreen>
  );
}
const styles = StyleSheet.create({
  error: { color: "#FFD1DF", marginVertical: 8 }, success: { color: "#8FE3B2", marginVertical: 8 },
  back: { color: "#A6A8AD", textAlign: "center", fontWeight: "800", marginTop: 22 },
});
