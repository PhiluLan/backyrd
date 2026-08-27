// mobile/app/privacy-consent.tsx

import React from "react";
import {
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from "react-native";
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
      "Optionale Verarbeitung, Standort, Push und Personalisierung verwalten.",
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
      "Erteilte, erneuerte und widerrufene Einwilligungen nachvollziehen.",
    icon: "time-outline",
    route: "/privacy-history",
    tone: "green",
  },
  {
    title: "Meine Daten",
    description:
      "Datenexport anfordern oder eine bestehende Kontolöschung verwalten.",
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

      <View style={styles.header}>
        <Pressable
          accessibilityLabel="Zurück"
          onPress={() => router.back()}
          style={styles.backButton}
        >
          <Ionicons name="chevron-back" size={24} color="#FFFFFF" />
        </Pressable>

        <View style={styles.headerCopy}>
          <Text style={styles.eyebrow}>PRIVACY CENTER</Text>
          <Text style={styles.title}>Deine Daten. Deine Kontrolle.</Text>
        </View>
      </View>

      <ScrollView
        contentContainerStyle={styles.content}
        showsVerticalScrollIndicator={false}
      >
        <View style={styles.hero}>
          <View style={styles.heroIcon}>
            <Ionicons name="shield-checkmark" size={31} color="#FF4F91" />
          </View>
          <Text style={styles.heroTitle}>Privatsphäre bei Backyrd</Text>
          <Text style={styles.heroText}>
            Hier verwaltest du Einwilligungen, liest gültige Dokumente und
            siehst nachvollziehbar, wann du welche Entscheidung getroffen hast.
          </Text>
        </View>

        <Text style={styles.sectionTitle}>DEIN PRIVACY CENTER</Text>

        {ITEMS.map((item) => (
          <Pressable
            key={item.route}
            style={styles.item}
            onPress={() => router.push(item.route as never)}
          >
            <View style={[styles.itemIcon, styles[`tone_${item.tone ?? "pink"}`]]}>
              <Ionicons name={item.icon} size={23} color="#FFFFFF" />
            </View>

            <View style={styles.itemCopy}>
              <Text style={styles.itemTitle}>{item.title}</Text>
              <Text style={styles.itemDescription}>{item.description}</Text>
            </View>

            <Ionicons
              name="chevron-forward"
              size={21}
              color="rgba(255,255,255,0.48)"
            />
          </Pressable>
        ))}

        <View style={styles.contactCard}>
          <Ionicons name="mail-outline" size={21} color="#FF4F91" />
          <View style={styles.contactCopy}>
            <Text style={styles.contactTitle}>Datenschutzkontakt</Text>
            <Text style={styles.contactText}>hello@backyrd.ch</Text>
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
  safe: { flex: 1, backgroundColor: "#050506" },
  header: {
    flexDirection: "row",
    alignItems: "center",
    paddingHorizontal: 18,
    paddingVertical: 14,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: "rgba(255,255,255,0.12)",
  },
  backButton: {
    width: 42,
    height: 42,
    borderRadius: 21,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: "rgba(255,255,255,0.08)",
    marginRight: 13,
  },
  headerCopy: { flex: 1 },
  eyebrow: {
    color: "#FF4F91",
    fontSize: 11,
    fontWeight: "900",
    letterSpacing: 1.3,
  },
  title: { color: "#FFFFFF", fontSize: 22, fontWeight: "900", marginTop: 2 },
  content: { padding: 18, paddingBottom: 46 },
  hero: {
    padding: 22,
    borderRadius: 26,
    backgroundColor: "#111113",
    borderWidth: 1,
    borderColor: "rgba(255,125,167,0.24)",
    marginBottom: 26,
  },
  heroIcon: {
    width: 54,
    height: 54,
    borderRadius: 18,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: "rgba(255,125,167,0.11)",
  },
  heroTitle: {
    color: "#FFFFFF",
    fontSize: 24,
    fontWeight: "900",
    marginTop: 18,
  },
  heroText: {
    color: "#B4B4BD",
    fontSize: 15,
    lineHeight: 22,
    marginTop: 9,
  },
  sectionTitle: {
    color: "#81818C",
    fontSize: 11,
    fontWeight: "900",
    letterSpacing: 1.2,
    marginBottom: 10,
  },
  item: {
    minHeight: 90,
    flexDirection: "row",
    alignItems: "center",
    padding: 15,
    borderRadius: 21,
    backgroundColor: "#111113",
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.07)",
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
  itemTitle: { color: "#FFFFFF", fontSize: 16, fontWeight: "900" },
  itemDescription: {
    color: "#A7A7B0",
    fontSize: 13,
    lineHeight: 18,
    marginTop: 4,
  },
  contactCard: {
    flexDirection: "row",
    padding: 18,
    borderRadius: 20,
    backgroundColor: "rgba(255,255,255,0.045)",
    marginTop: 14,
  },
  contactCopy: { flex: 1, marginLeft: 13 },
  contactTitle: { color: "#FFFFFF", fontSize: 15, fontWeight: "900" },
  contactText: { color: "#FF4F91", fontWeight: "800", marginTop: 6 },
  contactAddress: {
    color: "#868690",
    fontSize: 12,
    lineHeight: 17,
    marginTop: 5,
  },
});
