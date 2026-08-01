// mobile/app/privacy-data-rights.tsx

import React from "react";
import { Pressable, StyleSheet, Text, View } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { Stack, useRouter } from "expo-router";
import { SafeAreaView } from "react-native-safe-area-context";

export default function PrivacyDataRightsScreen() {
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

        <Text style={styles.headerTitle}>Meine Daten</Text>
      </View>


      <View style={styles.content}>
        <View style={styles.card}>
          <Ionicons name="construct-outline" size={31} color="#FF7DA7" />
          <Text style={styles.title}>Data Rights Engine folgt als Nächstes</Text>
          <Text style={styles.text}>
            Datenexport und Kontolöschung benötigen wegen Reviews, Nachrichten,
            Fotos, Spot-Ownership, Safety-Daten und gesetzlichen
            Aufbewahrungspflichten eine eigene sichere Engine.
          </Text>
          <Text style={styles.note}>
            Deine Anfrage kannst du bis dahin jederzeit an hello@backyrd.ch
            senden.
          </Text>
        </View>
      </View>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: "#09090A" },

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
  headerTitle: {
    color: "#FFFFFF",
    fontSize: 22,
    fontWeight: "900",
    flex: 1,
  },

  content: { flex: 1, padding: 18, justifyContent: "center" },
  card: {
    padding: 24,
    borderRadius: 24,
    backgroundColor: "#151519",
    borderWidth: 1,
    borderColor: "rgba(255,125,167,0.22)",
  },
  title: {
    color: "#FFFFFF",
    fontSize: 22,
    fontWeight: "900",
    marginTop: 17,
  },
  text: { color: "#AFAFB7", lineHeight: 21, marginTop: 10 },
  note: { color: "#FF7DA7", fontWeight: "800", lineHeight: 20, marginTop: 16 },
});
