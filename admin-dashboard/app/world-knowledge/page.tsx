"use client";

import type { ProductAdminSpotSearch } from "@backyrd/world-knowledge-authoring-ui";
import "@backyrd/world-knowledge-authoring-ui/styles.css";
import { supabase } from "@/lib/supabaseClient";
import { authorizedWorldKnowledgeSpotSearch, authorizedWorldResearchBatchPost } from "@/lib/worldKnowledgeSession";
import { WorldResearchBatchPanel } from "./WorldResearchBatchPanel";

const searchSpots = (query: string) => authorizedWorldKnowledgeSpotSearch({ auth: supabase.auth, query }) as Promise<ProductAdminSpotSearch>;

export default function AdminSpotResearchPage() {
  return <WorldResearchBatchPanel search={searchSpots} post={(body) => authorizedWorldResearchBatchPost({ auth: supabase.auth, body })} />;
}
