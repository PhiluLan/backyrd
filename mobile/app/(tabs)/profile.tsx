// app/(tabs)/profile.tsx
import React, { useEffect, useMemo, useState } from "react";
import {
  View,
  Text,
  Image,
  TextInput,
  Pressable,
  FlatList,
  Alert,
  ActivityIndicator,
  Switch,
  StyleSheet,
  ScrollView,
  Platform,
} from "react-native";
import { supabase } from "../../lib/supabase";
import { useRouter } from "expo-router";
import * as ImagePicker from "expo-image-picker";
import { decode } from "base64-arraybuffer";
import type { User } from "@supabase/supabase-js";
import { BlurView } from "expo-blur";
import { LinearGradient } from "expo-linear-gradient";
import { Ionicons } from "@expo/vector-icons";
import { useAchievements } from "../../hooks/useAchievements";

export default function ProfileScreen() {
  const router = useRouter();
  const [user, setUser] = useState<User | null>(null);

  // Profile fields
  const [avatar, setAvatar] = useState<string | null>(null);
  const [bio, setBio] = useState("");
  const [isLocal, setIsLocal] = useState(false);
  const [city, setCity] = useState("");
  const [sinceDate, setSinceDate] = useState("");

  const { achievements } = useAchievements(user?.id);

  // Data sets
  const [reviews, setReviews] = useState<any[]>([]);
  const [favorites, setFavorites] = useState<any[]>([]);
  const [badges, setBadges] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);

  /* SESSION */
  useEffect(() => {
    supabase.auth.getSession().then(({ data }) => {
      setUser(data.session?.user ?? null);
    });
  }, []);

  useEffect(() => {
    if (user) loadProfile();
  }, [user]);

  /* LOAD PROFILE */
  async function loadProfile() {
    setLoading(true);
    try {
      const { data: profile } = await supabase
        .from("profiles")
        .select("*")
        .eq("id", user!.id)
        .single();

      if (profile) {
        setAvatar(profile.avatar_url);
        setBio(profile.bio ?? "");
        setIsLocal(!!profile.is_local);
        setCity(profile.city ?? "");
        setSinceDate(profile.since_date ?? "");
      }

      const { data: revs } = await supabase
        .from("reviews")
        .select("*, spot:spots(id,name)")
        .eq("user_id", user!.id)
        .order("created_at", { ascending: false });
      setReviews(revs || []);

      const { data: favs } = await supabase
        .from("favorites")
        .select("spot_id, spots(name, spot_photos(url))")
        .eq("user_id", user!.id)
        .order("created_at", { ascending: false });
      setFavorites(favs || []);

      const { data: userBadges } = await supabase
        .from("user_achievements")
        .select("*, achievements(*)")
        .eq("user_id", user!.id)
        .order("achieved_at", { ascending: true });
      setBadges(userBadges || []);
    } catch (e) {
      Alert.alert("Fehler", String(e));
    } finally {
      setLoading(false);
    }
  }

  /* PICK AVATAR */
  async function pickAvatar() {
    try {
      const result = await ImagePicker.launchImageLibraryAsync({
        mediaTypes: ["images"],
        allowsEditing: true,
        aspect: [1, 1],
        quality: 0.85,
        base64: true,
      });

      if (result.canceled) return;

      const asset = result.assets[0];
      if (!asset.base64) return;

      const ext = asset.fileName?.split(".").pop() || "jpg";
      const fileName = `profile_${user!.id}_${Date.now()}.${ext}`;
      const arrayBuffer = decode(asset.base64);

      await supabase.storage
        .from("profile-photos")
        .upload(fileName, arrayBuffer, {
          contentType: asset.mimeType ?? "image/jpeg",
          upsert: true,
        });

      const { data } = supabase.storage
        .from("profile-photos")
        .getPublicUrl(fileName);

      await supabase
        .from("profiles")
        .update({ avatar_url: data.publicUrl })
        .eq("id", user!.id);

      setAvatar(data.publicUrl);
    } catch (e) {
      Alert.alert("Fehler", String(e));
    }
  }

  /* SAVE PROFILE */
  async function saveProfile() {
    if (!user) return;

    setSaving(true);
    try {
      await supabase
        .from("profiles")
        .update({
          bio,
          is_local: isLocal,
          city: isLocal ? city : null,
          since_date: isLocal ? sinceDate : null,
        })
        .eq("id", user.id);

      Alert.alert("Gespeichert", "Dein Profil wurde aktualisiert.");
    } catch (e) {
      Alert.alert("Fehler", String(e));
    } finally {
      setSaving(false);
    }
  }

  /* BADGE HELPERS */
  const topBadges = useMemo(() => {
    if (!badges.length) return [];
    return badges
      .map((b) => b.achievements)
      .sort((a, b) => (a.tier ?? 0) - (b.tier ?? 0))
      .slice(0, 3);
  }, [badges]);

  /* NOT LOGGED IN UI */
  if (!user) {
    return (
      <LinearGradient
        colors={["#0A0A0B", "#181820"]}
        style={styles.notLoggedContainer}
      >
        <BlurView intensity={60} tint="dark" style={styles.notLoggedCard}>
          <Ionicons name="lock-closed" size={36} color="#fff" />
          <Text style={styles.notLoggedTitle}>Nicht eingeloggt</Text>
          <Text style={styles.notLoggedSubtitle}>
            Logge dich ein, um dein Profil zu sehen.
          </Text>

          <Pressable
            onPress={() => router.push("/auth/login")}
            style={styles.loginBtn}
          >
            <Text style={styles.loginBtnText}>Zum Login</Text>
          </Pressable>
        </BlurView>
      </LinearGradient>
    );
  }

  /* LOADING */
  if (loading) {
    return (
      <View style={styles.loadingCenter}>
        <ActivityIndicator size="large" color="#fff" />
      </View>
    );
  }

  /* MAIN PROFILE */
  return (
    <LinearGradient
      colors={["#0A0A0B", "#181820"]}
      style={{ flex: 1 }}
    >
      <ScrollView
        showsVerticalScrollIndicator={false}
        contentContainerStyle={{ paddingBottom: 100 }}
      >
        {/* HEADER */}
        <Text style={styles.headerTitle}>Mein Profil</Text>

        {/* PROFILE CARD */}
        <BlurView intensity={60} tint="dark" style={styles.profileCard}>
          <Pressable onPress={pickAvatar} style={styles.avatarWrapper}>
            {avatar ? (
              <Image source={{ uri: avatar }} style={styles.avatar} />
            ) : (
              <View style={styles.avatarFallback}>
                <Ionicons name="person" size={38} color="#fff" />
              </View>
            )}
          </Pressable>

          <Text style={styles.usernameText}>
            {user.user_metadata?.first_name || "User"}{" "}
            {user.user_metadata?.last_name || ""}
          </Text>

          <Text style={styles.emailText}>{user.email}</Text>

          {/* TOP BADGES */}
          <View style={{ marginTop: 18 }}>
            <Text style={styles.sectionTitle}>Meine Badges</Text>

            {topBadges.length === 0 ? (
              <Text style={styles.textMuted}>Noch keine Badges.</Text>
            ) : (
              <FlatList
                horizontal
                data={topBadges}
                keyExtractor={(b) => b.id}
                renderItem={({ item }) => (
                  <View style={styles.badgeItem}>
                    <Image
                      source={{ uri: item.icon_url }}
                      style={styles.badgeIcon}
                    />
                    <Text style={styles.badgeName}>{item.name}</Text>
                  </View>
                )}
                showsHorizontalScrollIndicator={false}
              />
            )}
          </View>

          {/* BIO */}
          <Text style={[styles.sectionTitle, { marginTop: 24 }]}>
            Über mich
          </Text>
          <TextInput
            style={styles.input}
            placeholder="Schreibe etwas über dich…"
            placeholderTextColor="#979AA2"
            value={bio}
            onChangeText={setBio}
            multiline
          />

          {/* LOCAL SWITCH */}
          <View style={styles.localRow}>
            <Text style={styles.localLabel}>Ich bin Local</Text>
            <Switch value={isLocal} onValueChange={setIsLocal} />
          </View>

          {isLocal && (
            <>
              <TextInput
                placeholder="Stadt"
                placeholderTextColor="#979AA2"
                value={city}
                onChangeText={setCity}
                style={styles.input}
              />

              <TextInput
                placeholder="Seit wann? YYYY-MM-DD"
                placeholderTextColor="#979AA2"
                value={sinceDate}
                onChangeText={setSinceDate}
                style={styles.input}
              />
            </>
          )}

          <Pressable
            onPress={saveProfile}
            style={({ pressed }) => [
              styles.saveBtn,
              pressed && { opacity: 0.85 },
            ]}
          >
            <Text style={styles.saveBtnText}>
              {saving ? "Speichere…" : "Profil speichern"}
            </Text>
          </Pressable>
        </BlurView>

        {/* FAVORITES */}
        <Text style={[styles.sectionTitle, { marginTop: 30 }]}>
          Meine Favoriten
        </Text>

        <FlatList
          horizontal
          data={favorites}
          renderItem={({ item }) => (
            <Pressable
              onPress={() => router.push(`/spot/${item.spot_id}`)}
              style={{ marginRight: 14 }}
            >
              <Image
                source={{
                  uri:
                    item.spots?.spot_photos?.[0]?.url ??
                    "https://placehold.co/200x150",
                }}
                style={styles.favoriteImg}
              />
              <Text style={styles.favoriteText}>{item.spots?.name}</Text>
            </Pressable>
          )}
          showsHorizontalScrollIndicator={false}
          ListEmptyComponent={
            <Text style={styles.textMuted}>Keine Favoriten</Text>
          }
          contentContainerStyle={{ paddingHorizontal: 16 }}
        />

        {/* REVIEWS */}
        <Text style={[styles.sectionTitle, { marginTop: 30 }]}>
          Meine Reviews
        </Text>

        <View style={{ paddingHorizontal: 16 }}>
          {reviews.length === 0 ? (
            <Text style={styles.textMuted}>Noch keine Reviews.</Text>
          ) : (
            reviews.map((item) => (
              <View key={item.id} style={styles.reviewCard}>
                <Text style={styles.reviewTitle}>
                  {item.spot?.name ?? "Spot"}
                </Text>
                {item.text && (
                  <Text style={styles.reviewText}>{item.text}</Text>
                )}
                <Text style={styles.reviewDate}>
                  {item.created_at.split("T")[0]}
                </Text>
              </View>
            ))
          )}
        </View>

        {/* LOGOUT */}
        <View style={styles.logoutWrapper}>
          <BlurView intensity={80} tint="dark" style={styles.logoutBlur}>
            <Pressable
              onPress={async () => {
                await supabase.auth.signOut();
                router.replace("/(tabs)");
              }}
              style={styles.logoutBtn}
            >
              <Text style={styles.logoutText}>Ausloggen</Text>
            </Pressable>
          </BlurView>
        </View>
      </ScrollView>
    </LinearGradient>
  );
}

