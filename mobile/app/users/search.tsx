import React, { useCallback, useEffect, useState } from "react";
import {
  ActivityIndicator,
  Alert,
  FlatList,
  Pressable,
  SafeAreaView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { useRouter } from "expo-router";

import Avatar from "../../components/Avatar";
import { supabase } from "../../lib/supabase";
import { userFacingError } from "../../lib/userFacingError";

type SearchUser = {
  user_id: string;
  display_name: string | null;
  username: string | null;
  avatar_url: string | null;
  city: string | null;
  bio: string | null;
  is_local: boolean;
  viewer_follows_user: boolean;
  follower_count: number;
  following_count: number;
};

export default function UserSearchScreen() {
  const router = useRouter();
  const [query, setQuery] = useState("");
  const [results, setResults] = useState<SearchUser[]>([]);
  const [loading, setLoading] = useState(false);
  const [busyUser, setBusyUser] = useState<string | null>(null);

  useEffect(() => {
    const value = query.trim();
    if (value.length < 2) {
      setResults([]);
      return;
    }

    const timer = setTimeout(async () => {
      setLoading(true);
      try {
        const { data, error } = await supabase.rpc("search_social_users_v1", {
          p_query: value,
          p_limit: 30,
        });
        if (error) throw error;
        setResults((data ?? []) as SearchUser[]);
      } catch (error: any) {
        Alert.alert(
          "Suche nicht verfügbar",
          userFacingError(error, "Die Personensuche ist gerade nicht erreichbar. Bitte versuche es noch einmal."),
        );
      } finally {
        setLoading(false);
      }
    }, 280);

    return () => clearTimeout(timer);
  }, [query]);

  const toggleFollow = useCallback(async (user: SearchUser) => {
    if (busyUser) return;
    const next = !user.viewer_follows_user;
    setBusyUser(user.user_id);
    setResults((current) =>
      current.map((item) =>
        item.user_id === user.user_id
          ? {
              ...item,
              viewer_follows_user: next,
              follower_count: Math.max(
                0,
                item.follower_count + (next ? 1 : -1),
              ),
            }
          : item,
      ),
    );

    try {
      const { error } = await supabase.rpc(
        next ? "follow_user_v2" : "unfollow_user_v2",
        { p_user_id: user.user_id },
      );
      if (error) throw error;
    } catch (error: any) {
      setResults((current) =>
        current.map((item) =>
          item.user_id === user.user_id
            ? {
                ...item,
                viewer_follows_user: !next,
                follower_count: Math.max(
                  0,
                  item.follower_count + (next ? -1 : 1),
                ),
              }
            : item,
        ),
      );
      Alert.alert("Folgen fehlgeschlagen", userFacingError(error));
    } finally {
      setBusyUser(null);
    }
  }, [busyUser]);

  return (
    <SafeAreaView style={styles.screen}>
      <View style={styles.header}>
        <Pressable accessibilityRole="button" accessibilityLabel="Zurück" style={styles.iconButton} onPress={() => router.back()}>
          <Ionicons name="chevron-back" size={24} color="#FFFFFF" />
        </Pressable>
        <View style={styles.headerCopy}>
          <Text style={styles.kicker}>BACKYRD MENSCHEN</Text>
          <Text style={styles.title}>Leute entdecken</Text>
        </View>
      </View>

      <View style={styles.searchBox}>
        <Ionicons name="search" size={21} color="#8E8E96" />
        <TextInput
          accessibilityLabel="Menschen suchen"
          autoFocus
          value={query}
          onChangeText={setQuery}
          placeholder="Name oder @username"
          placeholderTextColor="#777780"
          style={styles.input}
          autoCapitalize="none"
        />
        {query.length > 0 ? (
          <Pressable accessibilityRole="button" accessibilityLabel="Suche löschen" onPress={() => setQuery("")}>
            <Ionicons name="close-circle" size={20} color="#777780" />
          </Pressable>
        ) : null}
      </View>

      {loading ? (
        <ActivityIndicator color="#FF4F91" style={{ marginTop: 28 }} />
      ) : (
        <FlatList
          data={results}
          keyExtractor={(item) => item.user_id}
          contentContainerStyle={styles.list}
          ListEmptyComponent={
            <View style={styles.empty}>
              <Ionicons name="people-outline" size={42} color="#4D4D55" />
              <Text style={styles.emptyTitle}>
                {query.trim().length < 2
                  ? "Finde Menschen auf Backyrd"
                  : "Keine öffentlichen Profile gefunden"}
              </Text>
              <Text style={styles.emptyText}>
                Private und blockierte Konten erscheinen nicht in der Suche.
              </Text>
            </View>
          }
          renderItem={({ item }) => (
            <Pressable
              accessibilityRole="button"
              accessibilityLabel={`${item.display_name || item.username || "Backyrd User"} Profil öffnen`}
              style={styles.row}
              onPress={() => router.push(`/user/${item.user_id}` as any)}
            >
              <Avatar
                uri={item.avatar_url ?? undefined}
                name={item.display_name || item.username || "Backyrd User"}
                size={54}
              />
              <View style={styles.userCopy}>
                <Text style={styles.name} numberOfLines={1}>
                  {item.display_name || item.username || "Backyrd User"}
                </Text>
                <Text style={styles.meta} numberOfLines={1}>
                  {item.username ? `@${item.username}` : "Backyrd"}
                  {item.city ? ` · ${item.city}` : ""}
                </Text>
                <Text style={styles.stats}>
                  {item.follower_count} Follower
                </Text>
              </View>
              <Pressable
                accessibilityRole="button"
                accessibilityLabel={item.viewer_follows_user ? `${item.display_name || item.username || "Backyrd User"} nicht mehr folgen` : `${item.display_name || item.username || "Backyrd User"} folgen`}
                accessibilityState={{ selected: item.viewer_follows_user, busy: busyUser === item.user_id }}
                style={[
                  styles.followButton,
                  item.viewer_follows_user && styles.followButtonActive,
                ]}
                disabled={busyUser === item.user_id}
                onPress={(event) => {
                  event.stopPropagation();
                  void toggleFollow(item);
                }}
              >
                <Text
                  style={[
                    styles.followText,
                    item.viewer_follows_user && styles.followTextActive,
                  ]}
                >
                  {item.viewer_follows_user ? "Gefolgt" : "Folgen"}
                </Text>
              </Pressable>
            </Pressable>
          )}
        />
      )}
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: "#050506" },
  header: {
    paddingHorizontal: 18,
    paddingTop: 8,
    flexDirection: "row",
    alignItems: "center",
    gap: 14,
  },
  iconButton: {
    width: 44,
    height: 44,
    borderRadius: 17,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: "#17171B",
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.08)",
  },
  headerCopy: { flex: 1 },
  kicker: {
    color: "#FF4F91",
    fontSize: 10,
    fontWeight: "900",
    letterSpacing: 2.2,
  },
  title: {
    marginTop: 2,
    color: "#FFFFFF",
    fontSize: 28,
    fontWeight: "900",
    letterSpacing: -0.5,
  },
  searchBox: {
    margin: 18,
    height: 56,
    paddingHorizontal: 16,
    borderRadius: 19,
    flexDirection: "row",
    alignItems: "center",
    gap: 11,
    backgroundColor: "#17171B",
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.08)",
  },
  input: { flex: 1, color: "#FFFFFF", fontSize: 16, fontWeight: "600" },
  list: { paddingHorizontal: 18, paddingBottom: 40 },
  row: {
    minHeight: 82,
    flexDirection: "row",
    alignItems: "center",
    gap: 13,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: "rgba(255,255,255,0.08)",
  },
  userCopy: { flex: 1 },
  name: { color: "#FFFFFF", fontSize: 16, fontWeight: "800" },
  meta: { marginTop: 2, color: "#9B9BA4", fontSize: 13, fontWeight: "600" },
  stats: { marginTop: 4, color: "#676770", fontSize: 11, fontWeight: "700" },
  followButton: {
    minWidth: 76,
    height: 38,
    paddingHorizontal: 14,
    borderRadius: 13,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: "#FF4F91",
  },
  followButtonActive: {
    backgroundColor: "#202026",
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.11)",
  },
  followText: { color: "#111113", fontSize: 13, fontWeight: "900" },
  followTextActive: { color: "#FFFFFF" },
  empty: { alignItems: "center", paddingTop: 76, paddingHorizontal: 28 },
  emptyTitle: {
    marginTop: 16,
    color: "#FFFFFF",
    fontSize: 19,
    fontWeight: "900",
    textAlign: "center",
  },
  emptyText: {
    marginTop: 8,
    color: "#868690",
    fontSize: 14,
    lineHeight: 20,
    textAlign: "center",
  },
});
