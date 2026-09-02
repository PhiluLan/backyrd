import { Ionicons } from "@expo/vector-icons";
import { usePathname, useRouter } from "expo-router";
import React, { type ReactNode, useCallback, useEffect, useRef, useState } from "react";
import {
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
import { ProductLoading } from "../ui/ProductState";

type Props = { children: ReactNode; enabled?: boolean };
const SAFETY_ALLOWED_ROUTES = [
  "/safety-center",
  "/safety-notifications",
];

function isAllowedSafetyRoute(pathname: string): boolean {
  return (
    pathname.startsWith("/safety/") ||
    SAFETY_ALLOWED_ROUTES.some(
      (route) =>
        pathname === route ||
        pathname.startsWith(`${route}/`),
    )
  );
}

function formatEnd(value: string | null): string | null {
  if (!value) return null;
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return null;
  return new Intl.DateTimeFormat("de-CH", {
    dateStyle: "medium",
    timeStyle: "short",
  }).format(date);
}

export default function GlobalSafetyEnforcementGuard({ children, enabled = true }: Props) {
  const router = useRouter();
  const pathname = usePathname() ?? "";
  const [status, setStatus] = useState<SafetyWriteStatus | null>(null);
  const [loading, setLoading] = useState(true);
  const [signedIn, setSignedIn] = useState(false);
  const shownWriteNoticeKey = useRef<string | null>(null);
  const mounted = useRef(true);
  const isSafetyRoute = isAllowedSafetyRoute(pathname);

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
    if (!enabled) {
      return () => {
        mounted.current = false;
      };
    }

    void refresh();

    const { data: authListener } = supabase.auth.onAuthStateChange(() => {
      setLoading(true);
      void refresh();
    });

    return () => {
      mounted.current = false;
      authListener.subscription.unsubscribe();
    };
  }, [enabled, refresh]);

  useEffect(() => {
    if (!enabled) return;

    const onStateChange = (nextState: AppStateStatus) => {
      if (nextState === "active") void refresh();
    };
    const subscription = AppState.addEventListener("change", onStateChange);
    return () => subscription.remove();
  }, [enabled, refresh]);

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
        { text: "Sicherheit & Support öffnen", onPress: () => router.push("/safety-center" as any) },
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
      <View style={{ flex: 1 }}>
        {children}

        <SafeAreaView
          style={[
            StyleSheet.absoluteFillObject,
            styles.lockRoot,
            { zIndex: 9999 },
          ]}
        >
          <View style={styles.lockGlow} />

          <View style={styles.lockContent}>
            <View style={styles.iconWrap}>
              <Ionicons
                name="lock-closed"
                size={34}
                color="#FF4F91"
              />
            </View>

            <Text style={styles.kicker}>
              ACCOUNT SAFETY
            </Text>

            <Text style={styles.title}>
              Dein Backyrd-Account ist gesperrt
            </Text>

            <Text style={styles.body}>
              Dein Konto ist vorübergehend gesperrt. Im Safety Center kannst du sehen, warum diese Maßnahme gilt, wie lange sie dauert und ob du die Entscheidung anfechten kannst.
            </Text>

            <Pressable
              onPress={() =>
                router.push("/safety/account-status" as any)
              }
              style={styles.primaryButton}
            >
              <Ionicons
                name="shield-checkmark-outline"
                size={20}
                color="#050506"
              />
              <Text style={styles.primaryButtonText}>
                Entscheidung ansehen
              </Text>
            </Pressable>

            <Pressable
              onPress={() => void signOut()}
              style={styles.secondaryButton}
            >
              <Ionicons
                name="log-out-outline"
                size={20}
                color="#FFFFFF"
              />
              <Text style={styles.secondaryButtonText}>
                Ausloggen
              </Text>
            </Pressable>
          </View>
        </SafeAreaView>
      </View>
    );
  }

  if (loading && signedIn && status === null) {
    return <ProductLoading label="Sicherheit wird geprüft" />;
  }

  return <>{children}</>;
}

const styles = StyleSheet.create({
  lockRoot: { flex: 1, backgroundColor: "#050506" },
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
    justifyContent: "center", gap: 10, backgroundColor: "#FF4F91",
  },
  primaryButtonText: { color: "#050506", fontSize: 16, fontWeight: "900" },
  secondaryButton: {
    marginTop: 12, minHeight: 56, borderRadius: 19, flexDirection: "row", alignItems: "center",
    justifyContent: "center", gap: 10, backgroundColor: "rgba(255,255,255,0.045)",
    borderWidth: 1, borderColor: "rgba(255,255,255,0.10)",
  },
  secondaryButtonText: { color: "#FFFFFF", fontSize: 16, fontWeight: "900" },
});
