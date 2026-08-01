// mobile/app/_layout.tsx

import React, { useEffect } from "react";
import { Stack } from "expo-router";
import {
  useFonts,
  PlayfairDisplay_400Regular,
  PlayfairDisplay_700Bold,
} from "@expo-google-fonts/playfair-display";
import { Platform, View, ActivityIndicator } from "react-native";

import SplashScreen from "./splash";
import { registerForPushNotificationsAsync } from "../lib/notifications";
import { useAuth } from "../hooks/useAuth";
import { AnalyticsProvider } from "../providers/AnalyticsProvider";
import { AnalyticsErrorBoundary } from "../components/AnalyticsErrorBoundary";
import { reportAnalyticsError } from "../lib/analytics";

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

  useEffect(() => {
    if (Platform.OS === "web") return;

    (async () => {
      try {
        await registerForPushNotificationsAsync();
      } catch (error) {
        console.log("Push registration error:", error);
        await reportAnalyticsError({
          error,
          errorType: "push_registration_error",
          severity: "warning",
          handled: true,
        });
      }
    })();
  }, []);

  if (!fontsLoaded || authLoading) {
    return Platform.OS === "web" ? <WebSafeFallback /> : <SplashScreen />;
  }

  return (
    <AnalyticsErrorBoundary>
      <AnalyticsProvider>
        <RootStack />
      </AnalyticsProvider>
    </AnalyticsErrorBoundary>
  );
}
