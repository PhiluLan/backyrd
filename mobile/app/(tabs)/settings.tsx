import React from "react";
import { View, Text, Pressable, StyleSheet, ScrollView } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { Ionicons } from "@expo/vector-icons";
import { useRouter } from "expo-router";

const theme = {
  bg: "#0A0A0B",
  card: "#15151A",
  border: "#2A2A33",
  text: "#FFFFFF",
  muted: "#A6A8AD",
};

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
    <Pressable onPress={onPress} style={styles.row}>
      <View style={styles.rowLeft}>
        <View style={styles.iconWrap}>
          <Ionicons name={icon} size={18} color="#fff" />
        </View>
        <View style={{ flex: 1 }}>
          <Text style={styles.rowTitle}>{title}</Text>
          {!!subtitle && <Text style={styles.rowSubtitle}>{subtitle}</Text>}
        </View>
      </View>

      <Ionicons name="chevron-forward" size={18} color="rgba(255,255,255,0.55)" />
    </Pressable>
  );
}

export default function SettingsScreen() {
  const router = useRouter();

  return (
    <SafeAreaView style={styles.safe}>
      <ScrollView contentContainerStyle={styles.container}>
        <Text style={styles.title}>Settings</Text>
        <Text style={styles.subtitle}>Profil, interne Tools und App-Bereiche.</Text>

        <View style={styles.group}>
          <SettingsRow
            icon="person-outline"
            title="Profil"
            subtitle="Dein Account, Beiträge, Favoriten und Badges"
            onPress={() => router.push("/profile")}
          />

          <SettingsRow
            icon="sparkles-outline"
            title="Decision Debug"
            subtitle="Debug- und Diagnosebereich für Decision"
            onPress={() => router.push("/decision-debug")}
          />

          <SettingsRow
            icon="hammer-outline"
            title="DEV"
            subtitle="Interne Entwickleransicht"
            onPress={() => router.push("/dev")}
          />
        </View>
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: {
    flex: 1,
    backgroundColor: theme.bg,
  },
  container: {
    padding: 20,
    paddingBottom: 120,
  },
  title: {
    color: theme.text,
    fontSize: 28,
    fontWeight: "800",
  },
  subtitle: {
    color: theme.muted,
    marginTop: 6,
    marginBottom: 22,
    lineHeight: 20,
  },
  group: {
    gap: 12,
  },
  row: {
    minHeight: 76,
    borderRadius: 18,
    backgroundColor: theme.card,
    borderWidth: 1,
    borderColor: theme.border,
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
    color: theme.text,
    fontSize: 16,
    fontWeight: "700",
  },
  rowSubtitle: {
    color: theme.muted,
    fontSize: 13,
    marginTop: 4,
    lineHeight: 18,
  },
});