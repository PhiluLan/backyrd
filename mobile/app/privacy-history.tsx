import { ScreenHeader } from "@/components/foundation/Screen";
import { backyrdTheme } from "../theme/backyrd";
// mobile/app/privacy-history.tsx

import React, { useCallback, useEffect, useState } from "react";
import { ScrollView, StyleSheet, View } from "react-native";
import { ProductText as Text } from "../components/foundation/AppText";
import { Stack, useRouter } from "expo-router";
import { SafeAreaView } from "react-native-safe-area-context";

import {
  ConsentHistoryRow,
  consentPurposeTitle,
  getMyConsentHistory,
} from "@/lib/consent";
import { StateView } from "@/components/foundation/StateView";

import { consentEventLabel } from "../../packages/shared/src/consent-presentation";

export default function PrivacyHistoryScreen() {
  const router = useRouter();
  const [rows, setRows] = useState<ConsentHistoryRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    setError(false);
    try {
      setRows(await getMyConsentHistory());
    } catch {
      setError(true);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  return (
    <SafeAreaView style={styles.safe} edges={["top", "bottom"]}>
      <Stack.Screen options={{ headerShown: false }} />


      <ScreenHeader title="Deine Entscheidungen" eyebrow="Datenschutz" subtitle="Deine Freigaben und Widerrufe im Verlauf." backLabel="Zurück" onBack={() => router.canGoBack() ? router.back() : router.replace("/settings")} />


      {loading ? (
        <View style={styles.loading}>
          <StateView kind="loading" title="Verlauf wird geladen" />
        </View>
      ) : error ? (
        <View style={styles.loading}>
          <StateView kind="error" title="Verlauf nicht verfügbar" message="Deine Datenschutzentscheidungen konnten gerade nicht geladen werden." actionLabel="Noch einmal" onAction={() => void load()} />
        </View>
      ) : (
        <ScrollView contentContainerStyle={styles.content}>
          <Text style={styles.lead}>
            Hier siehst du, wann du Einwilligungen erteilt, erneuert oder widerrufen hast.
          </Text>

          {rows.length === 0 ? (
            <StateView kind="empty" title="Noch keine Einträge" message="Deine künftigen Einwilligungen und Widerrufe erscheinen hier." />
          ) : (
            rows.map((row) => {
              const withdrawn = row.event_type === "consent_withdrawn";

              return (
                <View key={row.event_id} style={styles.row}>
                  <View
                    style={[
                      styles.dot,
                      withdrawn ? styles.dotOff : styles.dotOn,
                    ]}
                  />
                  <View style={styles.rowCopy}>
                    <Text style={styles.rowTitle}>
                      {row.purpose_key
                        ? consentPurposeTitle(row.purpose_key, row.purpose_title)
                        : row.document_title ?? "Rechtsdokument"}
                    </Text>
                    <Text style={styles.eventLabel}>
                      {consentEventLabel(row.event_type)}
                    </Text>
                    <Text style={styles.meta}>
                      {new Date(row.occurred_at).toLocaleString("de-CH")}
                      {row.source === "mobile" ? " · Backyrd App" : ""}
                      {row.app_version ? ` ${row.app_version}` : ""}
                    </Text>
                  </View>
                </View>
              );
            })
          )}
        </ScrollView>
      )}
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: backyrdTheme.color.background },

  loading: { flex: 1, alignItems: "center", justifyContent: "center" },
  content: { paddingHorizontal: 24, paddingBottom: 48 },
  lead: { color: backyrdTheme.color.textSecondary, lineHeight: 21, marginBottom: 18 },
  row: {
    flexDirection: "row",
    padding: 17,
    borderRadius: 19,
    backgroundColor: backyrdTheme.color.surface,
    borderWidth: 1,
    borderColor: backyrdTheme.color.border,
    marginBottom: 10,
  },
  dot: {
    width: 11,
    height: 11,
    borderRadius: 6,
    marginTop: 5,
    marginRight: 13,
  },
  dotOn: { backgroundColor: "#55D59B" },
  dotOff: { backgroundColor: "#FF7D87" },
  rowCopy: { flex: 1 },
  rowTitle: { color: backyrdTheme.color.textPrimary, fontSize: 16, fontWeight: "900" },
  eventLabel: { color: backyrdTheme.color.pink, fontWeight: "800", marginTop: 5 },
  meta: { color: backyrdTheme.color.textSecondary, fontSize: 12, lineHeight: 17, marginTop: 7 },
});
