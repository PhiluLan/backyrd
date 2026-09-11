"use client";

import { WorldKnowledgeAuthoring } from "@backyrd/world-knowledge-authoring-ui";
import "@backyrd/world-knowledge-authoring-ui/styles.css";
import { supabase } from "@/lib/supabaseClient";

async function authorizedPost(body: unknown) {
  const { data } = await supabase.auth.getSession();
  const token = data.session?.access_token;
  if (!token) throw new Error("Bitte melde dich zuerst als Admin an.");
  const response = await fetch("/api/world-knowledge/shadow", { method: "POST", headers: { "content-type": "application/json", authorization: `Bearer ${token}` }, body: JSON.stringify(body) });
  const result = await response.json();
  if (!response.ok) throw new Error(result.error ?? "Die lokale Aktion ist fehlgeschlagen.");
  return result;
}

export default function AdminWorldKnowledgePage() {
  const exportCohort = async () => { const result = await authorizedPost({ action: "cohort", cohortId: `founder-${new Date().toISOString().slice(0, 10)}` }); const blob = new Blob([JSON.stringify(result, null, 2)], { type: "application/json" }); const link = document.createElement("a"); link.href = URL.createObjectURL(blob); link.download = "founder-world-cohort.json"; link.click(); URL.revokeObjectURL(link.href); };
  return <WorldKnowledgeAuthoring client={supabase} surface="ADMIN" rebuild={(spotId) => authorizedPost({ action: "rebuild", spotId })} exportCohort={exportCohort} />;
}
