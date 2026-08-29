import { googleMatch, type Candidate } from "./index.ts";

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
