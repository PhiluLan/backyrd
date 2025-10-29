import React, { useEffect, useMemo, useState } from 'react';
import { View, Text, FlatList, RefreshControl } from 'react-native';
import { supabase } from '../../lib/supabase';
import { getFollowingIds, fetchStatsFor } from '../../lib/social';
import PostCard from '../../components/PostCard';
import CommentsSheet from '../../components/CommentsSheet';

type FeedItem = {
  id: string;
  user_id: string;
  mood_a?: string | null;
  mood_b?: string | null;
  text?: string | null;
  photo_path?: string | null;
  created_at: string;
  profiles?: {
    id?: string;
    first_name?: string | null;
    avatar_url?: string | null;
  } | null;
  spots?: { name?: string | null } | null;
};

export default function FeedScreen() {
  const [items, setItems] = useState<FeedItem[]>([]);
  const [stats, setStats] = useState<Record<string, { likes: number; comments: number }>>({});
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [commentsFor, setCommentsFor] = useState<string | null>(null);

  const load = async () => {
    setLoading(true);
    try {
      const following = await getFollowingIds();
      if (!following.length) {
        setItems([]);
        setStats({});
        setLoading(false);
        return;
      }

      const { data, error } = await supabase
        .from('reviews')
        .select(`
          id,
          user_id,
          mood_a,
          mood_b,
          text,
          photo_path,
          created_at,
          spots ( name ),
          profiles:profiles!reviews_user_id_fkey (
            id,
            first_name,
            avatar_url
          )
        `)
        .in('user_id', following)
        .order('created_at', { ascending: false })
        .limit(50);

      if (error) throw error;

      setItems(data as any[]);
      const ids = (data ?? []).map((r: any) => r.id);
      setStats(await fetchStatsFor(ids));
    } catch (e: any) {
      console.error('Feed load error:', e);
    }
    setLoading(false);
  };

  useEffect(() => {
    load();
  }, []);

  const onRefresh = async () => {
    setRefreshing(true);
    await load();
    setRefreshing(false);
  };

  const empty = useMemo(
    () => (
      <View style={{ padding: 24, alignItems: 'center' }}>
        <Text style={{ color: '#fff', fontSize: 18, fontWeight: '700', marginBottom: 6 }}>
          Folge deinen ersten Nutzern
        </Text>
        <Text style={{ color: '#9ca3af', textAlign: 'center' }}>
          Dein Feed zeigt Bewertungen von Menschen, denen du folgst. Besuche Profile und tippe auf „Folgen“.
        </Text>
      </View>
    ),
    []
  );

  return (
    <View style={{ flex: 1, backgroundColor: '#000' }}>
      <FlatList
        data={items}
        keyExtractor={(it) => it.id}
        ListHeaderComponent={
          <Text style={{ color: '#fff', fontSize: 28, fontWeight: '800', padding: 16 }}>
            Feed
          </Text>
        }
        ListEmptyComponent={!loading ? empty : null}
        renderItem={({ item }) => (
          <PostCard
            item={item}
            stats={stats[item.id]}
            onOpenComments={(id) => setCommentsFor(id)}
          />
        )}
        refreshControl={
          <RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor="#fff" />
        }
        contentContainerStyle={{ padding: 16, paddingBottom: 48 }}
      />
      <CommentsSheet
        visible={!!commentsFor}
        onClose={() => setCommentsFor(null)}
        reviewId={commentsFor ?? ''}
      />
    </View>
  );
}
