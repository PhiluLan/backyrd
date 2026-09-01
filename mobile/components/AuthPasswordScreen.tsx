import React, { useState } from "react";
import { ActivityIndicator, Pressable, StyleSheet, Text, TextInput, View } from "react-native";
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
  async function submit() {
    setError(null); setMessage(null);
    if (mode === "forgot" && !/^\S+@\S+\.\S+$/.test(email.trim())) { setError("Bitte gib eine gültige E-Mail-Adresse ein."); return; }
    if (mode === "reset" && password.length < 8) { setError("Das Passwort braucht mindestens 8 Zeichen."); return; }
    if (mode === "reset" && password !== confirm) { setError("Die Passwörter stimmen nicht überein."); return; }
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
    } finally { setBusy(false); }
  }
  return (
    <View style={styles.root}>
      <Text style={styles.kicker}>BACKYRD ACCOUNT</Text>
      <Text style={styles.title}>{mode === "forgot" ? "Passwort vergessen?" : "Neues Passwort"}</Text>
      <Text style={styles.copy}>{mode === "forgot" ? "Wir schicken dir einen sicheren Link. Deine Daten bleiben unverändert." : "Wähle ein neues, sicheres Passwort für deinen Account."}</Text>
      {mode === "forgot" ? <TextInput style={styles.input} placeholder="E-Mail" placeholderTextColor="#7D8086" keyboardType="email-address" autoCapitalize="none" value={email} onChangeText={setEmail} /> : <>
        <TextInput style={styles.input} placeholder="Mindestens 8 Zeichen" placeholderTextColor="#7D8086" secureTextEntry value={password} onChangeText={setPassword} />
        <TextInput style={styles.input} placeholder="Passwort bestätigen" placeholderTextColor="#7D8086" secureTextEntry value={confirm} onChangeText={setConfirm} />
      </>}
      {error ? <Text accessibilityLiveRegion="polite" style={styles.error}>{error}</Text> : null}
      {message ? <Text accessibilityLiveRegion="polite" style={styles.success}>{message}</Text> : null}
      <Pressable disabled={busy} style={styles.button} onPress={() => void submit()}>{busy ? <ActivityIndicator /> : <Text style={styles.buttonText}>{mode === "forgot" ? "Link senden" : "Passwort speichern"}</Text>}</Pressable>
      <Pressable onPress={() => router.replace("/auth/login" as never)}><Text style={styles.back}>Zur Anmeldung</Text></Pressable>
    </View>
  );
}
const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: "#050506", padding: 28, justifyContent: "center" },
  kicker: { color: "#8E9198", fontSize: 12, fontWeight: "900", letterSpacing: 5, marginBottom: 18 },
  title: { color: "#fff", fontSize: 34, fontWeight: "900", marginBottom: 12 }, copy: { color: "#A6A8AD", fontSize: 17, lineHeight: 25, marginBottom: 24 },
  input: { color: "#fff", fontSize: 17, borderWidth: 1, borderColor: "rgba(255,255,255,.16)", backgroundColor: "rgba(255,255,255,.08)", borderRadius: 17, padding: 16, marginBottom: 12 },
  error: { color: "#FFD1DF", marginVertical: 8 }, success: { color: "#8FE3B2", marginVertical: 8 },
  button: { backgroundColor: "#fff", borderRadius: 17, alignItems: "center", padding: 17, marginTop: 10 }, buttonText: { color: "#111", fontSize: 17, fontWeight: "900" },
  back: { color: "#A6A8AD", textAlign: "center", fontWeight: "800", marginTop: 22 },
});
