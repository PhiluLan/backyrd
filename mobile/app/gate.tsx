// mobile/app/gate.tsx

import React, { useEffect, useRef, useState } from "react";
import {
  ActivityIndicator,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from "react-native";
import { LinearGradient } from "expo-linear-gradient";
import { useRouter } from "expo-router";

import SplashScreen from "./splash";
import { supabase } from "../lib/supabase";
import { getMyProductEntryStatus } from "../lib/onboardingStatus";
import { useAuth } from "../hooks/useAuth";
import { rootStartupNavigationAuthority } from "../lib/root-startup-navigation";

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
  if (Platform.OS !== "web") {
    return <SplashScreen />;
  }

  return (
    <View style={styles.loadingFallback}>
      <ActivityIndicator color="#fff" />
    </View>
  );
}

function LoggedOutGate() {
  const router = useRouter();

  return (
    <LinearGradient colors={["#050506", "#050506", "#171820"]} style={styles.authContainer}>
      <ScrollView contentContainerStyle={styles.authContent} showsVerticalScrollIndicator={false}>
      <View style={styles.authCard}>
        <Text allowFontScaling={false} style={styles.kicker}>BACKYRD</Text>
        <Text allowFontScaling={false} style={styles.title}>Willkommen bei Backyrd</Text>
        <Text maxFontSizeMultiplier={1.4} style={styles.subtitle}>
          Melde dich an oder erstelle deinen Account. Danach bauen wir deinen ersten persönlichen
          Decision-Geschmack.
        </Text>

        <Pressable
          onPress={() => router.push("/auth/login" as any)}
          style={({ pressed }) => [styles.primaryButton, pressed && styles.pressed]}
        >
          <Text maxFontSizeMultiplier={1.2} style={styles.primaryText}>Einloggen</Text>
        </Pressable>

        <Pressable
          onPress={() => router.push("/auth/register" as any)}
          style={({ pressed }) => [styles.secondaryButton, pressed && styles.pressed]}
        >
          <Text maxFontSizeMultiplier={1.2} style={styles.secondaryText}>Neu registrieren</Text>
        </Pressable>

        <Text maxFontSizeMultiplier={1.5} style={styles.hint}>
          Wenn du bereits eingeloggt bist, leitet dich Backyrd automatisch weiter.
        </Text>

        {__DEV__ ? (
          <View style={styles.previewRow}>
            <Pressable
              accessibilityRole="button"
              onPress={() => router.push({ pathname: "/auth/login", params: { preview: "invalid" } } as any)}
              style={({ pressed }) => [styles.previewButton, pressed && styles.pressed]}
            >
              <Text style={styles.previewText}>Login-Fehler</Text>
            </Pressable>
            <Pressable
              accessibilityRole="button"
              onPress={() => router.push({ pathname: "/auth/verify", params: { email: "vorschau@backyrd.ch" } } as any)}
              style={({ pressed }) => [styles.previewButton, pressed && styles.pressed]}
            >
              <Text style={styles.previewText}>Verification</Text>
            </Pressable>
            <Pressable
              accessibilityRole="button"
              onPress={() => router.push({ pathname: "/onboarding", params: { preview: "1" } } as any)}
              style={({ pressed }) => [styles.previewButton, pressed && styles.pressed]}
            >
              <Text style={styles.previewText}>Onboarding</Text>
            </Pressable>
          </View>
        ) : null}
      </View>
      </ScrollView>
    </LinearGradient>
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
        <Text style={styles.errorTitle}>Kurz warten</Text>
        <Text style={styles.errorText}>{errorMessage}</Text>

        <Pressable onPress={retry} style={({ pressed }) => [styles.primaryButton, pressed && styles.pressed]}>
          <Text style={styles.primaryText}>Nochmals versuchen</Text>
        </Pressable>
      </View>
    );
  }

  return <LoadingFallback />;
}

const styles = StyleSheet.create({
  loadingFallback: {
    flex: 1,
    backgroundColor: "#050506",
    alignItems: "center",
    justifyContent: "center",
  },
  authContainer: {
    flex: 1,
  },
  authContent: {
    flexGrow: 1,
    paddingHorizontal: 22,
    justifyContent: "center",
    paddingVertical: 48,
  },
  authCard: {
    borderRadius: 32,
    padding: 24,
    backgroundColor: "rgba(255,255,255,0.07)",
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.12)",
  },
  kicker: {
    color: "rgba(255,255,255,0.54)",
    fontSize: 13,
    fontWeight: "900",
    letterSpacing: 6,
    marginBottom: 18,
  },
  title: {
    color: "#fff",
    fontSize: 38,
    lineHeight: 41,
    fontWeight: "900",
    letterSpacing: -1.2,
  },
  subtitle: {
    color: "rgba(255,255,255,0.68)",
    fontSize: 16,
    lineHeight: 23,
    marginTop: 12,
    marginBottom: 22,
  },
  primaryButton: {
    height: 56,
    borderRadius: 18,
    backgroundColor: "#fff",
    alignItems: "center",
    justifyContent: "center",
    marginTop: 12,
  },
  primaryText: {
    color: "#050506",
    fontSize: 16,
    fontWeight: "900",
  },
  secondaryButton: {
    height: 56,
    borderRadius: 18,
    backgroundColor: "rgba(255,255,255,0.08)",
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.16)",
    alignItems: "center",
    justifyContent: "center",
    marginTop: 12,
  },
  secondaryText: {
    color: "#fff",
    fontSize: 16,
    fontWeight: "900",
  },
  hint: {
    color: "rgba(255,255,255,0.42)",
    fontSize: 12,
    lineHeight: 17,
    marginTop: 18,
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
    color: "rgba(255,255,255,0.58)",
    fontSize: 13,
    fontWeight: "700",
  },
  pressed: {
    opacity: 0.86,
    transform: [{ scale: 0.99 }],
  },
  errorContainer: {
    flex: 1,
    backgroundColor: "#050506",
    alignItems: "center",
    justifyContent: "center",
    padding: 24,
  },
  errorTitle: {
    color: "#fff",
    fontSize: 32,
    fontWeight: "900",
    marginBottom: 10,
  },
  errorText: {
    color: "rgba(255,255,255,0.65)",
    fontSize: 16,
    lineHeight: 23,
    textAlign: "center",
    marginBottom: 14,
  },
});
