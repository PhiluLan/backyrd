// mobile/app/_layout.tsx

import React from "react";
import { Stack } from "expo-router";
import {
  useFonts,
  PlayfairDisplay_400Regular,
  PlayfairDisplay_700Bold,
} from "@expo-google-fonts/playfair-display";
import { Platform, View, ActivityIndicator } from "react-native";

import SplashScreen from "./splash";
import { useAuth } from "../hooks/useAuth";
import { AnalyticsProvider } from "../providers/AnalyticsProvider";
import { AnalyticsErrorBoundary } from "../components/AnalyticsErrorBoundary";
import GlobalSafetyEnforcementGuard from "../components/safety/GlobalSafetyEnforcementGuard";
import LegalGateGuard from "../components/consent/LegalGateGuard";

function WebSafeFallback() {
  return (
    <View
      style={{
        flex: 1,
        backgroundColor: "#0B0B0C",
        alignItems: "center",
        justifyContent: "center",
      }}
    >
      <ActivityIndicator color="#FF7DA7" />
    </View>
  );
}

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
      <Stack.Screen name="onboarding/profile" />
      <Stack.Screen name="onboarding/decision" />

      <Stack.Screen
        name="spot/[id]"
        options={{
          headerShown: true,
          headerTintColor: "#FFFFFF",
          headerBackTitle: "Zurück",
          headerTitle: "",
          headerStyle: { backgroundColor: "#09090A" },
          headerShadowVisible: false,
        }}
      />
    </Stack>
  );
}

export default function RootLayout() {
  const [fontsLoaded] = useFonts({
    PlayfairDisplay_400Regular,
    PlayfairDisplay_700Bold,
  });

  const { loading: authLoading } = useAuth();


  if (!fontsLoaded || authLoading) {
    return Platform.OS === "web" ? <WebSafeFallback /> : <SplashScreen />;
  }

  return (
    <AnalyticsErrorBoundary>
      <AnalyticsProvider>
        <GlobalSafetyEnforcementGuard>
          <LegalGateGuard>
            <RootStack />
          </LegalGateGuard>
        </GlobalSafetyEnforcementGuard>
      </AnalyticsProvider>
    </AnalyticsErrorBoundary>
  );
}
