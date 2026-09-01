import React, { useEffect, useState } from "react";
import { ActivityIndicator, Pressable, StyleSheet, Text, View } from "react-native";
import * as Linking from "expo-linking";
import { useRouter } from "expo-router";
import { createSessionFromAuthDeepLink } from "../../lib/authDeepLink";
import { consumePendingAuthRedirect } from "../../lib/pendingAuthRedirect";
import { ensureProfile } from "../../lib/profile";

export default function AuthCallbackScreen() {
  const router = useRouter();
  const [failed, setFailed] = useState(false);
  useEffect(() => {
    let active = true;
    void (async () => {
      try {
        const rawUrl = consumePendingAuthRedirect() ?? (await Linking.getInitialURL());
        if (!rawUrl) throw new Error("auth_callback_missing");
        const result = await createSessionFromAuthDeepLink(rawUrl);
        if (!active) return;
        if (result.kind === "recovery") router.replace("/auth/reset-password" as never);
        else {
          await ensureProfile();
          router.replace("/gate" as never);
        }
      } catch {
        if (active) setFailed(true);
      }
    })();
    return () => { active = false; };
  }, [router]);

  return (
    <View style={styles.root}>
      {failed ? (
        <>
          <Text style={styles.title}>Link nicht mehr gültig</Text>
          <Text style={styles.copy}>Der Link ist abgelaufen, wurde bereits verwendet oder ist unvollständig. Fordere bitte einen neuen Link an.</Text>
          <Pressable style={styles.button} onPress={() => router.replace("/auth/login" as never)}>
            <Text style={styles.buttonText}>Zur Anmeldung</Text>
          </Pressable>
        </>
      ) : (
        <><ActivityIndicator color="#fff" /><Text style={styles.copy}>Dein sicherer Link wird geprüft …</Text></>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: "#050506", padding: 28, justifyContent: "center", alignItems: "center" },
  title: { color: "#fff", fontSize: 30, fontWeight: "900", textAlign: "center", marginBottom: 14 },
  copy: { color: "#A6A8AD", fontSize: 17, lineHeight: 25, textAlign: "center", marginTop: 14 },
  button: { marginTop: 26, backgroundColor: "#fff", borderRadius: 17, paddingHorizontal: 24, paddingVertical: 16 },
  buttonText: { color: "#111", fontSize: 16, fontWeight: "900" },
});
