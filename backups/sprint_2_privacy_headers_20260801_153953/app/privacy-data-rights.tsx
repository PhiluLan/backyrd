// mobile/app/privacy-data-rights.tsx

import React from "react";
import { StyleSheet, Text, View } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { Stack } from "expo-router";
import { SafeAreaView } from "react-native-safe-area-context";

export default function PrivacyDataRightsScreen() {
  return (
    <SafeAreaView style={styles.safe} edges={["bottom"]}>
      <Stack.Screen
        options={{
          title: "Meine Daten",
          headerStyle: { backgroundColor: "#09090A" },
          headerTintColor: "#FFFFFF",
        }}
      />

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
