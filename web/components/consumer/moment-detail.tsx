"use client";
import { useCallback, useEffect, useState } from "react";
import { supabase } from "@/lib/supabase/client";
import { getMoment, type Moment } from "@/lib/consumer-api";
import { MomentCard } from "./moment-card";
import { CommentsDialog } from "./comments-dialog";
import { StateView } from "./ui";
export function MomentDetail({ postId }: { postId: string }) {
  const [moment, setMoment] = useState<Moment | null>(null);
  const [actor, setActor] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [failed, setFailed] = useState(false);
  const [comments, setComments] = useState<Moment | null>(null);
  const load = useCallback(async () => {
    setLoading(true); setFailed(false);
    try {
      const { data, error } = await supabase.auth.getUser();
      if (error || !data.user) throw error ?? new Error("not_authenticated");
      setActor(data.user.id); setMoment(await getMoment(postId));
    } catch { setFailed(true); }
    finally { setLoading(false); }
  }, [postId]);
  useEffect(() => { void load(); }, [load]);
  return <div className="b-narrow b-main">
    <h1 className="b-page-title">Ein Moment auf Backyrd</h1>
    {loading ? <p role="status">Moment wird geladen …</p> : failed ? <StateView title="Moment nicht geladen" message="Bitte versuche es erneut." actionLabel="Erneut versuchen" onAction={() => void load()} /> : !moment ? <StateView title="Moment nicht verfügbar" message="Vielleicht wurde er entfernt oder die Person hat die Sichtbarkeit geändert." /> : <MomentCard moment={moment} currentUserId={actor} onComments={setComments} onChanged={() => void load()} />}
    <CommentsDialog onCreated={() => void load()} moment={comments} onClose={() => setComments(null)} />
  </div>;
}
