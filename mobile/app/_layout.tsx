// mobile/app/_layout.tsx

import React, { useCallback, useEffect, useMemo, useState } from "react";
import { Stack, useSegments } from "expo-router";
import * as ExpoSplashScreen from "expo-splash-screen";
import { useFonts } from "expo-font";
import { StatusBar } from "expo-status-bar";
import { StyleSheet, View } from "react-native";
import { LibreFranklin_400Regular } from "@expo-google-fonts/libre-franklin/400Regular";
import { LibreFranklin_600SemiBold } from "@expo-google-fonts/libre-franklin/600SemiBold";
import { LibreFranklin_700Bold } from "@expo-google-fonts/libre-franklin/700Bold";
import { BarlowCondensed_800ExtraBold } from "@expo-google-fonts/barlow-condensed/800ExtraBold";
import { AuthProvider, useAuth } from "../hooks/useAuth";
import { AnalyticsProvider } from "../providers/AnalyticsProvider";
import { AnalyticsErrorBoundary } from "../components/AnalyticsErrorBoundary";
import GlobalSafetyEnforcementGuard from "../components/safety/GlobalSafetyEnforcementGuard";
import LegalGateGuard from "../components/consent/LegalGateGuard";
import ColdStartProductDeepLinkRouter from "../components/ColdStartProductDeepLinkRouter";
import PushNotificationRouter from "../components/PushNotificationRouter";
import { ProductLoading, ProductState } from "../components/ui/ProductState";
import { runtimeConfigStatus } from "../lib/supabase";
import SplashScreen from "./splash";
import { useBackyrdTheme, usesFixedDarkAppearance } from "../theme/backyrd";
import { AppearancePreferenceProvider } from "../theme/appearancePreference";
import { StartupContentContext } from "../providers/StartupContentProvider";

const STARTUP_CONTENT_DEADLINE_MS = 9_000;

void ExpoSplashScreen.preventAutoHideAsync().catch(() => undefined);

function RootStack() {
  const { color } = useBackyrdTheme();
  return (
    <Stack screenOptions={{ headerShown: false }}>
      <Stack.Screen name="gate" />
      <Stack.Screen name="(tabs)" />
      <Stack.Screen name="privacy-consent" />
      <Stack.Screen name="privacy-consents" />
      <Stack.Screen name="privacy-history" />
      <Stack.Screen name="privacy-legal-documents" />
      <Stack.Screen name="privacy-data-rights" />
      <Stack.Screen name="legal-consent" />

      <Stack.Screen name="auth/login" />
      <Stack.Screen name="auth/register" />
      <Stack.Screen name="auth/verify" />

      <Stack.Screen name="onboarding/index" />

      <Stack.Screen name="events/index" />
      <Stack.Screen name="events/[id]" />

      <Stack.Screen
        name="spot/[id]"
        options={{
          headerShown: true,
          headerTintColor: color.textPrimary,
          headerBackTitle: "Zurück",
          headerTitle: "",
          headerStyle: { backgroundColor: color.background },
          headerShadowVisible: false,
        }}
      />
    </Stack>
  );
}

