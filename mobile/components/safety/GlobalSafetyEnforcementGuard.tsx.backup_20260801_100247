import { Ionicons } from "@expo/vector-icons";
import { usePathname, useRouter } from "expo-router";
import React, { type ReactNode, useCallback, useEffect, useRef, useState } from "react";
import {
  ActivityIndicator,
  Alert,
  AppState,
  type AppStateStatus,
  Pressable,
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

type Props = { children: ReactNode };
const SAFETY_ROUTE_PREFIX = "/safety/";

function formatEnd(value: string | null): string | null {
  if (!value) return null;
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return null;
  return new Intl.DateTimeFormat("de-CH", {
    dateStyle: "medium",
    timeStyle: "short",
  }).format(date);
}

export default function GlobalSafetyEnforcementGuard({ children }: Props) {
  const router = useRouter();
  const pathname = usePathname() ?? "";
  const [status, setStatus] = useState<SafetyWriteStatus | null>(null);
  const [loading, setLoading] = useState(true);
  const [signedIn, setSignedIn] = useState(false);
  const shownWriteNoticeKey = useRef<string | null>(null);
  const mounted = useRef(true);
  const isSafetyRoute = pathname.startsWith(SAFETY_ROUTE_PREFIX);

  const refresh = useCallback(async () => {
    const { data: { user } } = await supabase.auth.getUser();
    if (!mounted.current) return;

    if (!user) {
      setSignedIn(false);
      setStatus(null);
      setLoading(false);
      shownWriteNoticeKey.current = null;
      return;
    }

    setSignedIn(true);
    const nextStatus = await getSafetyWriteStatus();
    if (!mounted.current) return;
    setStatus(nextStatus);
    setLoading(false);
  }, []);

  useEffect(() => {
    mounted.current = true;
    void refresh();

    const { data: authListener } = supabase.auth.onAuthStateChange(() => {
      setLoading(true);
      void refresh();
    });

    return () => {
      mounted.current = false;
      authListener.subscription.unsubscribe();
    };
  }, [refresh]);

  useEffect(() => {
    const onStateChange = (nextState: AppStateStatus) => {
      if (nextState === "active") void refresh();
    };
    const subscription = AppState.addEventListener("change", onStateChange);
    return () => subscription.remove();
  }, [refresh]);

  const isWriteSuspension = signedIn && status?.activeMeasureType === "write_suspension" && status.canWrite === false;
  const isFullAccountLock = signedIn && status?.activeMeasureType === "account_restricted";

  useEffect(() => {
    if (!isWriteSuspension || isSafetyRoute) return;

    const noticeKey = [status?.activeMeasureType, status?.activeMeasureEndsAt ?? "no-end"].join(":");
    if (shownWriteNoticeKey.current === noticeKey) return;
    shownWriteNoticeKey.current = noticeKey;

    const end = formatEnd(status?.activeMeasureEndsAt ?? null);
    Alert.alert(
      "Veröffentlichungsfunktionen eingeschränkt",
      end
        ? `Du kannst Backyrd weiterhin ansehen und Spots entdecken. Bis ${end} kannst du jedoch keine Moments, Reviews oder Kommentare veröffentlichen. Im Safety Center siehst du den Grund und kannst die Entscheidung anfechten.`
        : "Du kannst Backyrd weiterhin ansehen und Spots entdecken. Momentan kannst du jedoch keine Moments, Reviews oder Kommentare veröffentlichen. Im Safety Center siehst du den Grund und kannst die Entscheidung anfechten.",
      [
        { text: "Safety Center öffnen", onPress: () => router.push("/safety/account-status") },
        { text: "Backyrd nur ansehen", style: "cancel" },
      ],
    );
  }, [isSafetyRoute, isWriteSuspension, router, status?.activeMeasureEndsAt, status?.activeMeasureType]);

  async function signOut() {
    await supabase.auth.signOut();
    router.replace("/auth/login");
  }

  if (isFullAccountLock && !isSafetyRoute) {
    return (
      <SafeAreaView style={styles.lockRoot}>
        <View style={styles.lockGlow} />
        <View style={styles.lockContent}>
          <View style={styles.iconWrap}>
            <Ionicons name="lock-closed" size={34} color="#FF78A7" />
          </View>
          <Text style={styles.kicker}>ACCOUNT SAFETY</Text>
          <Text style={styles.title}>Dein Backyrd-Account ist gesperrt</Text>
          <Text style={styles.body}>
            Aufgrund wiederholter oder schwerwiegender Richtlinienverstöße ist dein Account derzeit nicht verfügbar. Du kannst die Entscheidung im Safety Center ansehen und gegebenenfalls anfechten.
          </Text>

          <Pressable onPress={() => router.push("/safety/account-status")} style={styles.primaryButton}>
            <Ionicons name="shield-checkmark-outline" size={20} color="#09090A" />
            <Text style={styles.primaryButtonText}>Entscheidung ansehen</Text>
          </Pressable>

          <Pressable onPress={() => void signOut()} style={styles.secondaryButton}>
            <Ionicons name="log-out-outline" size={20} color="#FFFFFF" />
            <Text style={styles.secondaryButtonText}>Ausloggen</Text>
          </Pressable>
        </View>
      </SafeAreaView>
    );
  }

  if (loading && signedIn && status === null) {
    return (
      <View style={styles.loadingOverlay} pointerEvents="none">
        <ActivityIndicator color="#FF78A7" size="small" />
      </View>
    );
  }

  return <>{children}</>;
}

const styles = StyleSheet.create({
  lockRoot: { flex: 1, backgroundColor: "#070708" },
  lockGlow: {
    position: "absolute", top: -120, alignSelf: "center", width: 360, height: 360,
    borderRadius: 180, backgroundColor: "rgba(255,79,139,0.08)",
  },
  lockContent: { flex: 1, justifyContent: "center", paddingHorizontal: 28, paddingBottom: 36 },
  iconWrap: {
    width: 68, height: 68, borderRadius: 24, alignItems: "center", justifyContent: "center",
    backgroundColor: "rgba(255,79,139,0.10)", borderWidth: 1,
    borderColor: "rgba(255,79,139,0.24)", marginBottom: 28,
  },
  kicker: { color: "#FF5E96", fontSize: 12, fontWeight: "900", letterSpacing: 2.4 },
  title: { marginTop: 13, color: "#FFFFFF", fontSize: 38, lineHeight: 42, fontWeight: "900", letterSpacing: -1.2 },
  body: { marginTop: 17, color: "#A1A1AA", fontSize: 16, lineHeight: 24 },
  primaryButton: {
    marginTop: 32, minHeight: 58, borderRadius: 19, flexDirection: "row", alignItems: "center",
    justifyContent: "center", gap: 10, backgroundColor: "#FF78A7",
  },
  primaryButtonText: { color: "#09090A", fontSize: 16, fontWeight: "900" },
  secondaryButton: {
    marginTop: 12, minHeight: 56, borderRadius: 19, flexDirection: "row", alignItems: "center",
    justifyContent: "center", gap: 10, backgroundColor: "rgba(255,255,255,0.045)",
    borderWidth: 1, borderColor: "rgba(255,255,255,0.10)",
  },
  secondaryButtonText: { color: "#FFFFFF", fontSize: 16, fontWeight: "900" },
  loadingOverlay: { flex: 1, alignItems: "center", justifyContent: "center", backgroundColor: "#070708" },
});
