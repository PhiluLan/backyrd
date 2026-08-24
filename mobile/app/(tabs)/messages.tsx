// mobile/app/(tabs)/messages.tsx
import React, {
  useCallback,
  useEffect,
  useState,
} from "react";
import {
  ActivityIndicator,
  FlatList,
  Pressable,
  RefreshControl,
  SafeAreaView,
  StyleSheet,
  Text,
  View,
} from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { useFocusEffect } from "@react-navigation/native";
import { useRouter } from "expo-router";

import Avatar from "../../components/Avatar";
import { supabase } from "../../lib/supabase";

type ChatListItem = {
  chat_id: string;
  other_user_id: string;
  other_display_name: string | null;
  other_first_name: string | null;
  other_username: string | null;
  other_avatar_url: string | null;
  chat_created_at: string;
  last_message_text: string | null;
  last_message_at: string | null;
  last_message_sender_id: string | null;
  unread_count: number;
};

function errorMessage(error: any) {
  return (
    error?.message ||
    error?.details ||
    error?.hint ||
    "Chats konnten nicht geladen werden."
  );
}

function formatTime(value: string | null) {
  if (!value) return "";

  const date = new Date(value);
  const now = new Date();

  if (Number.isNaN(date.getTime())) return "";

  if (date.toDateString() === now.toDateString()) {
    return date.toLocaleTimeString("de-CH", {
      hour: "2-digit",
      minute: "2-digit",
    });
  }

  return date.toLocaleDateString("de-CH", {
    day: "2-digit",
    month: "2-digit",
  });
}

