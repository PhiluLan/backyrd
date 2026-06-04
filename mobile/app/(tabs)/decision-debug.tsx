import React, { useCallback, useEffect, useMemo, useState } from "react";
import { View, Text, TextInput, Pressable, ActivityIndicator, ScrollView, Alert } from "react-native";
import { Stack, useRouter } from "expo-router";
import { SafeAreaView } from "react-native-safe-area-context";
import { supabase } from "@/lib/supabase";

import { mapTextToClusterIds } from "@/lib/decision/moodMapping";
import { backyrdGetDecisionDebugV3, type BackyrdDecisionDebugRow } from "@/lib/decision/backyrdDecision";

const DEV_EMAIL = "philipplanger@yahoo.com";

const theme = {
  bg: "#0B0B0C",
  card: "rgba(255,255,255,0.06)",
  border: "rgba(255,255,255,0.12)",
  text: "#fff",
  muted: "rgba(255,255,255,0.65)",
  soft: "rgba(255,255,255,0.08)",
};

function clean(s: string) {
  return (s ?? "").trim().replace(/\s+/g, " ");
}

function fmtNum(n: any) {
  const x = typeof n === "string" ? Number(n) : n;
  if (Number.isFinite(x)) return x.toFixed(3);
  return String(n ?? "");
}

