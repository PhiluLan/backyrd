import React from "react";
import { ScreenHeader } from "../../components/foundation/Screen";
import { View, Pressable, StyleSheet, ScrollView, Platform } from "react-native";
import { ProductText as Text } from "../../components/foundation/AppText";
import { SafeAreaView } from "react-native-safe-area-context";
import { Ionicons } from "@expo/vector-icons";
import { useRouter } from "expo-router";
import { useAuth } from "../../hooks/useAuth";
import { isInternalMobileUser } from "../../lib/internalAccess";
import { backyrdTheme as productTheme, useBackyrdTheme } from "../../theme/backyrd";
import { useAndroidAppearancePreference, type AndroidAppearancePreference } from "../../theme/appearancePreference";

const appearanceChoices = [
  { value: "system", label: "System", icon: "phone-portrait-outline" },
  { value: "light", label: "Hell", icon: "sunny-outline" },
  { value: "dark", label: "Dunkel", icon: "moon-outline" },
] as const;

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
  const { color } = useBackyrdTheme();
  return (
    <Pressable accessibilityRole="button" accessibilityLabel={title} accessibilityHint={subtitle} onPress={onPress} style={[styles.row, { backgroundColor: color.surface, borderColor: color.border }]}>
      <View style={styles.rowLeft}>
        <View style={[styles.iconWrap, { backgroundColor: color.surfaceElevated }]}>
          <Ionicons accessibilityElementsHidden name={icon} size={21} color={color.pink} />
        </View>
        <View style={{ flex: 1 }}>
          <Text style={[styles.rowTitle, { color: color.textPrimary }]}>{title}</Text>
          {!!subtitle && <Text style={[styles.rowSubtitle, { color: color.textSecondary }]}>{subtitle}</Text>}
        </View>
      </View>

      <Ionicons accessibilityElementsHidden name="chevron-forward" size={18} color={color.textMuted} />
    </Pressable>
  );
}

export default function SettingsScreen() {
  const { color } = useBackyrdTheme();
  const { preference, setPreference } = useAndroidAppearancePreference();
  const router = useRouter();
  const { user } = useAuth();
  const internal = __DEV__ || isInternalMobileUser(user);

  return (
    <SafeAreaView style={[styles.safe, { backgroundColor: color.background }]}>
      <ScrollView contentContainerStyle={styles.container}>
        <ScreenHeader inset={false} eyebrow="Dein Backyrd" title="Einstellungen" subtitle="Dein Profil, deine Privatsphäre und Hilfe für unterwegs." backLabel="Zurück zum Profil" onBack={() => router.canGoBack() ? router.back() : router.replace("/profile")} />

        {Platform.OS === "android" ? <>
          <Text style={[styles.groupLabel, { color: color.pink }]}>Darstellung</Text>
          <View style={[styles.appearanceGroup, { backgroundColor: color.surface, borderColor: color.border }]}>
            <Text style={[styles.rowTitle, { color: color.textPrimary }]}>Erscheinungsbild</Text>
            <Text style={[styles.rowSubtitle, { color: color.textSecondary }]}>Wähle, wie Backyrd auf diesem Gerät aussieht.</Text>
            <View style={styles.appearanceOptions} accessibilityRole="radiogroup" accessibilityLabel="Erscheinungsbild">
              {appearanceChoices.map(option => (
                <Pressable
                  key={option.value}
                  accessibilityRole="radio"
                  accessibilityState={{ selected: preference === option.value }}
                  accessibilityLabel={option.label}
                  onPress={() => void setPreference(option.value as AndroidAppearancePreference)}
                  style={[styles.appearanceOption, { borderColor: preference === option.value ? color.pink : color.border, backgroundColor: preference === option.value ? color.surfaceElevated : color.surface }]}
                >
                  <Ionicons name={option.icon} size={19} color={preference === option.value ? color.pink : color.textSecondary} />
                  <Text style={[styles.appearanceOptionLabel, { color: preference === option.value ? color.pink : color.textPrimary }]}>{option.label}</Text>
                </Pressable>
              ))}
            </View>
          </View>
        </> : null}

        <Text style={[styles.groupLabel, { color: color.pink }]}>Dein Konto</Text>
        <View style={styles.group}>
          <SettingsRow
            icon="person-outline"
            title="Profil"
            subtitle="Deine Angaben, Momente und gespeicherten Orte"
            onPress={() => router.push("/profile")}
          />
          <SettingsRow icon="key-outline" title="Passwort zurücksetzen" subtitle="Einen Link zum Zurücksetzen per E-Mail anfordern" onPress={() => router.push("/auth/forgot-password")} />
          <SettingsRow
            icon="eye-outline"
            title="Sichtbarkeit"
            subtitle="Wer dein Profil und deine Momente sehen kann"
            onPress={() => router.push("/settings/privacy" as any)}
          />
          <SettingsRow
            icon="time-outline"
            title="Deine Entdeckungen"
            subtitle="Orte, die du mit Wohin gefunden hast"
            onPress={() => router.push("/profile/history" as any)}
          />
        </View>

        <Text style={[styles.groupLabel, { color: color.pink }]}>Privatsphäre & Hilfe</Text>
        <View style={styles.group}>
          <SettingsRow
            icon="shield-checkmark-outline"
            title="Datenschutz & Einwilligungen"
            subtitle="Du entscheidest, welche Daten du freigibst"
            onPress={() => router.push("/privacy-consent" as any)}
          />
          <SettingsRow icon="notifications-outline" title="Mitteilungen" subtitle="Neuigkeiten zu deinem Konto und deinen Meldungen" onPress={() => router.push("/safety-notifications")} />
          <SettingsRow icon="person-circle-outline" title="Konto-Status" subtitle="Hinweise und mögliche Einschränkungen deines Kontos" onPress={() => router.push("/safety/account-status")} />
          <SettingsRow
            icon="help-buoy-outline"
            title="Sicherheit & Support"
            subtitle="Hilfe, Meldungen und Entscheidungen zu deinen Inhalten"
            onPress={() => router.push("/safety-center" as any)}
          />
        </View>

        {internal ? <>
          <Text style={[styles.groupLabel, { color: color.pink }]}>Intern</Text>
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
    padding: productTheme.layout.pageGutter,
    paddingBottom: 120,
  },
  group: {
    gap: 0, borderRadius: 24, overflow: "hidden",
  },
  groupLabel: {
    marginTop: 28,
    marginBottom: 10,
    color: productTheme.color.pink,
    fontFamily: productTheme.type.bodyBold,
    fontSize: 19, lineHeight: 25,
    letterSpacing: -0.3,
  },
  row: {
    minHeight: 86,
    borderRadius: 0,
    backgroundColor: productTheme.color.surface,
    borderBottomWidth: StyleSheet.hairlineWidth,
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
    fontSize: 14,
    marginTop: 5,
    lineHeight: 20,
  },
  appearanceGroup: { padding: 16, borderWidth: 1, borderRadius: 18 },
  appearanceOptions: { flexDirection: "row", gap: 8, marginTop: 17 },
  appearanceOption: { minHeight: 52, flex: 1, minWidth: 0, flexDirection: "row", justifyContent: "center", alignItems: "center", gap: 5, borderWidth: 1, borderRadius: 14 },
  appearanceOptionLabel: { fontSize: 13, fontWeight: "700" },
});
