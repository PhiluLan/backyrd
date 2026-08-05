import { Ionicons } from "@expo/vector-icons";
import { Stack, useRouter } from "expo-router";
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

import AppealDecisionButton from "../components/safety/AppealDecisionButton";
import { supabase } from "../lib/supabase";

type SafetyReport = {
  report_id: string;
  report_reason: string;
  report_status: string;
  report_details: string | null;
  source_surface: string | null;
  created_at: string;
  reviewed_at: string | null;
  resolution_note: string | null;
  case_id: string | null;
  content_item_id: string;
  content_type: string;
  entity_type: string;
  entity_id: string;
  spot_id: string | null;
  text_content: string | null;
  image_urls: string[];
  lifecycle_status: string;
  case_status: string | null;
  final_action: string | null;
  explanation_public: string | null;
};

type SafetyCenterTab = "decisions" | "reports";

type SafetyAction = {
  case_id: string;
  content_item_id: string;
  content_type: string;
  entity_type: string;
  entity_id: string;
  spot_id: string | null;
  text_content: string | null;
  image_urls: string[];
  lifecycle_status: string;
  final_action: string;
  final_category: string | null;
  final_severity: number | null;
  explanation_public: string | null;
  explanation_code: string | null;
  decided_at: string | null;
  appeal_id: string | null;
  appeal_status: string | null;
  appeal_outcome: string | null;
  appeal_reason: string | null;
  appeal_statement: string | null;
  appeal_submitted_at: string | null;
};

const actionLabels: Record<string, string> = {
  limit: "Inhalt begrenzt",
  temporary_hide: "Inhalt ausgeblendet",
  remove: "Inhalt entfernt",
  allow: "Inhalt wiederhergestellt",
};

const reportReasonLabels: Record<string, string> = {
  hate_discrimination: "Hass oder Diskriminierung",
  harassment: "Belästigung oder Mobbing",
  violence: "Gewalt oder Drohungen",
  sexual: "Sexuelle Inhalte",
  self_harm: "Selbstgefährdung",
  spam_fraud: "Spam oder Betrug",
  false_spot_info: "Falsche Spot-Informationen",
  privacy: "Privatsphäre",
  illegal_dangerous: "Illegal oder gefährlich",
  other: "Anderer Grund",
};

const reportStatusLabels: Record<string, string> = {
  submitted: "Eingereicht",
  attached_to_case: "In Prüfung",
  under_review: "In Prüfung",
  resolved_actioned: "Maßnahme ergriffen",
  resolved_no_violation: "Kein Verstoß festgestellt",
};

const categoryLabels: Record<string, string> = {
  hate: "Hass oder Diskriminierung",
  harassment: "Belästigung oder Ausgrenzung",
  violence: "Gewalt",
  sexual: "Sexuelle Inhalte",
  self_harm: "Selbstgefährdung",
  illicit: "Illegale oder gefährliche Inhalte",
};

function formatDate(value: string | null) {
  if (!value) return "—";

  return new Date(value).toLocaleDateString("de-CH", {
    day: "2-digit",
    month: "long",
    year: "numeric",
  });
}

