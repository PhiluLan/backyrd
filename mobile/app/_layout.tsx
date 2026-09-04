// mobile/app/_layout.tsx

import React, { useEffect } from "react";
import { Stack } from "expo-router";
import { useFonts } from "expo-font";
import { StyleSheet, View } from "react-native";
import { Inter_400Regular } from "@expo-google-fonts/inter/400Regular";
import { Inter_600SemiBold } from "@expo-google-fonts/inter/600SemiBold";
import { Inter_700Bold } from "@expo-google-fonts/inter/700Bold";
import { AuthProvider, useAuth } from "../hooks/useAuth";
import { AnalyticsProvider } from "../providers/AnalyticsProvider";
import { AnalyticsErrorBoundary } from "../components/AnalyticsErrorBoundary";
import GlobalSafetyEnforcementGuard from "../components/safety/GlobalSafetyEnforcementGuard";
import LegalGateGuard from "../components/consent/LegalGateGuard";
import ColdStartProductDeepLinkRouter from "../components/ColdStartProductDeepLinkRouter";
import PushNotificationRouter from "../components/PushNotificationRouter";
import { ProductLoading, ProductState } from "../components/ui/ProductState";
import { runtimeConfigStatus } from "../lib/supabase";

function RootStack() {
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

      <Stack.Screen
        name="spot/[id]"
        options={{
          headerShown: true,
          headerTintColor: "#FFFFFF",
          headerBackTitle: "Zurück",
          headerTitle: "",
          headerStyle: { backgroundColor: "#050506" },
          headerShadowVisible: false,
        }}
      />
    </Stack>
  );
}

function BootstrappedApp() {
  const [fontsLoaded, fontError] = useFonts({
    Inter_400Regular,
    Inter_600SemiBold,
    Inter_700Bold,
  });
  const { loading: authLoading } = useAuth();
  const bootstrapReady = !fontError && fontsLoaded && !authLoading;

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

  return (
    <AnalyticsProvider>
      <GlobalSafetyEnforcementGuard>
        <LegalGateGuard>
          <View style={styles.root}>
            <RootStack />
            <ColdStartProductDeepLinkRouter ready={bootstrapReady} />
            <PushNotificationRouter />
            {bootstrapState ? (
              <View
                accessibilityViewIsModal
                pointerEvents="auto"
                style={styles.bootstrapOverlay}
              >
                {bootstrapState}
              </View>
            ) : null}
          </View>
        </LegalGateGuard>
      </GlobalSafetyEnforcementGuard>
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
      <AuthProvider>
        <BootstrappedApp />
      </AuthProvider>
    </AnalyticsErrorBoundary>
  );
}
