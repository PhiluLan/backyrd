// mobile/app/privacy-history.tsx

import React, { useEffect, useState } from "react";
import {
  ActivityIndicator,
  Alert,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { Stack, useRouter } from "expo-router";
import { SafeAreaView } from "react-native-safe-area-context";

import {
  ConsentHistoryRow,
  getMyConsentHistory,
} from "@/lib/consent";

const LABELS: Record<string, string> = {
  consent_granted: "Einwilligung erteilt",
  consent_renewed: "Einwilligung erneuert",
  consent_withdrawn: "Einwilligung widerrufen",
  document_accepted: "Dokument bestätigt",
};

export default function PrivacyHistoryScreen() {
  const router = useRouter();
  const [rows, setRows] = useState<ConsentHistoryRow[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    void (async () => {
      try {
        setRows(await getMyConsentHistory());
      } catch (error: any) {
        Alert.alert(
          "Einwilligungsverlauf",
          error?.message ?? "Der Verlauf konnte nicht geladen werden.",
        );
      } finally {
        setLoading(false);
      }
    })();
  }, []);

  return (
    <SafeAreaView style={styles.safe} edges={["top", "bottom"]}>
      <Stack.Screen options={{ headerShown: false }} />


      <View style={styles.header}>
        <Pressable
          accessibilityLabel="Zurück"
          onPress={() => router.back()}
          style={styles.backButton}
        >
          <Ionicons name="chevron-back" size={24} color="#FFFFFF" />
        </Pressable>

        <Text style={styles.headerTitle}>Einwilligungsverlauf</Text>
      </View>


      {loading ? (
        <View style={styles.loading}>
          <ActivityIndicator color="#FF4F91" />
        </View>
      ) : (
        <ScrollView contentContainerStyle={styles.content}>
          <Text style={styles.lead}>
            Dieser Verlauf dokumentiert deine Datenschutzentscheidungen
            unveränderlich und nachvollziehbar.
          </Text>

          {rows.length === 0 ? (
            <View style={styles.empty}>
              <Ionicons name="time-outline" size={28} color="#777782" />
              <Text style={styles.emptyTitle}>Noch keine Einträge</Text>
              <Text style={styles.emptyText}>
                Deine künftigen Einwilligungen und Widerrufe erscheinen hier.
              </Text>
            </View>
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
                      {row.purpose_title ??
                        row.document_title ??
                        row.purpose_key ??
                        "Rechtsdokument"}
                    </Text>
                    <Text style={styles.eventLabel}>
                      {LABELS[row.event_type] ?? row.event_type}
                    </Text>
                    <Text style={styles.meta}>
                      {new Date(row.occurred_at).toLocaleString("de-CH")}
                      {row.source ? ` · ${row.source}` : ""}
                      {row.app_version ? ` · App ${row.app_version}` : ""}
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
  safe: { flex: 1, backgroundColor: "#050506" },

  header: {
    flexDirection: "row",
    alignItems: "center",
    paddingHorizontal: 18,
    paddingVertical: 14,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: "rgba(255,255,255,0.12)",
  },
  backButton: {
    width: 42,
    height: 42,
    borderRadius: 21,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: "rgba(255,255,255,0.08)",
    marginRight: 13,
  },
  headerTitle: {
    color: "#FFFFFF",
    fontSize: 22,
    fontWeight: "900",
    flex: 1,
  },

  loading: { flex: 1, alignItems: "center", justifyContent: "center" },
  content: { padding: 18, paddingBottom: 48 },
  lead: { color: "#AFAFB7", lineHeight: 21, marginBottom: 18 },
  row: {
    flexDirection: "row",
    padding: 17,
    borderRadius: 19,
    backgroundColor: "#111113",
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.07)",
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
  rowTitle: { color: "#FFFFFF", fontSize: 16, fontWeight: "900" },
  eventLabel: { color: "#FF4F91", fontWeight: "800", marginTop: 5 },
  meta: { color: "#797984", fontSize: 12, lineHeight: 17, marginTop: 7 },
  empty: {
    alignItems: "center",
    padding: 28,
    borderRadius: 22,
    backgroundColor: "#111113",
  },
  emptyTitle: {
    color: "#FFFFFF",
    fontSize: 18,
    fontWeight: "900",
    marginTop: 12,
  },
  emptyText: {
    color: "#888892",
    textAlign: "center",
    lineHeight: 19,
    marginTop: 7,
  },
});
