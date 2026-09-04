// mobile/app/messages/[id].tsx

import "react-native-get-random-values";

import React, {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import {
  ActivityIndicator,
  Alert,
  FlatList,
  Image,
  KeyboardAvoidingView,
  Platform,
  Pressable,
  SafeAreaView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from "react-native";
import { Ionicons } from "@expo/vector-icons";
import {
  Stack,
  useLocalSearchParams,
  useRouter,
} from "expo-router";
import * as ImagePicker from "expo-image-picker";
import { v4 as uuidv4 } from "uuid";

import Avatar from "../../components/Avatar";
import { supabase } from "../../lib/supabase";
import { getSafetyRestrictionMessage } from "../../lib/safety-enforcement";
import { userFacingError } from "../../lib/userFacingError";
import { StateView } from "../../components/foundation/StateView";

type Message = {
  id: string;
  chat_id: string;
  sender_id: string;
  text: string | null;
  image_url?: string | null;
  image_render_url?: string | null;
  created_at: string;
  seen_at?: string | null;
};

type ChatSummary = {
  chat_id: string;
  other_user_id: string;
  other_display_name: string | null;
  other_first_name: string | null;
  other_username: string | null;
  other_avatar_url: string | null;
  unread_count: number;
};

const CHAT_MEDIA_BUCKET = "chat-uploads";
const CHAT_SIGNED_URL_TTL_SECONDS = 60 * 60;

async function hydrateChatMessageImage(
  message: Message,
): Promise<Message> {
  const storedValue = message.image_url?.trim() || null;

  if (!storedValue) {
    return { ...message, image_render_url: null };
  }

  if (
    storedValue.startsWith("http://") ||
    storedValue.startsWith("https://")
  ) {
    return { ...message, image_render_url: storedValue };
  }

  const { data, error } = await supabase.storage
    .from(CHAT_MEDIA_BUCKET)
    .createSignedUrl(
      storedValue,
      CHAT_SIGNED_URL_TTL_SECONDS,
    );

  if (error) {
    console.warn(
      "[messages] signed chat image failed",
      error.message,
    );

    return { ...message, image_render_url: null };
  }

  return {
    ...message,
    image_render_url: data.signedUrl,
  };
}

async function hydrateChatMessages(
  messages: Message[],
): Promise<Message[]> {
  return await Promise.all(
    messages.map(hydrateChatMessageImage),
  );
}

function normalizeMessages(rows: Message[]) {
  const byId = new Map<string, Message>();

  for (const row of rows) {
    if (!row?.id) continue;
    byId.set(row.id, row);
  }

  return Array.from(byId.values()).sort(
    (a, b) =>
      new Date(a.created_at).getTime() -
      new Date(b.created_at).getTime(),
  );
}

function isSameCalendarDay(a: string, b: string) {
  const first = new Date(a);
  const second = new Date(b);

  return (
    first.getFullYear() === second.getFullYear() &&
    first.getMonth() === second.getMonth() &&
    first.getDate() === second.getDate()
  );
}

function dateLabel(value: string) {
  const date = new Date(value);
  const now = new Date();

  if (isSameCalendarDay(value, now.toISOString())) {
    return "Heute";
  }

  const yesterday = new Date(now);
  yesterday.setDate(now.getDate() - 1);

  if (isSameCalendarDay(value, yesterday.toISOString())) {
    return "Gestern";
  }

  return date.toLocaleDateString("de-CH", {
    day: "numeric",
    month: "short",
    year:
      date.getFullYear() === now.getFullYear()
        ? undefined
        : "numeric",
  });
}

function timeLabel(value: string) {
  return new Date(value).toLocaleTimeString("de-CH", {
    hour: "2-digit",
    minute: "2-digit",
  });
}

export default function ChatScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const router = useRouter();
  const listRef = useRef<FlatList<Message>>(null);

  const [messages, setMessages] = useState<Message[]>([]);
  const [chatSummary, setChatSummary] =
    useState<ChatSummary | null>(null);
  const [text, setText] = useState("");
  const [uid, setUid] = useState<string | null>(null);
  const pendingTextRequest = useRef<{ body: string; id: string } | null>(null);
  const [loading, setLoading] = useState(true);
  const [sending, setSending] = useState(false);
  const [imageSending, setImageSending] = useState(false);

  const displayName =
    chatSummary?.other_display_name?.trim() ||
    chatSummary?.other_first_name?.trim() ||
    chatSummary?.other_username?.trim() ||
    "Backyrd User";

  const username = chatSummary?.other_username?.trim() || null;

  const appendServerMessage = useCallback((message: Message) => {
    setMessages((current) =>
      normalizeMessages([...current, message]),
    );
  }, []);

  const markAsRead = useCallback(async () => {
    if (!id) return;

    const { error } = await supabase.rpc("mark_chat_read_v1", {
      p_chat_id: id,
    });

    if (error) {
      console.warn(
        "[messages] mark_chat_read_v1 failed",
        error.message,
      );
    }
  }, [id]);

  useEffect(() => {
    let active = true;
    let channel: ReturnType<typeof supabase.channel> | null = null;

    const bootstrap = async () => {
      setLoading(true);

      try {
        const { data: sessionData } =
          await supabase.auth.getSession();

        if (!active) return;

        const currentUserId =
          sessionData.session?.user.id ?? null;

        if (!currentUserId) {
          throw new Error("Du bist nicht angemeldet.");
        }

        setUid(currentUserId);

        const [
          { data: messageRows, error: messagesError },
          { data: chatRows, error: chatsError },
        ] = await Promise.all([
          supabase
            .from("messages")
            .select("*")
            .eq("chat_id", id)
            .order("created_at", { ascending: true }),

          supabase.rpc("get_my_direct_chats_v1"),
        ]);

        if (messagesError) throw messagesError;
        if (chatsError) throw chatsError;

        if (!active) return;

        const hydratedMessages =
          await hydrateChatMessages(
            (messageRows ?? []) as Message[],
          );

        setMessages(
          normalizeMessages(hydratedMessages),
        );

        const summary = (
          Array.isArray(chatRows) ? chatRows : []
        ).find((row: ChatSummary) => row.chat_id === id);

        setChatSummary(summary ?? null);
        await markAsRead();

        channel = supabase
          .channel(`chat-${id}`)
          .on(
            "postgres_changes",
            {
              event: "INSERT",
              schema: "public",
              table: "messages",
              filter: `chat_id=eq.${id}`,
            },
            async (payload) => {
              if (!active) return;

              const incoming =
                await hydrateChatMessageImage(
                  payload.new as Message,
                );
              appendServerMessage(incoming);

              if (
                incoming.sender_id !== currentUserId
              ) {
                await markAsRead();
              }
            },
          )
          .on(
            "postgres_changes",
            {
              event: "UPDATE",
              schema: "public",
              table: "messages",
              filter: `chat_id=eq.${id}`,
            },
            (payload) => {
              if (!active) return;

              void hydrateChatMessageImage(
                payload.new as Message,
              ).then((updated) => {
                setMessages((current) =>
                  normalizeMessages(
                    current.map((message) =>
                      message.id === updated.id
                        ? updated
                        : message,
                    ),
                  ),
                );
              });
            },
          )
          .subscribe();
      } catch (error: any) {
        Alert.alert(
          "Chat konnte nicht geladen werden",
          userFacingError(error, "Der Chat konnte gerade nicht geladen werden. Bitte versuche es noch einmal."),
        );
      } finally {
        if (active) setLoading(false);
      }
    };

    void bootstrap();

    return () => {
      active = false;

      if (channel) {
        void supabase.removeChannel(channel);
      }
    };
  }, [appendServerMessage, id, markAsRead]);

  useEffect(() => {
    if (messages.length === 0) return;

    const timer = setTimeout(() => {
      listRef.current?.scrollToEnd({
        animated: messages.length > 1,
      });
    }, 80);

    return () => clearTimeout(timer);
  }, [messages.length]);

  const lastOwnMessageId = useMemo(() => {
    if (!uid) return null;

    for (let index = messages.length - 1; index >= 0; index -= 1) {
      if (messages[index].sender_id === uid) {
        return messages[index].id;
      }
    }

    return null;
  }, [messages, uid]);

  const send = useCallback(async () => {
    const body = text.trim();

    if (!body || !uid || !id || sending) return;

    setSending(true);
    setText("");

    try {
      const request = pendingTextRequest.current?.body === body
        ? pendingTextRequest.current
        : { body, id: uuidv4() };
      pendingTextRequest.current = request;
      const response = await supabase.rpc("send_message_v2", {
        p_chat_id: id,
        p_text: body,
        p_image_url: null,
        p_client_request_id: request.id,
      });
      const data = Array.isArray(response.data) ? response.data[0] : response.data;
      const error = response.error;

      if (error) throw error;
      pendingTextRequest.current = null;

      // Realtime kann schneller sein als die INSERT-Antwort.
      // normalizeMessages verhindert deshalb zuverlässig Duplikate.
      appendServerMessage(
        await hydrateChatMessageImage(
          data as Message,
        ),
      );
    } catch (error: any) {
      setText(body);

      const safetyMessage =
        getSafetyRestrictionMessage(error);

      if (safetyMessage) {
        Alert.alert(
          "Nachrichtenfunktion eingeschränkt",
          safetyMessage,
        );
        return;
      }
      Alert.alert(
        "Nachricht konnte nicht gesendet werden",
        userFacingError(error, "Deine Nachricht konnte gerade nicht gesendet werden. Bitte versuche es noch einmal."),
      );
    } finally {
      setSending(false);
    }
  }, [appendServerMessage, id, sending, text, uid]);

  const sendImage = useCallback(
    async (uri: string) => {
      if (!uid || !id || imageSending) return;

      const caption = text.trim();
      setImageSending(true);

      try {
        const extension =
          uri.split(".").pop()?.toLowerCase() || "jpg";
        const filePath =
          `chat/${id}/${uuidv4()}.${extension}`;

        const uploadResponse = await fetch(uri);

        if (!uploadResponse.ok) {
          throw new Error("local_image_read_failed");
        }

        const arrayBuffer = await uploadResponse.arrayBuffer();
        const uploadBody = new Uint8Array(arrayBuffer);

        const contentType =
          extension === "png"
            ? "image/png"
            : extension === "webp"
              ? "image/webp"
              : extension === "heic" ||
                  extension === "heif"
                ? "image/heic"
                : "image/jpeg";

        const { error: uploadError } =
          await supabase.storage
            .from(CHAT_MEDIA_BUCKET)
            .upload(filePath, uploadBody, {
              contentType,
              upsert: false,
            });

        if (uploadError) throw uploadError;

        const messageResponse = await supabase.rpc("send_message_v2", {
          p_chat_id: id,
          p_text: caption || null,
          p_image_url: filePath,
          p_client_request_id: uuidv4(),
        });
        const data = Array.isArray(messageResponse.data) ? messageResponse.data[0] : messageResponse.data;
        const error = messageResponse.error;

        if (error) throw error;

        appendServerMessage(
          await hydrateChatMessageImage(
            data as Message,
          ),
        );

        if (caption) {
          setText("");
        }
      } catch (error: any) {
        Alert.alert(
          "Bild konnte nicht gesendet werden",
          userFacingError(error, "Das Bild konnte gerade nicht gesendet werden. Bitte versuche es noch einmal."),
        );
      } finally {
        setImageSending(false);
      }
    },
    [appendServerMessage, id, imageSending, text, uid],
  );

  const pickImage = useCallback(
    async (fromCamera: boolean) => {
      try {
        const permission = fromCamera
          ? await ImagePicker.requestCameraPermissionsAsync()
          : await ImagePicker.requestMediaLibraryPermissionsAsync();

        if (permission.status !== "granted") {
          Alert.alert(
            "Berechtigung benötigt",
            fromCamera
              ? "Erlaube Backyrd den Kamerazugriff."
              : "Erlaube Backyrd den Zugriff auf deine Fotos.",
          );
          return;
        }

        const options: ImagePicker.ImagePickerOptions = {
          mediaTypes:
            ImagePicker.MediaTypeOptions.Images,
          allowsEditing: true,
          quality: 0.82,
        };

        const result = fromCamera
          ? await ImagePicker.launchCameraAsync(options)
          : await ImagePicker.launchImageLibraryAsync(options);

        if (
          !result.canceled &&
          result.assets?.[0]?.uri
        ) {
          await sendImage(result.assets[0].uri);
        }
      } catch (error: any) {
        Alert.alert(
          "Bildauswahl fehlgeschlagen",
          userFacingError(error, "Das Bild konnte gerade nicht ausgewählt werden. Bitte versuche es noch einmal."),
        );
      }
    },
    [sendImage],
  );

  const openOtherProfile = () => {
    if (!chatSummary?.other_user_id) return;

    router.push(
      `/user/${chatSummary.other_user_id}` as any,
    );
  };

  return (
    <SafeAreaView style={styles.screen}>
      <Stack.Screen options={{ headerShown: false }} />

      <View style={styles.header}>
        <Pressable
          style={styles.headerCircle}
          onPress={() => router.back()}
          hitSlop={8}
        >
          <Ionicons
            name="chevron-back"
            size={28}
            color="#FFFFFF"
          />
        </Pressable>

        <Pressable
          style={styles.profileHeader}
          onPress={openOtherProfile}
        >
          <Avatar
            uri={
              chatSummary?.other_avatar_url ??
              undefined
            }
            name={displayName}
            size={45}
          />

          <View style={styles.profileHeaderCopy}>
            <View style={styles.headerNameRow}>
              <Text
                style={styles.headerName}
                numberOfLines={1}
              >
                {displayName}
              </Text>
              <Ionicons
                name="chevron-forward"
                size={17}
                color="#909099"
              />
            </View>

            <Text
              style={styles.headerMeta}
              numberOfLines={1}
            >
              {username
                ? `@${username}`
                : "Backyrd Chat"}
            </Text>
          </View>
        </Pressable>

        <Pressable
          style={styles.headerCircle}
          onPress={openOtherProfile}
        >
          <Ionicons
            name="person-outline"
            size={22}
            color="#FFFFFF"
          />
        </Pressable>
      </View>

      <KeyboardAvoidingView
        style={styles.keyboardView}
        behavior={
          Platform.OS === "ios"
            ? "padding"
            : undefined
        }
        keyboardVerticalOffset={0}
      >
        {loading ? (
          <View style={styles.loading}>
            <StateView kind="loading" title="Chat wird geladen" />
          </View>
        ) : (
          <FlatList
            ref={listRef}
            data={messages}
            keyExtractor={(message) => message.id}
            contentContainerStyle={[
              styles.messageList,
              messages.length === 0 &&
                styles.messageListEmpty,
            ]}
            keyboardShouldPersistTaps="handled"
            showsVerticalScrollIndicator={false}
            ListEmptyComponent={
              <View style={styles.empty}>
                <Avatar
                  uri={
                    chatSummary?.other_avatar_url ??
                    undefined
                  }
                  name={displayName}
                  size={82}
                />
                <Text style={styles.emptyName}>
                  {displayName}
                </Text>
                <Text style={styles.emptyCopy}>
                  Starte euren Backyrd-Chat.
                </Text>
              </View>
            }
            renderItem={({ item, index }) => {
              const mine =
                item.sender_id === uid;
              const previous =
                index > 0
                  ? messages[index - 1]
                  : null;
              const next =
                index < messages.length - 1
                  ? messages[index + 1]
                  : null;

              const showDate =
                !previous ||
                !isSameCalendarDay(
                  previous.created_at,
                  item.created_at,
                );

              const groupedWithPrevious =
                previous?.sender_id ===
                  item.sender_id &&
                isSameCalendarDay(
                  previous.created_at,
                  item.created_at,
                ) &&
                new Date(item.created_at).getTime() -
                  new Date(
                    previous.created_at,
                  ).getTime() <
                  5 * 60 * 1000;

              const groupedWithNext =
                next?.sender_id ===
                  item.sender_id &&
                isSameCalendarDay(
                  next.created_at,
                  item.created_at,
                ) &&
                new Date(next.created_at).getTime() -
                  new Date(
                    item.created_at,
                  ).getTime() <
                  5 * 60 * 1000;

              const lastOwn =
                mine &&
                item.id === lastOwnMessageId;

              return (
                <View>
                  {showDate ? (
                    <View style={styles.dateWrap}>
                      <Text style={styles.dateText}>
                        {dateLabel(
                          item.created_at,
                        )}
                      </Text>
                    </View>
                  ) : null}

                  <View
                    style={[
                      styles.messageRow,
                      mine
                        ? styles.messageRowMine
                        : styles.messageRowOther,
                      groupedWithPrevious &&
                        styles.groupedMessageRow,
                    ]}
                  >
                    {!mine ? (
                      <View style={styles.avatarSlot}>
                        {!groupedWithNext ? (
                          <Avatar
                            uri={
                              chatSummary?.other_avatar_url ??
                              undefined
                            }
                            name={displayName}
                            size={30}
                          />
                        ) : null}
                      </View>
                    ) : null}

                    <View
                      style={[
                        styles.bubble,
                        mine
                          ? styles.bubbleMine
                          : styles.bubbleOther,
                        !groupedWithPrevious &&
                          mine &&
                          styles.bubbleMineTop,
                        !groupedWithPrevious &&
                          !mine &&
                          styles.bubbleOtherTop,
                      ]}
                    >
                      {item.image_url ? (
                        <Image
                          source={{
                            uri: item.image_render_url || item.image_url || "",
                          }}
                          style={styles.messageImage}
                          resizeMode="cover"
                        />
                      ) : null}

                      {item.text ? (
                        <Text
                          style={styles.messageText}
                        >
                          {item.text}
                        </Text>
                      ) : null}

                      <Text
                        style={[
                          styles.messageTime,
                          mine &&
                            styles.messageTimeMine,
                        ]}
                      >
                        {timeLabel(
                          item.created_at,
                        )}
                      </Text>
                    </View>
                  </View>

                  {lastOwn ? (
                    <Text style={styles.seenText}>
                      {item.seen_at
                        ? "Gesehen"
                        : "Gesendet"}
                    </Text>
                  ) : null}
                </View>
              );
            }}
          />
        )}

        <View style={styles.composerOuter}>
          <View style={styles.composer}>
            <Pressable
              style={styles.cameraButton}
              onPress={() => void pickImage(true)}
              disabled={imageSending}
            >
              <Ionicons
                name="camera"
                size={22}
                color="#FFFFFF"
              />
            </Pressable>

            <TextInput
              style={styles.input}
              placeholder="Nachricht schreiben …"
              placeholderTextColor="#85858E"
              value={text}
              onChangeText={setText}
              multiline
              maxLength={4000}
              returnKeyType="default"
            />

            {text.trim() ? (
              <Pressable
                style={styles.sendButton}
                onPress={() => void send()}
                disabled={sending}
              >
                {sending ? (
                  <ActivityIndicator
                    size="small"
                    color="#FF4F91"
                  />
                ) : (
                  <Text style={styles.sendText}>
                    Senden
                  </Text>
                )}
              </Pressable>
            ) : (
              <View style={styles.composerActions}>
                <Pressable
                  style={styles.inlineAction}
                  onPress={() =>
                    void pickImage(false)
                  }
                  disabled={imageSending}
                >
                  <Ionicons
                    name="image-outline"
                    size={24}
                    color="#FFFFFF"
                  />
                </Pressable>

                <Pressable
                  style={styles.inlineAction}
                  onPress={() =>
                    Alert.alert(
                      "Kommt bald",
                      "Sprachnachrichten ergänzen wir in einem späteren Messenger-Upgrade.",
                    )
                  }
                >
                  <Ionicons
                    name="mic-outline"
                    size={24}
                    color="#FFFFFF"
                  />
                </Pressable>
              </View>
            )}
          </View>
        </View>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  screen: {
    flex: 1,
    backgroundColor: "#050506",
  },
  keyboardView: {
    flex: 1,
  },
  header: {
    height: 78,
    paddingHorizontal: 14,
    flexDirection: "row",
    alignItems: "center",
    gap: 11,
    borderBottomWidth:
      StyleSheet.hairlineWidth,
    borderBottomColor:
      "rgba(255,255,255,0.08)",
    backgroundColor: "#050506",
  },
  headerCircle: {
    width: 47,
    height: 47,
    borderRadius: 19,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: "#15171B",
    borderWidth: 1,
    borderColor:
      "rgba(255,255,255,0.09)",
  },
  profileHeader: {
    flex: 1,
    minWidth: 0,
    flexDirection: "row",
    alignItems: "center",
    gap: 11,
  },
  profileHeaderCopy: {
    flex: 1,
    minWidth: 0,
  },
  headerNameRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 3,
  },
  headerName: {
    maxWidth: "88%",
    color: "#FFFFFF",
    fontSize: 17,
    fontWeight: "900",
  },
  headerMeta: {
    marginTop: 2,
    color: "#9A9AA3",
    fontSize: 12,
    fontWeight: "600",
  },
  loading: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
  },
  messageList: {
    paddingHorizontal: 13,
    paddingTop: 10,
    paddingBottom: 18,
  },
  messageListEmpty: {
    flexGrow: 1,
  },
  empty: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
    paddingBottom: 60,
  },
  emptyName: {
    marginTop: 14,
    color: "#FFFFFF",
    fontSize: 21,
    fontWeight: "900",
  },
  emptyCopy: {
    marginTop: 6,
    color: "#8D8D96",
    fontSize: 14,
  },
  dateWrap: {
    alignItems: "center",
    marginVertical: 18,
  },
  dateText: {
    color: "#7D7D86",
    fontSize: 12,
    fontWeight: "800",
    textTransform: "uppercase",
    letterSpacing: 0.6,
  },
  messageRow: {
    flexDirection: "row",
    alignItems: "flex-end",
    marginTop: 7,
  },
  groupedMessageRow: {
    marginTop: 3,
  },
  messageRowMine: {
    justifyContent: "flex-end",
  },
  messageRowOther: {
    justifyContent: "flex-start",
  },
  avatarSlot: {
    width: 36,
    alignItems: "flex-start",
    justifyContent: "flex-end",
    marginRight: 5,
  },
  bubble: {
    maxWidth: "78%",
    minWidth: 74,
    paddingHorizontal: 14,
    paddingTop: 10,
    paddingBottom: 7,
    borderRadius: 20,
  },
  bubbleMine: {
    backgroundColor: "#FF4F91",
    borderBottomRightRadius: 7,
  },
  bubbleOther: {
    backgroundColor: "#23262B",
    borderBottomLeftRadius: 7,
  },
  bubbleMineTop: {
    borderTopRightRadius: 20,
  },
  bubbleOtherTop: {
    borderTopLeftRadius: 20,
  },
  messageText: {
    color: "#FFFFFF",
    fontSize: 16,
    lineHeight: 21,
    fontWeight: "500",
  },
  messageTime: {
    marginTop: 4,
    color: "#9999A2",
    fontSize: 9,
    fontWeight: "700",
    alignSelf: "flex-end",
  },
  messageTimeMine: {
    color: "rgba(255,255,255,0.72)",
  },
  messageImage: {
    width: 238,
    height: 278,
    borderRadius: 14,
    marginBottom: 5,
  },
  seenText: {
    alignSelf: "flex-end",
    marginTop: 4,
    marginRight: 4,
    color: "#787881",
    fontSize: 10,
    fontWeight: "700",
  },
  composerOuter: {
    paddingHorizontal: 10,
    paddingTop: 8,
    paddingBottom:
      Platform.OS === "ios" ? 8 : 10,
    borderTopWidth:
      StyleSheet.hairlineWidth,
    borderTopColor:
      "rgba(255,255,255,0.08)",
    backgroundColor: "#050506",
  },
  composer: {
    minHeight: 54,
    paddingLeft: 6,
    paddingRight: 8,
    borderRadius: 27,
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: "#1D1F23",
    borderWidth: 1,
    borderColor:
      "rgba(255,255,255,0.08)",
  },
  cameraButton: {
    width: 42,
    height: 42,
    borderRadius: 21,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: "#FF4F91",
  },
  input: {
    flex: 1,
    minHeight: 44,
    maxHeight: 118,
    paddingHorizontal: 12,
    paddingTop:
      Platform.OS === "ios" ? 12 : 9,
    paddingBottom:
      Platform.OS === "ios" ? 10 : 8,
    color: "#FFFFFF",
    fontSize: 16,
    lineHeight: 21,
  },
  composerActions: {
    flexDirection: "row",
    alignItems: "center",
  },
  inlineAction: {
    width: 38,
    height: 42,
    alignItems: "center",
    justifyContent: "center",
  },
  sendButton: {
    minWidth: 64,
    height: 42,
    alignItems: "center",
    justifyContent: "center",
  },
  sendText: {
    color: "#FF8DB3",
    fontSize: 15,
    fontWeight: "900",
  },
});
