import { Ionicons } from "@expo/vector-icons";
import { Image } from "expo-image";
import { useRouter } from "expo-router";
import React, { useCallback, useEffect, useState } from "react";
import { ActivityIndicator, FlatList, KeyboardAvoidingView, Platform, Pressable, ScrollView, StyleSheet, Text, TextInput, View } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";

import { useAuth } from "../../hooks/useAuth";
import { filterDistributedSpots } from "../../lib/distributionTrust";
import { supabase } from "../../lib/supabase";
import { backyrdTheme as theme } from "../../theme/backyrd";

type HomeSpot = { id: string; name: string; city: string | null; category_id: string | null; header_photo_path: string | null; status: string; photoUrl?: string | null };

function publicPhoto(path: string | null | undefined) {
  if (!path) return null;
  if (/^https?:\/\//.test(path)) return path;
  return supabase.storage.from("spot-photos").getPublicUrl(path).data.publicUrl;
}

export default function HomeScreen() {
  const router = useRouter();
  const { user } = useAuth();
  const [query, setQuery] = useState("");
  const [city, setCity] = useState("Basel");
  const [spots, setSpots] = useState<HomeSpot[]>([]);
  const [loading, setLoading] = useState(true);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      if (user?.id) {
        const { data: profile } = await supabase.from("profiles").select("city").eq("id", user.id).maybeSingle();
        if (profile?.city?.trim()) setCity(profile.city.trim());
      }
      const { data, error } = await supabase.from("spots").select("id,name,city,category_id,header_photo_path,status").eq("status", "approved").order("created_at", { ascending: false }).limit(18);
      if (error) throw error;
      const visible = await filterDistributedSpots((data ?? []) as HomeSpot[], "discovery");
      setSpots(visible.slice(0, 8).map((spot) => ({ ...spot, photoUrl: publicPhoto(spot.header_photo_path) })));
    } catch {
      setSpots([]);
    } finally {
      setLoading(false);
    }
  }, [user?.id]);

  useEffect(() => { void load(); }, [load]);

  function submitDecision() {
    const normalized = query.trim();
    if (normalized.length < 3) return;
    router.push({ pathname: "/(tabs)/decision", params: { query: normalized, city, auto: "1" } });
  }

  return (
    <SafeAreaView style={styles.root} edges={["top", "left", "right"]}>
      <KeyboardAvoidingView style={styles.root} behavior={Platform.OS === "ios" ? "padding" : undefined}>
        <ScrollView keyboardShouldPersistTaps="handled" contentContainerStyle={styles.content}>
          <View style={styles.locationRow}><Ionicons name="location-outline" size={17} color={theme.color.acid} /><Text style={styles.location}>{city.toUpperCase()}</Text></View>
          <Text style={styles.hero}>WOHIN{`\n`}GEHT’S HEUTE?</Text>
          <View style={styles.marker} />
          <View style={styles.searchBox}>
            <TextInput accessibilityLabel="Beschreibe deinen heutigen Moment" value={query} onChangeText={setQuery} onSubmitEditing={submitDecision} returnKeyType="search" placeholder="Spots, Moods oder Decisions" placeholderTextColor={theme.color.textSecondary} style={styles.input} />
            <Pressable accessibilityLabel="Decision starten" accessibilityRole="button" disabled={query.trim().length < 3} onPress={submitDecision} style={({ pressed }) => [styles.submit, query.trim().length < 3 && styles.submitDisabled, pressed && styles.pressed]}><Ionicons name="arrow-forward" size={25} color={theme.color.background} /></Pressable>
          </View>
          <View style={styles.sectionHeader}><Text style={styles.sectionTitle}>MOMENTE</Text><Pressable onPress={() => router.push("/(tabs)/feed" as never)}><Text style={styles.sectionAction}>ALLE</Text></Pressable></View>
          <View style={styles.moments}>
            {["HEUTE", "FREUNDE", "DATE", "DRAUSSEN"].map((label, index) => (
              <Pressable key={label} onPress={() => setQuery(index === 0 ? "Was passt heute zu mir?" : `${label.toLowerCase()} in ${city}`)} style={styles.moment}>
                <View style={[styles.momentRing, index === 0 && styles.momentRingActive]}><Text style={styles.momentGlyph}>{["✦", "☺", "♡", "↗"][index]}</Text></View><Text style={styles.momentLabel}>{label}</Text>
              </Pressable>
            ))}
          </View>
          <View style={styles.sectionHeader}><Text style={styles.sectionTitle}>GERADE ANGESAGT</Text><Pressable onPress={() => router.push("/(tabs)/map" as never)}><Text style={styles.sectionAction}>KARTE</Text></Pressable></View>
          {loading ? <ActivityIndicator color={theme.color.pink} style={styles.loader} /> : spots.length ? (
            <FlatList horizontal data={spots} keyExtractor={(item) => item.id} showsHorizontalScrollIndicator={false} contentContainerStyle={styles.cards} renderItem={({ item }) => (
              <Pressable onPress={() => router.push(`/spot/${item.id}` as never)} style={styles.card}>
                {item.photoUrl ? <Image source={{ uri: item.photoUrl }} contentFit="cover" transition={180} style={StyleSheet.absoluteFill} /> : <View style={[StyleSheet.absoluteFill, styles.photoFallback]} />}
                <View style={styles.cardShade} /><Text numberOfLines={2} style={styles.cardName}>{item.name.toUpperCase()}</Text><Text style={styles.cardMeta}>{item.city || city}</Text>
              </Pressable>
            )} />
          ) : <Text style={styles.empty}>Gerade sind keine kuratierten Spots verfügbar.</Text>}
        </ScrollView>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: theme.color.background }, content: { paddingTop: 18, paddingBottom: 130 },
  locationRow: { paddingHorizontal: 22, flexDirection: "row", alignItems: "center", gap: 7 }, location: { color: theme.color.textSecondary, fontFamily: theme.type.bodyBold, fontSize: 12, letterSpacing: 2.2 },
  hero: { marginTop: 21, paddingHorizontal: 22, color: theme.color.textPrimary, fontFamily: theme.type.display, fontWeight: "900", fontSize: 57, lineHeight: 53, letterSpacing: -1.5 }, marker: { marginLeft: 20, marginTop: 3, width: 176, height: 8, backgroundColor: theme.color.pink, transform: [{ rotate: "-2deg" }] },
  searchBox: { margin: 22, minHeight: 62, flexDirection: "row", alignItems: "center", borderBottomWidth: 2, borderColor: theme.color.textPrimary }, input: { flex: 1, color: theme.color.textPrimary, fontFamily: theme.type.bodyMedium, fontSize: 17, paddingVertical: 16 }, submit: { width: 48, height: 48, alignItems: "center", justifyContent: "center", backgroundColor: theme.color.pink }, submitDisabled: { opacity: 0.36 }, pressed: { opacity: 0.76 },
  sectionHeader: { marginTop: 25, marginBottom: 15, paddingHorizontal: 22, flexDirection: "row", alignItems: "center", justifyContent: "space-between" }, sectionTitle: { color: theme.color.textPrimary, fontFamily: theme.type.display, fontWeight: "900", fontSize: 28, letterSpacing: -0.3 }, sectionAction: { color: theme.color.acid, fontFamily: theme.type.bodyBold, fontSize: 11, letterSpacing: 1.7 },
  moments: { paddingHorizontal: 22, flexDirection: "row", justifyContent: "space-between" }, moment: { width: 72, alignItems: "center" }, momentRing: { width: 62, height: 62, borderRadius: 31, alignItems: "center", justifyContent: "center", borderWidth: 1, borderColor: theme.color.border, backgroundColor: theme.color.surface }, momentRingActive: { borderColor: theme.color.pink, borderWidth: 2 }, momentGlyph: { color: theme.color.textPrimary, fontSize: 24 }, momentLabel: { marginTop: 8, color: theme.color.textSecondary, fontFamily: theme.type.bodyBold, fontSize: 9, letterSpacing: 1.1 },
  cards: { paddingHorizontal: 22, gap: 14 }, card: { width: 278, height: 360, justifyContent: "flex-end", overflow: "hidden", backgroundColor: theme.color.surface }, photoFallback: { backgroundColor: theme.color.surfaceElevated }, cardShade: { ...StyleSheet.absoluteFillObject, backgroundColor: "rgba(0,0,0,0.28)" }, cardName: { marginHorizontal: 17, color: theme.color.textPrimary, fontFamily: theme.type.display, fontWeight: "900", fontSize: 34, lineHeight: 33 }, cardMeta: { marginHorizontal: 18, marginTop: 7, marginBottom: 18, color: theme.color.acid, fontFamily: theme.type.bodyBold, fontSize: 11, letterSpacing: 1.4, textTransform: "uppercase" }, loader: { marginTop: 60 }, empty: { marginHorizontal: 22, color: theme.color.textSecondary, fontFamily: theme.type.body, lineHeight: 22 },
});
