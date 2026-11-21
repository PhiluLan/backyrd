import { ScreenHeader } from "@/components/foundation/Screen";
import { BlockedPeople } from "../../components/BlockedPeople";
import React, { useCallback, useState } from "react";
import { ScrollView, StyleSheet } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
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
      const { data: userData, error: authError } = await supabase.auth.getUser();
      if (authError) throw authError;
      const userId = userData.user?.id;
      if (!userId) { router.replace("/auth/login"); return; }
      const { data, error: profileError } = await supabase
        .from("profiles")
        .select("is_private")
        .eq("id", userId)
        .single();
      if (profileError || !data) throw profileError ?? new Error("profile_missing");
      setIsPrivate(Boolean(data?.is_private));
    } catch {
      setError(true);
    } finally {
      setLoading(false);
    }
  }, [router]);

  useFocusEffect(
    useCallback(() => {
      void load();
    }, [load]),
  );

  return (
    <SafeAreaView style={styles.safe}>
      <ScrollView contentContainerStyle={{paddingBottom:32}} showsVerticalScrollIndicator={false}>
      <ScreenHeader inset={false} title="Sichtbarkeit" eyebrow="Dein Profil" subtitle="Wer dich findet und wie andere dich erreichen können." backLabel="Zurück zu Einstellungen" onBack={() => router.canGoBack() ? router.back() : router.replace("/settings")} />
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
      <BlockedPeople />
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: backyrdTheme.color.background, paddingHorizontal: backyrdTheme.layout.pageGutter },
});
