// mobile/app/(tabs)/_layout.tsx
import { AppText } from "../../components/foundation/AppText";
import { Ionicons } from "@expo/vector-icons";
import { BlurView } from "expo-blur";
import { Tabs, useGlobalSearchParams, usePathname, useRouter } from "expo-router";
import React from "react";
import { ActivityIndicator, Alert, Pressable, StyleSheet, View, useWindowDimensions } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";

import { trackAnalyticsEvent } from "../../lib/analytics";
import { useAuth } from "../../hooks/useAuth";
import { backyrdTheme as theme } from "../../theme/backyrd";
import { openMomentComposerSafely } from "../../lib/safety-moment-entry";

function SmartReviewTabButton({ onPress, opening }: { onPress?: () => void; opening: boolean }) {
  return (
    <View style={styles.plusWrap}>
      <Pressable
        accessibilityRole="button"
        accessibilityLabel="Moment mit Foto festhalten"
        accessibilityState={{ busy: opening, disabled: opening }}
        disabled={opening}
        hitSlop={8}
        onPress={onPress}
        style={({ pressed }) => [
          styles.plusButton,
          pressed && styles.plusButtonPressed,
        ]}
      >
        {opening ? <ActivityIndicator color={theme.color.background} /> : <Ionicons name="add" size={27} color={theme.color.background} />}
      </Pressable>
    </View>
  );
}

export default function TabsLayout() {
  const router = useRouter();
  const pathname = usePathname();
  const params = useGlobalSearchParams();
  const insets = useSafeAreaInsets();
  const { user } = useAuth();
  const momentOpening = React.useRef(false);
  const [openingMoment, setOpeningMoment] = React.useState(false);
  const isGuest = !user;
  const { width } = useWindowDimensions();
  const compactTabs = !isGuest && width < 360;

  const hideTabs = pathname.includes("/decision-onboarding") || (pathname.includes("/decision") && params.hideTabs === "1");

  const tabBarStyle = hideTabs
    ? ({ display: "none" } as const)
    : [styles.tabBar, { bottom: Math.max(8, insets.bottom - 2), left: compactTabs ? 8 : 14, right: compactTabs ? 8 : 14 }];

  return (
    <Tabs
      initialRouteName="index"
      screenOptions={{
        headerShown: false,
        tabBarStyle,
        tabBarBackground: () => (
          <BlurView intensity={54} tint="dark" style={styles.tabBarGlass} />
        ),
        tabBarActiveTintColor: theme.color.pink,
        tabBarInactiveTintColor: "#808087",
        tabBarHideOnKeyboard: true,
        tabBarLabel: ({ children, color }) => <AppText role="caption" numberOfLines={1} adjustsFontSizeToFit minimumFontScale={0.9} maxFontSizeMultiplier={1.1} style={[styles.tabLabel, compactTabs && styles.compactTabLabel, { color }]}>{children}</AppText>,
        tabBarItemStyle: styles.tabItem,
      }}
    >
      <Tabs.Screen
        name="index"
        options={{
          title: "Entdecken",
          tabBarAccessibilityLabel: "Entdecken",
          tabBarIcon: ({ color, focused }) => (
            <Ionicons
              name={focused ? "compass" : "compass-outline"}
              color={color}
              size={23}
            />
          ),
        }}
      />

      <Tabs.Screen
        name="wohin"
        options={{
          href: isGuest ? null : undefined,
          title: "Wohin",
          tabBarAccessibilityLabel: "Wohin",
          tabBarIcon: ({ color, focused }) => (
            <Ionicons
              name={focused ? "sparkles" : "sparkles-outline"}
              color={color}
              size={23}
            />
          ),
        }}
      />

      <Tabs.Screen
        name="smart-review"
        options={{
          title: "",
          tabBarIcon: () => null,
          tabBarButton: isGuest || hideTabs
            ? () => null
            : () => (
                <SmartReviewTabButton
                  opening={openingMoment}
                  onPress={() => {
                    if (momentOpening.current) return;
                    momentOpening.current = true;
                    setOpeningMoment(true);
                    void openMomentComposerSafely({ router, href: "/review/smart?capture=1", onAllowed: () => {
                      void trackAnalyticsEvent({ eventName: "review_started", screenName: "tabs", properties: { mode: "camera_first", source: "tab_bar" } });
                    } }).catch(() => Alert.alert("Moment gerade nicht verfügbar", "Versuche es bitte noch einmal."))
                      .finally(() => { momentOpening.current = false; setOpeningMoment(false); });
                  }}
                />
              ),
        }}
      />

      <Tabs.Screen
        name="map"
        options={{
          title: "Orte",
          tabBarAccessibilityLabel: "Orte",
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
          href: isGuest ? null : undefined,
          title: "Momente",
          tabBarAccessibilityLabel: "Momente",
          tabBarIcon: ({ color, focused }) => (
            <Ionicons
              name={focused ? "people" : "people-outline"}
              color={color}
              size={23}
            />
          ),
        }}
      />

      <Tabs.Screen
        name="booking"
        options={{ title: "Booking", tabBarAccessibilityLabel: "Booking", tabBarIcon: ({ color, focused }) => <Ionicons name={focused ? "calendar" : "calendar-outline"} color={color} size={23} /> }}
      />
      <Tabs.Screen name="profile" options={{ href: null }} />
      <Tabs.Screen name="decision" options={{ href: null }} />
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
    paddingTop: 7,
    paddingBottom: 5,
  },
  tabLabel: {
    marginBottom: 1,
    fontFamily: theme.type.bodyMedium,
    fontSize: 11,
    letterSpacing: -0.1,
  },
  compactTabLabel: { fontSize: 10, letterSpacing: -0.15 },
  tabBar: {
    position: "absolute",
    left: 14,
    right: 14,
    height: theme.control.tabBarVisual,
    paddingTop: 0,
    paddingBottom: 0,
    borderTopWidth: 0,
    borderRadius: theme.radius.lg,
    borderWidth: 1,
    borderColor: "rgba(246,240,232,0.12)",
    backgroundColor: "transparent",
    overflow: "hidden",
    elevation: 0,
    shadowColor: "#000",
    shadowOpacity: 0.34,
    shadowRadius: 24,
    shadowOffset: { width: 0, height: 12 },
  },
  tabBarGlass: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: "rgba(8,8,9,0.72)",
  },
  plusWrap: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
  },
  plusButton: {
    width: 47,
    height: 47,
    borderRadius: 24,
    backgroundColor: theme.color.pink,
    alignItems: "center",
    justifyContent: "center",
    shadowColor: "#000",
    shadowOpacity: 0.34,
    shadowRadius: 12,
    shadowOffset: { width: 0, height: 6 },
    elevation: 8,
    transform: [{ scale: 1 }],
  },
  plusButtonPressed: {
    opacity: 0.9,
    transform: [{ scale: 0.96 }],
  },
});
