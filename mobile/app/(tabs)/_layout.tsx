// mobile/app/(tabs)/_layout.tsx
import { Ionicons } from "@expo/vector-icons";
import { Tabs, useGlobalSearchParams, usePathname, useRouter } from "expo-router";
import React from "react";
import { Pressable, StyleSheet, View } from "react-native";

import { trackAnalyticsEvent } from "../../lib/analytics";
import { backyrdTheme as theme } from "../../theme/backyrd";

const DEFAULT_TAB_BAR_STYLE = {
  position: "absolute" as const,
  left: 16,
  right: 16,
  bottom: 14,
  height: 78,
  paddingTop: 8,
  paddingBottom: 12,
  borderTopWidth: 0,
  borderRadius: 30,
  borderWidth: 1,
  borderColor: "rgba(255,255,255,0.08)",
  backgroundColor: "rgba(7,7,8,0.96)",
  elevation: 0,
  shadowColor: "#000",
  shadowOpacity: 0.38,
  shadowRadius: 24,
  shadowOffset: { width: 0, height: 12 },
};

function SmartReviewTabButton({ onPress }: { onPress?: () => void }) {
  return (
    <View style={styles.plusWrap}>
      <Pressable
        accessibilityLabel="Mood abgeben"
        hitSlop={8}
        onPress={onPress}
        style={({ pressed }) => [
          styles.plusButton,
          pressed && styles.plusButtonPressed,
        ]}
      >
        <Ionicons name="add" size={30} color="#050506" />
      </Pressable>
    </View>
  );
}

export default function TabsLayout() {
  const router = useRouter();
  const pathname = usePathname();
  const params = useGlobalSearchParams();

  const hideTabs = pathname.includes("/decision") && params.hideTabs === "1";

  const hiddenTabStyle = hideTabs ? ({ display: "none" } as const) : DEFAULT_TAB_BAR_STYLE;

  return (
    <Tabs
      initialRouteName="index"
      screenOptions={{
        headerShown: false,
        tabBarStyle: hiddenTabStyle,
        tabBarActiveTintColor: theme.color.pink,
        tabBarInactiveTintColor: "#808087",
        tabBarHideOnKeyboard: true,
        tabBarLabelStyle: styles.tabLabel,
        tabBarItemStyle: styles.tabItem,
      }}
    >
      <Tabs.Screen
        name="index"
        options={{
          title: "Entdecken",
          tabBarIcon: ({ color, focused }) => (
            <Ionicons
              name={focused ? "home" : "home-outline"}
              color={color}
              size={25}
            />
          ),
        }}
      />

      <Tabs.Screen
        name="decision"
        options={{
          title: "Für jetzt",
          tabBarIcon: ({ color, focused }) => (
            <Ionicons
              name={focused ? "sparkles" : "sparkles-outline"}
              color={color}
              size={25}
            />
          ),
        }}
      />

      <Tabs.Screen
        name="smart-review"
        options={{
          title: "",
          tabBarIcon: () => null,
          tabBarButton: hideTabs
            ? () => null
            : () => (
                <SmartReviewTabButton
                  onPress={() => {
                    trackAnalyticsEvent({
                      eventName: "review_started",
                      screenName: "tabs",
                      properties: { mode: "smart", source: "tab_bar" },
                    });
                    router.push("/review/smart");
                  }}
                />
              ),
        }}
      />

      <Tabs.Screen
        name="map"
        options={{
          title: "Karte",
          tabBarIcon: ({ color, focused }) => (
            <Ionicons
              name={focused ? "map" : "map-outline"}
              color={color}
              size={25}
            />
          ),
        }}
      />

      <Tabs.Screen
        name="feed"
        options={{
          title: "Moments",
          tabBarIcon: ({ color, focused }) => (
            <Ionicons
              name={focused ? "albums" : "albums-outline"}
              color={color}
              size={25}
            />
          ),
        }}
      />

      <Tabs.Screen name="profile" options={{ href: null }} />
      <Tabs.Screen name="settings" options={{ href: null }} />
      <Tabs.Screen name="release-diagnostics" options={{ href: null }} />
      <Tabs.Screen name="decision-onboarding" options={{ href: null }} />
      <Tabs.Screen name="dev" options={{ href: null }} />
      <Tabs.Screen name="new-spot" options={{ href: null }} />
      <Tabs.Screen name="messages" options={{ href: null }} />
      <Tabs.Screen name="achievements" options={{ href: null }} />
      <Tabs.Screen name="journey" options={{ href: null }} />
      <Tabs.Screen name="spot" options={{ href: null }} />
    </Tabs>
  );
}

const styles = StyleSheet.create({
  tabItem: {
    paddingVertical: 4,
  },
  tabLabel: {
    marginBottom: 2,
    fontSize: 11,
    fontWeight: "700",
  },
  plusWrap: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
    marginTop: -20,
  },
  plusButton: {
    width: 64,
    height: 64,
    borderRadius: 32,
    backgroundColor: theme.color.pink,
    alignItems: "center",
    justifyContent: "center",
    shadowColor: "#000",
    shadowOpacity: 0.34,
    shadowRadius: 14,
    shadowOffset: { width: 0, height: 8 },
    elevation: 10,
    transform: [{ scale: 1 }],
  },
  plusButtonPressed: {
    opacity: 0.9,
    transform: [{ scale: 0.96 }],
  },
});