export default function MessagesScreen() {
  const router = useRouter();

  const [chats, setChats] = useState<ChatListItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [errorText, setErrorText] = useState<string | null>(
    null,
  );

  const loadChats = useCallback(
    async (options?: { refresh?: boolean }) => {
      const isRefresh = Boolean(options?.refresh);

      try {
        if (isRefresh) {
          setRefreshing(true);
        } else {
          setLoading(true);
        }

        setErrorText(null);

        const { data: authData, error: authError } =
          await supabase.auth.getUser();

        if (authError) throw authError;

        if (!authData.user) {
          setChats([]);
          setErrorText(
            "Bitte melde dich an, um deine Nachrichten zu sehen.",
          );
          return;
        }

        const { data, error } = await supabase.rpc(
          "get_my_direct_chats_v1",
        );

        if (error) throw error;

        const normalized = Array.isArray(data)
          ? data
              .filter(
                (row: any) =>
                  row &&
                  typeof row.chat_id === "string" &&
                  typeof row.other_user_id === "string",
              )
              .map(
                (row: any): ChatListItem => ({
                  chat_id: row.chat_id,
                  other_user_id: row.other_user_id,
                  other_display_name:
                    typeof row.other_display_name === "string"
                      ? row.other_display_name
                      : null,
                  other_first_name:
                    typeof row.other_first_name === "string"
                      ? row.other_first_name
                      : null,
                  other_username:
                    typeof row.other_username === "string"
                      ? row.other_username
                      : null,
                  other_avatar_url:
                    typeof row.other_avatar_url === "string"
                      ? row.other_avatar_url
                      : null,
                  chat_created_at:
                    typeof row.chat_created_at === "string"
                      ? row.chat_created_at
                      : new Date().toISOString(),
                  last_message_text:
                    typeof row.last_message_text === "string"
                      ? row.last_message_text
                      : null,
                  last_message_at:
                    typeof row.last_message_at === "string"
                      ? row.last_message_at
                      : null,
                  last_message_sender_id:
                    typeof row.last_message_sender_id === "string"
                      ? row.last_message_sender_id
                      : null,
                  unread_count: Number(row.unread_count ?? 0),
                }),
              )
          : [];

        setChats(normalized);
      } catch (error: any) {
        console.log("get_my_direct_chats_v1 failed:", error);
        setChats([]);
        setErrorText(errorMessage(error));
      } finally {
        setLoading(false);
        setRefreshing(false);
      }
    },
    [],
  );

  useFocusEffect(
    useCallback(() => {
      void loadChats();
    }, [loadChats]),
  );

  useEffect(() => {
    void loadChats();
  }, [loadChats]);

  if (loading) {
    return (
      <SafeAreaView style={styles.screen}>
        <View style={styles.center}>
          <ActivityIndicator size="large" color="#FF4F91" />
          <Text style={styles.stateText}>
            Nachrichten werden geladen …
          </Text>
        </View>
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView style={styles.screen}>
      <View style={styles.header}>
        <View>
          <Text style={styles.kicker}>BACKYRD</Text>
          <Text style={styles.title}>Nachrichten</Text>
        </View>

        <Pressable
          style={styles.headerIcon}
          onPress={() => router.push("/users/search" as any)}
          accessibilityLabel="Neuen Chat starten"
        >
          <Ionicons name="person-add-outline" size={22} color="#FFFFFF" />
        </Pressable>
      </View>

      {errorText ? (
        <View style={styles.center}>
          <Ionicons
            name="alert-circle-outline"
            size={38}
            color="rgba(255,255,255,0.4)"
          />
          <Text style={styles.stateTitle}>
            Nachrichten nicht verfügbar
          </Text>
          <Text style={styles.stateText}>{errorText}</Text>
          <Pressable
            style={styles.retryButton}
            onPress={() => void loadChats()}
          >
            <Text style={styles.retryText}>
              Erneut versuchen
            </Text>
          </Pressable>
        </View>
      ) : (
        <FlatList
          data={chats}
          keyExtractor={(item) => item.chat_id}
          contentContainerStyle={
            chats.length === 0
              ? styles.emptyList
              : styles.listContent
          }
          refreshControl={
            <RefreshControl
              refreshing={refreshing}
              onRefresh={() =>
                void loadChats({ refresh: true })
              }
              tintColor="#FF4F91"
            />
          }
          ListEmptyComponent={
            <View style={styles.center}>
              <View style={styles.emptyIcon}>
                <Ionicons
                  name="chatbubbles-outline"
                  size={34}
                  color="#FF4F91"
                />
              </View>
              <Text style={styles.stateTitle}>
                Noch keine Nachrichten
              </Text>
              <Text style={styles.stateText}>
                Suche nach einem öffentlichen Profil und starte deinen ersten Backyrd-Chat.
              </Text>
            </View>
          }
          renderItem={({ item }) => {
            const displayName =
              item.other_display_name?.trim() ||
              item.other_first_name?.trim() ||
              item.other_username?.trim() ||
              "Backyrd User";

            const preview =
              item.last_message_text?.trim() ||
              "Noch keine Nachricht";

            const hasUnread = item.unread_count > 0;

            return (
              <Pressable
                style={styles.chatRow}
                onPress={() =>
                  router.push(
                    `/messages/${item.chat_id}` as any,
                  )
                }
              >
                <Avatar
                  uri={item.other_avatar_url ?? undefined}
                  name={displayName}
                  size={52}
                />

                <View style={styles.chatText}>
                  <View style={styles.nameRow}>
                    <Text
                      style={[
                        styles.chatName,
                        hasUnread && styles.unreadText,
                      ]}
                      numberOfLines={1}
                    >
                      {displayName}
                    </Text>

                    <Text style={styles.timeText}>
                      {formatTime(
                        item.last_message_at ||
                          item.chat_created_at,
                      )}
                    </Text>
                  </View>

                  <View style={styles.previewRow}>
                    <Text
                      style={[
                        styles.previewText,
                        hasUnread && styles.unreadText,
                      ]}
                      numberOfLines={1}
                    >
                      {preview}
                    </Text>

                    {hasUnread ? (
                      <View style={styles.unreadBadge}>
                        <Text style={styles.unreadBadgeText}>
                          {Math.min(item.unread_count, 99)}
                        </Text>
                      </View>
                    ) : (
                      <Ionicons
                        name="chevron-forward"
                        size={18}
                        color="rgba(255,255,255,0.28)"
                      />
                    )}
                  </View>
                </View>
              </Pressable>
            );
          }}
        />
      )}
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  screen: {
    flex: 1,
    backgroundColor: "#050506",
  },
  header: {
    paddingHorizontal: 20,
    paddingTop: 18,
    paddingBottom: 18,
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
  },
  kicker: {
    color: "#FF4F91",
    fontSize: 11,
    fontWeight: "800",
    letterSpacing: 2,
    marginBottom: 4,
  },
  title: {
    color: "#FFFFFF",
    fontSize: 30,
    fontWeight: "800",
  },
  headerIcon: {
    width: 44,
    height: 44,
    borderRadius: 22,
    backgroundColor: "rgba(255,255,255,0.07)",
    alignItems: "center",
    justifyContent: "center",
  },
  listContent: {
    paddingHorizontal: 16,
    paddingBottom: 30,
  },
  emptyList: {
    flexGrow: 1,
  },
  chatRow: {
    flexDirection: "row",
    alignItems: "center",
    paddingHorizontal: 4,
    paddingVertical: 14,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: "rgba(255,255,255,0.10)",
  },
  chatText: {
    flex: 1,
    marginLeft: 13,
  },
  nameRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
  },
  chatName: {
    flex: 1,
    color: "#FFFFFF",
    fontSize: 16,
    fontWeight: "600",
  },
  timeText: {
    color: "rgba(255,255,255,0.42)",
    fontSize: 12,
  },
  previewRow: {
    marginTop: 5,
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
  },
  previewText: {
    flex: 1,
    color: "rgba(255,255,255,0.48)",
    fontSize: 14,
  },
  unreadText: {
    color: "#FFFFFF",
    fontWeight: "800",
  },
  unreadBadge: {
    minWidth: 22,
    height: 22,
    paddingHorizontal: 6,
    borderRadius: 11,
    backgroundColor: "#FF4F91",
    alignItems: "center",
    justifyContent: "center",
  },
  unreadBadgeText: {
    color: "#121214",
    fontSize: 11,
    fontWeight: "900",
  },
  center: {
    flex: 1,
    paddingHorizontal: 32,
    alignItems: "center",
    justifyContent: "center",
  },
  emptyIcon: {
    width: 72,
    height: 72,
    borderRadius: 36,
    backgroundColor: "rgba(255,107,158,0.12)",
    alignItems: "center",
    justifyContent: "center",
    marginBottom: 18,
  },
  stateTitle: {
    color: "#FFFFFF",
    fontSize: 20,
    fontWeight: "800",
    textAlign: "center",
    marginTop: 14,
  },
  stateText: {
    color: "rgba(255,255,255,0.52)",
    fontSize: 14,
    lineHeight: 20,
    textAlign: "center",
    marginTop: 8,
  },
  retryButton: {
    marginTop: 20,
    paddingHorizontal: 18,
    paddingVertical: 11,
    borderRadius: 999,
    backgroundColor: "#FF4F91",
  },
  retryText: {
    color: "#151216",
    fontSize: 14,
    fontWeight: "900",
  },
});
