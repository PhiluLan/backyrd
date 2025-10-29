// mobile/app/(tabs)/journey.tsx
import React, { useState } from "react";
import {
  View,
  Text,
  TextInput,
  Pressable,
  ScrollView,
  KeyboardAvoidingView,
  Platform,
  StyleSheet,
  Alert,
  Image,
  Modal,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { Ionicons } from "@expo/vector-icons";
import OpenAI from "openai";
import { supabase } from "../../lib/supabase";
import { useRouter } from "expo-router";
import DateTimePicker from "@react-native-community/datetimepicker";

const openai = new OpenAI({
  apiKey: process.env.EXPO_PUBLIC_OPENAI_KEY,
});

export default function JourneyScreen() {
  const [input, setInput] = useState("");
  const [loading, setLoading] = useState(false);
  const [suggestions, setSuggestions] = useState<any[]>([]);
  const router = useRouter();

  // 🧾 Buchungsmodal State
  const [bookingVisible, setBookingVisible] = useState(false);
  const [selectedSpot, setSelectedSpot] = useState<any>(null);
  const [date, setDate] = useState(new Date());
  const [persons, setPersons] = useState(2);

  const generate = async () => {
    if (!input.trim()) return;
    setLoading(true);
    try {
      const prompt = `
Analysiere folgende Nutzerabsicht: "${input}".
Gib mir ein JSON Array zurück. Jeder Eintrag soll folgendes Format haben:
{
  "category": "weinbar | restaurant | spaziergang | event | café | ...",
  "title": "Kurzbeschreibung des Erlebnisbausteins",
  "reason": "Kurze, emotionale Begründung, warum diese Kategorie passt"
}
Keine Einleitung, keine Erklärung, nur reines JSON.
`;

      const res = await openai.chat.completions.create({
        model: "gpt-4o-mini",
        messages: [
          { role: "system", content: "Du bist ein Reise- und Erlebniskurator." },
          { role: "user", content: prompt },
        ],
        temperature: 0.8,
      });

      let raw = res.choices[0].message.content?.trim() ?? "[]";
      if (raw.startsWith("```")) {
        raw = raw.replace(/```(json)?/g, "").trim();
      }

      let parsed: any[] = [];
      try {
        parsed = JSON.parse(raw);
      } catch (err) {
        console.warn("❌ JSON parse error. Raw output:", raw);
        throw new Error("Ungültiges KI-Antwortformat. Versuche es erneut.");
      }

      const enriched: any[] = [];
      for (const block of parsed) {
        const { data: spots, error } = await supabase
          .from("spots")
          .select("id, name, category, spot_photos(url)")
          .ilike("category", `%${block.category}%`)
          .limit(1);

        if (error) console.error("Spot-Suche Fehler:", error);

        if (spots && spots.length > 0) {
          const spot = spots[0];
          enriched.push({
            ...block,
            spot,
            image: spot.spot_photos?.[0]?.url ?? null,
          });
        } else {
          enriched.push(block);
        }
      }

      setSuggestions(enriched);
    } catch (e: any) {
      console.error(e);
      Alert.alert("Fehler", e.message ?? "Konnte keine Vorschläge generieren.");
    } finally {
      setLoading(false);
    }
  };

  const openBooking = (spot: any) => {
    setSelectedSpot(spot);
    setBookingVisible(true);
  };

  const submitBooking = async () => {
    if (!selectedSpot) return;
    try {
      const { data: session } = await supabase.auth.getSession();
      const userId = session.session?.user.id;
      if (!userId) {
        Alert.alert("Fehler", "Du musst eingeloggt sein, um zu reservieren.");
        return;
      }

      const { error } = await supabase.from("reservations").insert({
        spot_id: selectedSpot.id,
        user_id: userId,
        date: date.toISOString(),
        persons,
      });

      if (error) throw error;

      setBookingVisible(false);
      Alert.alert(
        "Reservierung bestätigt 🎉",
        `Dein Tisch bei ${selectedSpot.name} ist für ${persons} Person(en) am ${date.toLocaleString()} reserviert.`
      );
    } catch (e: any) {
      Alert.alert("Fehler", e.message ?? "Reservierung fehlgeschlagen.");
    }
  };

  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: "#000" }}>
      <KeyboardAvoidingView
        style={{ flex: 1 }}
        behavior={Platform.OS === "ios" ? "padding" : undefined}
      >
        <ScrollView contentContainerStyle={styles.container}>
          <Text style={styles.title}>✨ Deine perfekte Mood Journey</Text>
          <Text style={styles.subtitle}>
            Sag mir, wonach dir heute ist — ich stelle dir ein besonderes Erlebnis zusammen.
          </Text>

          <TextInput
            placeholder="z. B. Romantischer Abend mit meiner Frau"
            placeholderTextColor="#666"
            style={styles.input}
            value={input}
            onChangeText={setInput}
            multiline
          />

          <Pressable
            onPress={generate}
            style={({ pressed }) => [
              styles.button,
              { opacity: pressed || loading ? 0.7 : 1 },
            ]}
            disabled={loading}
          >
            <Ionicons name="sparkles" size={20} color="#fff" style={{ marginRight: 6 }} />
            <Text style={styles.buttonText}>
              {loading ? "Wird generiert..." : "Vorschlag generieren"}
            </Text>
          </Pressable>

          {suggestions.length > 0 && (
            <View style={{ marginTop: 24 }}>
              {suggestions.map((s, i) => (
                <View key={i} style={styles.card}>
                  {s.image && (
                    <Image source={{ uri: s.image }} style={styles.cardImage} resizeMode="cover" />
                  )}
                  <Text style={styles.cardTitle}>{s.spot ? s.spot.name : s.title}</Text>
                  <Text style={styles.cardReason}>{s.reason}</Text>

                  {s.spot && (
                    <View style={{ flexDirection: "row", gap: 8, marginTop: 8 }}>
                      <Pressable
                        onPress={() => router.push(`/spot/${s.spot.id}`)}
                        style={[styles.detailButton, { flex: 1 }]}
                      >
                        <Text style={styles.detailButtonText}>Details</Text>
                      </Pressable>

                      {(s.spot.category?.toLowerCase().includes("restaurant") ||
                        s.spot.category?.toLowerCase().includes("event")) && (
                        <Pressable
                          onPress={() => openBooking(s.spot)}
                          style={[styles.detailButton, { flex: 1, backgroundColor: "#10B981" }]}
                        >
                          <Text style={styles.detailButtonText}>Reservieren</Text>
                        </Pressable>
                      )}
                    </View>
                  )}
                </View>
              ))}
            </View>
          )}
        </ScrollView>
      </KeyboardAvoidingView>

      {/* 📅 Buchungsmodal */}
      <Modal
        visible={bookingVisible}
        transparent
        animationType="slide"
        onRequestClose={() => setBookingVisible(false)}
      >
        <View style={styles.modalBackdrop}>
          <View style={styles.modalContent}>
            <Text style={styles.modalTitle}>
              Tisch reservieren bei {selectedSpot?.name}
            </Text>

            <Text style={styles.modalLabel}>Datum & Uhrzeit</Text>
            <DateTimePicker
              value={date}
              mode="datetime"
              display="default"
              onChange={(e, d) => d && setDate(d)}
              minimumDate={new Date()}
            />

            <Text style={styles.modalLabel}>Personen</Text>
            <View style={{ flexDirection: "row", alignItems: "center", gap: 12 }}>
              <Pressable onPress={() => setPersons(Math.max(1, persons - 1))}>
                <Ionicons name="remove-circle" size={32} color="#3A86FF" />
              </Pressable>
              <Text style={{ color: "#fff", fontSize: 18 }}>{persons}</Text>
              <Pressable onPress={() => setPersons(persons + 1)}>
                <Ionicons name="add-circle" size={32} color="#3A86FF" />
              </Pressable>
            </View>

            <Pressable onPress={submitBooking} style={[styles.button, { marginTop: 16 }]}>
              <Text style={styles.buttonText}>Reservierung bestätigen</Text>
            </Pressable>

            <Pressable
              onPress={() => setBookingVisible(false)}
              style={{ marginTop: 12, alignItems: "center" }}
            >
              <Text style={{ color: "#aaa" }}>Abbrechen</Text>
            </Pressable>
          </View>
        </View>
      </Modal>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: { padding: 16 },
  title: { fontSize: 28, fontWeight: "800", color: "#fff", marginBottom: 8 },
  subtitle: { color: "#9ca3af", marginBottom: 16, fontSize: 15 },
  input: {
    backgroundColor: "#111",
    color: "#fff",
    borderRadius: 12,
    padding: 14,
    fontSize: 16,
    minHeight: 80,
    textAlignVertical: "top",
    marginBottom: 16,
  },
  button: {
    flexDirection: "row",
    backgroundColor: "#3A86FF",
    borderRadius: 999,
    paddingVertical: 14,
    justifyContent: "center",
    alignItems: "center",
  },
  buttonText: { color: "#fff", fontWeight: "700", fontSize: 16 },
  card: {
    backgroundColor: "#0B0B0C",
    borderRadius: 16,
    padding: 16,
    marginBottom: 16,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: "#222",
  },
  cardImage: {
    width: "100%",
    height: 160,
    borderRadius: 12,
    marginBottom: 12,
    backgroundColor: "#222",
  },
  cardTitle: { fontSize: 18, fontWeight: "700", color: "#fff", marginBottom: 4 },
  cardReason: { color: "#9ca3af", fontSize: 14, marginBottom: 8 },
  detailButton: {
    backgroundColor: "#3A86FF",
    borderRadius: 999,
    paddingVertical: 10,
    alignItems: "center",
    flex: 1,
  },
  detailButtonText: { color: "#fff", fontWeight: "600" },
  modalBackdrop: {
    flex: 1,
    backgroundColor: "rgba(0,0,0,0.6)",
    justifyContent: "flex-end",
  },
  modalContent: {
    backgroundColor: "#111",
    padding: 20,
    borderTopLeftRadius: 20,
    borderTopRightRadius: 20,
  },
  modalTitle: { fontSize: 18, fontWeight: "700", color: "#fff", marginBottom: 16 },
  modalLabel: { color: "#9ca3af", marginTop: 12, marginBottom: 4 },
});
