// mobile/app/_layout.tsx
import React, { useEffect } from "react";
import { Stack } from "expo-router";
import {
  useFonts,
  PlayfairDisplay_400Regular,
  PlayfairDisplay_700Bold,
} from "@expo-google-fonts/playfair-display";
import { Text } from "react-native";
import { registerForPushNotificationsAsync } from "../lib/notifications";

export default function RootLayout() {
  const [fontsLoaded] = useFonts({
    PlayfairDisplay_400Regular,
    PlayfairDisplay_700Bold,
  });

  // 🧠 Push Notifications beim Start registrieren
  useEffect(() => {
    (async () => {
      try {
        await registerForPushNotificationsAsync();
      } catch (e) {
        console.log("Push registration error:", e);
      }
    })();
  }, []);

  if (!fontsLoaded) {
    return null; // Optional: Splash / Loader
  }

  // 📌 Override: global alle Text-Komponenten mit Playfair Regular
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

  return (
    <Stack screenOptions={{ headerShown: false }}>
      {/* Tabs-Navigation */}
      <Stack.Screen name="(tabs)" options={{ headerShown: false }} />

      {/* Spot-Details */}
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
