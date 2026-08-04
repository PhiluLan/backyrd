// mobile/lib/chat.ts
import { supabase } from "./supabase";

/**
 * Finds or creates one canonical 1:1 chat.
 *
 * The public signature stays compatible with existing callers, but the
 * database derives the current user from auth.uid() and creates the chat
 * plus both participant rows atomically.
 */
export async function getOrCreateChat(
  userA: string,
  userB: string,
): Promise<string> {
  const { data: authData, error: authError } =
    await supabase.auth.getUser();

  if (authError) throw authError;

  const currentUserId = authData.user?.id;

  if (!currentUserId) {
    throw new Error("Du musst angemeldet sein, um einen Chat zu starten.");
  }

  if (!userA || !userB) {
    throw new Error("Für den Chat fehlen Teilnehmer.");
  }

  if (userA === userB) {
    throw new Error("Ein Chat mit dir selbst ist nicht möglich.");
  }

  if (currentUserId !== userA && currentUserId !== userB) {
    throw new Error(
      "Der angemeldete Nutzer gehört nicht zu diesem Chat.",
    );
  }

  const otherUserId =
    currentUserId === userA ? userB : userA;

  const { data, error } = await supabase.rpc(
    "get_or_create_direct_chat_v1",
    {
      p_other_user_id: otherUserId,
    },
  );

  if (error) throw error;

  if (typeof data !== "string" || !data) {
    throw new Error("Chat konnte nicht erstellt werden.");
  }

  return data;
}
