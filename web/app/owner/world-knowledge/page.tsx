"use client";

import { sessionRecoveringAuthoringClient, WorldKnowledgeAuthoring } from "@backyrd/world-knowledge-authoring-ui";
import "@backyrd/world-knowledge-authoring-ui/styles.css";
import { supabase } from "@/lib/supabase/client";

const authoringClient = sessionRecoveringAuthoringClient(supabase, supabase.auth);

async function authorizedPost(body: unknown) {
  const request = async (forceRefresh: boolean) => {
    const sessionResult = forceRefresh ? await supabase.auth.refreshSession() : await supabase.auth.getSession();
    let session = sessionResult.data.session;
    if (!forceRefresh && (!session || (session.expires_at ?? 0) <= Math.floor(Date.now() / 1000) + 60)) session = (await supabase.auth.refreshSession()).data.session;
    if (!session?.access_token) throw new Error("invalid_session");
    const response = await fetch("/api/world-knowledge/shadow", { method: "POST", headers: { "content-type": "application/json", authorization: `Bearer ${session.access_token}` }, body: JSON.stringify(body) });
    const result = await response.json().catch(() => ({ error: "invalid_server_response" })) as { error?: string };
    return { response, result };
  };
  let outcome = await request(false);
  if (outcome.response.status === 401 && ["invalid_session", "authentication_required"].includes(outcome.result.error ?? "")) outcome = await request(true);
  if (!outcome.response.ok) throw new Error(outcome.result.error ?? "Die Datenvorschau konnte nicht aktualisiert werden.");
  return outcome.result;
}

export default function OwnerWorldKnowledgePage() {
  return <WorldKnowledgeAuthoring client={authoringClient} surface="OWNER" rebuild={(spotId) => authorizedPost({ action: "rebuild", spotId })} />;
}
