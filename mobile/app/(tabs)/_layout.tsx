// mobile/app/(tabs)/_layout.tsx
import { Tabs, useRouter } from "expo-router";
import { Ionicons } from "@expo/vector-icons";
import { useEffect, useState } from "react";
import * as Updates from "expo-updates";
import AsyncStorage from "@react-native-async-storage/async-storage";
import { supabase } from "../../lib/supabase";
import { StyleSheet } from "react-native";

export default function TabsLayout() {
  const router = useRouter();
  const [checkedSession, setCheckedSession] = useState(false);

  // 🔥 OTA Updates beim App-Start automatisch prüfen
  useEffect(() => {
    if (__DEV__) return;
    (async () => {
      try {
        const update = await Updates.checkForUpdateAsync();
        if (update.isAvailable) {
          await Updates.fetchUpdateAsync();
          await Updates.reloadAsync();
        }
      } catch (e) {
        console.log("OTA Update check failed:", e);
      }
    })();
  }, []);

  // 🧭 Session + Onboarding prüfen
  useEffect(() => {
    let active = true;
    (async () => {
      try {
        const { data } = await supabase.auth.getSession();
        const onboardingDone = await AsyncStorage.getItem("onboardingComplete");

        if (!data.session && onboardingDone !== "true") {
          router.replace("/onboarding");
        }
      } finally {
        if (active) setCheckedSession(true);
      }
    })();
    return () => {
      active = false;
    };
  }, []);

  if (!checkedSession) {
    return null; // Splash-Zustand
  }

  return (
    <Tabs
      screenOptions={{
        headerShown: false,
        tabBarStyle: {
          backgroundColor: "rgba(10,10,10,0.9)",
          borderTopColor: "#222",
          borderTopWidth: StyleSheet.hairlineWidth,
          position: "absolute",
          left: 0,
          right: 0,
          bottom: 0,
          elevation: 0,
        },
        tabBarActiveTintColor: "#fff",
        tabBarInactiveTintColor: "#888",
        tabBarLabelStyle: {
          fontSize: 12,
          fontWeight: "600",
          marginBottom: 2,
        },
      }}
    >
      <Tabs.Screen
        name="index"
        options={{
          title: "Home",
          tabBarIcon: ({ color, size, focused }) => (
            <Ionicons name={focused ? "home" : "home-outline"} color={color} size={size} />
          ),
        }}
      />
      <Tabs.Screen
        name="map"
        options={{
          title: "Map",
          tabBarIcon: ({ color, size, focused }) => (
            <Ionicons name={focused ? "map" : "map-outline"} color={color} size={size} />
          ),
        }}
      />
      <Tabs.Screen
        name="new-spot"
        options={{
          title: "Neu",
          tabBarIcon: ({ color, size, focused }) => (
            <Ionicons name={focused ? "add-circle" : "add-circle-outline"} color={color} size={size} />
          ),
        }}
      />
      <Tabs.Screen
        name="profile"
        options={{
          title: "Profil",
          tabBarIcon: ({ color, size, focused }) => (
            <Ionicons name={focused ? "person" : "person-outline"} color={color} size={size} />
          ),
        }}
      />

      <Tabs.Screen
        name="journey"
        options={{
          title: "Journey",
          tabBarIcon: ({ color, size, focused }) => (
            <Ionicons name={focused ? "sparkles" : "sparkles-outline"} color={color} size={size} />
          ),
        }}
      />

    </Tabs>
  );
}
