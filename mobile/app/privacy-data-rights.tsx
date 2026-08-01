// mobile/app/privacy-data-rights.tsx

import React, { useCallback, useEffect, useMemo, useState } from "react";
import {
  ActivityIndicator,
  Alert,
  Linking,
  Pressable,
  RefreshControl,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { Stack, useRouter } from "expo-router";
import { SafeAreaView } from "react-native-safe-area-context";

import {
  cancelMyAccountDeletion,
  DataRightsRequest,
  generateMyDataExport,
  getMyDataRightsRequests,
  requestMyAccountDeletion,
  requestMyDataExport,
} from "@/lib/data-rights";

function formatDate(value: string | null) {
  if (!value) return "–";
  return new Date(value).toLocaleString("de-CH");
}

function statusLabel(status: DataRightsRequest["status"]) {
  const labels: Record<DataRightsRequest["status"], string> = {
    requested: "Angefordert",
    processing: "Wird erstellt",
    ready: "Bereit",
    scheduled: "Geplant",
    completed: "Abgeschlossen",
    cancelled: "Storniert",
    rejected: "Abgelehnt",
    failed: "Fehlgeschlagen",
  };

  return labels[status];
}

export default function PrivacyDataRightsScreen() {
  const router = useRouter();
  const [rows, setRows] = useState<DataRightsRequest[]>([]);
  const [loading, setLoading] = useState(true);
  const [working, setWorking] = useState<"export" | "delete" | "cancel" | null>(
    null,
  );

  const load = useCallback(async () => {
    try {
      setRows(await getMyDataRightsRequests());
    } catch (error: any) {
      Alert.alert(
        "Meine Daten",
        error?.message ?? "Anfragen konnten nicht geladen werden.",
      );
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  const activeDeletion = useMemo(
    () =>
      rows.find(
        (row) =>
          row.request_type === "account_deletion" &&
          ["requested", "scheduled", "processing"].includes(row.status),
      ) ?? null,
    [rows],
  );

  const latestExport = useMemo(
    () => rows.find((row) => row.request_type === "data_export") ?? null,
    [rows],
  );

  async function createExport() {
    setWorking("export");

    try {
      await requestMyDataExport();
      const result = await generateMyDataExport();
      await load();

      Alert.alert(
        "Datenexport bereit",
        `Deine JSON-Datei wurde erstellt und ist bis ${formatDate(
          result.expires_at,
        )} verfügbar.`,
        [
          { text: "Später", style: "cancel" },
          {
            text: "Jetzt öffnen",
            onPress: () => void Linking.openURL(result.download_url),
          },
        ],
      );
    } catch (error: any) {
      Alert.alert(
        "Export fehlgeschlagen",
        error?.message ?? "Der Datenexport konnte nicht erstellt werden.",
      );
      await load();
    } finally {
      setWorking(null);
    }
  }

  function confirmDeletion() {
    Alert.alert(
      "Konto wirklich löschen?",
      "Die Löschung wird zunächst für 14 Tage vorgemerkt. Während dieser Frist kannst du sie hier stornieren. Danach folgt eine kontrollierte Prüfung von Spot-Ownership, Safety-Daten und Inhalten.",
      [
        { text: "Abbrechen", style: "cancel" },
        {
          text: "Löschung vormerken",
          style: "destructive",
          onPress: () => void createDeletion(),
        },
      ],
    );
  }

  async function createDeletion() {
    setWorking("delete");

    try {
      const result = await requestMyAccountDeletion();
      await load();

      Alert.alert(
        "Löschung vorgemerkt",
        `Die Sicherheitsfrist endet am ${formatDate(result.scheduled_for)}. Bis dahin kannst du die Anfrage jederzeit stornieren.`,
      );
    } catch (error: any) {
      const message =
        error?.message?.includes("admin_account_requires_manual_transfer")
          ? "Dieses Konto besitzt Admin-Rechte. Vor einer Löschung müssen Admin-Zugänge und Spot-Verantwortlichkeiten manuell übertragen werden."
          : error?.message ?? "Die Löschanfrage konnte nicht erstellt werden.";

      Alert.alert("Löschung nicht vorgemerkt", message);
    } finally {
      setWorking(null);
    }
  }

  function confirmCancellation() {
    Alert.alert(
      "Löschanfrage stornieren?",
      "Dein Konto und deine Inhalte bleiben vollständig bestehen.",
      [
        { text: "Nein", style: "cancel" },
        {
          text: "Anfrage stornieren",
          onPress: () => void cancelDeletion(),
        },
      ],
    );
  }

  async function cancelDeletion() {
    setWorking("cancel");

    try {
      const cancelled = await cancelMyAccountDeletion();
      await load();

      Alert.alert(
        cancelled ? "Löschung storniert" : "Keine offene Anfrage",
        cancelled
          ? "Dein Konto bleibt aktiv."
          : "Es wurde keine stornierbare Löschanfrage gefunden.",
      );
    } catch (error: any) {
      Alert.alert(
        "Stornierung fehlgeschlagen",
        error?.message ?? "Die Anfrage konnte nicht storniert werden.",
      );
    } finally {
      setWorking(null);
    }
  }

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
        <Text style={styles.headerTitle}>Meine Daten</Text>
      </View>

      {loading ? (
        <View style={styles.loading}>
          <ActivityIndicator color="#FF7DA7" />
        </View>
      ) : (
        <ScrollView
          contentContainerStyle={styles.content}
          refreshControl={
            <RefreshControl
              refreshing={false}
              onRefresh={() => void load()}
              tintColor="#FF7DA7"
            />
          }
        >
          <View style={styles.intro}>
            <Ionicons name="archive-outline" size={28} color="#FF7DA7" />
            <Text style={styles.introTitle}>Deine Datenschutzrechte</Text>
            <Text style={styles.introText}>
              Du kannst eine maschinenlesbare Kopie deiner Daten anfordern oder
              dein Konto zur Löschung vormerken.
            </Text>
          </View>

          <View style={styles.card}>
            <View style={styles.cardHead}>
              <View style={styles.iconWrap}>
                <Ionicons name="download-outline" size={23} color="#FF7DA7" />
              </View>
              <View style={styles.cardCopy}>
                <Text style={styles.cardTitle}>Datenexport</Text>
                <Text style={styles.cardText}>
                  Erstellt eine JSON-Datei mit Profil, Reviews, Social Posts,
                  Nachrichten, Decisions, Analytics und Einwilligungen.
                </Text>
              </View>
            </View>

            {!!latestExport && (
              <View style={styles.statusBox}>
                <Text style={styles.statusLabel}>
                  Letzter Export: {statusLabel(latestExport.status)}
                </Text>
                <Text style={styles.statusMeta}>
                  {formatDate(latestExport.requested_at)}
                  {latestExport.export_expires_at
                    ? ` · verfügbar bis ${formatDate(
                        latestExport.export_expires_at,
                      )}`
                    : ""}
                </Text>
                {!!latestExport.failure_code && (
                  <Text style={styles.errorText}>
                    {latestExport.failure_code}
                  </Text>
                )}
              </View>
            )}

            <Pressable
              style={[styles.primaryButton, working && styles.disabled]}
              disabled={working !== null}
              onPress={() => void createExport()}
            >
              {working === "export" ? (
                <ActivityIndicator color="#09090A" />
              ) : (
                <>
                  <Ionicons name="download-outline" size={19} color="#09090A" />
                  <Text style={styles.primaryButtonText}>
                    JSON-Export erstellen
                  </Text>
                </>
              )}
            </Pressable>
          </View>

          <View style={[styles.card, styles.dangerCard]}>
            <View style={styles.cardHead}>
              <View style={[styles.iconWrap, styles.dangerIcon]}>
                <Ionicons name="trash-outline" size={23} color="#FF7D87" />
              </View>
              <View style={styles.cardCopy}>
                <Text style={styles.cardTitle}>Konto und Daten löschen</Text>
                <Text style={styles.cardText}>
                  Die Anfrage erhält eine 14-tägige Sicherheitsfrist. Spot-
                  Ownership, öffentlich relevante Inhalte und Safety-Daten
                  werden anschließend kontrolliert behandelt.
                </Text>
              </View>
            </View>

            {activeDeletion ? (
              <>
                <View style={[styles.statusBox, styles.dangerStatus]}>
                  <Text style={styles.statusLabel}>
                    Löschung {statusLabel(activeDeletion.status).toLowerCase()}
                  </Text>
                  <Text style={styles.statusMeta}>
                    Vorgemerkt für {formatDate(activeDeletion.scheduled_for)}
                  </Text>
                </View>

                <Pressable
                  style={[styles.cancelButton, working && styles.disabled]}
                  disabled={working !== null}
                  onPress={confirmCancellation}
                >
                  {working === "cancel" ? (
                    <ActivityIndicator color="#FFFFFF" />
                  ) : (
                    <Text style={styles.cancelButtonText}>
                      Löschanfrage stornieren
                    </Text>
                  )}
                </Pressable>
              </>
            ) : (
              <Pressable
                style={[styles.deleteButton, working && styles.disabled]}
                disabled={working !== null}
                onPress={confirmDeletion}
              >
                {working === "delete" ? (
                  <ActivityIndicator color="#FFFFFF" />
                ) : (
                  <Text style={styles.deleteButtonText}>
                    Kontolöschung vormerken
                  </Text>
                )}
              </Pressable>
            )}
          </View>

          <Text style={styles.footer}>
            Bei Fragen oder manuellen Datenschutzanfragen: hello@backyrd.ch
          </Text>
        </ScrollView>
      )}
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: "#09090A" },
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
  intro: {
    padding: 21,
    borderRadius: 24,
    backgroundColor: "#151519",
    borderWidth: 1,
    borderColor: "rgba(255,125,167,0.23)",
    marginBottom: 15,
  },
  introTitle: {
    color: "#FFFFFF",
    fontSize: 23,
    fontWeight: "900",
    marginTop: 14,
  },
  introText: { color: "#AFAFB7", lineHeight: 21, marginTop: 8 },
  card: {
    padding: 18,
    borderRadius: 22,
    backgroundColor: "#151519",
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.07)",
    marginBottom: 13,
  },
  dangerCard: { borderColor: "rgba(255,125,135,0.22)" },
  cardHead: { flexDirection: "row" },
  iconWrap: {
    width: 46,
    height: 46,
    borderRadius: 15,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: "rgba(255,125,167,0.11)",
    marginRight: 13,
  },
  dangerIcon: { backgroundColor: "rgba(255,125,135,0.10)" },
  cardCopy: { flex: 1 },
  cardTitle: { color: "#FFFFFF", fontSize: 18, fontWeight: "900" },
  cardText: { color: "#A7A7B0", fontSize: 13, lineHeight: 19, marginTop: 5 },
  statusBox: {
    padding: 13,
    borderRadius: 15,
    backgroundColor: "rgba(255,255,255,0.045)",
    marginTop: 16,
  },
  dangerStatus: { backgroundColor: "rgba(255,125,135,0.07)" },
  statusLabel: { color: "#FFFFFF", fontWeight: "900" },
  statusMeta: { color: "#85858F", fontSize: 12, lineHeight: 17, marginTop: 5 },
  errorText: { color: "#FF7D87", fontSize: 12, marginTop: 7 },
  primaryButton: {
    minHeight: 52,
    borderRadius: 17,
    backgroundColor: "#FF7DA7",
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 8,
    marginTop: 16,
  },
  primaryButtonText: { color: "#09090A", fontWeight: "900", fontSize: 15 },
  deleteButton: {
    minHeight: 52,
    borderRadius: 17,
    backgroundColor: "#B83D50",
    alignItems: "center",
    justifyContent: "center",
    marginTop: 16,
  },
  deleteButtonText: { color: "#FFFFFF", fontWeight: "900", fontSize: 15 },
  cancelButton: {
    minHeight: 52,
    borderRadius: 17,
    backgroundColor: "rgba(255,255,255,0.08)",
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.12)",
    alignItems: "center",
    justifyContent: "center",
    marginTop: 12,
  },
  cancelButtonText: { color: "#FFFFFF", fontWeight: "900", fontSize: 15 },
  disabled: { opacity: 0.55 },
  footer: {
    color: "#777782",
    textAlign: "center",
    fontSize: 12,
    lineHeight: 18,
    marginTop: 10,
  },
});
