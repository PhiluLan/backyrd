import React, { useEffect, useState } from 'react';
import { View, Text, FlatList, TouchableOpacity } from 'react-native';
import { supabase } from '../../lib/supabase';
import { useRouter } from 'expo-router';

type Chat = {
  id: string;
  user_a: string;
  user_b: string;
  other_profile: { id: string; first_name: string | null; avatar_url: string | null };
};

export default function MessagesScreen() {
  const [chats, setChats] = useState<Chat[]>([]);
  const router = useRouter();

  useEffect(() => {
    (async () => {
      const { data: session } = await supabase.auth.getSession();
      const uid = session.session?.user.id;
      if (!uid) return;

      const { data, error } = await supabase
        .from('chats')
        .select(`
          id,
          user_a,
          user_b,
          profiles:user_a (
            id,
            first_name,
            avatar_url
          ),
          profiles_b:user_b (
            id,
            first_name,
            avatar_url
          )
        `)
        .or(`user_a.eq.${uid},user_b.eq.${uid}`);

      if (error) {
        console.error(error);
        return;
      }

      // Bestimme immer das Gegenüber
      const mapped = data.map((chat: any) => {
        const other =
          chat.user_a === uid ? chat.profiles_b : chat.profiles;
        return {
          id: chat.id,
          user_a: chat.user_a,
          user_b: chat.user_b,
          other_profile: other,
        };
      });

      setChats(mapped);
    })();
  }, []);

  return (
    <View style={{ flex: 1, backgroundColor: '#000', padding: 16 }}>
      <Text style={{ color: '#fff', fontSize: 28, fontWeight: '800', marginBottom: 16 }}>Nachrichten</Text>
      <FlatList
        data={chats}
        keyExtractor={(c) => c.id}
        renderItem={({ item }) => (
          <TouchableOpacity
            onPress={() => router.push(`/messages/${item.id}`)}
            style={{
              paddingVertical: 14,
              borderBottomColor: '#222',
              borderBottomWidth: 1,
            }}
          >
            <Text style={{ color: '#fff', fontSize: 16 }}>
              {item.other_profile.first_name ?? 'User'}
            </Text>
          </TouchableOpacity>
        )}
      />
    </View>
  );
}
