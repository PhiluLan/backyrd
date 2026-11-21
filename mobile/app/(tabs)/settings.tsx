import React from "react";
import { ScreenHeader } from "../../components/foundation/Screen";
import { Alert, View, Pressable, StyleSheet, ScrollView, Platform } from "react-native";
import { ProductText as Text } from "../../components/foundation/AppText";
import { SafeAreaView } from "react-native-safe-area-context";
import { Ionicons } from "@expo/vector-icons";
import { useRouter } from "expo-router";
import { useAuth } from "../../hooks/useAuth";
import { isInternalMobileUser } from "../../lib/internalAccess";
import { backyrdTheme as productTheme, useBackyrdTheme } from "../../theme/backyrd";
import { useAndroidAppearancePreference, type AndroidAppearancePreference } from "../../theme/appearancePreference";
import { signOutWithPushCleanup } from "../../lib/signOut";

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
        <ScreenHeader inset={false} title="Einstellungen" subtitle="Alles Wichtige für dein Konto – an einem Ort." backLabel="Zurück zum Profil" onBack={() => router.canGoBack() ? router.back() : router.replace("/profile")} />

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

        <Text style={[styles.groupLabel, { color: color.textSecondary }]}>Konto</Text>
        <View style={styles.group}>
          <SettingsRow
            icon="person-outline"
            title="Profil"
            subtitle="Name, Foto, Bio und Interessen"
            onPress={() => router.push("/profile")}
          />
          <SettingsRow icon="key-outline" title="Anmeldung & Passwort" subtitle="Passwort ändern oder zurücksetzen" onPress={() => router.push("/auth/forgot-password")} />
        </View>

        <Text style={[styles.groupLabel, { color: color.textSecondary }]}>Privatsphäre</Text>
        <View style={styles.group}>
          <SettingsRow
            icon="lock-closed-outline"
            title="Sichtbarkeit & Blockierungen"
            subtitle="Wer dich und deine Inhalte sehen kann"
            onPress={() => router.push("/settings/privacy" as any)}
          />
          <SettingsRow icon="notifications-outline" title="Mitteilungen" subtitle="Was Backyrd dir mitteilen darf" onPress={() => router.push("/safety-notifications")} />
          <SettingsRow
            icon="shield-checkmark-outline"
            title="Datenschutz & deine Daten"
            subtitle="Einwilligungen und Datennutzung verwalten"
            onPress={() => router.push("/privacy-consent" as any)}
          />
        </View>

        <Text style={[styles.groupLabel, { color: color.textSecondary }]}>Deine Aktivität</Text>
        <View style={styles.group}>
          <SettingsRow
            icon="time-outline"
            title="Deine Entdeckungen"
            subtitle="Frühere Suchen und gefundene Orte"
            onPress={() => router.push("/profile/history" as any)}
          />
        </View>

        <Text style={[styles.groupLabel, { color: color.textSecondary }]}>Hilfe & Sicherheit</Text>
        <View style={styles.group}>
          <SettingsRow icon="person-circle-outline" title="Konto-Status" subtitle="Hinweise und mögliche Einschränkungen deines Kontos" onPress={() => router.push("/safety/account-status")} />
          <SettingsRow
            icon="help-buoy-outline"
            title="Sicherheit & Support"
            subtitle="Hilfe, Meldungen und Entscheidungen zu deinen Inhalten"
            onPress={() => router.push("/safety-center" as any)}
          />
        </View>

        {internal ? <>
          <Text style={[styles.groupLabel, { color: color.textSecondary }]}>Intern</Text>
          <View style={styles.group}>
            <SettingsRow icon="pulse-outline" title="App- & Release-Status" subtitle="Version, Runtime und aktives Update" onPress={() => router.push("/release-diagnostics")} />
            <SettingsRow icon="hammer-outline" title="DEV" subtitle="Interne Entwickleransicht" onPress={() => router.push("/dev")} />
          </View>
        </> : null}

        <Pressable
          accessibilityRole="button"
          accessibilityLabel="Aus Backyrd ausloggen"
          onPress={() => Alert.alert("Ausloggen?", "Du kannst dich jederzeit wieder anmelden.", [
            { text: "Abbrechen", style: "cancel" },
            { text: "Ausloggen", style: "destructive", onPress: async () => {
              try {
                await signOutWithPushCleanup();
                router.replace("/gate" as any);
              } catch {
                Alert.alert("Ausloggen noch nicht möglich", "Prüfe deine Verbindung und versuche es noch einmal.");
              }
            } },
          ])}
          style={[styles.signOut, { borderColor: color.border }]}
        >
          <Ionicons name="log-out-outline" size={19} color={color.textSecondary} />
          <Text style={[styles.signOutText, { color: color.textSecondary }]}>Ausloggen</Text>
        </Pressable>
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
    gap: 0, borderRadius: 18, overflow: "hidden",
  },
  groupLabel: {
    marginTop: 28,
    marginBottom: 10,
    color: productTheme.color.textSecondary,
    fontFamily: productTheme.type.bodyBold,
    fontSize: 14, lineHeight: 20,
    letterSpacing: 0.2,
  },
  row: {
    minHeight: 78,
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
  signOut: { marginTop: 34, minHeight: 52, borderWidth: 1, borderRadius: 16, flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 9 },
  signOutText: { fontSize: 15, fontWeight: "700" },
});
