import React, { useCallback, useState } from "react";
import { View } from "react-native";
import { useFocusEffect, useRouter } from "expo-router";
import { AppText } from "./foundation/AppText";
import { StateView } from "./foundation/StateView";
import SocialPostCard, { type SocialFeedPost } from "./PostCard";
import CommentsSheet from "./CommentsSheet";
import { loadMySavedMoments } from "../lib/social-feed";
import { supabase } from "../lib/supabase";
export function SavedMoments() {
  const router = useRouter();
  const [posts, setPosts] = useState<SocialFeedPost[]>([]);
  const [actor, setActor] = useState<string | null>(null);
  const [comments, setComments] = useState<SocialFeedPost | null>(null);
  const [loading, setLoading] = useState(true);
  const [failed, setFailed] = useState(false);
  const load = useCallback(async () => {
    setLoading(true); setFailed(false);
    try {
      const {data,error}=await supabase.auth.getUser();
      if(error || !data.user)throw error ?? new Error("not_authenticated");
      setActor(data.user.id); setPosts(await loadMySavedMoments());
    } catch { setFailed(true); }
    finally { setLoading(false); }
  }, []);
  useFocusEffect(useCallback(()=>{void load();},[load]));
  async function react(id: string, kind: "like" | "save", active: boolean) {
    const {data,error}=await supabase.rpc("react_to_social_post_v1",{p_post_id:id,p_reaction_type:kind,p_active:active});
    const receipt=Array.isArray(data)?data[0]:data;
    if(error || receipt?.post_id!==id || receipt?.active!==active)throw error ?? new Error("reaction_not_confirmed");
    if(kind==="save" && !active)setPosts(rows=>rows.filter(p=>p.post_id!==id));
  }
  return <View style={{gap:16,marginTop:24}}>
    <AppText role="sectionTitle">Gespeicherte Momente</AppText>
    {loading && !posts.length ? <StateView kind="loading" title="Momente werden geladen" /> : failed ? <StateView kind="error" title="Gespeicherte Momente nicht geladen" actionLabel="Erneut versuchen" onAction={()=>void load()} /> : !posts.length ? <StateView kind="empty" title="Noch keine Momente gespeichert" message="Tippe bei einem Moment auf das Lesezeichen, um ihn hier wiederzufinden." /> : posts.map(post=><SocialPostCard key={post.post_id} post={post} currentUserId={actor} onToggleReaction={react} onChanged={()=>void load()} onOpenComments={setComments} onOpenSpot={p=>{if(p.spot_id)router.push(`/spot/${p.spot_id}`);}}/>)}
    <CommentsSheet visible={Boolean(comments)} postId={comments?.post_id ?? null} onClose={()=>setComments(null)} onCommentCreated={()=>void load()}/>
  </View>;
}
