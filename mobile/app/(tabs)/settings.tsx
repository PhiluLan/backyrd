import React from "react";
import { View, Text, Pressable, StyleSheet, ScrollView } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { Ionicons } from "@expo/vector-icons";
import { useRouter } from "expo-router";
import { useAuth } from "../../hooks/useAuth";
import { isInternalMobileUser } from "../../lib/internalAccess";
import { backyrdTheme as productTheme } from "../../theme/backyrd";

function SettingsRow({
  icon,
  title,
  subtitle,
  onPress,
}: {
  icon: keyof typeof Ionicons.glyphMap;
  title: string;
  subtitle?: string;
  onPress: () => void;
}) {
  return (
    <Pressable accessibilityRole="button" accessibilityLabel={title} accessibilityHint={subtitle} onPress={onPress} style={styles.row}>
      <View style={styles.rowLeft}>
        <View style={styles.iconWrap}>
          <Ionicons accessibilityElementsHidden name={icon} size={18} color="#fff" />
        </View>
        <View style={{ flex: 1 }}>
          <Text style={styles.rowTitle}>{title}</Text>
          {!!subtitle && <Text style={styles.rowSubtitle}>{subtitle}</Text>}
        </View>
      </View>

      <Ionicons accessibilityElementsHidden name="chevron-forward" size={18} color="rgba(255,255,255,0.55)" />
    </Pressable>
  );
}

export default function SettingsScreen() {
  const router = useRouter();
  const { user } = useAuth();
  const internal = __DEV__ || isInternalMobileUser(user);

  return (
    <SafeAreaView style={styles.safe}>
      <ScrollView contentContainerStyle={styles.container}>
        <Text style={styles.kicker}>DEIN BACKYRD</Text>
        <Text style={styles.title}>EINSTELLUNGEN</Text>
        <Text style={styles.subtitle}>Profil, Privatsphäre und deine App.</Text>

        <Text style={styles.groupLabel}>ACCOUNT</Text>
        <View style={styles.group}>
          <SettingsRow
            icon="person-outline"
            title="Profil"
            subtitle="Dein Account, Momente, Gespeichertes und Erfolge"
            onPress={() => router.push("/profile")}
          />
          <SettingsRow
            icon="eye-outline"
            title="Sichtbarkeit"
            subtitle="Öffentlichkeit deines Profils und deiner Momente"
            onPress={() => router.push("/settings/privacy" as any)}
          />
          <SettingsRow
            icon="time-outline"
            title="Decision-Verlauf"
            subtitle="Deine bisherigen Entscheidungen"
            onPress={() => router.push("/profile/history" as any)}
          />
        </View>

        <Text style={styles.groupLabel}>PRIVATSPHÄRE</Text>
        <View style={styles.group}>
          <SettingsRow
            icon="shield-checkmark-outline"
            title="Datenschutz & Einwilligungen"
            subtitle="Kontrolle über deine Daten und Zustimmung"
            onPress={() => router.push("/privacy-consent" as any)}
          />
          <SettingsRow
            icon="help-buoy-outline"
            title="Sicherheit & Support"
            subtitle="Moderationsentscheidungen und Hilfe"
            onPress={() => router.push("/safety-center" as any)}
          />
        </View>

        {internal ? <>
          <Text style={styles.groupLabel}>INTERN</Text>
          <View style={styles.group}>
            <SettingsRow icon="pulse-outline" title="App- & Release-Status" subtitle="Version, Runtime und aktives Update" onPress={() => router.push("/release-diagnostics")} />
            <SettingsRow icon="hammer-outline" title="DEV" subtitle="Interne Entwickleransicht" onPress={() => router.push("/dev")} />
          </View>
        </> : null}
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: {
    flex: 1,
    backgroundColor: productTheme.color.background,
  },
  container: {
    padding: 20,
    paddingBottom: 120,
  },
  title: {
    color: productTheme.color.textPrimary,
    fontFamily: productTheme.type.display,
    fontSize: 44,
    fontWeight: "900",
  },
  kicker: { color: productTheme.color.acid, fontFamily: productTheme.type.bodyBold, fontSize: 11, letterSpacing: 2.5 },
  subtitle: {
    color: productTheme.color.textSecondary,
    marginTop: 6,
    marginBottom: 22,
    lineHeight: 20,
  },
  group: {
    gap: 12,
  },
  groupLabel: {
    marginTop: 26,
    marginBottom: 10,
    color: productTheme.color.acid,
    fontFamily: productTheme.type.bodyBold,
    fontSize: 11,
    letterSpacing: 1.4,
  },
  row: {
    minHeight: 76,
    borderRadius: 18,
    backgroundColor: productTheme.color.surface,
    borderWidth: 1,
    borderColor: productTheme.color.border,
    paddingHorizontal: 16,
    paddingVertical: 14,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
  },
  rowLeft: {
    flexDirection: "row",
    alignItems: "center",
    gap: 14,
    flex: 1,
  },
  iconWrap: {
    width: 38,
    height: 38,
    borderRadius: 19,
    backgroundColor: "rgba(255,255,255,0.08)",
    alignItems: "center",
    justifyContent: "center",
  },
  rowTitle: {
    color: productTheme.color.textPrimary,
    fontSize: 16,
    fontWeight: "700",
  },
  rowSubtitle: {
    color: productTheme.color.textSecondary,
    fontSize: 13,
    marginTop: 4,
    lineHeight: 18,
  },
});
