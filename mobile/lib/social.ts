import { supabase } from './supabase';

export async function getSessionUserId() {
  const { data } = await supabase.auth.getUser();
  return data.user?.id ?? null;
}

/* ---------- FOLLOW ---------- */
export async function isFollowing(targetUserId: string) {
  const me = await getSessionUserId();
  if (!me) return false;
  const { data, error } = await supabase
    .from('follows')
    .select('follower')
    .eq('follower', me)
    .eq('following', targetUserId)
    .maybeSingle();
  if (error && error.code !== 'PGRST116') console.error(error);
  return !!data;
}

export async function follow(targetUserId: string) {
  const me = await getSessionUserId();
  if (!me) throw new Error('Not authenticated');
  const { error } = await supabase.from('follows').insert({ follower: me, following: targetUserId });
  if (error && error.code !== '23505') throw error; // ignore duplicates
}

export async function unfollow(targetUserId: string) {
  const me = await getSessionUserId();
  if (!me) throw new Error('Not authenticated');
  const { error } = await supabase
    .from('follows')
    .delete()
    .eq('follower', me)
    .eq('following', targetUserId);
  if (error) throw error;
}

export async function getFollowingIds() {
  const me = await getSessionUserId();
  if (!me) return [];
  const { data, error } = await supabase.from('follows').select('following').eq('follower', me);
  if (error) throw error;
  return (data ?? []).map((r: any) => r.following as string);
}

/* ---------- LIKES ---------- */
export async function hasLiked(reviewId: string) {
  const me = await getSessionUserId();
  if (!me) return false;
  const { data } = await supabase
    .from('review_likes')
    .select('user_id')
    .eq('user_id', me)
    .eq('review_id', reviewId)
    .maybeSingle();
  return !!data;
}

export async function toggleLike(reviewId: string) {
  const me = await getSessionUserId();
  if (!me) throw new Error('Not authenticated');
  const liked = await hasLiked(reviewId);
  if (liked) {
    const { error } = await supabase.from('review_likes').delete().eq('review_id', reviewId).eq('user_id', me);
    if (error) throw error;
    return false;
  } else {
    const { error } = await supabase.from('review_likes').insert({ review_id: reviewId, user_id: me });
    if (error && error.code !== '23505') throw error;
    return true;
  }
}

/* ---------- COMMENTS ---------- */
export type CommentNode = {
  id: string;
  review_id: string;
  user_id: string;
  text: string;
  created_at: string;
  parent_id: string | null;
  profiles?: { username?: string | null; avatar_url?: string | null } | null;
  children?: CommentNode[];
};

export async function fetchComments(reviewId: string): Promise<CommentNode[]> {
  const { data, error } = await supabase
    .from('review_comments')
    .select('id, review_id, user_id, text, created_at, parent_id, profiles(username, avatar_url)')
    .eq('review_id', reviewId)
    .order('created_at', { ascending: true });
  if (error) throw error;
  const byId: Record<string, CommentNode> = {};
  (data ?? []).forEach((c: any) => { byId[c.id] = { ...c, children: [] }; });
  const roots: CommentNode[] = [];
  (data ?? []).forEach((c: any) => {
    if (c.parent_id && byId[c.parent_id]) byId[c.parent_id].children!.push(byId[c.id]);
    else roots.push(byId[c.id]);
  });
  return roots;
}

export async function addComment(reviewId: string, text: string, parentId?: string | null) {
  const me = await getSessionUserId();
  if (!me) throw new Error('Not authenticated');
  const { error } = await supabase.from('review_comments').insert({
    review_id: reviewId, user_id: me, text, parent_id: parentId ?? null
  });
  if (error) throw error;
}

/* ---------- LIGHT STATS (likes/comments count) ---------- */
export async function fetchStatsFor(reviewIds: string[]) {
  if (!reviewIds.length) return {};
  const { data, error } = await supabase
    .from('review_stats')
    .select('review_id, likes_count, comments_count')
    .in('review_id', reviewIds);
  if (error) { console.error(error); return {}; }
  const m: Record<string, { likes: number; comments: number }> = {};
  (data ?? []).forEach((r: any) => { m[r.review_id] = { likes: Number(r.likes_count), comments: Number(r.comments_count) }; });
  return m;
}
