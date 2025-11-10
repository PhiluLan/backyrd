import React, { useEffect } from "react";
import { Stack, useRouter } from "expo-router";
import {
  useFonts,
  PlayfairDisplay_400Regular,
  PlayfairDisplay_700Bold,
} from "@expo-google-fonts/playfair-display";
import { Text } from "react-native";
import { registerForPushNotificationsAsync } from "../lib/notifications";
import SplashScreen from "./splash";
import { useAuth } from "../hooks/useAuth";

export default function RootLayout() {
  const [fontsLoaded] = useFonts({
    PlayfairDisplay_400Regular,
    PlayfairDisplay_700Bold,
  });

  const { session, loading } = useAuth();
  const router = useRouter();

  // 🔔 Push Notifications
  useEffect(() => {
    (async () => {
      try {
        await registerForPushNotificationsAsync();
      } catch (e) {
        console.log("Push registration error:", e);
      }
    })();
  }, []);

  // 📌 Global Font Override
  useEffect(() => {
    const oldRender = Text.render;

    if (oldRender) {
      Text.render = function (...args) {
        const origin = oldRender.call(this, ...args);

        return React.cloneElement(origin, {
          style: [
            { fontFamily: "PlayfairDisplay_400Regular" },
            origin.props.style,
          ],
        });
      };
    }
  }, []);

  // ✅ Login / Tabs Navigation
  useEffect(() => {
    if (!loading && fontsLoaded) {
      router.replace("/(tabs)");
    }
  }, [loading, fontsLoaded]);

  // ⏳ Loading / Splash
  if (!fontsLoaded || loading) return <SplashScreen />;

  return (
    <Stack screenOptions={{ headerShown: false }}>

      {/* Tabs */}
      <Stack.Screen name="(tabs)" />

      {/* Auth */}
      <Stack.Screen name="auth/login" />
      <Stack.Screen name="auth/register" />
      <Stack.Screen name="auth/verify" />

      {/* Detailseite */}
      <Stack.Screen
        name="spot/[id]"
        options={{
          headerShown: true,
          headerTintColor: "#000",
          headerBackTitle: "Zurück",
          headerTitle: "",
          headerStyle: { backgroundColor: "#FFFFF1" },
        }}
      />
    </Stack>
  );
}