/* ======================================================
   ✅ STYLES — BACKYRD GLASS UI
====================================================== */
const styles = StyleSheet.create({
  notLoggedContainer: {
    flex: 1,
    justifyContent: "center",
    paddingHorizontal: 26,
  },
  notLoggedCard: {
    padding: 26,
    borderRadius: 28,
    alignItems: "center",
    backgroundColor: "rgba(255,255,255,0.06)",
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.1)",
  },
  notLoggedTitle: {
    color: "#fff",
    fontSize: 22,
    fontWeight: "800",
    marginTop: 14,
  },
  notLoggedSubtitle: {
    color: "#A6A8AD",
    fontSize: 14,
    textAlign: "center",
    marginTop: 6,
    marginBottom: 16,
  },
  loginBtn: {
    backgroundColor: "#000",
    paddingVertical: 14,
    paddingHorizontal: 26,
    borderRadius: 20,
  },
  loginBtnText: {
    color: "#fff",
    fontWeight: "700",
    fontSize: 16,
  },

  /* LOADING */
  loadingCenter: {
    flex: 1,
    justifyContent: "center",
    alignItems: "center",
    backgroundColor: "#0A0A0B",
  },

  /* HEADER */
  headerTitle: {
    color: "#fff",
    fontSize: 28,
    fontWeight: "800",
    paddingHorizontal: 18,
    paddingTop: Platform.select({ ios: 60, android: 32 }),
    marginBottom: 12,
  },

  /* PROFILE CARD */
  profileCard: {
    marginHorizontal: 18,
    padding: 20,
    borderRadius: 28,
    backgroundColor: "rgba(255,255,255,0.06)",
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.1)",
  },

  avatarWrapper: {
    alignSelf: "center",
    marginBottom: 12,
  },
  avatar: {
    width: 110,
    height: 110,
    borderRadius: 55,
  },
  avatarFallback: {
    width: 110,
    height: 110,
    borderRadius: 55,
    backgroundColor: "#222",
    alignItems: "center",
    justifyContent: "center",
  },

  usernameText: {
    color: "#fff",
    textAlign: "center",
    fontSize: 22,
    fontWeight: "800",
  },
  emailText: {
    color: "#A6A8AD",
    textAlign: "center",
    marginTop: 2,
    marginBottom: 20,
  },

  /* BADGES */
  sectionTitle: {
    color: "#fff",
    fontSize: 20,
    fontWeight: "800",
    marginBottom: 10,
    paddingHorizontal: 18,
  },
  badgeItem: {
    alignItems: "center",
    marginRight: 16,
  },
  badgeIcon: {
    width: 58,
    height: 58,
    borderRadius: 999,
    marginBottom: 6,
  },
  badgeName: {
    color: "#fff",
    fontSize: 12,
  },

  /* INPUTS */
  input: {
    backgroundColor: "rgba(255,255,255,0.06)",
    borderColor: "rgba(255,255,255,0.12)",
    borderWidth: 1,
    color: "#fff",
    borderRadius: 16,
    padding: 14,
    fontSize: 16,
    marginBottom: 10,
  },

  /* LOCAL */
  localRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    marginTop: 14,
    marginBottom: 10,
    paddingHorizontal: 6,
  },
  localLabel: {
    color: "#fff",
    fontSize: 16,
    fontWeight: "600",
  },

  /* SAVE BUTTON */
  saveBtn: {
    marginTop: 10,
    backgroundColor: "#000",
    paddingVertical: 16,
    borderRadius: 16,
    alignItems: "center",
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.12)",
  },
  saveBtnText: {
    color: "#fff",
    fontSize: 16,
    fontWeight: "700",
  },

  /* FAVORITES */
  favoriteImg: {
    width: 160,
    height: 110,
    borderRadius: 16,
    marginBottom: 6,
  },
  favoriteText: {
    color: "#fff",
    fontSize: 15,
    fontWeight: "600",
  },

  /* REVIEWS */
  reviewCard: {
    backgroundColor: "rgba(255,255,255,0.05)",
    padding: 14,
    marginTop: 8,
    borderRadius: 16,
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.08)",
  },
  reviewTitle: {
    color: "#fff",
    fontSize: 16,
    fontWeight: "700",
  },
  reviewText: {
    color: "#CFCFD4",
    marginTop: 4,
  },
  reviewDate: {
    color: "#8F91A0",
    marginTop: 6,
    fontSize: 12,
  },

  /* LOGOUT */
  logoutWrapper: {
    marginTop: 40,
    marginBottom: 50,
    paddingHorizontal: 18,
  },
  logoutBlur: {
    borderRadius: 20,
    backgroundColor: "rgba(255,255,255,0.07)",
    overflow: "hidden",
  },
  logoutBtn: {
    paddingVertical: 16,
    alignItems: "center",
  },
  logoutText: {
    color: "#fff",
    fontSize: 17,
    fontWeight: "800",
    letterSpacing: 0.3,
  },

  /* SHARED */
  textMuted: {
    color: "#8F91A0",
    fontSize: 14,
  },
});
