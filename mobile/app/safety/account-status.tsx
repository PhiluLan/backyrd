import { Ionicons } from "@expo/vector-icons";
import { useFocusEffect, useRouter } from "expo-router";
import React, { useCallback, useState } from "react";
import {
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from "react-native";
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

  const load = useCallback(async () => {
    setLoading(true);

    const nextStatus = await getSafetyWriteStatus();

    const { data } = await supabase
      .from("safety_account_measures")
      .select(
        "id,measure_type,status,ends_at,public_explanation,reason_code,created_at",
      )
      .order("created_at", { ascending: false })
      .limit(20);

    setStatus(nextStatus);
    setMeasures((data ?? []) as Measure[]);
    setLoading(false);
  }, []);

  useFocusEffect(
    useCallback(() => {
      void load();
    }, [load]),
  );

  async function acknowledge(measureId: string) {
    await supabase.rpc(
      "safety_acknowledge_warning_v1",
      { p_measure_id: measureId },
    );
    await load();
  }

  return (
    <SafeAreaView style={styles.root}>
      <View style={styles.header}>
        <Pressable
          onPress={() => router.back()}
          style={styles.iconButton}
        >
          <Ionicons
            name="chevron-back"
            size={24}
            color="#fff"
          />
        </Pressable>

        <Text style={styles.headerTitle}>
          Account-Sicherheit
        </Text>

        <View style={styles.iconButton} />
      </View>

      <ScrollView
        contentContainerStyle={styles.content}
      >
        <Text style={styles.kicker}>
          SAFETY & INTEGRITY
        </Text>
        <Text style={styles.title}>
          Dein Account-Status
        </Text>
        <Text style={styles.subtitle}>
          Hier siehst du Verwarnungen,
          Schreibsperren und laufende Maßnahmen.
        </Text>

        {loading ? (
          <StateView kind="loading" title="Account-Status wird geladen" />
        ) : (
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
                        ? "#7CDD9F"
                        : "#FF9B68",
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
              Maßnahmen
            </Text>

            {measures.length === 0 ? (
              <View style={styles.emptyCard}>
                <Ionicons
                  name="shield-checkmark-outline"
                  size={28}
                  color="#7CDD9F"
                />
                <Text style={styles.emptyTitle}>
                  Keine aktiven Maßnahmen
                </Text>
                <Text style={styles.emptyText}>
                  Dein Account ist ohne Einschränkungen aktiv.
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
                        measure.measure_type}
                    </Text>
                    <Text style={styles.statusPill}>
                      {measure.status}
                    </Text>
                  </View>

                  <Text style={styles.measureText}>
                    {measure.public_explanation ??
                      "Für deinen Account gilt eine Safety-Maßnahme."}
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
                      style={styles.ackButton}
                    >
                      <Text style={styles.ackButtonText}>
                        Zur Kenntnis genommen
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
    backgroundColor: "#050506",
  },
  header: {
    minHeight: 58,
    paddingHorizontal: 18,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
  },
  iconButton: {
    width: 42,
    height: 42,
    borderRadius: 21,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: "rgba(255,255,255,0.055)",
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.09)",
  },
  headerTitle: {
    color: "#fff",
    fontSize: 17,
    fontWeight: "800",
  },
  content: {
    padding: 20,
    paddingBottom: 80,
  },
  kicker: {
    color: "#FF4F91",
    fontSize: 12,
    fontWeight: "900",
    letterSpacing: 2.5,
  },
  title: {
    marginTop: 12,
    color: "#fff",
    fontSize: 38,
    lineHeight: 41,
    fontWeight: "900",
    letterSpacing: -1,
  },
  subtitle: {
    marginTop: 10,
    color: "#8E8E98",
    fontSize: 15,
    lineHeight: 22,
  },
  summaryCard: {
    marginTop: 28,
    padding: 18,
    borderRadius: 24,
    backgroundColor: "rgba(255,255,255,0.04)",
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.09)",
  },
  summaryLabel: {
    color: "#85858E",
    fontSize: 12,
    fontWeight: "800",
    textTransform: "uppercase",
    letterSpacing: 0.6,
  },
  summaryValue: {
    marginTop: 6,
    color: "#fff",
    fontSize: 22,
    fontWeight: "900",
  },
  divider: {
    height: 1,
    marginVertical: 16,
    backgroundColor: "rgba(255,255,255,0.07)",
  },
  sectionTitle: {
    marginTop: 28,
    marginBottom: 12,
    color: "#fff",
    fontSize: 21,
    fontWeight: "900",
  },
  emptyCard: {
    alignItems: "center",
    padding: 28,
    borderRadius: 22,
    backgroundColor: "rgba(255,255,255,0.03)",
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.08)",
  },
  emptyTitle: {
    marginTop: 12,
    color: "#fff",
    fontSize: 17,
    fontWeight: "900",
  },
  emptyText: {
    marginTop: 6,
    color: "#85858E",
    textAlign: "center",
  },
  measureCard: {
    marginBottom: 12,
    padding: 17,
    borderRadius: 20,
    backgroundColor: "rgba(255,255,255,0.035)",
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.08)",
  },
  measureTop: {
    flexDirection: "row",
    justifyContent: "space-between",
    gap: 12,
  },
  measureTitle: {
    flex: 1,
    color: "#fff",
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
    color: "#B0B0B8",
    fontSize: 14,
    lineHeight: 20,
  },
  measureMeta: {
    marginTop: 10,
    color: "#777780",
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
    color: "#FF4F91",
    fontWeight: "900",
  },
});
