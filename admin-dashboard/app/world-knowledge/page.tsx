"use client";

import { sessionRecoveringAuthoringClient, WorldKnowledgeAuthoring } from "@backyrd/world-knowledge-authoring-ui";
import "@backyrd/world-knowledge-authoring-ui/styles.css";
import { supabase } from "@/lib/supabaseClient";
import { authorizedWorldKnowledgePost } from "@/lib/worldKnowledgeSession";

const authoringClient = sessionRecoveringAuthoringClient(supabase, supabase.auth);

export default function AdminWorldKnowledgePage() {
  const authorizedPost = (body: unknown) => authorizedWorldKnowledgePost({ auth: supabase.auth, body });
  const exportCohort = async () => { const result = await authorizedPost({ action: "cohort", cohortId: `founder-${new Date().toISOString().slice(0, 10)}` }); const blob = new Blob([JSON.stringify(result, null, 2)], { type: "application/json" }); const link = document.createElement("a"); link.href = URL.createObjectURL(blob); link.download = "founder-world-cohort.json"; link.click(); URL.revokeObjectURL(link.href); };
  return <WorldKnowledgeAuthoring client={authoringClient} surface="ADMIN" rebuild={(spotId) => authorizedPost({ action: "rebuild", spotId })} exportCohort={exportCohort} />;
}