export default function SafetyCenterScreen() {
  const router = useRouter();
  const insets = useSafeAreaInsets();

  const [tab, setTab] = useState<SafetyCenterTab>("decisions");
  const [items, setItems] = useState<SafetyAction[]>([]);
  const [reports, setReports] = useState<SafetyReport[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState("");

  const load = useCallback(async (refresh = false) => {
    if (refresh) setRefreshing(true);
    else setLoading(true);

    setError("");

    const [actionsResult, reportsResult] = await Promise.all([
      supabase.rpc("safety_my_actions_v1", {
        p_limit: 100,
      }),
      supabase.rpc("safety_my_reports_v1", {
        p_limit: 100,
      }),
    ]);

    if (actionsResult.error || reportsResult.error) {
      setError(
        actionsResult.error?.message ??
          reportsResult.error?.message ??
          "Safety Center konnte nicht geladen werden.",
      );
    } else {
      setItems(
        (actionsResult.data ?? []) as SafetyAction[],
      );
      setReports(
        (reportsResult.data ?? []) as SafetyReport[],
      );
    }

    setLoading(false);
    setRefreshing(false);
  }, []);

  useFocusEffect(
    useCallback(() => {
      void load();
    }, [load]),
  );

  return (
    <View style={styles.root}>
      <Stack.Screen options={{ headerShown: false }} />

      <View
        style={[
          styles.header,
          { paddingTop: insets.top + 10 },
        ]}
      >
        <Pressable
          onPress={() => router.back()}
          style={styles.backButton}
        >
          <Ionicons
            name="chevron-back"
            size={22}
            color="#fff"
          />
        </Pressable>

        <View style={{ flex: 1 }}>
          <Text style={styles.eyebrow}>
            SAFETY & INTEGRITY
          </Text>
          <Text style={styles.title}>
            Safety Center
          </Text>
        </View>
      </View>

      {loading ? (
        <View style={styles.center}>
          <ActivityIndicator color="#FF4F8B" />
        </View>
      ) : (
        <ScrollView
          contentContainerStyle={[
            styles.content,
            { paddingBottom: insets.bottom + 40 },
          ]}
          refreshControl={
            <RefreshControl
              refreshing={refreshing}
              onRefresh={() => void load(true)}
              tintColor="#FF4F8B"
            />
          }
        >
          <Pressable
            onPress={() => router.push("/safety-notifications" as never)}
            style={{padding:16,borderRadius:18,marginBottom:14,flexDirection:"row",alignItems:"center",gap:12,backgroundColor:"rgba(255,79,139,0.08)",borderWidth:1,borderColor:"rgba(255,79,139,0.20)"}}
          >
            <Ionicons name="notifications-outline" size={22} color="#FF7DA7" />
            <View style={{flex:1}}>
              <Text style={{color:"#FFFFFF",fontSize:16,fontWeight:"850"}}>Safety-Mitteilungen</Text>
              <Text style={{color:"rgba(255,255,255,0.58)",marginTop:3}}>Entscheidungen, Einsprüche und Kontomaßnahmen</Text>
            </View>
            <Ionicons name="chevron-forward" size={20} color="rgba(255,255,255,0.58)" />
          </Pressable>

          <Text style={styles.intro}>
            Prüfe Entscheidungen zu deinen eigenen Inhalten
            und verfolge Meldungen, die du eingereicht hast.
          </Text>

          <View style={styles.tabShell}>
            <Pressable
              onPress={() => setTab("decisions")}
              style={[
                styles.tabButton,
                tab === "decisions" &&
                  styles.tabButtonActive,
              ]}
            >
              <Text
                style={[
                  styles.tabText,
                  tab === "decisions" &&
                    styles.tabTextActive,
                ]}
              >
                Meine Inhalte
              </Text>
            </Pressable>

            <Pressable
              onPress={() => setTab("reports")}
              style={[
                styles.tabButton,
                tab === "reports" &&
                  styles.tabButtonActive,
              ]}
            >
              <Text
                style={[
                  styles.tabText,
                  tab === "reports" &&
                    styles.tabTextActive,
                ]}
              >
                Meine Meldungen
              </Text>

              {reports.length > 0 ? (
                <View style={styles.tabBadge}>
                  <Text style={styles.tabBadgeText}>
                    {reports.length}
                  </Text>
                </View>
              ) : null}
            </Pressable>
          </View>

          {error ? (
            <View style={styles.errorCard}>
              <Text style={styles.errorText}>{error}</Text>
            </View>
          ) : null}

          {!error &&
          tab === "decisions" &&
          items.length === 0 ? (
            <View style={styles.emptyCard}>
              <View style={styles.emptyIcon}>
                <Ionicons
                  name="shield-checkmark-outline"
                  size={30}
                  color="#fff"
                />
              </View>
              <Text style={styles.emptyTitle}>
                Keine Moderationsmaßnahmen
              </Text>
              <Text style={styles.emptyText}>
                Zu deinen Inhalten liegen aktuell keine
                anfechtbaren Entscheidungen vor.
              </Text>
            </View>
          ) : null}

          {tab === "decisions"
            ? items.map((item) => {
            const appealOpen =
              item.appeal_status === "submitted" ||
              item.appeal_status === "in_review";

            const appealDecided =
              item.appeal_status === "decided";

            return (
              <View key={item.case_id} style={styles.card}>
                <View style={styles.cardHeader}>
                  <View style={{ flex: 1 }}>
                    <Text style={styles.cardEyebrow}>
                      {item.content_type === "review"
                        ? "MOMENT"
                        : "INHALT"}
                    </Text>

                    <Text style={styles.actionTitle}>
                      {actionLabels[item.final_action] ??
                        item.final_action}
                    </Text>

                    <Text style={styles.date}>
                      {formatDate(item.decided_at)}
                    </Text>
                  </View>

                  <View style={styles.statusPill}>
                    <Text style={styles.statusText}>
                      {appealOpen
                        ? "Einspruch offen"
                        : appealDecided
                          ? item.appeal_outcome === "overturned"
                            ? "Wiederhergestellt"
                            : "Einspruch entschieden"
                          : "Entschieden"}
                    </Text>
                  </View>
                </View>

                <View style={styles.preview}>
                  <Text
                    style={styles.previewText}
                    numberOfLines={5}
                  >
                    {item.text_content ||
                      "Kein Textinhalt vorhanden."}
                  </Text>
                </View>

                <View style={styles.metaRow}>
                  <View style={{ flex: 1 }}>
                    <Text style={styles.metaLabel}>
                      Kategorie
                    </Text>
                    <Text style={styles.metaValue}>
                      {categoryLabels[
                        item.final_category ?? ""
                      ] ??
                        item.final_category ??
                        "Nicht angegeben"}
                    </Text>
                  </View>

                  <View style={{ flex: 1 }}>
                    <Text style={styles.metaLabel}>
                      Status
                    </Text>
                    <Text style={styles.metaValue}>
                      {item.lifecycle_status === "removed"
                        ? "Nicht sichtbar"
                        : item.lifecycle_status === "hidden"
                          ? "Ausgeblendet"
                          : item.lifecycle_status === "limited"
                            ? "Begrenzt"
                            : "Live"}
                    </Text>
                  </View>
                </View>

                {item.explanation_public ? (
                  <View style={styles.reasonBox}>
                    <Text style={styles.metaLabel}>
                      Begründung
                    </Text>
                    <Text style={styles.reasonText}>
                      {item.explanation_public}
                    </Text>
                  </View>
                ) : null}

                {appealOpen ? (
                  <View style={styles.appealNotice}>
                    <Ionicons
                      name="time-outline"
                      size={19}
                      color="#FFBA62"
                    />
                    <Text style={styles.appealNoticeText}>
                      Dein Einspruch wird geprüft.
                    </Text>
                  </View>
                ) : appealDecided ? (
                  <View style={styles.appealNotice}>
                    <Ionicons
                      name={
                        item.appeal_outcome === "overturned"
                          ? "checkmark-circle-outline"
                          : "information-circle-outline"
                      }
                      size={19}
                      color={
                        item.appeal_outcome === "overturned"
                          ? "#7FDBA5"
                          : "#A8A8B0"
                      }
                    />
                    <Text style={styles.appealNoticeText}>
                      {item.appeal_outcome === "overturned"
                        ? "Der Einspruch wurde angenommen."
                        : item.appeal_outcome === "modified"
                          ? "Die Maßnahme wurde angepasst."
                          : "Die ursprüngliche Entscheidung wurde bestätigt."}
                    </Text>
                  </View>
                ) : (
                  <AppealDecisionButton
                    caseId={item.case_id}
                    contentPreview={item.text_content}
                    onSubmitted={() => void load(true)}
                  />
                )}
              </View>
            );
          })
            : reports.length === 0 ? (
                <View style={styles.emptyCard}>
                  <View style={styles.emptyIcon}>
                    <Ionicons
                      name="flag-outline"
                      size={30}
                      color="#fff"
                    />
                  </View>
                  <Text style={styles.emptyTitle}>
                    Noch keine Meldungen
                  </Text>
                  <Text style={styles.emptyText}>
                    Von dir gemeldete Inhalte und deren
                    Bearbeitungsstatus erscheinen hier.
                  </Text>
                </View>
              ) : (
                reports.map((report) => (
                  <View
                    key={report.report_id}
                    style={styles.card}
                  >
                    <View style={styles.cardHeader}>
                      <View style={{ flex: 1 }}>
                        <Text style={styles.cardEyebrow}>
                          DEINE MELDUNG
                        </Text>
                        <Text style={styles.actionTitle}>
                          {reportReasonLabels[
                            report.report_reason
                          ] ?? report.report_reason}
                        </Text>
                        <Text style={styles.date}>
                          {formatDate(report.created_at)}
                        </Text>
                      </View>

                      <View style={styles.statusPill}>
                        <Text style={styles.statusText}>
                          {reportStatusLabels[
                            report.report_status
                          ] ?? report.report_status}
                        </Text>
                      </View>
                    </View>

                    <View style={styles.preview}>
                      <Text
                        style={styles.previewText}
                        numberOfLines={5}
                      >
                        {report.text_content ||
                          "Kein Textinhalt vorhanden."}
                      </Text>
                    </View>

                    <View style={styles.metaRow}>
                      <View style={{ flex: 1 }}>
                        <Text style={styles.metaLabel}>
                          Inhalt
                        </Text>
                        <Text style={styles.metaValue}>
                          {report.content_type === "review"
                            ? "Moment / Review"
                            : report.content_type}
                        </Text>
                      </View>

                      <View style={{ flex: 1 }}>
                        <Text style={styles.metaLabel}>
                          Ergebnis
                        </Text>
                        <Text style={styles.metaValue}>
                          {report.final_action === "remove"
                            ? "Inhalt entfernt"
                            : report.final_action ===
                                "temporary_hide"
                              ? "Inhalt ausgeblendet"
                              : report.final_action === "limit"
                                ? "Inhalt begrenzt"
                                : report.final_action === "allow"
                                  ? "Kein Verstoß"
                                  : "Wird geprüft"}
                        </Text>
                      </View>
                    </View>

                    {report.report_details ? (
                      <View style={styles.reasonBox}>
                        <Text style={styles.metaLabel}>
                          Deine Angaben
                        </Text>
                        <Text style={styles.reasonText}>
                          {report.report_details}
                        </Text>
                      </View>
                    ) : null}

                    {report.explanation_public ||
                    report.resolution_note ? (
                      <View style={styles.reasonBox}>
                        <Text style={styles.metaLabel}>
                          Rückmeldung
                        </Text>
                        <Text style={styles.reasonText}>
                          {report.resolution_note ??
                            report.explanation_public}
                        </Text>
                      </View>
                    ) : null}
                  </View>
                ))
              )}
        </ScrollView>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  root: {
    flex: 1,
    backgroundColor: "#0A0A0B",
  },
  header: {
    flexDirection: "row",
    alignItems: "center",
    gap: 14,
    paddingHorizontal: 20,
    paddingBottom: 18,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: "rgba(255,255,255,0.08)",
  },
  backButton: {
    width: 44,
    height: 44,
    borderRadius: 22,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: "rgba(255,255,255,0.055)",
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.08)",
  },
  eyebrow: {
    color: "#FF4F8B",
    fontSize: 10,
    fontWeight: "800",
    letterSpacing: 1.1,
    marginBottom: 4,
  },
  title: {
    color: "#fff",
    fontSize: 25,
    lineHeight: 30,
    fontWeight: "850",
  },
  content: {
    padding: 20,
  },
  tabShell: {
    minHeight: 54,
    marginBottom: 20,
    padding: 4,
    borderRadius: 27,
    flexDirection: "row",
    backgroundColor: "#111113",
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.08)",
  },
  tabButton: {
    flex: 1,
    minHeight: 44,
    borderRadius: 23,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 7,
  },
  tabButtonActive: {
    backgroundColor: "#FFFFFF",
  },
  tabText: {
    color: "#91919A",
    fontSize: 13,
    fontWeight: "800",
  },
  tabTextActive: {
    color: "#0A0A0B",
  },
  tabBadge: {
    minWidth: 20,
    height: 20,
    borderRadius: 10,
    paddingHorizontal: 6,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: "#FF4F8B",
  },
  tabBadgeText: {
    color: "#FFFFFF",
    fontSize: 10,
    fontWeight: "900",
  },
  intro: {
    color: "#9B9BA4",
    fontSize: 14,
    lineHeight: 21,
    marginBottom: 20,
  },
  center: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
  },
  card: {
    padding: 17,
    borderRadius: 23,
    backgroundColor: "#111113",
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.09)",
    marginBottom: 14,
  },
  cardHeader: {
    flexDirection: "row",
    gap: 12,
    alignItems: "flex-start",
  },
  cardEyebrow: {
    color: "#85858E",
    fontSize: 10,
    fontWeight: "800",
    letterSpacing: 1,
    marginBottom: 5,
  },
  actionTitle: {
    color: "#fff",
    fontSize: 19,
    lineHeight: 24,
    fontWeight: "800",
  },
  date: {
    color: "#85858E",
    fontSize: 12,
    marginTop: 4,
  },
  statusPill: {
    paddingHorizontal: 9,
    paddingVertical: 6,
    borderRadius: 999,
    backgroundColor: "rgba(255,184,84,0.08)",
    borderWidth: 1,
    borderColor: "rgba(255,184,84,0.18)",
  },
  statusText: {
    color: "#FFBD67",
    fontSize: 10,
    fontWeight: "800",
  },
  preview: {
    marginTop: 16,
    padding: 14,
    borderRadius: 15,
    backgroundColor: "rgba(0,0,0,0.24)",
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.07)",
  },
  previewText: {
    color: "#DCDCE1",
    fontSize: 14,
    lineHeight: 20,
  },
  metaRow: {
    flexDirection: "row",
    gap: 16,
    marginTop: 16,
  },
  metaLabel: {
    color: "#7F7F88",
    fontSize: 10,
    fontWeight: "800",
    letterSpacing: 0.8,
    textTransform: "uppercase",
  },
  metaValue: {
    color: "#ECECEF",
    fontSize: 13,
    lineHeight: 18,
    fontWeight: "700",
    marginTop: 4,
  },
  reasonBox: {
    marginTop: 16,
  },
  reasonText: {
    color: "#B9B9C0",
    fontSize: 13,
    lineHeight: 19,
    marginTop: 5,
  },
  appealNotice: {
    minHeight: 46,
    flexDirection: "row",
    alignItems: "center",
    gap: 9,
    marginTop: 18,
    paddingHorizontal: 13,
    borderRadius: 14,
    backgroundColor: "rgba(255,255,255,0.035)",
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.07)",
  },
  appealNoticeText: {
    flex: 1,
    color: "#C9C9CF",
    fontSize: 13,
    lineHeight: 18,
    fontWeight: "650",
  },
  emptyCard: {
    alignItems: "center",
    padding: 28,
    borderRadius: 23,
    backgroundColor: "#111113",
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.08)",
  },
  emptyIcon: {
    width: 60,
    height: 60,
    borderRadius: 20,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: "rgba(255,255,255,0.05)",
    marginBottom: 16,
  },
  emptyTitle: {
    color: "#fff",
    fontSize: 19,
    fontWeight: "800",
    textAlign: "center",
  },
  emptyText: {
    color: "#92929B",
    fontSize: 13,
    lineHeight: 19,
    textAlign: "center",
    marginTop: 7,
  },
  errorCard: {
    padding: 14,
    marginBottom: 14,
    borderRadius: 15,
    backgroundColor: "rgba(255,70,70,0.08)",
    borderWidth: 1,
    borderColor: "rgba(255,80,80,0.20)",
  },
  errorText: {
    color: "#FF9292",
    fontSize: 13,
    lineHeight: 19,
  },
});
