import React, { useEffect, useState } from 'react';
import { TouchableOpacity, Text } from 'react-native';
import { isFollowing, follow, unfollow } from '../lib/social';

export default function FollowButton({ userId }: { userId: string }) {
  const [following, setFollowing] = useState<boolean | null>(null);
  useEffect(() => { (async () => setFollowing(await isFollowing(userId)))(); }, [userId]);
  const toggle = async () => {
    if (following) { await unfollow(userId); setFollowing(false); }
    else { await follow(userId); setFollowing(true); }
  };
  return (
    <TouchableOpacity onPress={toggle} style={{ paddingVertical:10, paddingHorizontal:16, borderRadius:999, backgroundColor:'#111' }}>
      <Text style={{ color:'#fff' }}>{following ? 'Gefolgt' : 'Folgen'}</Text>
    </TouchableOpacity>
  );
}
