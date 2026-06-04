import React, { useCallback, useEffect, useMemo, useState } from "react";
import {
  ActivityIndicator,
  Alert,
  Pressable,
  RefreshControl,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from "react-native";
import { Stack, useRouter } from "expo-router";
import { SafeAreaView } from "react-native-safe-area-context";
import { Ionicons } from "@expo/vector-icons";

import { supabase } from "@/lib/supabase";

type VisitStatus =
  | "visited_reviewed"
  | "confirmed_needs_review"
  | "opened_needs_review"
  | "suggested_needs_review"
  | string;

type CandidateRow = {
  decision_id: string;
  decision_created_at: string;
  city: string | null;
  mood_a_text: string | null;
  mood_b_text: string | null;
  spot_id: string;
  spot_name: string;
  spot_city: string | null;
  category_name: string | null;
  rank: number | null;
  why_this: string | null;
  last_action: string | null;
  last_action_at: string | null;
  review_id: string | null;
  reviewed_at: string | null;
  status: VisitStatus;
  prompt_title: string;
  prompt_body: string;
  signal_score: number | string | null;
};

type FilterMode = "smart" | "open" | "done";

function fmtDate(ts?: string | null) {
  if (!ts) return "gerade";
  try {
    return new Date(ts).toLocaleString("de-DE", {
      day: "2-digit",
      month: "short",
      hour: "2-digit",
      minute: "2-digit",
    });
  } catch {
    return ts;
  }
}

function fmtShortTime(ts?: string | null) {
  if (!ts) return "";
  const then = new Date(ts).getTime();
  const diff = Math.max(0, Date.now() - then);
  const minutes = Math.floor(diff / 60000);
  if (minutes < 60) return `${Math.max(1, minutes)} Min.`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours} Std.`;
  const days = Math.floor(hours / 24);
  return `${days} Tg.`;
}

function moodLine(row: CandidateRow) {
  return [row.mood_a_text, row.mood_b_text].filter(Boolean).join(" + ");
}

function isDone(row: CandidateRow) {
  return row.status === "visited_reviewed" || Boolean(row.review_id);
}

function isStrongOpen(row: CandidateRow) {
  return row.status === "confirmed_needs_review" || row.status === "opened_needs_review";
}

function statusCopy(row: CandidateRow) {
  if (isDone(row)) {
    return {
      eyebrow: "Besuch erkannt",
      title: "Aus Decision wurde Moment",
      body:
        "Backyrd hat erkannt: Du hast diesen Spot nach deiner Suche bewertet. Genau dieses Signal macht deine Empfehlungen smarter.",
      icon: "sparkles" as const,
      tone: "success" as const,
    };
  }

  if (row.status === "confirmed_needs_review") {
    return {
      eyebrow: "Starkes Signal",
      title: "Wie war es wirklich?",
      body:
        "Du hast diesen Spot aktiv markiert. Eine kurze Review macht daraus einen Backyrd Treffer.",
      icon: "checkmark-circle" as const,
      tone: "warm" as const,
    };
  }

  if (row.status === "opened_needs_review") {
    return {
      eyebrow: "Follow-up",
      title: "Warst du inzwischen da?",
      body:
        "Du hast dir den Spot genauer angeschaut. Falls du dort warst, speichere kurz den Moment.",
      icon: "location" as const,
      tone: "neutral" as const,
    };
  }

  return {
    eyebrow: "Vielleicht passend",
    title: "Hat der Tipp gepasst?",
    body:
      "Dieser Spot war weit oben in deiner Auswahl. Wenn du dort warst, lernt Backyrd extrem viel daraus.",
    icon: "help-circle" as const,
    tone: "neutral" as const,
  };
}

function encodeParam(value?: string | number | null) {
  if (value === null || value === undefined) return "";
  return encodeURIComponent(String(value));
}

export default function DecisionHistoryScreen() {
  const router = useRouter();

  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [rows, setRows] = useState<CandidateRow[]>([]);
  const [filter, setFilter] = useState<FilterMode>("smart");

  const load = useCallback(async (mode: "initial" | "refresh" = "initial") => {
    try {
      if (mode === "initial") setLoading(true);
      if (mode === "refresh") setRefreshing(true);

      const { data: sess } = await supabase.auth.getSession();
      if (!sess.session?.user?.id) {
        router.replace("/auth/login");
        return;
      }

      const { data, error } = await supabase.rpc("get_decision_visit_candidates_v1", {
        p_limit: 60,
        p_review_window_hours: 12,
        p_candidate_ttl_hours: 72,
      });

      if (error) throw error;
      setRows((data ?? []) as CandidateRow[]);
    } catch (error: any) {
      console.log("decision visit candidates load error", error);
      Alert.alert("Fehler", error?.message ?? "Konnte deine Backyrd Treffer nicht laden.");
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, [router]);

  useEffect(() => {
    load("initial");
  }, [load]);

  const counts = useMemo(() => {
    const done = rows.filter(isDone).length;
    const strong = rows.filter((r) => !isDone(r) && isStrongOpen(r)).length;
    const open = rows.filter((r) => !isDone(r)).length;
    return { done, strong, open };
  }, [rows]);

  const filteredRows = useMemo(() => {
    if (filter === "done") return rows.filter(isDone);
    if (filter === "open") return rows.filter((r) => !isDone(r));
    return rows;
  }, [filter, rows]);

  const grouped = useMemo(() => {
    const map = new Map<string, CandidateRow[]>();

    filteredRows.forEach((row) => {
      if (!map.has(row.decision_id)) map.set(row.decision_id, []);
      map.get(row.decision_id)!.push(row);
    });

    return Array.from(map.entries()).map(([decisionId, items]) => {
      const sorted = [...items].sort((a, b) => {
        if (isDone(a) !== isDone(b)) return isDone(a) ? 1 : -1;
        return Number(b.signal_score ?? 0) - Number(a.signal_score ?? 0);
      });

      return [decisionId, sorted] as const;
    });
  }, [filteredRows]);

  function openReview(row: CandidateRow) {
    const query = [
      `spotId=${encodeParam(row.spot_id)}`,
      `source=decision`,
      `decisionId=${encodeParam(row.decision_id)}`,
      `decisionRank=${encodeParam(row.rank)}`,
      `decisionQuery=${encodeParam(moodLine(row) || row.city || "")}`,
      `inputMode=decision_followup`,
      `modelVersion=sprint_2d`,
    ].join("&");

    router.push(`/review/new?${query}` as any);
  }

  function openSmartReview(row: CandidateRow) {
    const query = [
      `source=decision`,
      `decisionId=${encodeParam(row.decision_id)}`,
      `decisionRank=${encodeParam(row.rank)}`,
      `decisionQuery=${encodeParam(moodLine(row) || row.city || "")}`,
      `inputMode=decision_followup`,
      `modelVersion=sprint_2d`,
    ].join("&");

    router.push(`/review/smart?${query}` as any);
  }

  function openSpot(row: CandidateRow) {
    router.push(`/spot/${row.spot_id}` as any);
  }

  return (
    <SafeAreaView style={styles.screen} edges={["top", "left", "right"]}>
      <Stack.Screen options={{ headerShown: false }} />

      <View style={styles.header}>
        <Pressable onPress={() => router.back()} style={styles.circleButton}>
          <Ionicons name="chevron-back" size={25} color="#FFFFFF" />
        </Pressable>

        <View style={styles.titleBlock}>
          <Text style={styles.kicker}>Backyrd Intelligence</Text>
          <Text style={styles.title}>Treffer & Besuche</Text>
        </View>

        <Pressable onPress={() => load("refresh")} style={styles.circleButton}>
          <Ionicons name="refresh" size={21} color="#FFFFFF" />
        </Pressable>
      </View>

      <View style={styles.heroCard}>
        <View style={styles.heroIcon}>
          <Ionicons name="sparkles" size={24} color="#0A0A0B" />
        </View>
        <View style={{ flex: 1 }}>
          <Text style={styles.heroTitle}>Magische Signale</Text>
          <Text style={styles.heroText}>
            Wenn du nach einer Decision denselben Spot bewertest, erkennt Backyrd automatisch:
            Vorschlag → Besuch → echter Moment.
          </Text>
        </View>
      </View>

      <View style={styles.segment}>
        <SegmentButton
          label="Smart"
          count={rows.length}
          active={filter === "smart"}
          onPress={() => setFilter("smart")}
        />
        <SegmentButton
          label="Offen"
          count={counts.open}
          active={filter === "open"}
          onPress={() => setFilter("open")}
        />
        <SegmentButton
          label="Erkannt"
          count={counts.done}
          active={filter === "done"}
          onPress={() => setFilter("done")}
        />
      </View>

      {loading ? (
        <View style={styles.loading}>
          <ActivityIndicator color="#FFFFFF" />
          <Text style={styles.loadingText}>Treffer werden geladen…</Text>
        </View>
      ) : (
        <ScrollView
          refreshControl={
            <RefreshControl tintColor="#FFFFFF" refreshing={refreshing} onRefresh={() => load("refresh")} />
          }
          showsVerticalScrollIndicator={false}
          contentContainerStyle={styles.scrollContent}
        >
          {grouped.length === 0 ? (
            <View style={styles.emptyCard}>
              <Ionicons name="compass-outline" size={34} color="rgba(255,255,255,0.45)" />
              <Text style={styles.emptyTitle}>
                {filter === "done" ? "Noch nichts erkannt" : "Keine offenen Treffer"}
              </Text>
              <Text style={styles.emptyText}>
                Suche etwas mit Backyrd, öffne oder like einen Spot und bewerte ihn später.
              </Text>
            </View>
          ) : (
            grouped.map(([decisionId, items]) => {
              const head = items[0];
              const moods = moodLine(head);

              return (
                <View key={decisionId} style={styles.decisionGroup}>
                  <View style={styles.groupHeader}>
                    <View>
                      <Text style={styles.groupKicker}>{fmtDate(head.decision_created_at)}</Text>
                      <Text style={styles.groupTitle} numberOfLines={2}>
                        {head.city || "Backyrd"}{moods ? ` · ${moods}` : ""}
                      </Text>
                    </View>
                    <Text style={styles.groupCount}>{items.length}</Text>
                  </View>

                  <View style={styles.cardsStack}>
                    {items.map((row) => (
                      <CandidateCard
                        key={`${row.decision_id}:${row.spot_id}`}
                        row={row}
                        onReview={() => openReview(row)}
                        onSmartReview={() => openSmartReview(row)}
                        onOpenSpot={() => openSpot(row)}
                      />
                    ))}
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

function SegmentButton({
  label,
  count,
  active,
  onPress,
}: {
  label: string;
  count: number;
  active: boolean;
  onPress: () => void;
}) {
  return (
    <Pressable onPress={onPress} style={[styles.segmentButton, active && styles.segmentButtonActive]}>
      <Text style={[styles.segmentText, active && styles.segmentTextActive]}>
        {label} {count}
      </Text>
    </Pressable>
  );
}

function CandidateCard({
  row,
  onReview,
  onSmartReview,
  onOpenSpot,
}: {
  row: CandidateRow;
  onReview: () => void;
  onSmartReview: () => void;
  onOpenSpot: () => void;
}) {
  const copy = statusCopy(row);
  const done = isDone(row);

  return (
    <View style={[styles.candidateCard, done && styles.candidateCardDone]}>
      <View style={styles.candidateTop}>
        <View style={[styles.statusIcon, done && styles.statusIconDone]}>
          <Ionicons name={copy.icon} size={19} color={done ? "#0A0A0B" : "#FFFFFF"} />
        </View>

        <View style={{ flex: 1 }}>
          <Text style={styles.statusEyebrow}>{copy.eyebrow}</Text>
          <Text style={styles.candidateTitle} numberOfLines={1}>
            {row.spot_name}
          </Text>
          <Text style={styles.candidateMeta} numberOfLines={1}>
            {[row.category_name, row.spot_city || row.city, row.rank ? `Pick ${row.rank}` : null]
              .filter(Boolean)
              .join(" · ")}
          </Text>
        </View>
      </View>

      <Text style={styles.promptTitle}>{copy.title}</Text>
      <Text style={styles.promptBody}>{copy.body}</Text>

      {!!row.why_this && !done && (
        <Text style={styles.whyText} numberOfLines={3}>
          {row.why_this}
        </Text>
      )}

      {done && (
        <View style={styles.detectedBox}>
          <Ionicons name="checkmark-circle" size={17} color="#9AE6B4" />
          <Text style={styles.detectedText}>
            Bewertet {fmtShortTime(row.reviewed_at)} nach der Decision.
          </Text>
        </View>
      )}

      <View style={styles.actionRow}>
        {done ? (
          <Pressable style={styles.primaryButton} onPress={onOpenSpot}>
            <Text style={styles.primaryButtonText}>Moment ansehen</Text>
            <Ionicons name="arrow-forward" size={18} color="#0A0A0B" />
          </Pressable>
        ) : (
          <>
            <Pressable style={styles.primaryButton} onPress={onReview}>
              <Text style={styles.primaryButtonText}>Kurz bewerten</Text>
              <Ionicons name="arrow-forward" size={18} color="#0A0A0B" />
            </Pressable>

            <Pressable style={styles.secondaryButton} onPress={onSmartReview}>
              <Ionicons name="camera-outline" size={18} color="#FFFFFF" />
            </Pressable>
          </>
        )}

        <Pressable style={styles.secondaryButton} onPress={onOpenSpot}>
          <Ionicons name="location-outline" size={18} color="#FFFFFF" />
        </Pressable>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  screen: {
    flex: 1,
    backgroundColor: "#08080A",
  },
  header: {
    paddingHorizontal: 18,
    paddingTop: 10,
    paddingBottom: 14,
    flexDirection: "row",
    alignItems: "center",
    gap: 14,
  },
  circleButton: {
    width: 48,
    height: 48,
    borderRadius: 24,
    backgroundColor: "#15151A",
    borderWidth: 1,
    borderColor: "#2A2A33",
    alignItems: "center",
    justifyContent: "center",
  },
  titleBlock: {
    flex: 1,
  },
  kicker: {
    color: "#85858E",
    fontSize: 12,
    fontWeight: "950",
    letterSpacing: 1.3,
    textTransform: "uppercase",
  },
  title: {
    marginTop: 2,
    color: "#FFFFFF",
    fontSize: 31,
    fontWeight: "950",
    letterSpacing: -0.9,
  },
  heroCard: {
    marginHorizontal: 18,
    marginBottom: 14,
    borderRadius: 28,
    backgroundColor: "#101015",
    borderWidth: 1,
    borderColor: "#282832",
    padding: 16,
    flexDirection: "row",
    gap: 14,
  },
  heroIcon: {
    width: 46,
    height: 46,
    borderRadius: 23,
    backgroundColor: "#FFFFFF",
    alignItems: "center",
    justifyContent: "center",
  },
  heroTitle: {
    color: "#FFFFFF",
    fontSize: 19,
    fontWeight: "950",
  },
  heroText: {
    marginTop: 5,
    color: "#A3A3AA",
    fontSize: 14,
    fontWeight: "650",
    lineHeight: 20,
  },
  segment: {
    marginHorizontal: 18,
    marginBottom: 14,
    height: 56,
    borderRadius: 28,
    padding: 5,
    backgroundColor: "#101015",
    borderWidth: 1,
    borderColor: "#282832",
    flexDirection: "row",
  },
  segmentButton: {
    flex: 1,
    borderRadius: 999,
    alignItems: "center",
    justifyContent: "center",
  },
  segmentButtonActive: {
    backgroundColor: "#FFFFFF",
  },
  segmentText: {
    color: "#8F8F98",
    fontSize: 14,
    fontWeight: "850",
  },
  segmentTextActive: {
    color: "#08080A",
  },
  loading: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
    gap: 10,
  },
  loadingText: {
    color: "#8F8F98",
    fontSize: 15,
    fontWeight: "800",
  },
  scrollContent: {
    paddingHorizontal: 18,
    paddingBottom: 120,
  },
  emptyCard: {
    minHeight: 220,
    borderRadius: 30,
    backgroundColor: "#101015",
    borderWidth: 1,
    borderColor: "#282832",
    alignItems: "center",
    justifyContent: "center",
    padding: 24,
  },
  emptyTitle: {
    marginTop: 12,
    color: "#FFFFFF",
    fontSize: 21,
    fontWeight: "950",
    textAlign: "center",
  },
  emptyText: {
    marginTop: 8,
    color: "#8F8F98",
    fontSize: 15,
    lineHeight: 21,
    textAlign: "center",
    fontWeight: "650",
  },
  decisionGroup: {
    marginBottom: 18,
  },
  groupHeader: {
    paddingHorizontal: 2,
    paddingBottom: 10,
    flexDirection: "row",
    justifyContent: "space-between",
    gap: 12,
  },
  groupKicker: {
    color: "#85858E",
    fontSize: 12,
    fontWeight: "900",
    textTransform: "uppercase",
    letterSpacing: 0.7,
  },
  groupTitle: {
    marginTop: 3,
    color: "#FFFFFF",
    fontSize: 19,
    fontWeight: "950",
    letterSpacing: -0.3,
  },
  groupCount: {
    color: "#8F8F98",
    fontSize: 17,
    fontWeight: "900",
  },
  cardsStack: {
    gap: 12,
  },
  candidateCard: {
    borderRadius: 28,
    backgroundColor: "#101015",
    borderWidth: 1,
    borderColor: "#282832",
    padding: 16,
  },
  candidateCardDone: {
    borderColor: "rgba(154,230,180,0.28)",
    backgroundColor: "#0E1411",
  },
  candidateTop: {
    flexDirection: "row",
    gap: 12,
    alignItems: "center",
  },
  statusIcon: {
    width: 42,
    height: 42,
    borderRadius: 21,
    backgroundColor: "#1B1B22",
    borderWidth: 1,
    borderColor: "#30303A",
    alignItems: "center",
    justifyContent: "center",
  },
  statusIconDone: {
    backgroundColor: "#FFFFFF",
    borderColor: "#FFFFFF",
  },
  statusEyebrow: {
    color: "#8F8F98",
    fontSize: 12,
    fontWeight: "900",
    letterSpacing: 0.8,
    textTransform: "uppercase",
  },
  candidateTitle: {
    marginTop: 2,
    color: "#FFFFFF",
    fontSize: 20,
    fontWeight: "950",
    letterSpacing: -0.35,
  },
  candidateMeta: {
    marginTop: 2,
    color: "#9A9AA2",
    fontSize: 14,
    fontWeight: "750",
  },
  promptTitle: {
    marginTop: 14,
    color: "#FFFFFF",
    fontSize: 22,
    fontWeight: "950",
    letterSpacing: -0.45,
  },
  promptBody: {
    marginTop: 6,
    color: "#B7B7BE",
    fontSize: 15,
    lineHeight: 21,
    fontWeight: "650",
  },
  whyText: {
    marginTop: 12,
    color: "#8F8F98",
    fontSize: 14,
    lineHeight: 20,
    fontWeight: "600",
  },
  detectedBox: {
    marginTop: 13,
    borderRadius: 18,
    backgroundColor: "rgba(154,230,180,0.10)",
    borderWidth: 1,
    borderColor: "rgba(154,230,180,0.18)",
    paddingHorizontal: 12,
    paddingVertical: 10,
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
  },
  detectedText: {
    flex: 1,
    color: "#D8FBE3",
    fontSize: 14,
    fontWeight: "750",
  },
  actionRow: {
    marginTop: 16,
    flexDirection: "row",
    gap: 10,
    alignItems: "center",
  },
  primaryButton: {
    flex: 1,
    minHeight: 50,
    borderRadius: 999,
    backgroundColor: "#FFFFFF",
    alignItems: "center",
    justifyContent: "center",
    flexDirection: "row",
    gap: 8,
  },
  primaryButtonText: {
    color: "#08080A",
    fontSize: 15,
    fontWeight: "950",
  },
  secondaryButton: {
    width: 50,
    height: 50,
    borderRadius: 25,
    backgroundColor: "#17171D",
    borderWidth: 1,
    borderColor: "#30303A",
    alignItems: "center",
    justifyContent: "center",
  },
});
