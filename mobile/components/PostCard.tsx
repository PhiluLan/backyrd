import React, { useEffect, useMemo, useState } from 'react';
import { View, Text, Image, TouchableOpacity, Share, Alert } from 'react-native';
import Avatar from './Avatar';
import { hasLiked, toggleLike, isFollowing, follow, unfollow } from '../lib/social';

type Review = {
  id: string;
  user_id: string;
  text?: string | null;
  mood_a?: string | null;
  mood_b?: string | null;
  photo_path?: string | null;
  created_at: string;
  profiles?: {
    first_name?: string | null;
    avatar_url?: string | null;
    id?: string;
  } | null;
  spots?: { name?: string | null } | null;
};

export default function PostCard({
  item,
  stats,
  onOpenComments,
}: {
  item: Review;
  stats?: { likes?: number; comments?: number };
  onOpenComments: (reviewId: string) => void;
}) {
  const [liked, setLiked] = useState(false);
  const [likeCount, setLikeCount] = useState(stats?.likes ?? 0);
  const [following, setFollowing] = useState<boolean | null>(null);

  const cover = useMemo(() => {
    return item.photo_path ?? null;
  }, [item.photo_path]);

  const displayName = item.profiles?.first_name?.trim() || 'User';

  useEffect(() => {
    (async () => {
      setLiked(await hasLiked(item.id));
      if (item.profiles?.id) {
        setFollowing(await isFollowing(item.profiles.id));
      }
    })();
  }, [item.id]);

  const onLike = async () => {
    try {
      const nowLiked = await toggleLike(item.id);
      setLiked(nowLiked);
      setLikeCount(prev => prev + (nowLiked ? 1 : -1));
    } catch (e: any) {
      Alert.alert('Fehler', e.message ?? 'Like nicht möglich');
    }
  };

  const onShare = async () => {
    try {
      await Share.share({
        message: `${displayName} hat ${item.spots?.name ?? 'einen Spot'} bewertet — ${item.mood_a ?? ''} / ${item.mood_b ?? ''}`,
      });
    } catch {}
  };

  const onToggleFollow = async () => {
    if (!item.profiles?.id) return;
    try {
      if (following) {
        await unfollow(item.profiles.id);
        setFollowing(false);
      } else {
        await follow(item.profiles.id);
        setFollowing(true);
      }
    } catch (e: any) {
      Alert.alert('Fehler', e.message ?? 'Follow nicht möglich');
    }
  };

  return (
    <View
      style={{
        backgroundColor: '#0a0a0a',
        borderRadius: 24,
        borderWidth: 1,
        borderColor: '#111',
        marginBottom: 16,
        overflow: 'hidden',
      }}
    >
      {/* Header */}
      <View
        style={{
          flexDirection: 'row',
          alignItems: 'center',
          justifyContent: 'space-between',
          padding: 12,
        }}
      >
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10 }}>
          <Avatar
            uri={item.profiles?.avatar_url ?? undefined}
            name={displayName}
            size={36}
          />
          <View>
            <Text style={{ color: '#fff', fontWeight: '700' }}>{displayName}</Text>
            <Text style={{ color: '#9ca3af', fontSize: 12 }}>
              hat {item.spots?.name ?? 'einen Spot'} bewertet
            </Text>
          </View>
        </View>
        {item.profiles?.id && (
          <TouchableOpacity
            onPress={onToggleFollow}
            style={{
              paddingVertical: 6,
              paddingHorizontal: 12,
              borderRadius: 999,
              backgroundColor: '#111',
            }}
          >
            <Text style={{ color: '#fff' }}>{following ? 'Gefolgt' : 'Folgen'}</Text>
          </TouchableOpacity>
        )}
      </View>

      {/* Image */}
      {cover && (
        <Image
          source={{ uri: cover }}
          style={{ width: '100%', height: 320, backgroundColor: '#111' }}
        />
      )}

      {/* Body */}
      <View style={{ padding: 12 }}>
        {/* Mood Pills */}
        <View style={{ flexDirection: 'row', gap: 8, marginBottom: 8 }}>
          {!!item.mood_a && (
            <View
              style={{
                borderRadius: 999,
                borderWidth: 1,
                borderColor: '#333',
                paddingHorizontal: 10,
                paddingVertical: 6,
              }}
            >
              <Text style={{ color: '#fff' }}>{item.mood_a}</Text>
            </View>
          )}
          {!!item.mood_b && (
            <View
              style={{
                borderRadius: 999,
                borderWidth: 1,
                borderColor: '#333',
                paddingHorizontal: 10,
                paddingVertical: 6,
              }}
            >
              <Text style={{ color: '#fff' }}>{item.mood_b}</Text>
            </View>
          )}
        </View>

        {/* Text */}
        {!!item.text && <Text style={{ color: '#e5e7eb' }}>{item.text}</Text>}

        {/* Actions */}
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 16, marginTop: 12 }}>
          <TouchableOpacity onPress={onLike}>
            <Text style={{ color: liked ? '#fff' : '#9ca3af' }}>
              {liked ? '♥︎ Gefällt mir' : '♡ Gefällt mir'}
            </Text>
          </TouchableOpacity>
          <TouchableOpacity onPress={() => onOpenComments(item.id)}>
            <Text style={{ color: '#9ca3af' }}>Kommentieren</Text>
          </TouchableOpacity>
          <TouchableOpacity onPress={onShare}>
            <Text style={{ color: '#9ca3af' }}>Teilen</Text>
          </TouchableOpacity>
        </View>

        {/* Counts */}
        <View style={{ flexDirection: 'row', gap: 16, marginTop: 8 }}>
          <Text style={{ color: '#9ca3af', fontSize: 12 }}>{likeCount} Likes</Text>
          <Text style={{ color: '#9ca3af', fontSize: 12 }}>{stats?.comments ?? 0} Kommentare</Text>
        </View>
      </View>
    </View>
  );
}
