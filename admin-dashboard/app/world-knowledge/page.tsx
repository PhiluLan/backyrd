"use client";

import { sessionRecoveringAuthoringClient, WorldKnowledgeAuthoring, WorldProductCorrection } from "@backyrd/world-knowledge-authoring-ui";
import type { ProductAdminSpotSearch } from "@backyrd/world-knowledge-authoring-ui";
import "@backyrd/world-knowledge-authoring-ui/styles.css";
import { supabase } from "@/lib/supabaseClient";
import { authorizedWorldKnowledgePost, authorizedWorldKnowledgeSpotSearch } from "@/lib/worldKnowledgeSession";
import { WorldAddressPicker } from "./WorldAddressPicker";
import Link from "next/link";

const authoringClient = sessionRecoveringAuthoringClient(supabase, supabase.auth);
const searchSpots = (query: string) => authorizedWorldKnowledgeSpotSearch({ auth: supabase.auth, query }) as Promise<ProductAdminSpotSearch>;

export default function AdminWorldKnowledgePage() {
  const authorizedPost = (body: unknown) => authorizedWorldKnowledgePost({ auth: supabase.auth, body });
  const exportCohort = async () => { const result = await authorizedPost({ action: "cohort", cohortId: `founder-${new Date().toISOString().slice(0, 10)}` }); const blob = new Blob([JSON.stringify(result, null, 2)], { type: "application/json" }); const link = document.createElement("a"); link.href = URL.createObjectURL(blob); link.download = "founder-world-cohort.json"; link.click(); URL.revokeObjectURL(link.href); };
  const local = (() => { try { return ["localhost", "127.0.0.1", "::1"].includes(new URL(process.env.NEXT_PUBLIC_SUPABASE_URL ?? "").hostname); } catch { return false; } })();
  return <>
    <div className="wk-presentation-link"><div><strong>Eine Wissensquelle, kontrollierte Ausgabe</strong><span>Hier gepflegte Fakten bleiben vollständig erhalten. Welche davon auf Spot-Detailseiten erscheinen, wird separat gesteuert und verändert Decision vNext nicht.</span></div><Link href="/spots/presentation">Detail-Darstellung steuern</Link></div>
    <WorldProductCorrection client={authoringClient} search={searchSpots} addressPicker={WorldAddressPicker} rebuild={(spotId, idempotencyKey) => authorizedPost({ action: "product-rebuild", spotId, idempotencyKey })} />
    {local && <WorldKnowledgeAuthoring client={authoringClient} surface="ADMIN" rebuild={(spotId) => authorizedPost({ action: "rebuild", spotId })} exportCohort={exportCohort} />}
  </>;
}
