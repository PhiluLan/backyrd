// mobile/app/(tabs)/_layout.tsx
import { Tabs, useGlobalSearchParams, usePathname, useRouter } from "expo-router";
import { Ionicons } from "@expo/vector-icons";
import { useEffect, useMemo, useState } from "react";
import { Platform, Pressable, StyleSheet, View } from "react-native";
import * as Updates from "expo-updates";
import { supabase } from "../../lib/supabase";

const DEV_EMAIL = "philipplanger@yahoo.com";

const DEFAULT_TAB_BAR_STYLE = {
  position: "absolute" as const,
  left: 14,
  right: 14,
  bottom: 16,
  height: 74,
  backgroundColor: "rgba(10,10,10,0.94)",
  borderTopWidth: 0,
  borderRadius: 26,
  elevation: 0,
  paddingTop: 8,
  paddingBottom: 10,
};

function SmartReviewTabButton({ onPress }: { onPress?: () => void }) {
  return (
    <View style={styles.plusWrap}>
      <Pressable onPress={onPress} style={styles.plusBtn}>
        <Ionicons name="add" size={28} color="#000" />
      </Pressable>
    </View>
  );
}

export default function TabsLayout() {
  const router = useRouter();
  const pathname = usePathname();
  const params = useGlobalSearchParams();

  const [checkedSession, setCheckedSession] = useState(false);
  const [sessionEmail, setSessionEmail] = useState<string | null>(null);

  const isDev = useMemo(() => {
    return (sessionEmail ?? "").toLowerCase() === DEV_EMAIL.toLowerCase();
  }, [sessionEmail]);

  const hideTabs = pathname.includes("/decision") && params.hideTabs === "1";

  useEffect(() => {
    if (__DEV__) return;
    if (Platform.OS === "web") return;

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

  useEffect(() => {
    let active = true;

    (async () => {
      try {
        const { data } = await supabase.auth.getSession();

        const email = data.session?.user?.email ?? null;
        if (active) setSessionEmail(email);

        if (!data.session) {
          router.replace("/gate" as any);
          return;
        }
      } finally {
        if (active) setCheckedSession(true);
      }
    })();

    const { data: sub } = supabase.auth.onAuthStateChange((_event, session) => {
      setSessionEmail(session?.user?.email ?? null);

      if (!session) {
        router.replace("/gate" as any);
      }
    });

    return () => {
      active = false;
      sub.subscription.unsubscribe();
    };
  }, [router]);

  if (!checkedSession) return null;

  return (
    <Tabs
      initialRouteName="index"
      screenOptions={{
        headerShown: false,
        tabBarStyle: hideTabs ? { display: "none" } : DEFAULT_TAB_BAR_STYLE,
        tabBarActiveTintColor: "#fff",
        tabBarInactiveTintColor: "#777",
        tabBarLabelStyle: { fontSize: 12, fontWeight: "600", marginBottom: 2 },
        tabBarItemStyle: { paddingVertical: 4 },
      }}
    >
      <Tabs.Screen name="index" options={{ title: "Home", tabBarIcon: ({ color, size, focused }) => <Ionicons name={focused ? "home" : "home-outline"} color={color} size={size} /> }} />
      <Tabs.Screen name="decision" options={{ title: "Decision", tabBarIcon: ({ color, size, focused }) => <Ionicons name={focused ? "sparkles" : "sparkles-outline"} color={color} size={size} /> }} />
      <Tabs.Screen name="smart-review" options={{ title: "", tabBarIcon: () => null, tabBarButton: hideTabs ? () => null : () => <SmartReviewTabButton onPress={() => router.push("/review/smart")} /> }} />
      <Tabs.Screen name="map" options={{ title: "Karte", tabBarIcon: ({ color, size, focused }) => <Ionicons name={focused ? "map" : "map-outline"} color={color} size={size} /> }} />
      <Tabs.Screen name="feed" options={{ title: "Feed", tabBarIcon: ({ color, size, focused }) => <Ionicons name={focused ? "albums" : "albums-outline"} color={color} size={size} /> }} />
      <Tabs.Screen name="settings" options={{ title: "Settings", tabBarIcon: ({ color, size, focused }) => <Ionicons name={focused ? "settings" : "settings-outline"} color={color} size={size} /> }} />
      <Tabs.Screen name="profile" options={{ href: null }} />
      <Tabs.Screen name="dev" options={{ href: null }} />
      <Tabs.Screen name="decision-onboarding" options={{ href: null }} />
      <Tabs.Screen name="new-spot" options={{ href: null }} />
      <Tabs.Screen name="messages" options={{ href: null }} />
      <Tabs.Screen name="achievements" options={{ href: null }} />
      <Tabs.Screen name="explore" options={{ href: null }} />
      <Tabs.Screen name="journey" options={{ href: null }} />
      <Tabs.Screen name="spot" options={{ href: null }} />
    </Tabs>
  );
}

const styles = StyleSheet.create({
  plusWrap: { flex: 1, alignItems: "center", justifyContent: "center", marginTop: -18 },
  plusBtn: { width: 62, height: 62, borderRadius: 31, backgroundColor: "#fff", alignItems: "center", justifyContent: "center", shadowColor: "#000", shadowOpacity: 0.28, shadowRadius: 10, shadowOffset: { width: 0, height: 6 }, elevation: 10 },
});
