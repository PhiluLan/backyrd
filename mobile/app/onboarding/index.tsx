import { useRef, useState } from "react";
import { View, Text, ScrollView, Dimensions, Pressable } from "react-native";
import { useRouter } from "expo-router";
import { Screen, Button } from "../../components/ui";
import { colors, spacing } from "../../lib/theme";
import { supabase } from "../../lib/supabase";
import AsyncStorage from "@react-native-async-storage/async-storage";

const { width } = Dimensions.get("window");

const slides = [
  {
    key: "mood_vs_stars",
    title: "Finde Orte nach Gefühl, nicht nach Zahlen",
    subtitle:
      "Backyrd ersetzt Sterne durch Zwei-Wort-Moods. „urig-gemütlich“ sagt mehr als ★★★★☆.",
    emoji: "✨",
  },
  {
    key: "map_as_experience",
    title: "Entdecke deine Stadt visuell",
    subtitle:
      "Farbcodierte Mood-Marker auf der Karte zeigen dir Vibes auf einen Blick.",
    emoji: "🗺️",
  },
  {
    key: "locals_trust",
    title: "Echte Stimmen der Locals",
    subtitle:
      "Local-Badges & Besucher-Mix bringen Glaubwürdigkeit in deine Entdeckungen.",
    emoji: "🏡",
  },
];

export default function Onboarding() {
  const router = useRouter();
  const scrollRef = useRef<ScrollView>(null);
  const [index, setIndex] = useState(0);

  const finishOnboarding = async () => {
    await AsyncStorage.setItem("onboardingComplete", "true");
    router.replace("/(tabs)");
  };

  const goNext = async () => {
    if (index < slides.length - 1) {
      scrollRef.current?.scrollTo({ x: (index + 1) * width, animated: true });
      setIndex((i) => i + 1);
    } else {
      // Fertig → Onboarding als abgeschlossen markieren und Tabs laden
      await finishOnboarding();
    }
  };

  const skip = () => finishOnboarding();

  return (
    <Screen safe>
      <View style={{ flex: 1 }}>
        {/* Skip oben rechts */}
        <View style={{ alignItems: "flex-end", padding: spacing.m }}>
          <Pressable onPress={skip} hitSlop={10}>
            <Text style={{ color: colors.text.muted, fontSize: 16 }}>Überspringen</Text>
          </Pressable>
        </View>

        {/* Slides */}
        <ScrollView
          ref={scrollRef}
          horizontal
          pagingEnabled
          showsHorizontalScrollIndicator={false}
          onScroll={(e) => {
            const i = Math.round(e.nativeEvent.contentOffset.x / width);
            if (i !== index) setIndex(i);
          }}
          scrollEventThrottle={16}
        >
          {slides.map((s) => (
            <View
              key={s.key}
              style={{
                width,
                paddingHorizontal: spacing.l,
                alignItems: "center",
              }}
            >
              <Text style={{ fontSize: 48, marginBottom: spacing.s }}>{s.emoji}</Text>
              <Text
                style={{
                  fontSize: 24,
                  fontWeight: "700",
                  textAlign: "center",
                  marginBottom: spacing.m,
                  color: colors.text.primary,
                }}
              >
                {s.title}
              </Text>
              <Text
                style={{
                  fontSize: 16,
                  textAlign: "center",
                  color: colors.text.muted,
                }}
              >
                {s.subtitle}
              </Text>

              {/* Platzhalter-Visual */}
              <View
                style={{
                  height: 220,
                  width: width - spacing.l * 2,
                  marginTop: spacing.l,
                  borderRadius: 16,
                  backgroundColor: "#f0f0f0",
                  justifyContent: "center",
                  alignItems: "center",
                  shadowColor: "#000",
                  shadowOpacity: 0.08,
                  shadowRadius: 12,
                }}
              >
                <Text style={{ fontSize: 18, color: colors.text.muted }}>
                  Illustration / Screenshot
                </Text>
              </View>
            </View>
          ))}
        </ScrollView>

        {/* Dots */}
        <View
          style={{
            flexDirection: "row",
            justifyContent: "center",
            marginTop: spacing.m,
          }}
        >
          {slides.map((_, i) => (
            <View
              key={i}
              style={{
                width: 8,
                height: 8,
                borderRadius: 4,
                marginHorizontal: 4,
                backgroundColor: i === index ? colors.primary : "#D9D9D9",
              }}
            />
          ))}
        </View>

        {/* Weiter / Loslegen Button */}
        <View style={{ padding: spacing.l }}>
          <Button
            onPress={goNext}
            title={index < slides.length - 1 ? "Weiter" : "Loslegen"}
          />
        </View>
      </View>
    </Screen>
  );
}
