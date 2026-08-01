// mobile/lib/chat.ts
import { supabase } from './supabase';

/**
 * Findet oder erstellt einen 1:1 Chat zwischen zwei Usern
 */
export async function getOrCreateChat(userA: string, userB: string) {
  // Prüfen, ob bereits ein gemeinsamer Chat existiert
  const { data: existing } = await supabase
    .from('chat_participants')
    .select('chat_id')
    .eq('user_id', userA);

  if (existing?.length) {
    const chatIds = existing.map((e) => e.chat_id);
    const { data: shared } = await supabase
      .from('chat_participants')
      .select('chat_id')
      .in('chat_id', chatIds)
      .eq('user_id', userB)
      .limit(1)
      .maybeSingle();

    if (shared) return shared.chat_id;
  }

  // 🆕 Chat anlegen
  const { data: chat, error } = await supabase
    .from('chats')
    .insert({})
    .select()
    .single();
  if (error) throw error;

  // Teilnehmer eintragen
  await supabase.from('chat_participants').insert([
    { chat_id: chat.id, user_id: userA },
    { chat_id: chat.id, user_id: userB },
  ]);

  return chat.id;
}
