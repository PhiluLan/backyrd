import { supabase } from "@/lib/supabase";

type TrackEventParams = {
  userId: string;
  eventType: string;
  entityType?: string;
  entityId?: string;
  meta?: Record<string, any>;
};

export async function trackEvent({
  userId,
  eventType,
  entityType,
  entityId,
  meta = {},
}: TrackEventParams) {
  if (!userId) return;

  // Fire-and-forget (aber wir loggen Fehler, damit Debugging easy bleibt)
  const { error } = await supabase.from("user_events").insert({
    user_id: userId,
    event_type: eventType,
    entity_type: entityType ?? null,
    entity_id: entityId ?? null,
    meta,
  });

  if (error) {
    console.log("trackEvent error:", error.message);
  }
}
