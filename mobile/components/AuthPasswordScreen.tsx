import React, { useRef, useState } from "react";
import { Pressable, StyleSheet } from "react-native";
import { ProductText as Text } from "./foundation/AppText";
import { AuthScreen, AuthField, AuthSubmit } from "./auth/AuthScreen";
import { useRouter } from "expo-router";
import { supabase } from "../lib/supabase";

export function AuthPasswordScreen({ mode }: { mode: "forgot" | "reset" }) {
  const router = useRouter();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [confirm, setConfirm] = useState("");
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const pending = useRef(false);
  async function submit() {
    if (pending.current) return;
    setError(null); setMessage(null);
    if (mode === "forgot" && !/^\S+@\S+\.\S+$/.test(email.trim())) { setError("Bitte gib eine gültige E-Mail-Adresse ein."); return; }
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
        await supabase.auth.signOut({ scope: "local" });
        router.replace("/auth/login" as never);
      }
    } catch {
      setError(mode === "forgot" ? "Der Link konnte gerade nicht angefordert werden. Bitte versuche es später erneut." : "Das Passwort konnte nicht gespeichert werden. Fordere bitte einen neuen Link an.");
    } finally { pending.current = false; setBusy(false); }
  }
  return (
    <AuthScreen eyebrow="DEIN KONTO" title={mode === "forgot" ? "Passwort vergessen?" : "Neues Passwort"} description={mode === "forgot" ? "Wir schicken dir einen Link, mit dem du dein Passwort neu setzen kannst." : "Wähle ein neues Passwort mit mindestens acht Zeichen."} backTo="/auth/login">
      {mode === "forgot" ? <AuthField label="E-Mail" placeholder="deine@email.ch" keyboardType="email-address" autoCapitalize="none" autoCorrect={false} textContentType="emailAddress" value={email} onChangeText={setEmail} returnKeyType="go" onSubmitEditing={() => void submit()} editable={!busy} /> : <>
        <AuthField label="Neues Passwort" placeholder="Mindestens 8 Zeichen" secureTextEntry textContentType="newPassword" autoCapitalize="none" autoCorrect={false} value={password} onChangeText={setPassword} editable={!busy} />
        <AuthField label="Passwort bestätigen" placeholder="Noch einmal eingeben" secureTextEntry textContentType="newPassword" autoCapitalize="none" autoCorrect={false} value={confirm} onChangeText={setConfirm} editable={!busy} returnKeyType="go" onSubmitEditing={() => void submit()} />
      </>}
      {error ? <Text accessibilityRole="alert" accessibilityLiveRegion="polite" style={styles.error}>{error}</Text> : null}
      {message ? <Text accessibilityLiveRegion="polite" style={styles.success}>{message}</Text> : null}
      <AuthSubmit label={mode === "forgot" ? "Link senden" : "Passwort speichern"} loading={busy} disabled={busy} onPress={() => void submit()} />
      <Pressable accessibilityRole="button" accessibilityLabel="Zur Anmeldung" onPress={() => router.replace("/auth/login" as never)} style={{ minHeight: 52, justifyContent: "center" }}><Text style={styles.back}>Zur Anmeldung</Text></Pressable>
    </AuthScreen>
  );
}
const styles = StyleSheet.create({
  error: { color: "#FFD1DF", marginVertical: 8 }, success: { color: "#8FE3B2", marginVertical: 8 },
  back: { color: "#A6A8AD", textAlign: "center", fontWeight: "800", marginTop: 22 },
});
