import React from "react";
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
          <Ionicons accessibilityElementsHidden name={icon} size={18} color={color.textPrimary} />
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
        <Text style={[styles.kicker, { color: color.pink }]}>DEIN backyrd</Text>
        <Text style={[styles.title, { color: color.textPrimary }]}>Einstellungen</Text>
        <Text style={[styles.subtitle, { color: color.textSecondary }]}>Profil, Privatsphäre und deine App.</Text>

        {Platform.OS === "android" ? <>
          <Text style={[styles.groupLabel, { color: color.pink }]}>DARSTELLUNG</Text>
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

        <Text style={[styles.groupLabel, { color: color.pink }]}>ACCOUNT</Text>
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
            title="Deine Entdeckungen"
            subtitle="Orte, die du mit Wohin gefunden hast"
            onPress={() => router.push("/profile/history" as any)}
          />
        </View>

        <Text style={[styles.groupLabel, { color: color.pink }]}>PRIVATSPHÄRE</Text>
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
          <Text style={[styles.groupLabel, { color: color.pink }]}>INTERN</Text>
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
  title: {
    color: productTheme.color.textPrimary,
    fontFamily: productTheme.type.display,
    ...productTheme.typeScale.displayL,
  },
  kicker: { color: productTheme.color.pink, fontFamily: productTheme.type.bodyBold, fontSize: productTheme.typeScale.label.fontSize, letterSpacing: 2.5 },
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
    color: productTheme.color.pink,
    fontFamily: productTheme.type.bodyBold,
    fontSize: productTheme.typeScale.label.fontSize,
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
  appearanceGroup: { padding: 16, borderWidth: 1, borderRadius: 18 },
  appearanceOptions: { flexDirection: "row", gap: 8, marginTop: 17 },
  appearanceOption: { minHeight: 52, flex: 1, minWidth: 0, flexDirection: "row", justifyContent: "center", alignItems: "center", gap: 5, borderWidth: 1, borderRadius: 14 },
  appearanceOptionLabel: { fontSize: 13, fontWeight: "700" },
});
