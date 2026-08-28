// mobile/app/privacy-legal-documents.tsx

import React, { useCallback, useEffect, useState } from "react";
import {
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
  getMyLegalDocumentsOverview,
  LegalDocumentOverviewRow,
} from "@/lib/consent";
import { StateView } from "@/components/foundation/StateView";

export default function PrivacyLegalDocumentsScreen() {
  const router = useRouter();
  const [rows, setRows] = useState<LegalDocumentOverviewRow[]>([]);
  const [expanded, setExpanded] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    setError(false);
    try {
      setRows(await getMyLegalDocumentsOverview());
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


      <View style={styles.header}>
        <Pressable
          accessibilityLabel="Zurück"
          onPress={() => router.back()}
          style={styles.backButton}
        >
          <Ionicons name="chevron-back" size={24} color="#FFFFFF" />
        </Pressable>

        <Text style={styles.headerTitle}>Rechtsdokumente</Text>
      </View>


      {loading ? (
        <View style={styles.loading}>
          <StateView kind="loading" title="Dokumente werden geladen" />
        </View>
      ) : error ? (
        <View style={styles.loading}>
          <StateView kind="error" title="Dokumente nicht verfügbar" message="Die Rechtsdokumente konnten gerade nicht geladen werden." actionLabel="Noch einmal" onAction={() => void load()} />
        </View>
      ) : (
        <ScrollView contentContainerStyle={styles.content}>
          {rows.length === 0 ? (
            <StateView kind="empty" title="Noch keine veröffentlichten Dokumente" message="Sobald Dokumente veröffentlicht sind, erscheinen sie automatisch hier." />
          ) : (
            rows.map((row) => {
              const open = expanded === row.document_id;

              return (
                <View key={row.document_id} style={styles.card}>
                  <Pressable
                    style={styles.cardHeader}
                    onPress={() =>
                      setExpanded(open ? null : row.document_id)
                    }
                  >
                    <View style={styles.cardCopy}>
                      <Text style={styles.cardTitle}>{row.title}</Text>
                      <Text style={styles.meta}>
                        Version {row.version} · gültig seit{" "}
                        {new Date(row.effective_at).toLocaleDateString("de-CH")}
                      </Text>
                      {row.requires_acceptance && (
                        <Text
                          style={[
                            styles.acceptance,
                            row.accepted
                              ? styles.accepted
                              : styles.notAccepted,
                          ]}
                        >
                          {row.accepted ? "Bestätigt" : "Bestätigung offen"}
                        </Text>
                      )}
                    </View>
                    <Ionicons
                      name={open ? "chevron-up" : "chevron-down"}
                      size={20}
                      color="#FFFFFF"
                    />
                  </Pressable>

                  {open && (
                    <View style={styles.documentBody}>
                      {!!row.summary && (
                        <Text style={styles.summary}>{row.summary}</Text>
                      )}
                      <Text style={styles.documentText}>
                        {row.content_markdown}
                      </Text>
                    </View>
                  )}
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
  card: {
    borderRadius: 21,
    backgroundColor: "#111113",
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.07)",
    marginBottom: 11,
    overflow: "hidden",
  },
  cardHeader: {
    flexDirection: "row",
    alignItems: "center",
    padding: 18,
  },
  cardCopy: { flex: 1, paddingRight: 12 },
  cardTitle: { color: "#FFFFFF", fontSize: 17, fontWeight: "900" },
  meta: { color: "#85858F", fontSize: 12, marginTop: 6 },
  acceptance: { fontSize: 12, fontWeight: "900", marginTop: 8 },
  accepted: { color: "#55D59B" },
  notAccepted: { color: "#F5B949" },
  documentBody: {
    padding: 18,
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: "rgba(255,255,255,0.09)",
  },
  summary: {
    color: "#FFFFFF",
    fontWeight: "800",
    lineHeight: 21,
    marginBottom: 15,
  },
  documentText: { color: "#AEAEA7", lineHeight: 21 },
  empty: {
    alignItems: "center",
    padding: 30,
    borderRadius: 23,
    backgroundColor: "#111113",
  },
  emptyTitle: {
    color: "#FFFFFF",
    fontSize: 19,
    fontWeight: "900",
    textAlign: "center",
    marginTop: 13,
  },
  emptyText: {
    color: "#8C8C96",
    textAlign: "center",
    lineHeight: 20,
    marginTop: 8,
  },
});
