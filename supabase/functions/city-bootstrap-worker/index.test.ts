import { googleMatch, planRefreshCandidates, selectResearchCohort, selectResearchEligible, type Candidate } from "./index.ts";

const candidate: Candidate = {
  sourceFamily: "OPENSTREETMAP",
  sourceIdentity: "node/1",
  name: "Pilot Café",
  address: "Testweg 1",
  city: "Basel",
  country: "Switzerland",
  lat: 47.56,
  lng: 7.59,
  website: "https://pilot.example/",
  externalTypes: ["cafe"],
  relevance: { state: "RELEVANT", confidence: "HIGH", categoryName: "Café" },
  identity: { state: "NEW_IDENTITY", confidence: "STRONG" },
  lifecycleState: "EVIDENCE_PENDING",
};

Deno.test("Google identity linking uses bounded Text Search and retains only the identifier", async () => {
  const originalFetch = globalThis.fetch;
  let capturedUrl = "";
  let capturedInit: RequestInit | undefined;
  globalThis.fetch = async (input, init) => {
    capturedUrl = String(input);
    capturedInit = init;
    return Response.json({ places: [{ id: "place-id-1", displayName: { text: "Pilot Café" }, formattedAddress: "Testweg 1, 4051 Basel, Schweiz", location: { latitude: 47.5601, longitude: 7.5901 } }] });
  };
  try {
    const result = await googleMatch(candidate, "server-key");
    if (!result.ok || result.placeId !== "place-id-1" || result.confidence !== "EXACT") throw new Error("expected exact identifier match");
    if (capturedUrl !== "https://places.googleapis.com/v1/places:searchText") throw new Error("identity linking must use Text Search");
    const body = JSON.parse(String(capturedInit?.body));
    if (body.pageSize !== 5 || body.locationBias?.circle?.radius !== 500) throw new Error("Text Search is not bounded");
    const headers = new Headers(capturedInit?.headers);
    if (headers.get("x-goog-fieldmask") !== "places.id,places.displayName,places.formattedAddress,places.location") throw new Error("unexpected Google field mask");
  } finally {
    globalThis.fetch = originalFetch;
  }
});

Deno.test("Google identity linking fails closed when no result is sufficiently close", async () => {
  const originalFetch = globalThis.fetch;
  globalThis.fetch = async () => Response.json({ places: [{ id: "far-away", displayName: { text: "Pilot Café" }, formattedAddress: "Testweg 1, Basel", location: { latitude: 47.7, longitude: 7.8 } }] });
  try {
    const result = await googleMatch(candidate, "server-key");
    if (result.ok || result.code !== "google_identity_unmatched") throw new Error("distant identity must be rejected");
  } finally {
    globalThis.fetch = originalFetch;
  }
});

Deno.test("Research pilot cohort is bounded and category-breadth first", () => {
  const rows = [
    { id: "a1", canonical_category_name: "A" }, { id: "a2", canonical_category_name: "A" }, { id: "a3", canonical_category_name: "A" },
    { id: "b1", canonical_category_name: "B" }, { id: "b2", canonical_category_name: "B" },
    { id: "c1", canonical_category_name: "C" },
  ];
  const selected = selectResearchCohort(rows, 5);
  if (selected.map((row) => row.id).join(",") !== "a1,b1,c1,a2,b2") throw new Error("research cohort must round-robin categories");
});

Deno.test("Research cohort excludes rows without canonical website eligibility", () => {
  const rows = [
    { id: "museum-without-site", matched_spot_id: "spot-1", canonical_category_name: "Museum" },
    { id: "museum-ready", matched_spot_id: "spot-2", canonical_category_name: "Museum" },
    { id: "cafe-ready", matched_spot_id: "spot-3", canonical_category_name: "Café" },
  ];
  const eligible = selectResearchEligible(rows, [
    { id: "spot-1", website: null },
    { id: "spot-2", website: "https://museum.example" },
    { id: "spot-3", website: "http://not-official.example" },
  ]);
  const selected = selectResearchCohort(eligible, 10);
  if (selected.map((row) => row.id).join(",") !== "museum-ready") throw new Error("research cohort included an ineligible row");
});

Deno.test("Independent Research cohort excludes previously researched Spots and official hosts", () => {
  const rows = [
    { id: "old-spot", matched_spot_id: "spot-1", canonical_category_name: "Museum" },
    { id: "old-host", matched_spot_id: "spot-2", canonical_category_name: "Café" },
    { id: "fresh", matched_spot_id: "spot-3", canonical_category_name: "Bar" },
  ];
  const eligible = selectResearchEligible(rows, [
    { id: "spot-1", website: "https://one.example/" },
    { id: "spot-2", website: "https://www.old.example/path" },
    { id: "spot-3", website: "https://fresh.example/" },
  ], { spotIds: ["spot-1"], hosts: ["old.example"] });
  if (eligible.map((row) => row.id).join(",") !== "fresh") throw new Error("independent cohort repeated prior Research evidence");
});

Deno.test("Refresh planning skips unchanged fingerprints and routes changes or new identities", async () => {
  const unchangedIdentity="e6ffef2167ed623997726ac5ff910b43d755d83702d2d0515a5c85e5117811d2";
  const unchangedFingerprint="1f70e9b625149d20fe28e053e8dd71f7a3c06c013772c46842d3b7f55bef145a";
  const changed={...candidate,sourceIdentity:"node/2",name:"Pilot Café Renamed"};
  const fresh={...candidate,sourceIdentity:"node/3",name:"Fresh Pilot Café"};
  const changedBaseline={...candidate,sourceIdentity:"node/2"};
  const baseline=await planRefreshCandidates([candidate,changedBaseline],[]);
  const decisions=await planRefreshCandidates([candidate,changed,fresh],[
    {identity_key:unchangedIdentity,source_fingerprint:unchangedFingerprint,matched_spot_id:"spot-1"},
    {identity_key:baseline[1].identityKey,source_fingerprint:baseline[1].sourceFingerprint,matched_spot_id:"spot-2"},
  ]);
  if(decisions[0].identityKey!==unchangedIdentity||decisions[0].sourceFingerprint!==unchangedFingerprint||decisions[0].reason!=="UNCHANGED_SOURCE_SKIP")throw new Error("unchanged source must skip deep work");
  if(decisions[1].reason!=="SOURCE_CHANGED"||decisions[1].previous?.matched_spot_id!=="spot-2")throw new Error("changed known identity must preserve lineage and route to review");
  if(decisions[2].reason!=="NEW_CANDIDATE"||decisions[2].previous!==null)throw new Error("new refresh identity must route to identity review");
});
