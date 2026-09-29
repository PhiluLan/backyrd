// mobile/app/gate.tsx

import React, { useEffect, useRef, useState } from "react";
import { Platform, Pressable, ScrollView, StyleSheet, View } from "react-native";
import { AppText } from "../components/foundation/AppText";
import { LinearGradient } from "expo-linear-gradient";
import { useRouter } from "expo-router";
import { SafeAreaView } from "react-native-safe-area-context";
import { Ionicons } from "@expo/vector-icons";

import SplashScreen from "./splash";
import { supabase } from "../lib/supabase";
import { getMyProductEntryStatus } from "../lib/onboardingStatus";
import { useAuth } from "../hooks/useAuth";
import { rootStartupNavigationAuthority } from "../lib/root-startup-navigation";
import { backyrdTheme as theme } from "../theme/backyrd";

function normalizeRoute(route: string | null | undefined): string {
  if (!route) return "/(tabs)";

  if (route === "/(tabs)") return "/(tabs)";
  if (route === "/auth/login") return "/auth/login";

  // Backend route names -> real Expo Router files
  if (route === "/onboarding") return "/onboarding";
  if (route === "/onboarding/profile") return "/onboarding";
  if (route === "/onboarding/decision") return "/(tabs)/decision-onboarding";
  if (route === "/decision-onboarding") return "/(tabs)/decision-onboarding";
  if (route === "/(tabs)/decision-onboarding") return "/(tabs)/decision-onboarding";

  return "/(tabs)";
}

function LoadingFallback() {
  return <SplashScreen compact />;
}

function LoggedOutGate() {
  const router = useRouter();

  return (
    <SafeAreaView style={styles.authContainer} edges={["top", "bottom"]}>
      <LinearGradient colors={["#050505", "#050505", "#190D15"]} style={StyleSheet.absoluteFill} />
      <ScrollView contentContainerStyle={styles.authContent} showsVerticalScrollIndicator={false}>
      <View style={styles.brandRow}>
        <View style={styles.brandMark}><AppText role="cardTitle" style={styles.brandLetter}>B</AppText></View>
        <AppText role="label" style={styles.brandName}>BACKYRD</AppText>
      </View>

      <View style={styles.intro}>
        <View style={styles.accentLine} />
        <AppText role="label" tone="pink" style={styles.kicker}>DEIN NÄCHSTER MOMENT</AppText>
        <AppText role="displayXL" style={styles.title}>Rausgehen. Erleben. Erinnern.</AppText>
        <AppText role="body" tone="secondary" style={styles.subtitle}>
          Finde Orte, die zu dir und dem Moment passen, den du jetzt erleben möchtest.
        </AppText>
      </View>

      <View style={styles.actions}>
        <Pressable accessibilityRole="button" onPress={() => router.push("/auth/login" as any)} style={({ pressed }) => [styles.primaryButton, pressed && styles.pressed]}>
          <AppText role="bodyStrong" style={styles.primaryText}>Einloggen</AppText>
          <Ionicons name="arrow-forward" size={20} color={theme.color.background} />
        </Pressable>

        <Pressable accessibilityRole="button" onPress={() => router.push("/auth/register" as any)} style={({ pressed }) => [styles.secondaryButton, pressed && styles.pressed]}>
          <AppText role="bodyStrong">Account erstellen</AppText>
        </Pressable>

        {__DEV__ ? (
          <View style={styles.previewRow}>
            <Pressable
              accessibilityRole="button"
              onPress={() => router.push({ pathname: "/auth/login", params: { preview: "invalid" } } as any)}
              style={({ pressed }) => [styles.previewButton, pressed && styles.pressed]}
            >
              <AppText role="caption" style={styles.previewText}>Login-Fehler</AppText>
            </Pressable>
            <Pressable
              accessibilityRole="button"
              onPress={() => router.push({ pathname: "/auth/verify", params: { email: "vorschau@backyrd.ch" } } as any)}
              style={({ pressed }) => [styles.previewButton, pressed && styles.pressed]}
            >
              <AppText role="caption" style={styles.previewText}>Verification</AppText>
            </Pressable>
            <Pressable
              accessibilityRole="button"
              onPress={() => router.push({ pathname: "/onboarding", params: { preview: "1" } } as any)}
              style={({ pressed }) => [styles.previewButton, pressed && styles.pressed]}
            >
              <AppText role="caption" style={styles.previewText}>Onboarding</AppText>
            </Pressable>
          </View>
        ) : null}
      </View>
      </ScrollView>
    </SafeAreaView>
  );
}

