"use client";
import { useRef, useState } from "react";
import { supabase } from "@/lib/supabase/client";
import { type Moment } from "@/lib/consumer-api";
import { Button, Dialog } from "./ui";
const reasons = [
  ["hate_discrimination", "Hass oder Diskriminierung"], ["harassment_bullying", "Belästigung oder Mobbing"],
  ["violence_threat", "Gewalt oder Bedrohung"], ["sexual_content", "Sexuelle Inhalte"],
  ["self_harm", "Selbstgefährdung"], ["spam_fraud", "Spam oder Betrug"],
  ["privacy_personal_data", "Verletzung der Privatsphäre"], ["illegal_dangerous_goods", "Illegale oder gefährliche Inhalte"], ["other", "Anderer Grund"],
] as const;
export function ReportMoment({ moment }: { moment: Moment }) {
  const [open, setOpen] = useState(false);
  const [reason, setReason] = useState("");
  const [details, setDetails] = useState("");
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState("");
  const pending = useRef(false);
  async function submit() {
    if (!reason || pending.current) return;
    pending.current = true; setBusy(true); setMessage("");
    try {
      const content = await supabase.rpc("safety_get_or_create_reportable_content_v1", {
        p_content_type:"moment",p_entity_type:"social_post",p_entity_id:moment.post_id,p_actor_user_id:moment.user_id,
        p_spot_id:moment.spot_id,p_text_content:moment.caption,p_image_urls:[],p_locale:"de-CH",p_context:{source_surface:"web_moments"},
      });
      const itemId = content.data?.content_item_id ?? content.data?.id;
      if (content.error || !itemId) throw content.error ?? new Error("missing_content_receipt");
      const report = await supabase.rpc("safety_submit_report_v1", {
        p_content_item_id:itemId,p_report_reason:reason,p_report_details:details.trim()||null,
        p_source_surface:"web_moments",p_reporter_locale:"de-CH",p_source_context:{},
      });
      if (report.error || !report.data?.report_id) throw report.error ?? new Error("missing_report_receipt");
      setMessage(report.data.duplicate ? "Deine Meldung liegt bereits zur Prüfung vor." : "Danke. Deine Meldung ist eingegangen und wird geprüft. Du findest sie unter Einstellungen → Sicherheit.");
      setReason(""); setDetails("");
    } catch { setMessage("Die Meldung konnte nicht bestätigt werden. Deine Eingaben bleiben erhalten. Bitte versuche es erneut."); }
    finally { pending.current = false; setBusy(false); }
  }
  return <>
    <button type="button" className="b-action-button" onClick={() => setOpen(true)}>Melden</button>
    <Dialog open={open} title="Moment melden" onClose={() => { if (!pending.current) setOpen(false); }}>
      <p>Was stimmt mit diesem Moment nicht? Deine Meldung wird geprüft; sie ist kein öffentliches Urteil über die Person.</p>
      <fieldset className="b-form" disabled={busy}>
        <label className="b-label" htmlFor={`report-reason-${moment.post_id}`}>Grund</label>
        <select id={`report-reason-${moment.post_id}`} className="b-select" value={reason} onChange={e => setReason(e.target.value)}><option value="">Bitte auswählen</option>{reasons.map(([value,label])=><option key={value} value={value}>{label}</option>)}</select>
        <label className="b-label" htmlFor={`report-details-${moment.post_id}`}>Was sollten wir wissen? · optional</label>
        <textarea id={`report-details-${moment.post_id}`} className="b-textarea" value={details} onChange={e => setDetails(e.target.value)} maxLength={2000}/>
        <Button disabled={!reason || busy} onClick={() => void submit()}>{busy ? "Wird gesendet …" : "Meldung senden"}</Button>
      </fieldset>
      {message ? <p role="status">{message}</p> : null}
    </Dialog>
  </>;
}
