import Constants from "expo-constants";
import * as Updates from "expo-updates";
import { Stack } from "expo-router";
import React, { useEffect, useState } from "react";
import { ScrollView, StyleSheet, Text, View } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";

import { useAuth } from "../../hooks/useAuth";
import { isInternalMobileUser } from "../../lib/internalAccess";
import { backyrdTheme as theme } from "../../theme/backyrd";

function safe(value: unknown) {
  if (value === null || value === undefined || value === "") return "—";
  return String(value);
}

export default function ReleaseDiagnosticsScreen() {
  const { user } = useAuth();
  const internal = __DEV__ || isInternalMobileUser(user);
  const [lastUpdateError, setLastUpdateError] = useState<string | null>(null);

  useEffect(() => {
    if (!internal || !Updates.isEnabled) return;
    void Updates.readLogEntriesAsync(7 * 24 * 60 * 60 * 1000)
      .then((entries) => {
        const entry = [...entries].reverse().find((item) => item.level === "error");
        setLastUpdateError(entry ? `${entry.code} · ${entry.message}` : null);
      })
      .catch(() => setLastUpdateError("Update-Protokoll nicht verfügbar"));
  }, [internal]);

  if (!internal) {
    return (
      <SafeAreaView style={styles.root}>
        <Text style={styles.title}>Nicht verfügbar</Text>
      </SafeAreaView>
    );
  }

  const rows = [
    ["App-Version", Constants.expoConfig?.version],
    ["Native Build", Constants.nativeBuildVersion],
    ["Runtime", Updates.runtimeVersion],
    ["Channel", Updates.channel],
    ["Update-ID", Updates.updateId],
    ["Startquelle", Updates.isEmbeddedLaunch ? "EMBEDDED" : "OTA"],
    ["Emergency Launch", Updates.isEmergencyLaunch ? "JA" : "NEIN"],
    ["Emergency-Grund", Updates.emergencyLaunchReason],
    ["Update erstellt", Updates.createdAt?.toISOString()],
    ["Startdauer", Updates.launchDuration === null ? null : `${Updates.launchDuration} ms`],
    ["Letzter Update-Fehler", lastUpdateError],
  ];

  return (
    <SafeAreaView style={styles.root}>
      <Stack.Screen options={{ headerShown: false }} />
      <ScrollView contentContainerStyle={styles.content}>
        <Text style={styles.eyebrow}>INTERN · RELEASE</Text>
        <Text style={styles.title}>APP STATUS</Text>
        <Text style={styles.help}>Diese Angaben enthalten keine Schlüssel oder Zugangsdaten.</Text>
        <View style={styles.table}>
          {rows.map(([label, value]) => (
            <View key={label} style={styles.row}>
              <Text style={styles.label}>{label}</Text>
              <Text selectable style={styles.value}>{safe(value)}</Text>
            </View>
          ))}
        </View>
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: theme.color.background },
  content: { paddingHorizontal: 22, paddingVertical: 32 },
  eyebrow: { color: theme.color.acid, fontFamily: theme.type.bodyBold, fontSize: 12, letterSpacing: 2.6 },
  title: { marginTop: 8, color: theme.color.textPrimary, fontFamily: theme.type.display, fontWeight: "900", fontSize: 48 },
  help: { marginTop: 8, color: theme.color.textSecondary, fontFamily: theme.type.body, lineHeight: 21 },
  table: { marginTop: 28, borderTopWidth: 1, borderColor: theme.color.border },
  row: { paddingVertical: 15, borderBottomWidth: 1, borderColor: theme.color.border },
  label: { color: theme.color.textSecondary, fontFamily: theme.type.bodyMedium, fontSize: 12, textTransform: "uppercase", letterSpacing: 1.1 },
  value: { marginTop: 5, color: theme.color.textPrimary, fontFamily: theme.type.body, fontSize: 15 },
});