export default function DevDecisionDebugScreen() {
  const router = useRouter();

  const [isDev, setIsDev] = useState<boolean>(false);
  const [checkedDev, setCheckedDev] = useState<boolean>(false);

  const [city, setCity] = useState("Basel");
  const [moodA, setMoodA] = useState("cozy");
  const [moodB, setMoodB] = useState("urban");
  const [query, setQuery] = useState("");
  const [limit, setLimit] = useState("10");
  const [k, setK] = useState("1.0");
  const [openBonus, setOpenBonus] = useState("0.0");

  const [loading, setLoading] = useState(false);
  const [rows, setRows] = useState<BackyrdDecisionDebugRow[]>([]);
  const [expanded, setExpanded] = useState<Record<string, boolean>>({});

  // 🔒 DEV Gate (hard)
  useEffect(() => {
    let active = true;
    (async () => {
      try {
        const { data } = await supabase.auth.getUser();
        const email = data.user?.email?.toLowerCase() ?? "";
        if (active) setIsDev(email === DEV_EMAIL.toLowerCase());
      } finally {
        if (active) setCheckedDev(true);
      }
    })();
    return () => {
      active = false;
    };
  }, []);

  useEffect(() => {
    if (!checkedDev) return;
    if (!isDev) router.replace("/(tabs)");
  }, [checkedDev, isDev, router]);

  const canRun = useMemo(() => {
    const c = clean(city);
    const a = clean(moodA);
    const b = clean(moodB);
    const q = clean(query);
    return c.length > 1 && (a.length > 0 || b.length > 0 || q.length > 0);
  }, [city, moodA, moodB, query]);

  const run = useCallback(async () => {
    if (!canRun) {
      Alert.alert("Fehlt noch was", "Bitte Stadt und mindestens ein Mood oder Query setzen.");
      return;
    }

    const p_limit = Math.max(1, Math.min(50, parseInt(limit || "10", 10) || 10));
    const p_k = Math.max(0.01, Math.min(10, Number(k || "1.0")));
    const p_open_bonus = Math.max(0, Math.min(5, Number(openBonus || "0.0")));

    const { clusterIds, leftoverText } = mapTextToClusterIds(moodA, moodB);
    const finalQuery = [clean(query), leftoverText].filter(Boolean).join(" ").trim();

    try {
      setLoading(true);
      setRows([]);
      setExpanded({});

      const data = await backyrdGetDecisionDebugV3({
        city: clean(city),
        selectedClusterIds: clusterIds,
        query: finalQuery,
        limit: p_limit,
        k: p_k,
        openBonus: p_open_bonus,
      });

      setRows(data ?? []);
    } catch (e: any) {
      console.log("debug v3 rpc error", e);
      Alert.alert("Fehler", e?.message ?? "RPC konnte nicht geladen werden");
    } finally {
      setLoading(false);
    }
  }, [canRun, city, moodA, moodB, query, limit, k, openBonus]);

  const toggle = useCallback((id: string) => {
    setExpanded((prev) => ({ ...prev, [id]: !prev[id] }));
  }, []);

  if (!checkedDev) return null;

  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: theme.bg }} edges={["top", "left", "right"]}>
      <Stack.Screen
        options={{
          title: "Decision Debug",
          headerStyle: { backgroundColor: theme.bg },
          headerTintColor: "#fff",
          headerShadowVisible: false,
        }}
      />

      <ScrollView contentContainerStyle={{ padding: 16, paddingBottom: 28 }}>
        <View style={{ marginBottom: 12 }}>
          <Text style={{ color: "#fff", fontSize: 28, fontWeight: "900" }}>Decision Debug</Text>
          <Text style={{ color: theme.muted, marginTop: 6, lineHeight: 20 }}>
            DEV-only. Zeigt Score-Komponenten aus <Text style={{ fontWeight: "900" }}>backyrd_get_decision_debug_v3</Text>.
          </Text>
        </View>

        {/* Inputs */}
        <View
          style={{
            backgroundColor: theme.card,
            borderWidth: 1,
            borderColor: theme.border,
            borderRadius: 18,
            padding: 14,
            gap: 12,
          }}
        >
          <View>
            <Text style={{ color: theme.muted, fontWeight: "800", marginBottom: 6 }}>Stadt</Text>
            <TextInput
              value={city}
              onChangeText={setCity}
              placeholder="Basel"
              placeholderTextColor="rgba(255,255,255,0.35)"
              style={{
                color: "#fff",
                paddingHorizontal: 12,
                paddingVertical: 12,
                borderRadius: 14,
                backgroundColor: theme.soft,
                borderWidth: 1,
                borderColor: "rgba(255,255,255,0.10)",
                fontWeight: "700",
              }}
            />
          </View>

          <View style={{ flexDirection: "row", gap: 10 }}>
            <View style={{ flex: 1 }}>
              <Text style={{ color: theme.muted, fontWeight: "800", marginBottom: 6 }}>Mood A (frei)</Text>
              <TextInput
                value={moodA}
                onChangeText={setMoodA}
                placeholder="cozy"
                placeholderTextColor="rgba(255,255,255,0.35)"
                autoCapitalize="none"
                style={{
                  color: "#fff",
                  paddingHorizontal: 12,
                  paddingVertical: 12,
                  borderRadius: 14,
                  backgroundColor: theme.soft,
                  borderWidth: 1,
                  borderColor: "rgba(255,255,255,0.10)",
                  fontWeight: "700",
                }}
              />
            </View>

            <View style={{ flex: 1 }}>
              <Text style={{ color: theme.muted, fontWeight: "800", marginBottom: 6 }}>Mood B (frei)</Text>
              <TextInput
                value={moodB}
                onChangeText={setMoodB}
                placeholder="urban"
                placeholderTextColor="rgba(255,255,255,0.35)"
                autoCapitalize="none"
                style={{
                  color: "#fff",
                  paddingHorizontal: 12,
                  paddingVertical: 12,
                  borderRadius: 14,
                  backgroundColor: theme.soft,
                  borderWidth: 1,
                  borderColor: "rgba(255,255,255,0.10)",
                  fontWeight: "700",
                }}
              />
            </View>
          </View>

          <View>
            <Text style={{ color: theme.muted, fontWeight: "800", marginBottom: 6 }}>Query (optional)</Text>
            <TextInput
              value={query}
              onChangeText={setQuery}
              placeholder="Weinbar, Pizza, ruhig..."
              placeholderTextColor="rgba(255,255,255,0.35)"
              autoCapitalize="sentences"
              style={{
                color: "#fff",
                paddingHorizontal: 12,
                paddingVertical: 12,
                borderRadius: 14,
                backgroundColor: theme.soft,
                borderWidth: 1,
                borderColor: "rgba(255,255,255,0.10)",
                fontWeight: "700",
              }}
            />
          </View>

          <View style={{ flexDirection: "row", gap: 10 }}>
            <View style={{ flex: 1 }}>
              <Text style={{ color: theme.muted, fontWeight: "800", marginBottom: 6 }}>Limit (1–50)</Text>
              <TextInput
                value={limit}
                onChangeText={setLimit}
                keyboardType="number-pad"
                placeholder="10"
                placeholderTextColor="rgba(255,255,255,0.35)"
                style={{
                  color: "#fff",
                  paddingHorizontal: 12,
                  paddingVertical: 12,
                  borderRadius: 14,
                  backgroundColor: theme.soft,
                  borderWidth: 1,
                  borderColor: "rgba(255,255,255,0.10)",
                  fontWeight: "700",
                }}
              />
            </View>

            <View style={{ flex: 1 }}>
              <Text style={{ color: theme.muted, fontWeight: "800", marginBottom: 6 }}>k</Text>
              <TextInput
                value={k}
                onChangeText={setK}
                keyboardType="decimal-pad"
                placeholder="1.0"
                placeholderTextColor="rgba(255,255,255,0.35)"
                style={{
                  color: "#fff",
                  paddingHorizontal: 12,
                  paddingVertical: 12,
                  borderRadius: 14,
                  backgroundColor: theme.soft,
                  borderWidth: 1,
                  borderColor: "rgba(255,255,255,0.10)",
                  fontWeight: "700",
                }}
              />
            </View>
          </View>

          <View style={{ flexDirection: "row", gap: 10 }}>
            <View style={{ flex: 1 }}>
              <Text style={{ color: theme.muted, fontWeight: "800", marginBottom: 6 }}>open_bonus</Text>
              <TextInput
                value={openBonus}
                onChangeText={setOpenBonus}
                keyboardType="decimal-pad"
                placeholder="0.0"
                placeholderTextColor="rgba(255,255,255,0.35)"
                style={{
                  color: "#fff",
                  paddingHorizontal: 12,
                  paddingVertical: 12,
                  borderRadius: 14,
                  backgroundColor: theme.soft,
                  borderWidth: 1,
                  borderColor: "rgba(255,255,255,0.10)",
                  fontWeight: "700",
                }}
              />
            </View>
          </View>

          <Pressable
            onPress={run}
            disabled={loading || !canRun}
            style={{
              marginTop: 4,
              paddingVertical: 14,
              borderRadius: 14,
              alignItems: "center",
              backgroundColor: loading || !canRun ? "rgba(255,255,255,0.10)" : "rgba(255,255,255,0.92)",
            }}
          >
            {loading ? <ActivityIndicator /> : <Text style={{ color: "#000", fontWeight: "900", fontSize: 16 }}>Run Debug</Text>}
          </Pressable>
        </View>

        {/* Results */}
        <View style={{ marginTop: 14, gap: 10 }}>
          <Text style={{ color: "#fff", fontWeight: "900", fontSize: 16 }}>
            Results {rows.length > 0 ? `(${rows.length})` : ""}
          </Text>

          {rows.length === 0 && !loading && (
            <Text style={{ color: theme.muted, lineHeight: 20 }}>Noch keine Ergebnisse. Run Debug drücken.</Text>
          )}

          {rows.map((r, idx) => {
            const isOpen = expanded[r.spot_id] === true;
            return (
              <Pressable
                key={r.spot_id}
                onPress={() => toggle(r.spot_id)}
                style={{
                  borderRadius: 18,
                  padding: 14,
                  borderWidth: 1,
                  borderColor: theme.border,
                  backgroundColor: "rgba(255,255,255,0.06)",
                }}
              >
                <View style={{ flexDirection: "row", justifyContent: "space-between", gap: 12 }}>
                  <View style={{ flex: 1 }}>
                    <Text style={{ color: "#fff", fontWeight: "900", fontSize: 16 }}>
                      {idx + 1}. {r.name}
                    </Text>
                    <Text style={{ color: theme.muted, marginTop: 4 }}>
                      {r.city} • score {fmtNum(r.final_score)}
                      {r.is_open_now ? " • open" : ""}
                    </Text>
                    {!!r.why_this && (
                      <Text style={{ color: "rgba(255,255,255,0.82)", marginTop: 8, lineHeight: 18 }}>
                        {r.why_this}
                      </Text>
                    )}
                  </View>

                  <View
                    style={{
                      alignSelf: "flex-start",
                      paddingHorizontal: 10,
                      paddingVertical: 6,
                      borderRadius: 999,
                      borderWidth: 1,
                      borderColor: "rgba(255,255,255,0.18)",
                      backgroundColor: "rgba(255,255,255,0.06)",
                    }}
                  >
                    <Text style={{ color: "#fff", fontWeight: "900", fontSize: 12 }}>Details</Text>
                  </View>
                </View>

                <View style={{ flexDirection: "row", gap: 10, marginTop: 10, flexWrap: "wrap" }}>
                  <Text style={{ color: "rgba(255,255,255,0.75)", fontWeight: "800" }}>
                    mood_raw: {r.raw_mood_strength ?? 0}
                  </Text>
                  <Text style={{ color: "rgba(255,255,255,0.75)", fontWeight: "800" }}>
                    mood_norm: {fmtNum(r.mood_strength_norm ?? 0)}
                  </Text>
                  <Text style={{ color: "rgba(255,255,255,0.75)", fontWeight: "800" }}>
                    match: {r.mood_match_count ?? 0}
                  </Text>
                  <Text style={{ color: "rgba(255,255,255,0.75)", fontWeight: "800" }}>
                    text: {fmtNum(r.text_match_score ?? 0)}
                  </Text>
                </View>

                {isOpen && (
                  <View style={{ marginTop: 12, gap: 8 }}>
                    <View
                      style={{
                        borderRadius: 14,
                        padding: 12,
                        backgroundColor: "rgba(0,0,0,0.35)",
                        borderWidth: 1,
                        borderColor: "rgba(255,255,255,0.10)",
                      }}
                    >
                      <Text style={{ color: theme.muted, fontWeight: "900", marginBottom: 6 }}>Matched tokens</Text>
                      <Text style={{ color: "#fff", lineHeight: 18 }}>
                        {(r.matched_tokens ?? [])
                          .map((t, i) => `${t} (${(r.matched_counts ?? [])[i] ?? "?"}×)`)
                          .join(", ") || "—"}
                      </Text>

                      <Text style={{ color: theme.muted, fontWeight: "900", marginTop: 12, marginBottom: 6 }}>Matched terms</Text>
                      <Text style={{ color: "#fff", lineHeight: 18 }}>{(r.matched_terms ?? []).join(", ") || "—"}</Text>

                      <Text style={{ color: theme.muted, fontWeight: "900", marginTop: 12, marginBottom: 6 }}>Spot ID</Text>
                      <Text style={{ color: "rgba(255,255,255,0.85)" }}>{r.spot_id}</Text>
                    </View>
                  </View>
                )}
              </Pressable>
            );
          })}
        </View>
      </ScrollView>
    </SafeAreaView>
  );
}
