// mobile/components/CommentsSheet.tsx
import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  ActivityIndicator,
  Alert,
  FlatList,
  Keyboard,
  KeyboardAvoidingView,
  Modal,
  Platform,
  Pressable,
  StyleSheet,
  Text,
  TextInput,
  View,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { Ionicons } from "@expo/vector-icons";

import Avatar from "./Avatar";
import { supabase } from "../lib/supabase";
import ReportContentButton from "./safety/ReportContentButton";
import { StateView } from "./foundation/StateView";
import { technicalErrorText } from "../lib/userFacingError";

export type SocialComment = {
  comment_id: string;
  post_id: string;
  user_id: string;
  body: string;
  created_at: string;
  display_name: string | null;
  username: string | null;
  avatar_url: string | null;
};

type Props = {
  visible: boolean;
  postId: string | null;
  postTitle?: string | null;
  onClose: () => void;
  onCommentCreated?: (postId: string) => void;
};

function timeAgo(value: string) {
  const then = new Date(value).getTime();
  const now = Date.now();
  const diff = Math.max(0, now - then);

  const minutes = Math.floor(diff / 60000);
  if (minutes < 1) return "gerade";
  if (minutes < 60) return `${minutes} Min.`;

  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours} Std.`;

  const days = Math.floor(hours / 24);
  if (days < 7) return `${days} Tg.`;

  return new Date(value).toLocaleDateString("de-CH", {
    day: "2-digit",
    month: "2-digit",
  });
}

export default function CommentsSheet({
  visible,
  postId,
  postTitle,
  onClose,
  onCommentCreated,
}: Props) {
  const insets = useSafeAreaInsets();
  const inputRef = useRef<TextInput>(null);

  const [currentUserId, setCurrentUserId] =
    useState<string | null>(null);
  const [comments, setComments] = useState<SocialComment[]>([]);
  const [loading, setLoading] = useState(false);
  const [sending, setSending] = useState(false);
  const [body, setBody] = useState("");
  const [loadError, setLoadError] = useState(false);

  const canSend = useMemo(() => body.trim().length > 0 && !sending && !!postId, [body, postId, sending]);

  const loadComments = useCallback(async () => {
    if (!postId) return;

    try {
      setLoading(true);
      setLoadError(false);

      const [commentsResult, userResult] =
        await Promise.all([
          supabase.rpc("get_social_comments_v1", {
            p_post_id: postId,
            p_limit: 80,
          }),
          supabase.auth.getUser(),
        ]);

      if (commentsResult.error) {
        throw commentsResult.error;
      }

      setCurrentUserId(
        userResult.data.user?.id ?? null,
      );

      const rawComments = Array.isArray(
        commentsResult.data,
      )
        ? (commentsResult.data as SocialComment[])
        : [];

      if (rawComments.length === 0) {
        setComments([]);
        return;
      }

      const { data: visibleCommentIds, error: visibilityError } =
        await supabase.rpc("safety_visible_entity_ids_v1", {
          p_entity_type: "social_comment",
          p_entity_ids: rawComments.map(
            (comment) => comment.comment_id,
          ),
        });

      if (visibilityError) {
        console.log(
          "comment safety visibility failed",
          visibilityError,
        );
        setComments(rawComments);
        return;
      }

      const allowedIds = new Set(
        Array.isArray(visibleCommentIds)
          ? visibleCommentIds
          : [],
      );

      setComments(
        rawComments.filter((comment) =>
          allowedIds.has(comment.comment_id),
        ),
      );
    } catch (error) {
      console.log("get_social_comments_v1 failed:", error);
      setLoadError(true);
    } finally {
      setLoading(false);
    }
  }, [postId]);

  useEffect(() => {
    if (!visible || !postId) {
      setComments([]);
      setBody("");
      return;
    }

    loadComments();
  }, [loadComments, postId, visible]);

  const closeSheet = useCallback(() => {
    Keyboard.dismiss();
    onClose();
  }, [onClose]);

  const sendComment = useCallback(async () => {
    const text = body.trim();
    if (!postId || !text) return;

    try {
      setSending(true);

      const { data, error } = await supabase.rpc("create_social_comment_v1", {
        p_post_id: postId,
        p_body: text,
      });

      if (error) throw error;

      const newComment = Array.isArray(data) ? data[0] : data;

      if (newComment?.comment_id) {
        setComments((current) => [newComment as SocialComment, ...current]);
      } else {
        await loadComments();
      }

      setBody("");
      onCommentCreated?.(postId);
    } catch (error) {
      const message = technicalErrorText(error);
      const isSafetyRestriction =
        message.includes("SAFETY_WRITE_RESTRICTED");

      if (isSafetyRestriction) {
        console.info(
          "Comment publishing blocked by Safety enforcement.",
        );

        Alert.alert(
          "Kommentieren derzeit nicht möglich",
          "Dein Konto wurde vorübergehend eingeschränkt. Deshalb kannst du aktuell keine Kommentare schreiben. Im Safety Center siehst du den Grund und wie lange die Einschränkung gilt.",
          [
            {
              text: "Verstanden",
              style: "default",
            },
          ],
        );
      } else {
        console.error(
          "create_social_comment_v1 failed:",
          error,
        );

        Alert.alert(
          "Kommentar nicht gesendet",
          "Beim Senden ist etwas schiefgelaufen. Bitte versuche es später erneut.",
        );
      }
    } finally {
      setSending(false);
    }
  }, [body, loadComments, onCommentCreated, postId]);

  const renderComment = useCallback(({ item }: { item: SocialComment }) => {
    const name = item.display_name?.trim() || item.username?.trim() || "Backyrd User";

    return (
      <View style={styles.commentRow}>
        <Avatar uri={item.avatar_url ?? undefined} name={name} size={38} />

        <View style={styles.commentTextWrap}>
          <View style={styles.commentTopLine}>
            <View style={styles.commentIdentity}>
              <Text
                style={styles.commentName}
                numberOfLines={1}
              >
                {name}
              </Text>
              <Text style={styles.commentTime}>
                {timeAgo(item.created_at)}
              </Text>
            </View>

            {currentUserId &&
            item.user_id !== currentUserId ? (
              <ReportContentButton
                entityType="social_comment"
                entityId={item.comment_id}
                contentType="comment"
                actorUserId={item.user_id}
                textContent={item.body}
                locale="de-CH"
                sourceSurface="comments_sheet"
                sourceContext={{
                  screen: "comments_sheet",
                  post_id: item.post_id,
                  comment_id: item.comment_id,
                }}
              />
            ) : null}
          </View>

          <Text style={styles.commentText}>
            {item.body}
          </Text>
        </View>
      </View>
    );
  }, [currentUserId]);

  return (
    <Modal visible={visible} animationType="fade" transparent onRequestClose={closeSheet}>
      <View style={styles.modalRoot}>
        <Pressable style={styles.backdrop} onPress={closeSheet} />

        <KeyboardAvoidingView
          pointerEvents="box-none"
          behavior={Platform.OS === "ios" ? "padding" : "height"}
          keyboardVerticalOffset={0}
          style={styles.keyboardLayer}
        >
          <View accessibilityViewIsModal style={[styles.sheet, { paddingBottom: Math.max(insets.bottom, 10) }]}>
            <View style={styles.handle} />

            <View style={styles.header}>
              <View style={styles.headerCopy}>
                <Text style={styles.kicker}>Kommentare</Text>
                <Text style={styles.title} numberOfLines={1}>
                  {postTitle || "Backyrd Moment"}
                </Text>
              </View>

              <Pressable accessibilityRole="button" accessibilityLabel="Kommentare schließen" style={styles.closeButton} onPress={closeSheet}>
                <Ionicons name="close" size={22} color="#FFFFFF" />
              </Pressable>
            </View>

            <View style={styles.content}>
              {loading ? (
                <View style={styles.state}>
                  <StateView kind="loading" title="Kommentare werden geladen" />
                </View>
              ) : loadError ? (
                <View style={styles.state}>
                  <StateView kind="error" title="Kommentare gerade nicht erreichbar" message="Bitte versuche es noch einmal." actionLabel="Erneut laden" onAction={() => void loadComments()} />
                </View>
              ) : comments.length === 0 ? (
                <View style={styles.emptyState}>
                  <View style={styles.emptyIcon}>
                    <Ionicons name="chatbubble-ellipses-outline" size={25} color="#FFFFFF" />
                  </View>
                  <Text style={styles.emptyTitle}>Noch keine Kommentare</Text>
                  <Text style={styles.emptyText}>
                    Starte die Unterhaltung mit einem kurzen Gedanken.
                  </Text>
                </View>
              ) : (
                <FlatList
                  data={comments}
                  keyExtractor={(item) => item.comment_id}
                  renderItem={renderComment}
                  inverted
                  keyboardShouldPersistTaps="handled"
                  showsVerticalScrollIndicator={false}
                  contentContainerStyle={styles.commentsContent}
                />
              )}
            </View>

            <View style={styles.inputWrap}>
              <View style={styles.inputShell}>
                <TextInput
                  accessibilityLabel="Kommentar schreiben"
                  ref={inputRef}
                  value={body}
                  onChangeText={setBody}
                  placeholder="Kommentieren…"
                  placeholderTextColor="#77777F"
                  multiline
                  maxLength={280}
                  style={styles.input}
                  returnKeyType="default"
                  blurOnSubmit={false}
                />

                <Pressable
                  accessibilityRole="button"
                  accessibilityLabel="Kommentar senden"
                  accessibilityState={{ disabled: !canSend, busy: sending }}
                  style={[styles.sendButton, !canSend && styles.sendButtonDisabled]}
                  onPress={sendComment}
                  disabled={!canSend}
                >
                  {sending ? (
                    <ActivityIndicator color="#000000" size="small" />
                  ) : (
                    <Ionicons name="arrow-up" size={19} color="#000000" />
                  )}
                </Pressable>
              </View>
            </View>
          </View>
        </KeyboardAvoidingView>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  modalRoot: {
    flex: 1,
    justifyContent: "flex-end",
  },
  backdrop: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: "rgba(0,0,0,0.48)",
  },
  keyboardLayer: {
    flex: 1,
    justifyContent: "flex-end",
  },
  sheet: {
    height: "56%",
    maxHeight: 520,
    minHeight: 430,
    backgroundColor: "#050506",
    borderTopLeftRadius: 34,
    borderTopRightRadius: 34,
    borderWidth: 1,
    borderColor: "#24242A",
    overflow: "hidden",
    shadowColor: "#000",
    shadowOpacity: 0.35,
    shadowRadius: 30,
    shadowOffset: { width: 0, height: -12 },
  },
  handle: {
    alignSelf: "center",
    marginTop: 9,
    width: 42,
    height: 5,
    borderRadius: 999,
    backgroundColor: "#2A2A31",
  },
  header: {
    paddingHorizontal: 18,
    paddingTop: 12,
    paddingBottom: 12,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: "#222228",
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    gap: 14,
  },
  headerCopy: {
    flex: 1,
    minWidth: 0,
  },
  kicker: {
    color: "#8E8E95",
    fontSize: 11,
    fontWeight: "900",
    letterSpacing: 1.1,
    textTransform: "uppercase",
  },
  title: {
    marginTop: 4,
    color: "#FFFFFF",
    fontSize: 24,
    lineHeight: 29,
    fontWeight: "800",
    letterSpacing: -0.5,
  },
  closeButton: {
    width: 42,
    height: 42,
    borderRadius: 21,
    backgroundColor: "#111113",
    alignItems: "center",
    justifyContent: "center",
  },
  content: {
    flex: 1,
    minHeight: 0,
  },
  state: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
    gap: 10,
    paddingHorizontal: 30,
  },
  stateText: {
    color: "#8E8E95",
    fontSize: 14,
    fontWeight: "700",
  },
  emptyState: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
    paddingHorizontal: 34,
    paddingBottom: 8,
  },
  emptyIcon: {
    width: 64,
    height: 64,
    borderRadius: 32,
    backgroundColor: "#16161B",
    alignItems: "center",
    justifyContent: "center",
    marginBottom: 16,
  },
  emptyTitle: {
    color: "#FFFFFF",
    fontSize: 23,
    lineHeight: 28,
    fontWeight: "700",
    textAlign: "center",
    letterSpacing: -0.4,
  },
  emptyText: {
    marginTop: 9,
    color: "#8E8E95",
    fontSize: 15,
    lineHeight: 21,
    fontWeight: "500",
    textAlign: "center",
  },
  commentsContent: {
    paddingHorizontal: 18,
    paddingTop: 18,
    paddingBottom: 16,
    gap: 16,
  },
  commentRow: {
    flexDirection: "row",
    gap: 11,
    alignItems: "flex-start",
  },
  commentTextWrap: {
    flex: 1,
    minWidth: 0,
    paddingTop: 1,
  },
  commentTopLine: {
    minHeight: 34,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    gap: 8,
  },
  commentIdentity: {
    flex: 1,
    minWidth: 0,
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
  },
  commentName: {
    flexShrink: 1,
    color: "#FFFFFF",
    fontSize: 15,
    fontWeight: "900",
  },
  commentTime: {
    color: "#77777F",
    fontSize: 12,
    fontWeight: "800",
  },
  commentText: {
    marginTop: 4,
    color: "#EAEAEE",
    fontSize: 16,
    lineHeight: 22,
    fontWeight: "500",
  },
  inputWrap: {
    paddingHorizontal: 12,
    paddingTop: 10,
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: "#222228",
    backgroundColor: "#050506",
  },
  inputShell: {
    minHeight: 52,
    borderRadius: 26,
    backgroundColor: "#111113",
    borderWidth: 1,
    borderColor: "#2A2A31",
    flexDirection: "row",
    alignItems: "flex-end",
    paddingLeft: 16,
    paddingRight: 5,
    paddingTop: 6,
    paddingBottom: 5,
    gap: 8,
  },
  input: {
    flex: 1,
    maxHeight: 96,
    minHeight: 40,
    color: "#FFFFFF",
    fontSize: 16,
    lineHeight: 21,
    paddingTop: 9,
    paddingBottom: 8,
  },
  sendButton: {
    width: 42,
    height: 42,
    borderRadius: 21,
    backgroundColor: "#FFFFFF",
    alignItems: "center",
    justifyContent: "center",
  },
  sendButtonDisabled: {
    opacity: 0.32,
  },
});
