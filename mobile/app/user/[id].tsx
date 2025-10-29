// mobile/app/user/[id].tsx
import React, { useEffect, useState, useMemo } from "react";
import {
  View,
  Text,
  ActivityIndicator,
  StyleSheet,
  ScrollView,
  Image,
  FlatList,
  Pressable,
  Platform,
  TouchableOpacity,
  Alert,
} from "react-native";
import { Stack, useLocalSearchParams, useRouter } from "expo-router";
import { supabase } from "../../lib/supabase";
import { MoodPill } from "../../components/spot";
import { Ionicons } from "@expo/vector-icons";
import { isFollowing, follow, unfollow } from "../../lib/social";
import { getOrCreateChat } from "../../lib/chat";

type Profile = {
  id: string;
  first_name: string | null;
  city: string | null;
  is_local: boolean | null;
  avatar_url?: string | null;
};

type ReviewRow = {
  id: string;
  spot_id: string;
  text?: string | null;
  mood_a?: string | null;
  mood_b?: string | null;
  created_at: string;
  spots?: { name: string };
};

export default function UserProfileScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const router = useRouter();

  const [profile, setProfile] = useState<Profile | null>(null);
  const [reviews, setReviews] = useState<ReviewRow[]>([]);
  const [favorites, setFavorites] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [err, setErr] = useState<string | null>(null);
  const [myId, setMyId] = useState<string | null>(null);
  const [following, setFollowing] = useState(false);

  useEffect(() => {
    let isMounted = true;

    async function load() {
      try {
        setLoading(true);
        setErr(null);
        if (!id) throw new Error("Keine User-ID übergeben");

        const { data: session } = await supabase.auth.getSession();
        setMyId(session.session?.user.id ?? null);

        // Profil laden
        const { data: prof, error: profErr } = await supabase
          .from("profiles")
          .select("id, first_name, city, is_local, avatar_url")
          .eq("id", id)
          .single();
        if (profErr) throw profErr;

        // Reviews laden
        const { data: revs, error: revErr } = await supabase
          .from("reviews")
          .select(`
            id,
            spot_id,
            text,
            mood_a,
            mood_b,
            created_at,
            spots ( name )
          `)
          .eq("user_id", id)
          .order("created_at", { ascending: false })
          .limit(20);
        if (revErr) throw revErr;

        // Favoriten laden
        const { data: favs, error: favErr } = await supabase
          .from("favorites")
          .select("spot_id, spots(name, spot_photos(url))")
          .eq("user_id", id)
          .order("created_at", { ascending: false });
        if (favErr) throw favErr;

        if (!isMounted) return;

        setProfile(prof as Profile);
        setReviews((revs || []) as ReviewRow[]);
        setFavorites(favs || []);

        if (session.session?.user.id && id && session.session.user.id !== id) {
          const f = await isFollowing(id);
          setFollowing(f);
        }
      } catch (e: any) {
        if (isMounted) setErr(e.message ?? "Unbekannter Fehler");
      } finally {
        if (isMounted) setLoading(false);
      }
    }

    load();
    return () => {
      isMounted = false;
    };
  }, [id]);

  const initials = useMemo(() => {
    const n = profile?.first_name?.trim() ?? "";
    const parts = n.split(/\s+/).filter(Boolean);
    return (parts[0]?.[0] ?? "U").toUpperCase();
  }, [profile?.first_name]);

  const toggleFollow = async () => {
    if (!id) return;
    try {
      if (following) {
        await unfollow(id);
        setFollowing(false);
      } else {
        await follow(id);
        setFollowing(true);
      }
    } catch (e: any) {
      Alert.alert("Fehler", e.message ?? "Follow-Aktion fehlgeschlagen");
    }
  };

  const startChat = async () => {
    try {
      if (!myId || !id || myId === id) return;
      const chatId = await getOrCreateChat(myId, id);
      router.push(`/messages/${chatId}`);
    } catch (e: any) {
      Alert.alert("Fehler", e.message ?? "Chat konnte nicht gestartet werden");
    }
  };

  if (loading) {
    return (
      <View style={[styles.center, { backgroundColor: "#000" }]}>
        <ActivityIndicator color="#fff" />
        <Text style={{ marginTop: 8, color: "#fff" }}>Profil wird geladen…</Text>
      </View>
    );
  }

  if (err || !profile) {
    return (
      <View style={[styles.center, { backgroundColor: "#000" }]}>
        <Text style={{ fontWeight: "600", fontSize: 16, marginBottom: 8, color: "#fff" }}>
          Profil konnte nicht geladen werden
        </Text>
        <Text style={{ color: "#fff" }}>{err ?? "User nicht gefunden."}</Text>
      </View>
    );
  }

  return (
    <View style={{ flex: 1, backgroundColor: "#000" }}>
      <Stack.Screen options={{ headerShown: false }} />

      <View style={styles.customHeader}>
        <Pressable onPress={() => router.back()} hitSlop={10} style={styles.headerIconBtn}>
          <Ionicons name="chevron-back" size={28} color="#fff" />
        </Pressable>
      </View>

      <ScrollView contentInsetAdjustmentBehavior="automatic">
        {/* Avatar + Name */}
        <View style={styles.header}>
          {profile.avatar_url ? (
            <Image source={{ uri: profile.avatar_url }} style={styles.avatarImg} />
          ) : (
            <View style={styles.avatarFallback}>
              <Text style={styles.avatarInitial}>{initials}</Text>
            </View>
          )}
          <Text style={styles.name}>{profile.first_name ?? "Unbekannt"}</Text>
          {profile.city && <Text style={styles.city}>{profile.city}</Text>}
          {profile.is_local === true && <Text style={styles.localBadge}>👤 Local</Text>}
          {profile.is_local === false && <Text style={styles.touristBadge}>🌍 Tourist</Text>}
        </View>

        {/* Follow + Nachricht */}
        {myId && myId !== id && (
          <View style={{ flexDirection: "row", justifyContent: "center", gap: 12, marginBottom: 12 }}>
            <TouchableOpacity
              onPress={toggleFollow}
              style={{
                backgroundColor: following ? "#111" : "#3A86FF",
                borderRadius: 999,
                paddingVertical: 10,
                paddingHorizontal: 20,
              }}
            >
              <Text style={{ color: "#fff", fontWeight: "600" }}>
                {following ? "Gefolgt" : "Folgen"}
              </Text>
            </TouchableOpacity>

            <TouchableOpacity
              onPress={startChat}
              style={{
                backgroundColor: "#3A86FF",
                borderRadius: 999,
                paddingVertical: 10,
                paddingHorizontal: 20,
              }}
            >
              <Text style={{ color: "#fff", fontWeight: "600" }}>Nachricht</Text>
            </TouchableOpacity>
          </View>
        )}

        {/* Favoriten */}
        <View style={styles.sectionBox}>
          <Text style={styles.sectionTitle}>Favoriten</Text>
          {favorites.length ? (
            <FlatList
              horizontal
              data={favorites}
              keyExtractor={(item) => item.spot_id}
              renderItem={({ item }) => (
                <Pressable
                  onPress={() => router.push(`/spot/${item.spot_id}`)}
                  style={{ marginRight: 12 }}
                >
                  <Image
                    source={{
                      uri: item.spots?.spot_photos?.[0]?.url ?? "https://placehold.co/200x150",
                    }}
                    style={{ width: 160, height: 110, borderRadius: 12, marginBottom: 4 }}
                  />
                  <Text style={{ color: "#fff", fontWeight: "600" }}>{item.spots?.name}</Text>
                </Pressable>
              )}
              showsHorizontalScrollIndicator={false}
            />
          ) : (
            <Text style={styles.textMuted}>Keine Favoriten gespeichert.</Text>
          )}
        </View>

        {/* Reviews */}
        <View style={styles.sectionBox}>
          <Text style={styles.sectionTitle}>Letzte Reviews</Text>
          {reviews.length ? (
            reviews.map((r) => (
              <View key={r.id} style={styles.reviewCard}>
                {r.spots?.name && <Text style={styles.spotName}>{r.spots.name}</Text>}
                <View style={{ flexDirection: "row", marginBottom: 4, gap: 6 }}>
                  {r.mood_a ? <MoodPill label={r.mood_a} variant="outline" /> : null}
                  {r.mood_b ? <MoodPill label={r.mood_b} variant="outline" /> : null}
                </View>
                {r.text ? <Text style={styles.text}>{r.text}</Text> : null}
                <Text style={styles.reviewDate}>
                  {new Date(r.created_at).toLocaleDateString()}
                </Text>
              </View>
            ))
          ) : (
            <Text style={styles.textMuted}>Dieser Nutzer hat noch keine Reviews geschrieben.</Text>
          )}
        </View>

        <View style={{ height: 80 }} />
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  center: { flex: 1, alignItems: "center", justifyContent: "center" },
  customHeader: {
    position: "absolute",
    top: Platform.select({ ios: 54, android: 24 }),
    left: 12,
    right: 12,
    zIndex: 20,
    flexDirection: "row",
    alignItems: "center",
  },
  headerIconBtn: {
    backgroundColor: "rgba(0,0,0,0.55)",
    borderRadius: 20,
    paddingVertical: 6,
    paddingHorizontal: 18,
  },
  header: { alignItems: "center", paddingVertical: 32 },
  avatarImg: { width: 96, height: 96, borderRadius: 48, marginBottom: 12 },
  avatarFallback: {
    width: 96,
    height: 96,
    borderRadius: 48,
    backgroundColor: "#222",
    justifyContent: "center",
    alignItems: "center",
    marginBottom: 12,
  },
  avatarInitial: { fontSize: 36, fontWeight: "700", color: "#fff" },
  name: { fontSize: 22, fontWeight: "700", color: "#fff" },
  city: { fontSize: 15, color: "#bbb", marginTop: 4 },
  localBadge: { color: "#10B981", fontWeight: "600", marginTop: 4 },
  touristBadge: { color: "#3A86FF", fontWeight: "600", marginTop: 4 },
  sectionBox: {
    backgroundColor: "#0B0B0C",
    borderRadius: 16,
    padding: 16,
    marginHorizontal: 16,
    marginTop: 16,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: "#222",
  },
  sectionTitle: { fontSize: 18, fontWeight: "700", color: "#fff", marginBottom: 8 },
  text: { color: "#fff", fontSize: 15, marginBottom: 4 },
  textMuted: { color: "#9CA3AF", fontSize: 14 },
  reviewCard: {
    backgroundColor: "#141417",
    borderRadius: 12,
    padding: 12,
    marginBottom: 12,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: "#222",
  },
  spotName: { fontWeight: "600", fontSize: 16, marginBottom: 4, color: "#fff" },
  reviewDate: { fontSize: 12, color: "#9CA3AF", marginTop: 4 },
});
