import { backyrdTheme } from "../theme/backyrd";
// mobile/app/privacy-consent.tsx

import React from "react";
import { ScreenHeader } from "../components/foundation/Screen";
import { Alert, Linking, Pressable, ScrollView, StyleSheet, View } from "react-native";
import { ProductText as Text } from "../components/foundation/AppText";
import { Ionicons } from "@expo/vector-icons";
import { Stack, useRouter } from "expo-router";
import { SafeAreaView } from "react-native-safe-area-context";

type HubItem = {
  title: string;
  description: string;
  icon: keyof typeof Ionicons.glyphMap;
  route: string;
  tone?: "pink" | "blue" | "green" | "amber";
};

const ITEMS: HubItem[] = [
  {
    title: "Einwilligungen",
    description:
      "Standort, Benachrichtigungen und persönliche Vorschläge einstellen.",
    icon: "options-outline",
    route: "/privacy-consents",
    tone: "pink",
  },
  {
    title: "Rechtsdokumente",
    description:
      "Datenschutzerklärung, Nutzungsbedingungen und weitere Hinweise lesen.",
    icon: "document-text-outline",
    route: "/privacy-legal-documents",
    tone: "blue",
  },
  {
    title: "Einwilligungsverlauf",
    description:
      "Nachsehen, wann du Freigaben erteilt oder widerrufen hast.",
    icon: "time-outline",
    route: "/privacy-history",
    tone: "green",
  },
  {
    title: "Meine Daten",
    description:
      "Eine Kopie deiner Daten erstellen oder dein Konto löschen.",
    icon: "archive-outline",
    route: "/privacy-data-rights",
    tone: "amber",
  },
];

export default function PrivacyCenterScreen() {
  const router = useRouter();

  return (
    <SafeAreaView style={styles.safe} edges={["top", "bottom"]}>
      <Stack.Screen options={{ headerShown: false }} />

      <ScreenHeader title="Datenschutz" eyebrow="Dein Backyrd" subtitle="Deine Freigaben, Dokumente und Daten an einem Ort." onBack={() => router.canGoBack() ? router.back() : router.replace("/settings")} />

      <ScrollView
        contentContainerStyle={styles.content}
        showsVerticalScrollIndicator={false}
      >
        {ITEMS.map((item) => (
          <Pressable
            key={item.route}
            style={styles.item}
            onPress={() => router.push(item.route as never)}
          >
            <View style={[styles.itemIcon, styles[`tone_${item.tone ?? "pink"}`]]}>
              <Ionicons accessibilityElementsHidden name={item.icon} size={23} color={backyrdTheme.color.textPrimary} />
            </View>

            <View style={styles.itemCopy}>
              <Text style={styles.itemTitle}>{item.title}</Text>
              <Text style={styles.itemDescription}>{item.description}</Text>
            </View>

            <Ionicons
              accessibilityElementsHidden
              name="chevron-forward"
              size={21}
              color={backyrdTheme.color.textMuted}
            />
          </Pressable>
        ))}

        <View style={styles.contactCard}>
          <Ionicons accessibilityElementsHidden name="mail-outline" size={21} color={backyrdTheme.color.pink} />
          <View style={styles.contactCopy}>
            <Text style={styles.contactTitle}>Datenschutzkontakt</Text>
            <Pressable accessibilityRole="link" accessibilityLabel="Datenschutzkontakt per E-Mail" onPress={() => { void Linking.openURL("mailto:hello@backyrd.ch").catch(() => Alert.alert("E-Mail nicht geöffnet", "Du erreichst uns unter hello@backyrd.ch.")); }} style={{ minHeight: 44, justifyContent: "center" }}><Text style={styles.contactText}>hello@backyrd.ch</Text></Pressable>
            <Text style={styles.contactAddress}>
              backyrd by Philipp Langer · Spalenring 64 · 4055 Basel
            </Text>
          </View>
        </View>
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: backyrdTheme.color.background },
  content: { paddingHorizontal: 24, paddingBottom: 48 },
  item: {
    minHeight: 100,
    flexDirection: "row",
    alignItems: "center",
    padding: 15,
    borderRadius: 21,
    backgroundColor: backyrdTheme.color.surface,
    borderWidth: 1,
    borderColor: "rgba(127,127,127,0.16)",
    marginBottom: 10,
  },
  itemIcon: {
    width: 48,
    height: 48,
    borderRadius: 16,
    alignItems: "center",
    justifyContent: "center",
    marginRight: 14,
  },
  tone_pink: { backgroundColor: "rgba(255,125,167,0.18)" },
  tone_blue: { backgroundColor: "rgba(91,155,255,0.18)" },
  tone_green: { backgroundColor: "rgba(82,205,151,0.18)" },
  tone_amber: { backgroundColor: "rgba(245,185,73,0.18)" },
  itemCopy: { flex: 1, paddingRight: 10 },
  itemTitle: { color: backyrdTheme.color.textPrimary, fontSize: 18, fontWeight: "700" },
  itemDescription: {
    color: backyrdTheme.color.textSecondary,
    fontSize: 15,
    lineHeight: 22,
    marginTop: 4,
  },
  contactCard: {
    flexDirection: "row",
    padding: 18,
    borderRadius: 20,
    backgroundColor: backyrdTheme.color.surfaceElevated,
    marginTop: 14,
  },
  contactCopy: { flex: 1, marginLeft: 13 },
  contactTitle: { color: backyrdTheme.color.textPrimary, fontSize: 15, fontWeight: "900" },
  contactText: { color: backyrdTheme.color.pink, fontWeight: "800", marginTop: 6 },
  contactAddress: {
    color: backyrdTheme.color.textSecondary,
    fontSize: 12,
    lineHeight: 17,
    marginTop: 5,
  },
});
