import React, { useCallback, useState } from "react";
import { Pressable, StyleSheet, Text, View } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { Ionicons } from "@expo/vector-icons";
import { useFocusEffect, useRouter } from "expo-router";

import ProfilePrivacyCard from "@/components/ProfilePrivacyCard";
import { StateView } from "@/components/foundation/StateView";
import { supabase } from "@/lib/supabase";
import { backyrdTheme } from "@/theme/backyrd";

export default function ProfilePrivacySettingsScreen() {
  const router = useRouter();
  const [loading, setLoading] = useState(true);
  const [isPrivate, setIsPrivate] = useState(false);
  const [error, setError] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    setError(false);
    try {
      const { data: userData } = await supabase.auth.getUser();
      const userId = userData.user?.id;
      if (!userId) return;
      const { data, error: profileError } = await supabase
        .from("profiles")
        .select("is_private")
        .eq("id", userId)
        .maybeSingle();
      if (profileError) throw profileError;
      setIsPrivate(Boolean(data?.is_private));
    } catch {
      setError(true);
    } finally {
      setLoading(false);
    }
  }, []);

  useFocusEffect(
    useCallback(() => {
      void load();
    }, [load]),
  );

  return (
    <SafeAreaView style={styles.safe}>
      <View style={styles.header}>
        <Pressable
          accessibilityRole="button"
          accessibilityLabel="Zurück zu Einstellungen"
          onPress={() => router.back()}
          style={styles.backButton}
        >
          <Ionicons name="chevron-back" size={22} color={backyrdTheme.color.textPrimary} />
        </Pressable>
        <Text style={styles.kicker}>DEIN PROFIL</Text>
      </View>
      <Text style={styles.title}>SICHTBARKEIT</Text>
      <Text style={styles.subtitle}>
        Entscheide, ob andere dein Profil und deine Momente finden können.
      </Text>
      {loading ? (
        <StateView kind="loading" title="Sichtbarkeit wird geladen" />
      ) : error ? (
        <StateView
          kind="error"
          title="Sichtbarkeit nicht geladen"
          message="Deine Einstellung konnte gerade nicht geladen werden."
          actionLabel="Noch einmal versuchen"
          onAction={() => void load()}
        />
      ) : (
        <ProfilePrivacyCard
          key={`privacy-${isPrivate ? "private" : "public"}`}
          initialPrivate={isPrivate}
          onChanged={setIsPrivate}
        />
      )}
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: backyrdTheme.color.background, paddingHorizontal: 20 },
  header: { minHeight: 58, flexDirection: "row", alignItems: "center", gap: 12 },
  backButton: { width: 44, height: 44, borderRadius: 22, alignItems: "center", justifyContent: "center", backgroundColor: backyrdTheme.color.surface },
  kicker: { color: backyrdTheme.color.acid, fontFamily: backyrdTheme.type.bodyBold, fontSize: 11, letterSpacing: 2 },
  title: { marginTop: 20, color: backyrdTheme.color.textPrimary, fontFamily: backyrdTheme.type.display, fontSize: 42, lineHeight: 48 },
  subtitle: { marginTop: 8, color: backyrdTheme.color.textSecondary, fontSize: 16, lineHeight: 23 },
});