function BootstrappedApp() {
  const [group, leaf] = useSegments() as readonly string[];
  const [fontsLoaded, fontError] = useFonts({
    LibreFranklin_400Regular,
    LibreFranklin_600SemiBold,
    LibreFranklin_700Bold,
    BarlowCondensed_800ExtraBold,
  });
  const { loading: authLoading } = useAuth();
  const [safetyStartupReady, setSafetyStartupReady] = useState(false);
  const bootstrapReady = !fontError && fontsLoaded && !authLoading && safetyStartupReady;
  const [splashSettled, setSplashSettled] = useState(false);
  const [reactSplashReady, setReactSplashReady] = useState(false);
  const [nativeSplashHidden, setNativeSplashHidden] = useState(false);
  const [gateReady, setGateReady] = useState(false);
  const [homeReady, setHomeReady] = useState(false);
  const [contentDeadlineReached, setContentDeadlineReached] = useState(false);
  const [startupRevealed, setStartupRevealed] = useState(false);
  const reportGateReady = useCallback(() => setGateReady(true), []);
  const reportHomeReady = useCallback(() => setHomeReady(true), []);
  const startupContent = useMemo(() => startupRevealed ? {} : { reportGateReady, reportHomeReady }, [startupRevealed, reportGateReady, reportHomeReady]);

  const bootstrapState = fontError ? (
    <ProductState
      title="Darstellung nicht geladen"
      message="Backyrd konnte seine Schrift gerade nicht vorbereiten. Starte die App bitte noch einmal."
    />
  ) : !fontsLoaded || authLoading ? (
    <ProductLoading />
  ) : null;

  useEffect(() => {
    if (bootstrapReady) {
      console.log("[startup-authority] bootstrap completed=true");
    }
  }, [bootstrapReady]);

  const onSplashSettled = useCallback(() => setSplashSettled(true), []);
  const onReactSplashReady = useCallback(() => setReactSplashReady(true), []);
  const onSafetyStartupReady = useCallback(() => setSafetyStartupReady(true), []);

  useEffect(() => {
    // Do not hide the native launch screen until the React splash has a real
    // layout. Hiding it after the animation would run that animation behind
    // the native screen and leave only the final b. mark visible.
    if ((!reactSplashReady && !fontError) || nativeSplashHidden) return;

    void ExpoSplashScreen.hideAsync()
      .catch(() => undefined)
      .finally(() => setNativeSplashHidden(true));
  }, [fontError, nativeSplashHidden, reactSplashReady]);

  const entryRoute = !group || group === "index" || group === "gate";
  const homeRoute = group === "(tabs)" && (!leaf || leaf === "index");
  const contentReady = entryRoute ? gateReady : !homeRoute || homeReady;
  const canReveal = bootstrapReady && splashSettled && (contentReady || contentDeadlineReached);
  const showStartupSplash = !fontError && !startupRevealed && !canReveal;

  useEffect(() => {
    if (!bootstrapReady || startupRevealed || contentDeadlineReached) return;
    const timeout = setTimeout(() => setContentDeadlineReached(true), STARTUP_CONTENT_DEADLINE_MS);
    return () => clearTimeout(timeout);
  }, [bootstrapReady, startupRevealed, contentDeadlineReached]);

  useEffect(() => {
    if (canReveal) setStartupRevealed(true);
  }, [canReveal]);

  return (
    <AnalyticsProvider>
      <StatusBar style={usesFixedDarkAppearance ? "light" : "auto"} />
      <View style={styles.root}>
        <StartupContentContext.Provider value={startupContent}>
          <View
            style={styles.root}
            aria-hidden={showStartupSplash}
            importantForAccessibility={showStartupSplash ? "no-hide-descendants" : "auto"}
            accessibilityElementsHidden={showStartupSplash}
          >
            <GlobalSafetyEnforcementGuard
              authReady={!authLoading}
              onStartupCheckSettled={onSafetyStartupReady}
            >
              <LegalGateGuard>
                <RootStack />
                <ColdStartProductDeepLinkRouter ready={bootstrapReady} />
                <PushNotificationRouter />
              </LegalGateGuard>
            </GlobalSafetyEnforcementGuard>
          </View>
        </StartupContentContext.Provider>
        {fontError ? (
          <View
            accessibilityViewIsModal
            pointerEvents="auto"
            style={styles.bootstrapOverlay}
          >
            {bootstrapState}
          </View>
        ) : showStartupSplash ? (
          <View
            accessibilityViewIsModal
            pointerEvents="auto"
            testID="startup-splash"
            style={styles.bootstrapOverlay}
          >
            <SplashScreen
              onAnimationSettled={onSplashSettled}
              onReadyToReveal={onReactSplashReady}
            />
          </View>
        ) : null}
      </View>
    </AnalyticsProvider>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1 },
  bootstrapOverlay: {
    ...StyleSheet.absoluteFillObject,
    zIndex: 10_000,
  },
});

export default function RootLayout() {
  useEffect(() => {
    if (!runtimeConfigStatus.valid) void ExpoSplashScreen.hideAsync();
  }, []);

  if (!runtimeConfigStatus.valid) {
    return (
      <ProductState
        title="App nicht startbereit"
        message="Die sichere Verbindung ist in dieser App-Version nicht vollständig konfiguriert. Bitte aktualisiere Backyrd oder versuche es später erneut."
      />
    );
  }

  return (
    <AnalyticsErrorBoundary>
      <AppearancePreferenceProvider>
        <AuthProvider>
          <BootstrappedApp />
        </AuthProvider>
      </AppearancePreferenceProvider>
    </AnalyticsErrorBoundary>
  );
}
