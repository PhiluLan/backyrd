// app/profile.tsx
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
} from "react-native";
import { Screen, Button } from "../components/ui";
import { supabase } from "../lib/supabase";
import { useRouter } from "expo-router";
import * as ImagePicker from "expo-image-picker";
import { decode } from "base64-arraybuffer";
import type { User } from "@supabase/supabase-js";

type Review = {
  id: string;
  text: string | null;
  mood_a: string | null;
  mood_b: string | null;
  created_at: string;
  spot: { id: string; name: string } | null;
};

export default function ProfileScreen() {
  const router = useRouter();
  const [user, setUser] = useState<User | null>(null);

  // Profil-Felder
  const [avatar, setAvatar] = useState<string | null>(null);
  const [bio, setBio] = useState("");
  const [isLocal, setIsLocal] = useState(false);
  const [city, setCity] = useState("");
  const [sinceDate, setSinceDate] = useState("");

  // Daten
  const [reviews, setReviews] = useState<Review[]>([]);
  const [favorites, setFavorites] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    supabase.auth.getUser().then(({ data }) => setUser(data.user ?? null));
  }, []);

  useEffect(() => {
    if (user) loadProfile();
  }, [user]);

  async function loadProfile() {
    setLoading(true);
    try {
      // Profil laden
      const { data: profile, error: profErr } = await supabase
        .from("profiles")
        .select("avatar_url,bio,is_local,city,since_date")
        .eq("id", user!.id)
        .single();
      if (profErr) throw profErr;

      setAvatar(profile?.avatar_url ?? null);
      setBio(profile?.bio ?? "");
      setIsLocal(!!profile?.is_local);
      setCity(profile?.city ?? "");
      setSinceDate(profile?.since_date ?? "");

      // Reviews laden
      const { data: myReviews, error: revErr } = await supabase
        .from("reviews")
        .select("id,text,mood_a,mood_b,created_at,spot:spots(id,name)")
        .eq("user_id", user!.id)
        .order("created_at", { ascending: false });
      if (revErr) throw revErr;
      setReviews((myReviews || []) as Review[]);

      // Favoriten laden
      const { data: favs, error: favErr } = await supabase
        .from("favorites")
        .select("spot_id, spots(name, spot_photos(url))")
        .eq("user_id", user!.id)
        .order("created_at", { ascending: false });
      if (favErr) throw favErr;
      setFavorites(favs || []);
    } catch (e: any) {
      Alert.alert("Fehler", e.message ?? String(e));
    } finally {
      setLoading(false);
    }
  }

  async function pickAvatar() {
    try {
      const perm = await ImagePicker.getMediaLibraryPermissionsAsync();
      if (!perm.granted) {
        const ask = await ImagePicker.requestMediaLibraryPermissionsAsync();
        if (!ask.granted) {
          Alert.alert(
            "Zugriff verweigert",
            "Bitte erlaube den Zugriff auf Fotos, um ein Profilbild zu wählen."
          );
          return;
        }
      }

      const result = await ImagePicker.launchImageLibraryAsync({
        mediaTypes: ["images"],
        allowsEditing: true,
        aspect: [1, 1],
        quality: 0.85,
        base64: true,
      });

      if (result.canceled || !result.assets?.length) return;
      const asset = result.assets[0];
      if (!asset.base64) {
        Alert.alert("Fehler", "Konnte Base64-Daten nicht lesen.");
        return;
      }

      const ext =
        asset.fileName?.split(".").pop()?.toLowerCase() ||
        asset.mimeType?.split("/").pop()?.toLowerCase() ||
        "jpg";
      const contentType = asset.mimeType ?? "image/jpeg";
      const fileName = `profile_${user!.id}_${Date.now()}.${ext}`;
      const arrayBuffer = decode(asset.base64);

      const { error: uploadErr } = await supabase.storage
        .from("profile-photos")
        .upload(fileName, arrayBuffer, { contentType, upsert: true });
      if (uploadErr) throw uploadErr;

      const { data } = supabase.storage.from("profile-photos").getPublicUrl(fileName);
      const publicUrl = data.publicUrl;

      const { error: updErr } = await supabase
        .from("profiles")
        .update({ avatar_url: publicUrl })
        .eq("id", user!.id);
      if (updErr) throw updErr;

      setAvatar(publicUrl);
      Alert.alert("Erfolgreich", "Profilbild aktualisiert!");
    } catch (e: any) {
      Alert.alert("Fehler", e.message ?? String(e));
    }
  }

  async function saveProfile() {
    if (!user) return;
    setSaving(true);
    try {
      const { error } = await supabase
        .from("profiles")
        .update({
          bio,
          is_local: isLocal,
          city: isLocal ? city : null,
          since_date: isLocal ? sinceDate : null,
        })
        .eq("id", user.id);
      if (error) throw error;
      Alert.alert("Gespeichert", "Profil aktualisiert!");
    } catch (e: any) {
      Alert.alert("Fehler", e.message ?? String(e));
    } finally {
      setSaving(false);
    }
  }

  const localBadge = useMemo(() => {
    if (!isLocal) return "🌍 Tourist";
    if (!sinceDate) return "👤 Local";
    const diffDays = Math.floor(
      (Date.now() - new Date(sinceDate).getTime()) / 86400000
    );
    if (diffDays < 90) return "👤 Local · neu in der Stadt";
    if (diffDays < 365) return "👤 Local · seit < 1 Jahr";
    return "👤 Local · seit > 1 Jahr";
  }, [isLocal, sinceDate]);

  if (!user) {
    return (
      <Screen style={{ backgroundColor: "#000" }}>
        <View style={styles.center}>
          <Text style={{ color: "#fff", marginBottom: 12 }}>Bitte zuerst einloggen.</Text>
          <Button title="Zum Login" onPress={() => router.push("/login")} />
        </View>
      </Screen>
    );
  }

  if (loading) {
    return (
      <Screen style={{ backgroundColor: "#000" }}>
        <View style={styles.center}>
          <ActivityIndicator color="#fff" />
        </View>
      </Screen>
    );
  }

  return (
    <Screen style={{ backgroundColor: "#000" }}>
      <FlatList
        data={reviews}
        keyExtractor={(item) => item.id}
        ItemSeparatorComponent={() => <View style={{ height: 8 }} />}
        renderItem={({ item }) => (
          <View style={styles.reviewCard}>
            <Text style={styles.reviewTitle}>
              {item.spot?.name ?? "Unbekannter Spot"}
            </Text>
            {item.text ? <Text style={styles.reviewText}>{item.text}</Text> : null}
            <Text style={styles.reviewDate}>{item.created_at.split("T")[0]}</Text>
            <Text style={styles.reviewMoods}>
              {item.mood_a ? `#${item.mood_a} ` : ""}
              {item.mood_b ? `#${item.mood_b}` : ""}
            </Text>
          </View>
        )}
        ListEmptyComponent={() => (
          <Text style={{ color: "#888", marginTop: 8, paddingHorizontal: 16 }}>
            Noch keine Reviews erstellt.
          </Text>
        )}
        contentContainerStyle={{ padding: 16, paddingBottom: 80 }}
        ListHeaderComponent={
          <View>
            <Text style={styles.title}>Mein Profil</Text>

            {/* Avatar */}
            <Pressable onPress={pickAvatar} style={{ alignSelf: "flex-start" }}>
              {avatar ? (
                <Image
                  source={{ uri: avatar }}
                  style={styles.avatar}
                />
              ) : (
                <View style={styles.avatarFallback}>
                  <Text style={{ color: "#fff", fontSize: 24 }}>+</Text>
                </View>
              )}
            </Pressable>
            <Button title="Profilbild ändern" variant="ghost" onPress={pickAvatar} />

            {/* Local / Tourist */}
            <View style={styles.box}>
              <View style={styles.boxHeader}>
                <Text style={styles.boxHeaderText}>Ich bin Local</Text>
                <Switch value={isLocal} onValueChange={setIsLocal} />
              </View>
              <Text style={{ color: "#bbb", marginBottom: 8 }}>{localBadge}</Text>

              {isLocal && (
                <>
                  <TextInput
                    style={styles.input}
                    placeholder="Stadt"
                    placeholderTextColor="#777"
                    value={city}
                    onChangeText={setCity}
                  />
                  <TextInput
                    style={styles.input}
                    placeholder="Seit wann? YYYY-MM-DD"
                    placeholderTextColor="#777"
                    value={sinceDate}
                    onChangeText={setSinceDate}
                  />
                </>
              )}
            </View>

            {/* Bio */}
            <TextInput
              style={[styles.input, { minHeight: 80, marginTop: 16 }]}
              placeholder="Über mich…"
              placeholderTextColor="#777"
              value={bio}
              onChangeText={setBio}
              multiline
            />
            <Button
              title={saving ? "Speichere…" : "Profil speichern"}
              onPress={saveProfile}
              disabled={saving}
            />

            {/* Favoriten */}
            <Text style={[styles.title, { marginTop: 24 }]}>Meine Favoriten</Text>
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
                    style={styles.favoriteImg}
                  />
                  <Text style={styles.favoriteText}>{item.spots?.name}</Text>
                </Pressable>
              )}
              showsHorizontalScrollIndicator={false}
              ListEmptyComponent={<Text style={{ color: "#888" }}>Keine Favoriten</Text>}
            />

            <Text style={[styles.title, { marginTop: 24 }]}>Meine Reviews</Text>
          </View>
        }
      />
    </Screen>
  );
}

