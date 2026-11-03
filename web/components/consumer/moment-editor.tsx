"use client";
import { useCallback, useEffect, useRef, useState } from "react";
import { supabase } from "@/lib/supabase/client";
import { parseMomentEditor, type MomentEditorData } from "../../../packages/shared/src/presentation/social";
import { MoodSelection } from "./mood-selection";
import { Button, Dialog } from "./ui";
export function MomentEditor({ postId, onClose, onChanged }: { postId: string | null; onClose: () => void; onChanged: () => void }) {
  const [original, setOriginal] = useState<MomentEditorData | null>(null);
  const [caption, setCaption] = useState("");
  const [moods, setMoods] = useState<string[]>([]);
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const pending = useRef(false);
  const load = useCallback(async () => {
    setError(""); setOriginal(null);
    if (!postId) return;
    try {
      const { data, error } = await supabase.rpc("get_my_moment_editor_v1", { p_post_id: postId });
      if (error) throw error;
      const row = parseMomentEditor(data, postId);
      setOriginal(row); setCaption(row.caption ?? ""); setMoods(row.moods);
    } catch { setError("Dein Moment konnte nicht geladen werden."); }
  }, [postId]);
  useEffect(() => { void load(); }, [load]);
  function close() {
    if (pending.current) return;
    if (original && (caption !== (original.caption ?? "") || JSON.stringify(moods) !== JSON.stringify(original.moods)) && !window.confirm("Änderungen verwerfen?")) return;
    onClose();
  }
  async function save(remove: boolean) {
    if (!original || pending.current) return;
    if (remove && !window.confirm(original.reviewId ? "Moment aus dem Feed entfernen? Dein Ortseindruck und seine Moods bleiben auf der Ortsseite erhalten." : "Diesen Moment entfernen? Er wird nicht mehr im Feed oder Profil angezeigt.")) return;
    pending.current = true; setBusy(true); setError("");
    try {
      const result = remove
        ? await supabase.rpc("remove_my_moment_v1", { p_post_id: original.postId })
        : await supabase.rpc("update_my_moment_v1", { p_post_id: original.postId, p_caption: caption, p_mood_tags: moods, p_expected_caption: original.caption, p_expected_mood_tags: original.moods });
      const receipt = Array.isArray(result.data) ? result.data[0] : result.data;
      if (result.error || receipt?.post_id !== original.postId || (remove && receipt?.status !== "deleted")) throw result.error ?? new Error("missing_receipt");
      onChanged(); onClose();
    } catch (e: unknown) {
      const reason = e && typeof e === "object" && "message" in e ? String(e.message) : "";
      setError(reason.includes("moment_changed") ? "Dieser Moment wurde inzwischen geändert. Schliesse den Editor und lade ihn erneut, bevor du speicherst. Deine Eingabe bleibt bis dahin sichtbar." : "Die Änderung konnte nicht bestätigt werden. Deine Eingaben bleiben erhalten.");
    } finally { pending.current = false; setBusy(false); }
  }
  return <Dialog open={Boolean(postId)} title="Dein Moment" onClose={close}>
    {error ? <p role="alert">{error}</p> : null}
    {!original ? <Button onClick={() => void load()}>Moment laden</Button> : <fieldset className="b-form" disabled={busy}>
      {original.reviewId ? <p className="b-meta">Dein Text und deine Moods gehören auch zu deinem Ortseindruck. Änderungen werden an beiden Stellen gespeichert.</p> : null}
      <label className="b-label" htmlFor="edit-moment-caption">Dein Erlebnis</label>
      <textarea id="edit-moment-caption" className="b-textarea" maxLength={1200} value={caption} onChange={e => setCaption(e.target.value)} />
      <MoodSelection context={original.reviewId ? "place" : "moment"} values={moods} onChange={setMoods} />
      <Button onClick={() => void save(false)}>{busy ? "Wird gespeichert …" : "Änderungen speichern"}</Button>
      <Button variant="secondary" onClick={() => void save(true)}>Moment entfernen</Button>
    </fieldset>}
  </Dialog>;
}