export default function GateScreen() {
  const router = useRouter();
  const { session, loading: authLoading } = useAuth();

  const didRouteRef = useRef(false);
  const [checkingStatus, setCheckingStatus] = useState(false);
  const [forcedLoggedOut, setForcedLoggedOut] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  async function forceLogoutBecauseSessionIsStale(reason?: unknown) {
    console.log("Gate stale session detected:", reason);
    didRouteRef.current = false;
    setForcedLoggedOut(true);
    setErrorMessage(null);

    try {
      await supabase.auth.signOut();
    } catch (signOutError) {
      console.log("Gate signOut after stale session failed:", signOutError);
    }
  }

  async function routeUser() {
    if (didRouteRef.current) return;
    if (authLoading) return;

    setErrorMessage(null);

    if (!session?.user || forcedLoggedOut) {
      return;
    }

    try {
      setCheckingStatus(true);

      // Important: getSession() can still return a locally cached session after the user
      // was deleted in Supabase. getUser() verifies the JWT against Supabase Auth.
      const { data: verifiedUserData, error: verifiedUserError } = await supabase.auth.getUser();

      if (verifiedUserError && verifiedUserError.status !== 401 && verifiedUserError.status !== 403) {
        throw verifiedUserError;
      }

      if (verifiedUserError || !verifiedUserData.user?.id) {
        await forceLogoutBecauseSessionIsStale(verifiedUserError?.message ?? "No verified user");
        return;
      }

      const status = await getMyProductEntryStatus();

      if (!status.loggedIn) {
        await forceLogoutBecauseSessionIsStale("RPC returned logged_in=false");
        return;
      }

      const target = normalizeRoute(status.nextRoute);

      if (Platform.OS === "ios") {
        const startupSelection =
          await rootStartupNavigationAuthority.waitForSelection();

        if (target === "/(tabs)" && startupSelection.kind === "target") {
          didRouteRef.current = true;
          rootStartupNavigationAuthority.allowProductTargetFromEntryGate();
          console.log("[startup-authority] product-entry=target-authorized");
          return;
        }

        if (target === "/(tabs)") {
          rootStartupNavigationAuthority.completeDefaultStart();
          console.log("[startup-authority] product-entry=default-home");
        } else {
          console.log("[startup-authority] product-entry=mandatory-gate");
        }
      }

      didRouteRef.current = true;
      router.replace(target as any);
    } catch (error: any) {
      console.log("Gate status error:", error?.message ?? error);
      setErrorMessage("Wir konnten deinen App-Status gerade nicht laden. Bitte versuche es nochmals.");
    } finally {
      setCheckingStatus(false);
    }
  }

  useEffect(() => {
    didRouteRef.current = false;
    setForcedLoggedOut(false);
    routeUser();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [authLoading, session?.user?.id]);

  async function retry() {
    didRouteRef.current = false;
    await routeUser();
  }

  if (authLoading || checkingStatus) {
    return <LoadingFallback />;
  }

  if (!session?.user || forcedLoggedOut) {
    return <LoggedOutGate />;
  }

  if (errorMessage) {
    return (
      <View style={styles.errorContainer}>
        <AppText role="screenTitle" style={styles.errorTitle}>Kurz warten</AppText>
        <AppText role="body" style={styles.errorText}>{errorMessage}</AppText>

        <Pressable onPress={retry} style={({ pressed }) => [styles.primaryButton, pressed && styles.pressed]}>
          <AppText role="bodyStrong" style={styles.primaryText}>Nochmals versuchen</AppText>
        </Pressable>
      </View>
    );
  }

  return <LoadingFallback />;
}

const styles = StyleSheet.create({
  authContainer: {
    flex: 1,
    backgroundColor: theme.color.background,
  },
  authContent: {
    flexGrow: 1,
    paddingHorizontal: theme.layout.pageGutter,
    paddingTop: theme.spacing.xxl,
    paddingBottom: theme.spacing.xxl,
    justifyContent: "space-between",
  },
  brandRow: { flexDirection: "row", alignItems: "center", gap: 12 },
  brandMark: { width: 38, height: 38, borderRadius: 12, backgroundColor: theme.color.pink, alignItems: "center", justifyContent: "center" },
  brandLetter: { color: theme.color.background, lineHeight: 25 },
  brandName: { letterSpacing: 3.2 },
  intro: { marginTop: 92, marginBottom: 62 },
  accentLine: { width: 36, height: 4, borderRadius: 2, backgroundColor: theme.color.pink, marginBottom: 22 },
  kicker: {
    letterSpacing: 2.2,
    marginBottom: 18,
  },
  title: {
    maxWidth: 380,
  },
  subtitle: { maxWidth: 350, marginTop: 22 },
  actions: { gap: 12 },
  primaryButton: {
    minHeight: 56,
    borderRadius: theme.radius.pill,
    backgroundColor: theme.color.pink,
    alignItems: "center",
    justifyContent: "center",
    flexDirection: "row",
    gap: 12,
    paddingHorizontal: 24,
  },
  primaryText: {
    color: theme.color.background,
  },
  secondaryButton: {
    minHeight: 56,
    borderRadius: theme.radius.pill,
    backgroundColor: "rgba(246,240,232,0.05)",
    borderWidth: 1,
    borderColor: theme.color.border,
    alignItems: "center",
    justifyContent: "center",
  },
  previewButton: {
    flex: 1,
    minHeight: 44,
    alignItems: "center",
    justifyContent: "center",
    marginTop: 8,
  },
  previewRow: {
    flexDirection: "row",
    gap: 8,
    marginTop: 8,
  },
  previewText: {
    color: theme.color.textSecondary,
  },
  pressed: {
    opacity: 0.86,
    transform: [{ scale: 0.99 }],
  },
  errorContainer: {
    flex: 1,
    backgroundColor: theme.color.background,
    alignItems: "center",
    justifyContent: "center",
    padding: 24,
  },
  errorTitle: {
    marginBottom: 10,
  },
  errorText: {
    color: theme.color.textSecondary,
    textAlign: "center",
    marginBottom: 14,
  },
});
