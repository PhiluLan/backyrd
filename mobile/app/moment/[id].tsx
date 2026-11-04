import React, { useCallback, useState } from "react";
import { Pressable, ScrollView } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { Stack, useFocusEffect, useLocalSearchParams, useRouter } from "expo-router";
import { AppText } from "../../components/foundation/AppText";
import { StateView } from "../../components/foundation/StateView";
import SocialPostCard, { type SocialFeedPost } from "../../components/PostCard";
import CommentsSheet from "../../components/CommentsSheet";
import { loadVisibleSocialPost } from "../../lib/social-feed";
import { supabase } from "../../lib/supabase";
import { backyrdTheme as theme } from "../../theme/backyrd";
export default function MomentDetailScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const router = useRouter();
  const [post, setPost] = useState<SocialFeedPost | null>(null);
  const [actor, setActor] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(false);
  const [comments, setComments] = useState(false);
  const load = useCallback(async () => {
    setLoading(true); setError(false);
    try {
      if (!id || !/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(id)) throw new Error("invalid_moment");
      const {data,error} = await supabase.auth.getUser();
      if (error || !data.user) throw error ?? new Error("not_authenticated");
      setActor(data.user.id); setPost(await loadVisibleSocialPost(id));
    } catch { setError(true); }
    finally { setLoading(false); }
  }, [id]);
  useFocusEffect(useCallback(() => { void load(); }, [load]));
  async function react(postId: string, reactionType: "like" | "save", active: boolean) {
    const { data, error } = await supabase.rpc("react_to_social_post_v1", { p_post_id: postId, p_reaction_type: reactionType, p_active: active });
    const receipt = Array.isArray(data) ? data[0] : data;
    if (error || receipt?.post_id !== postId || receipt?.active !== active) throw error ?? new Error("missing_receipt");
  }
  return <SafeAreaView style={{flex:1,backgroundColor:theme.color.background}}>
    <Stack.Screen options={{headerShown:false}} />
    <ScrollView contentContainerStyle={{padding:20,paddingBottom:40}}>
      <Pressable accessibilityRole="button" accessibilityLabel="Zurück" onPress={() => router.canGoBack() ? router.back() : router.replace("/(tabs)/feed")} style={{minHeight:48,justifyContent:"center"}}><AppText>← Momente</AppText></Pressable>
      {loading ? <StateView kind="loading" title="Moment wird geladen" /> : error ? <StateView kind="error" title="Moment nicht geladen" actionLabel="Erneut versuchen" onAction={() => void load()} /> : !post ? <StateView kind="empty" title="Moment nicht verfügbar" message="Vielleicht wurde er entfernt oder die Person hat die Sichtbarkeit geändert." /> : <SocialPostCard post={post} currentUserId={actor} onChanged={() => void load()} onToggleReaction={react} onOpenSpot={p => {if(p.spot_id)router.push(`/spot/${p.spot_id}`);}} onOpenComments={() => setComments(true)} />}
    </ScrollView>
    <CommentsSheet visible={comments} postId={post?.post_id ?? null} onClose={() => setComments(false)} onCommentCreated={() => void load()} />
  </SafeAreaView>;
}
