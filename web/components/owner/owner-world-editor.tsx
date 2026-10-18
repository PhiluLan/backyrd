"use client";

import { EVENT_DECISION_TAGS } from "../../../packages/shared/src/event-decision.mjs";
import {
  preparePublicDiscovery,
  sessionRecoveringAuthoringClient,
  WorldProductCorrection,
  SpotEvents,
  type SpotEventRpc,
  type ProductAdminSpotSearch,
} from "@backyrd/world-knowledge-authoring-ui";
import { getOwnerSpots } from "@/lib/owner-api";
import { supabase } from "@/lib/supabase/client";
import { useState } from "react";
import { OwnerShell } from "./owner-shell";

const eventRpc: SpotEventRpc = async (name, args) => { const { data, error } = await supabase.rpc(name, args); return { data, error }; };

const authoringClient = sessionRecoveringAuthoringClient(supabase, supabase.auth);

async function rebuildOwnedSpot(spotId: string, idempotencyKey: string) {
  const request = async (refresh: boolean) => {
    const auth = refresh ? await supabase.auth.refreshSession() : await supabase.auth.getSession();
    const session = auth.data.session;
    if (!session?.access_token) throw new Error("Bitte melde dich erneut an.");
    const response = await fetch("/api/world-knowledge/shadow", {
      method: "POST",
      headers: {
        "content-type": "application/json",
        authorization: `Bearer ${session.access_token}`,
      },
      body: JSON.stringify({ action: "product-rebuild", spotId, idempotencyKey }),
    });
    const body = await response.json().catch(() => ({ error: "invalid_server_response" })) as {
      error?: string;
      manifestHash?: string;
      readerSnapshot?: unknown;
    };
    return { response, body };
  };
  let result = await request(false);
  if (result.response.status === 401 && ["invalid_session", "authentication_required"].includes(result.body.error ?? "")) {
    result = await request(true);
  }
  if (!result.response.ok) throw new Error(result.body.error ?? "Die Datenvorschau konnte nicht aktualisiert werden.");
  return result.body;
}

async function searchOwnedSpots(query: string): Promise<ProductAdminSpotSearch> {
  const spots = await getOwnerSpots(200);
  const term = query.trim().toLocaleLowerCase("de-CH");
  const matches = spots.filter((spot) =>
    spot.status === "approved" && (!term || [spot.name, spot.city, spot.address].some((value) => value?.toLocaleLowerCase("de-CH").includes(term))),
  );
  return {
    contractVersion: "backyrd.world-knowledge.product-admin-spot-search@1.0",
    spots: matches.map((spot) => ({ spotId: spot.spot_id, name: spot.name, city: spot.city })),
    hasMore: spots.length === 200,
  };
}

export function OwnerWorldEditor({ spotId }: { spotId?: string }) {
  const [view, setView] = useState<"profile" | "events">("profile");
  return <OwnerShell>
    <div className="owner-world">
    {spotId && <nav className="spot-editor-tabs" aria-label="Spot-Bereiche"><button type="button" aria-pressed={view === "profile"} onClick={() => setView("profile")}>Profil & Angebote</button><button type="button" aria-pressed={view === "events"} onClick={() => setView("events")}>Events & Veranstaltungen</button></nav>}
    <div hidden={view !== "profile"}><WorldProductCorrection
      key={spotId ?? "spot-picker"}
      surface="OWNER"
      client={authoringClient}
      search={searchOwnedSpots}
      prepareDiscovery={async (id,text)=>{const {data}=await supabase.auth.getSession();if(!data.session?.access_token)throw new Error("authentication_required");return preparePublicDiscovery(authoringClient,data.session.access_token,id,text,rebuildOwnedSpot);}}
      rebuild={rebuildOwnedSpot}
      initialSpotId={spotId}
    /></div>
    {spotId && <div hidden={view !== "events"}><SpotEvents key={spotId} spotId={spotId} admin={false} rpc={eventRpc} formatTags={EVENT_DECISION_TAGS}/></div>}
    </div>
  </OwnerShell>;
}
