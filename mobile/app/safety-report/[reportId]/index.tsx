import { Ionicons } from "@expo/vector-icons";
import { Stack, useLocalSearchParams, useRouter } from "expo-router";
import React, { useCallback, useState } from "react";
import {
  ActivityIndicator,
  Pressable,
  RefreshControl,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from "react-native";
import { useFocusEffect } from "@react-navigation/native";
import { useSafeAreaInsets } from "react-native-safe-area-context";

import { supabase } from "../../../lib/supabase";

type SafetyReport = {
  report_id: string;
  report_reason: string;
  report_status: string;
  report_details: string | null;
  created_at: string;
  reviewed_at: string | null;
  resolution_note: string | null;
  case_status: string | null;
  content_type: string;
  text_content: string | null;
  final_action: string | null;
  explanation_public: string | null;
};

const reasonLabels: Record<string, string> = {
  hate_discrimination: "Hass oder Diskriminierung",
  harassment: "Belästigung oder Mobbing",
  harassment_bullying: "Belästigung oder Mobbing",
  violence: "Gewalt oder Drohungen",
  violence_threat: "Gewalt oder Drohungen",
  sexual: "Sexuelle Inhalte",
  sexual_content: "Sexuelle Inhalte",
  self_harm: "Selbstgefährdung",
  spam_fraud: "Spam oder Betrug",
  false_spot_info: "Falsche Spot-Informationen",
  false_spot_information: "Falsche Spot-Informationen",
  privacy: "Privatsphäre",
  privacy_personal_data: "Privatsphäre",
  illegal_dangerous: "Illegal oder gefährlich",
  illegal_dangerous_goods: "Illegal oder gefährlich",
  other: "Anderer Grund",
};

const statusLabels: Record<string, string> = {
  submitted: "Eingereicht",
  attached_to_case: "In Prüfung",
  under_review: "In Prüfung",
  resolved_actioned: "Maßnahme erfolgt",
  resolved_no_violation: "Kein Verstoß festgestellt",
};

function formatDate(value: string | null) {
  if (!value) return "—";
  return new Date(value).toLocaleString("de-CH");
}

export default function SafetyReportDetailScreen() {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const params = useLocalSearchParams<{ reportId: string }>();
  const reportId = String(params.reportId ?? "");

  const [report, setReport] = useState<SafetyReport | null>(null);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState("");

  const load = useCallback(async (refresh = false) => {
    if (refresh) setRefreshing(true);
    else setLoading(true);
    setError("");

    const { data, error: rpcError } = await supabase.rpc(
      "safety_my_reports_v1",
      { p_limit: 250 },
    );

    if (rpcError) {
      setError(rpcError.message);
      setReport(null);
    } else {
      const rows = (data ?? []) as SafetyReport[];
      const found = rows.find((item) => item.report_id === reportId) ?? null;
      if (!found) setError("Meldung wurde nicht gefunden.");
      setReport(found);
    }

    setLoading(false);
    setRefreshing(false);
  }, [reportId]);

  useFocusEffect(useCallback(() => { void load(); }, [load]));

  return (
    <View style={styles.root}>
      <Stack.Screen options={{ headerShown: false }} />
      <View style={[styles.header, { paddingTop: insets.top + 10 }]}>
        <Pressable onPress={() => router.back()} style={styles.backButton}>
          <Ionicons name="chevron-back" size={22} color="#FFFFFF" />
        </Pressable>
        <View style={{ flex: 1 }}>
          <Text style={styles.eyebrow}>DEINE MELDUNG</Text>
          <Text style={styles.title}>Meldungsdetails</Text>
        </View>
      </View>

      {loading ? (
        <View style={styles.center}><ActivityIndicator color="#FF4F8B" /></View>
      ) : (
        <ScrollView
          contentContainerStyle={[styles.content, { paddingBottom: insets.bottom + 40 }]}
          refreshControl={<RefreshControl refreshing={refreshing} onRefresh={() => void load(true)} tintColor="#FF4F8B" />}
        >
          {error ? <View style={styles.errorCard}><Text style={styles.errorText}>{error}</Text></View> : null}
          {report ? (
            <>
              <View style={styles.heroCard}>
                <Text style={styles.heroEyebrow}>MELDEGRUND</Text>
                <Text style={styles.heroTitle}>
                  {reasonLabels[report.report_reason] ?? report.report_reason.replaceAll("_", " ")}
                </Text>
                <View style={styles.statusPill}>
                  <Text style={styles.statusText}>
                    {statusLabels[report.report_status] ?? report.report_status}
                  </Text>
                </View>
                <Text style={styles.date}>Eingereicht am {formatDate(report.created_at)}</Text>
              </View>

              <Section title="Gemeldeter Inhalt">
                <Text style={styles.bodyText}>{report.text_content || "Kein Textinhalt vorhanden."}</Text>
              </Section>

              <Section title="Deine Angaben">
                <Text style={styles.bodyText}>{report.report_details || "Keine zusätzlichen Angaben."}</Text>
              </Section>

              <Section title="Bearbeitungsstand">
                <Row label="Inhaltstyp" value={report.content_type === "review" ? "Moment / Review" : report.content_type} />
                <Row label="Fallstatus" value={report.case_status ?? "Noch keinem Fall zugeordnet"} />
                <Row label="Ergebnis" value={
                  report.final_action === "remove" ? "Inhalt entfernt" :
                  report.final_action === "temporary_hide" ? "Inhalt ausgeblendet" :
                  report.final_action === "limit" ? "Inhalt begrenzt" :
                  report.final_action === "allow" ? "Kein Verstoß" : "Wird geprüft"
                } />
                <Row label="Geprüft am" value={formatDate(report.reviewed_at)} />
              </Section>

              <Section title="Rückmeldung von Backyrd">
                <Text style={styles.bodyText}>
                  {report.resolution_note ?? report.explanation_public ?? "Die Meldung wird noch geprüft."}
                </Text>
              </Section>

              <View style={styles.infoCard}>
                <Ionicons name="information-circle-outline" size={22} color="#FF7DA7" />
                <Text style={styles.infoText}>
                  Aus Datenschutzgründen zeigen wir keine Kontomaßnahmen oder persönlichen Details der gemeldeten Person.
                </Text>
              </View>
            </>
          ) : null}
        </ScrollView>
      )}
    </View>
  );
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return <View style={styles.section}><Text style={styles.sectionTitle}>{title}</Text>{children}</View>;
}

function Row({ label, value }: { label: string; value: string }) {
  return <View style={styles.row}><Text style={styles.rowLabel}>{label}</Text><Text style={styles.rowValue}>{value}</Text></View>;
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: "#0A0A0B" },
  header: { flexDirection: "row", alignItems: "center", gap: 14, paddingHorizontal: 20, paddingBottom: 18, borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: "rgba(255,255,255,0.08)" },
  backButton: { width: 44, height: 44, borderRadius: 22, alignItems: "center", justifyContent: "center", backgroundColor: "rgba(255,255,255,0.055)", borderWidth: 1, borderColor: "rgba(255,255,255,0.08)" },
  eyebrow: { color: "#FF4F8B", fontSize: 10, fontWeight: "800", letterSpacing: 1.1 },
  title: { color: "#FFFFFF", fontSize: 25, fontWeight: "850", marginTop: 4 },
  center: { flex: 1, alignItems: "center", justifyContent: "center" },
  content: { padding: 20, gap: 14 },
  errorCard: { padding: 16, borderRadius: 16, backgroundColor: "rgba(255,82,82,0.10)" },
  errorText: { color: "#FF9C9C" },
  heroCard: { padding: 20, borderRadius: 24, backgroundColor: "#111113", borderWidth: 1, borderColor: "rgba(255,255,255,0.09)" },
  heroEyebrow: { color: "#85858E", fontSize: 10, fontWeight: "800", letterSpacing: 1 },
  heroTitle: { color: "#FFFFFF", fontSize: 25, lineHeight: 31, fontWeight: "900", marginTop: 7 },
  statusPill: { alignSelf: "flex-start", marginTop: 14, paddingHorizontal: 10, paddingVertical: 7, borderRadius: 999, backgroundColor: "rgba(255,184,84,0.08)", borderWidth: 1, borderColor: "rgba(255,184,84,0.18)" },
  statusText: { color: "#FFBD67", fontSize: 11, fontWeight: "800" },
  date: { color: "#85858E", marginTop: 12 },
  section: { padding: 18, borderRadius: 20, backgroundColor: "#111113", borderWidth: 1, borderColor: "rgba(255,255,255,0.09)" },
  sectionTitle: { color: "#85858E", fontSize: 11, fontWeight: "800", letterSpacing: 1, marginBottom: 12, textTransform: "uppercase" },
  bodyText: { color: "#E2E2E6", fontSize: 16, lineHeight: 24 },
  row: { flexDirection: "row", justifyContent: "space-between", gap: 20, paddingVertical: 11, borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: "rgba(255,255,255,0.07)" },
  rowLabel: { color: "#85858E", flex: 1 },
  rowValue: { color: "#FFFFFF", fontWeight: "700", flex: 1, textAlign: "right" },
  infoCard: { padding: 17, borderRadius: 18, flexDirection: "row", gap: 12, backgroundColor: "rgba(255,79,139,0.07)", borderWidth: 1, borderColor: "rgba(255,79,139,0.18)" },
  infoText: { flex: 1, color: "rgba(255,255,255,0.66)", lineHeight: 21 },
});
