import { backyrdTheme } from "../../theme/backyrd";
import { Ionicons } from "@expo/vector-icons";
import { usePathname, useRouter } from "expo-router";
import React, { type ReactNode, useCallback, useEffect, useRef, useState } from "react";
import { Alert, Platform, AppState, type AppStateStatus, Pressable, StyleSheet, View } from "react-native";
import { ProductText as Text } from "../foundation/AppText";
import { SafeAreaView } from "react-native-safe-area-context";

import {
  getSafetyWriteStatus,
  type SafetyWriteStatus,
} from "../../lib/safety-enforcement";
import { supabase } from "../../lib/supabase";
import { signOutWithPushCleanup } from "../../lib/signOut";
import { ProductLoading, ProductState } from "../ui/ProductState";
import { withRequestDeadline } from "../../lib/requestDeadline";

type Props = {
  children: ReactNode;
  /** Allows the root splash to remain the only visible bootstrap surface. */
  authReady?: boolean;
  onStartupCheckSettled?: (failed: boolean) => void;
};
const SAFETY_CHECK_DEADLINE_MS = 8_000;
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

export default function GlobalSafetyEnforcementGuard({
  children,
  authReady = true,
  onStartupCheckSettled,
}: Props) {
  const router = useRouter();
  const pathname = usePathname() ?? "";
  const [status, setStatus] = useState<SafetyWriteStatus | null>(null);
  const [loading, setLoading] = useState(true);
  const [signedIn, setSignedIn] = useState(false);
  const [checkFailed, setCheckFailed] = useState(false);
  const shownWriteNoticeKey = useRef<string | null>(null);
  const onStartupCheckSettledRef = useRef(onStartupCheckSettled);
  const mounted = useRef(true);
  const refreshGeneration = useRef(0);
  const checkedActor = useRef<string | null>(null);
  const isSafetyRoute = isAllowedSafetyRoute(pathname);

  useEffect(() => {
    onStartupCheckSettledRef.current = onStartupCheckSettled;
  }, [onStartupCheckSettled]);

  const refresh = useCallback(async () => {
    const generation = ++refreshGeneration.current;
    setLoading(true);
    const isCurrent = () => mounted.current && generation === refreshGeneration.current;
    try {
      const result = await withRequestDeadline(async signal => {
        const { data: { user }, error } = await supabase.auth.getUser();
        if (error && error.name !== "AuthSessionMissingError") throw error;
        if (!user) return { actor: null, status: null };
        if (signal.aborted || !isCurrent()) throw new Error("safety_check_cancelled");
        const status = await getSafetyWriteStatus(signal);
        if (!status) throw new Error("safety_status_unavailable");
        return { actor: user.id, status };
      }, SAFETY_CHECK_DEADLINE_MS);
      if (!isCurrent()) return;
      checkedActor.current = result.actor;
      setSignedIn(result.actor !== null);
      setStatus(result.status);
      setCheckFailed(false);
      if (!result.actor) shownWriteNoticeKey.current = null;
      onStartupCheckSettledRef.current?.(false);
    } catch {
      if (!isCurrent()) return;
      setCheckFailed(true);
      onStartupCheckSettledRef.current?.(true);
    } finally {
      if (isCurrent()) setLoading(false);
    }
  }, []);

  useEffect(() => {
    mounted.current = true;
    if (!authReady) return;
    let active = true;
    void refresh();

    const { data: authListener } = supabase.auth.onAuthStateChange((event, session) => {
      if (event === "INITIAL_SESSION") return;
      ++refreshGeneration.current;
      if ((session?.user.id ?? null) !== checkedActor.current) {
        setStatus(null);
        setSignedIn(Boolean(session));
      }
      setLoading(true);
      // Leave Supabase's auth callback before calling its APIs again.
      setTimeout(() => { if (active) void refresh(); }, 0);
    });

    return () => {
      active = false;
      mounted.current = false;
      ++refreshGeneration.current;
      authListener.subscription.unsubscribe();
    };
  }, [authReady, refresh]);

  useEffect(() => {
    if (!authReady) return;
    const onStateChange = (nextState: AppStateStatus) => {
      if (nextState === "active") void refresh();
    };
    const subscription = AppState.addEventListener("change", onStateChange);
    return () => subscription.remove();
  }, [authReady, refresh]);

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
    try {
      await signOutWithPushCleanup();
      router.replace("/auth/login");
    } catch {
      Alert.alert("Ausloggen noch nicht möglich", "Dein Gerät konnte nicht sicher vom Push-Empfang getrennt werden. Prüfe deine Verbindung und versuche es nochmals.");
    }
  }

  const checkingSafety = loading && (status === null || checkFailed);
  const blocking = checkingSafety || checkFailed || (isFullAccountLock && !isSafetyRoute);
  const webBlockProps = Platform.OS === "web" ? { inert: blocking } : {};
  return (
    <View style={{ flex: 1 }}>
      <View {...webBlockProps} aria-hidden={blocking} style={{ flex: 1 }} pointerEvents={blocking ? "none" : "auto"} accessibilityElementsHidden={blocking} importantForAccessibility={blocking ? "no-hide-descendants" : "auto"}>
        {children}
      </View>
      {checkingSafety ? <View accessibilityViewIsModal pointerEvents="auto" style={[StyleSheet.absoluteFillObject, { zIndex: 9999 }]}><ProductLoading label="Sicherheit wird geprüft" /></View> : null}
      {checkFailed && !loading ? <View accessibilityViewIsModal pointerEvents="auto" style={[StyleSheet.absoluteFillObject, { zIndex: 9999 }]}><ProductState title="Sicherheitsprüfung nicht erreichbar" message="Prüfe deine Verbindung und versuche es nochmals." actionLabel="Nochmals versuchen" onAction={() => void refresh()} /></View> : null}
      {!checkFailed && isFullAccountLock && !isSafetyRoute ? <SafeAreaView accessibilityViewIsModal aria-modal
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

            <Pressable accessibilityRole="button"
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

            <Pressable accessibilityRole="button"
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
        </SafeAreaView> : null}
    </View>
  );
}

const styles = StyleSheet.create({
  lockRoot: { flex: 1, backgroundColor: backyrdTheme.color.background },
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
  title: { marginTop: 13, color: backyrdTheme.color.textPrimary, fontSize: 38, lineHeight: 42, fontWeight: "900", letterSpacing: -1.2 },
  body: { marginTop: 17, color: "#A1A1AA", fontSize: 16, lineHeight: 24 },
  primaryButton: {
    marginTop: 32, minHeight: 58, borderRadius: 19, flexDirection: "row", alignItems: "center",
    justifyContent: "center", gap: 10, backgroundColor: "#FF4F91",
  },
  primaryButtonText: { color: backyrdTheme.color.onAccent, fontSize: 16, fontWeight: "900" },
  secondaryButton: {
    marginTop: 12, minHeight: 56, borderRadius: 19, flexDirection: "row", alignItems: "center",
    justifyContent: "center", gap: 10, backgroundColor: backyrdTheme.color.surfaceElevated,
    borderWidth: 1, borderColor: backyrdTheme.color.border,
  },
  secondaryButtonText: { color: backyrdTheme.color.textPrimary, fontSize: 16, fontWeight: "900" },
});
