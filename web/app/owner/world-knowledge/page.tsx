"use client";

import { WorldKnowledgeAuthoring } from "@backyrd/world-knowledge-authoring-ui";
import "@backyrd/world-knowledge-authoring-ui/styles.css";
import { supabase } from "@/lib/supabase/client";

async function authorizedPost(body: unknown) {
  const { data } = await supabase.auth.getSession();
  const token = data.session?.access_token;
  if (!token) throw new Error("Bitte melde dich zuerst als Owner an.");
  const response = await fetch("/api/world-knowledge/shadow", { method: "POST", headers: { "content-type": "application/json", authorization: `Bearer ${token}` }, body: JSON.stringify(body) });
  const result = await response.json();
  if (!response.ok) throw new Error(result.error ?? "Die Datenvorschau konnte nicht aktualisiert werden.");
  return result;
}

export default function OwnerWorldKnowledgePage() {
  return <WorldKnowledgeAuthoring client={supabase} surface="OWNER" rebuild={(spotId) => authorizedPost({ action: "rebuild", spotId })} />;
}
