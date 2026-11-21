import { ScreenHeader } from "@/components/foundation/Screen";
import { backyrdTheme } from "../../theme/backyrd";
import { Ionicons } from "@expo/vector-icons";
import { useFocusEffect, useRouter } from "expo-router";
import React, { useCallback, useState } from "react";
import { Alert, Pressable, ScrollView, StyleSheet, View } from "react-native";
import { ProductText as Text } from "../../components/foundation/AppText";
import { SafeAreaView } from "react-native-safe-area-context";

import {
  getSafetyWriteStatus,
  type SafetyWriteStatus,
} from "../../lib/safety-enforcement";
import { supabase } from "../../lib/supabase";
import { StateView } from "../../components/foundation/StateView";

type Measure = {
  id: string;
  measure_type: string;
  status: string;
  ends_at: string | null;
  public_explanation: string | null;
  reason_code: string;
  created_at: string;
};

const labels: Record<string, string> = {
  warning: "Verwarnung",
  write_suspension: "Temporäre Schreibsperre",
  account_restricted: "Account eingeschränkt",
  account_review: "Account in Prüfung",
};

export default function SafetyAccountStatusScreen() {
  const router = useRouter();
  const [status, setStatus] =
    useState<SafetyWriteStatus | null>(null);
  const [measures, setMeasures] = useState<Measure[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState(false);
  const [acknowledging, setAcknowledging] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true); setLoadError(false);
    try {
      const nextStatus = await getSafetyWriteStatus();

      const { data, error } = await supabase
        .from("safety_account_measures")
        .select(
          "id,measure_type,status,ends_at,public_explanation,reason_code,created_at",
        )
        .order("created_at", { ascending: false })
        .limit(20);

      if (error || !nextStatus || !Array.isArray(data)) throw new Error("account_status_unavailable");
      setStatus(nextStatus);
      setMeasures((data ?? []) as Measure[]);
    } catch { setLoadError(true); } finally { setLoading(false); }
  }, []);

  useFocusEffect(
    useCallback(() => {
      void load();
    }, [load]),
  );

  async function acknowledge(measureId: string) {
    if (acknowledging) return;
    setAcknowledging(measureId);
    try {
      const { error } = await supabase.rpc("safety_acknowledge_warning_v1", { p_measure_id: measureId });
      if (error) throw error;
      await load();
    } catch { Alert.alert("Nicht bestätigt", "Deine Bestätigung konnte nicht gespeichert werden. Bitte versuche es erneut."); }
    finally { setAcknowledging(null); }
  }

  return (
    <SafeAreaView style={styles.root}>
      <ScreenHeader title="Dein Konto-Status" eyebrow="Sicherheit & Support" subtitle="Hinweise und mögliche Einschränkungen deines Kontos." onBack={() => router.canGoBack() ? router.back() : router.replace("/settings")} />

      <ScrollView
        contentContainerStyle={styles.content}
      >


        {loading ? (
          <StateView kind="loading" title="Account-Status wird geladen" />
        ) : loadError ? <StateView kind="error" title="Konto-Status nicht verfügbar" message="Wir konnten deine Angaben gerade nicht laden." actionLabel="Erneut versuchen" onAction={() => void load()} /> : (
          <>
            <View style={styles.summaryCard}>
              <View>
                <Text style={styles.summaryLabel}>
                  Schreiben
                </Text>
                <Text
                  style={[
                    styles.summaryValue,
                    {
                      color: status?.canWrite
                        ? backyrdTheme.color.success
                        : backyrdTheme.color.warning,
                    },
                  ]}
                >
                  {status?.canWrite
                    ? "Aktiv"
                    : "Vorübergehend gesperrt"}
                </Text>
              </View>

              <View style={styles.divider} />

              <View>
                <Text style={styles.summaryLabel}>
                  Punkte · letzte 90 Tage
                </Text>
                <Text style={styles.summaryValue}>
                  {status?.activePoints ?? 0}
                </Text>
              </View>
            </View>

            <Text style={styles.sectionTitle}>
              Massnahmen
            </Text>

            {measures.length === 0 ? (
              <View style={styles.emptyCard}>
                <Ionicons
                  name="shield-checkmark-outline"
                  size={28}
                  color={backyrdTheme.color.success}
                />
                <Text style={styles.emptyTitle}>
                  Keine Einträge im Verlauf
                </Text>
                <Text style={styles.emptyText}>
                  Hier erscheinen Hinweise zu Massnahmen für dein Konto.
                </Text>
              </View>
            ) : (
              measures.map((measure) => (
                <View
                  key={measure.id}
                  style={styles.measureCard}
                >
                  <View style={styles.measureTop}>
                    <Text style={styles.measureTitle}>
                      {labels[measure.measure_type] ??
                        "Weitere Massnahme"}
                    </Text>
                    <Text style={styles.statusPill}>
                      {({ active: "Aktiv", expired: "Abgelaufen", revoked: "Aufgehoben", acknowledged: "Zur Kenntnis genommen" } as Record<string, string>)[measure.status] ?? "Status nicht verfügbar"}
                    </Text>
                  </View>

                  <Text style={styles.measureText}>
                    {measure.public_explanation ??
                      "Für dein Konto liegt eine Sicherheitsmassnahme vor."}
                  </Text>

                  {measure.ends_at ? (
                    <Text style={styles.measureMeta}>
                      Gültig bis{" "}
                      {new Date(
                        measure.ends_at,
                      ).toLocaleString("de-CH")}
                    </Text>
                  ) : null}

                  {measure.measure_type === "warning" &&
                  measure.status === "active" ? (
                    <Pressable
                      onPress={() =>
                        void acknowledge(measure.id)
                      }
                      accessibilityRole="button" disabled={acknowledging !== null}
                      style={styles.ackButton}
                    >
                      <Text style={styles.ackButtonText}>
                        {acknowledging === measure.id ? "Wird bestätigt …" : "Zur Kenntnis genommen"}
                      </Text>
                    </Pressable>
                  ) : null}
                </View>
              ))
            )}
          </>
        )}
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  root: {
    flex: 1,
    backgroundColor: backyrdTheme.color.background,
  },
  content: {
    padding: 20,
    paddingBottom: 80,
  },
  summaryCard: {
    marginTop: 28,
    padding: 18,
    borderRadius: 24,
    backgroundColor: backyrdTheme.color.surface,
    borderWidth: 1,
    borderColor: backyrdTheme.color.border,
  },
  summaryLabel: {
    color: backyrdTheme.color.textSecondary,
    fontSize: 12,
    fontWeight: "800",
    textTransform: "uppercase",
    letterSpacing: 0.6,
  },
  summaryValue: {
    marginTop: 6,
    color: backyrdTheme.color.textPrimary,
    fontSize: 22,
    fontWeight: "900",
  },
  divider: {
    height: 1,
    marginVertical: 16,
    backgroundColor: backyrdTheme.color.surfaceElevated,
  },
  sectionTitle: {
    marginTop: 28,
    marginBottom: 12,
    color: backyrdTheme.color.textPrimary,
    fontSize: 21,
    fontWeight: "900",
  },
  emptyCard: {
    alignItems: "center",
    padding: 28,
    borderRadius: 22,
    backgroundColor: backyrdTheme.color.surface,
    borderWidth: 1,
    borderColor: backyrdTheme.color.border,
  },
  emptyTitle: {
    marginTop: 12,
    color: backyrdTheme.color.textPrimary,
    fontSize: 17,
    fontWeight: "900",
  },
  emptyText: {
    marginTop: 6,
    color: backyrdTheme.color.textSecondary,
    textAlign: "center",
  },
  measureCard: {
    marginBottom: 12,
    padding: 17,
    borderRadius: 20,
    backgroundColor: backyrdTheme.color.surface,
    borderWidth: 1,
    borderColor: backyrdTheme.color.border,
  },
  measureTop: {
    flexDirection: "row",
    justifyContent: "space-between",
    gap: 12,
  },
  measureTitle: {
    flex: 1,
    color: backyrdTheme.color.textPrimary,
    fontSize: 17,
    fontWeight: "900",
  },
  statusPill: {
    color: "#FFB35D",
    fontSize: 12,
    fontWeight: "800",
  },
  measureText: {
    marginTop: 10,
    color: backyrdTheme.color.textSecondary,
    fontSize: 14,
    lineHeight: 20,
  },
  measureMeta: {
    marginTop: 10,
    color: backyrdTheme.color.textSecondary,
    fontSize: 12,
  },
  ackButton: {
    marginTop: 15,
    minHeight: 46,
    borderRadius: 15,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: "rgba(255,79,139,0.12)",
    borderWidth: 1,
    borderColor: "rgba(255,79,139,0.24)",
  },
  ackButtonText: {
    color: backyrdTheme.color.pink,
    fontWeight: "900",
  },
});