const styles = StyleSheet.create({
  center: { flex: 1, justifyContent: "center", alignItems: "center" },
  title: { color: "#fff", fontSize: 24, fontWeight: "800", marginBottom: 12 },
  avatar: { width: 100, height: 100, borderRadius: 50, marginBottom: 12 },
  avatarFallback: {
    width: 100,
    height: 100,
    borderRadius: 50,
    backgroundColor: "#222",
    alignItems: "center",
    justifyContent: "center",
    marginBottom: 12,
  },
  box: {
    backgroundColor: "#141417",
    padding: 12,
    borderRadius: 8,
    marginTop: 16,
  },
  boxHeader: { flexDirection: "row", justifyContent: "space-between", alignItems: "center", marginBottom: 8 },
  boxHeaderText: { color: "#fff", fontWeight: "600" },
  input: {
    borderWidth: 1,
    borderColor: "#333",
    borderRadius: 8,
    padding: 8,
    color: "#fff",
    marginBottom: 8,
  },
  favoriteImg: { width: 160, height: 110, borderRadius: 12, marginBottom: 4 },
  favoriteText: { color: "#fff", fontWeight: "600" },
  reviewCard: {
    backgroundColor: "#141417",
    padding: 12,
    borderRadius: 12,
  },
  reviewTitle: { color: "#fff", fontWeight: "600", fontSize: 16 },
  reviewText: { color: "#ddd", marginTop: 4 },
  reviewDate: { color: "#aaa", marginTop: 4, fontSize: 12 },
  reviewMoods: { color: "#ccc", marginTop: 4 },
});
