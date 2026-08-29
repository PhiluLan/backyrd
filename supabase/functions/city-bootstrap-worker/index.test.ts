import { evaluatePilotAcceptance, evaluateScaleBatchIntegrity, evaluateScaleFinalization, googleMatch, planRefreshCandidates, selectResearchCohort, selectResearchEligible, websiteIdentityCompatible, type Candidate } from "./index.ts";

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

Deno.test("Pilot acceptance requires reviewed, audited, persistent SPOT proposals", () => {
  const jobs=Array.from({length:10},(_,index)=>({id:`00000000-0000-0000-0000-${String(index).padStart(12,"0")}`,state:index===9?"FAILED":"READY_FOR_REVIEW",proposal_count:index<7?1:0,failure_code:index===9?"research_source_not_official:3":null}));
  const proposals=jobs.slice(0,7).map((job,index)=>({id:`10000000-0000-0000-0000-${String(index).padStart(12,"0")}`,status:"ACCEPTED",reviewed_by:"founder",idempotency_key:`research-v2.1:${job.id}:A:0`,research_entity_scope:"SPOT",research_durability:"PERSISTENT",research_scope_resolution:"PASS"}));
  const proposalIds=proposals.map((proposal)=>proposal.id),spotIds=Array.from({length:30},(_,index)=>`spot-${index}`),googleIds=Array.from({length:30},(_,index)=>`google-${index}`);
  const pass=evaluatePilotAcceptance({publishedCandidateCount:30,publishedSpotIds:spotIds,googlePlaceIds:googleIds,openBootstrapReviews:0,incompleteBootstrapJobs:0,researchJobs:jobs,proposals,acceptedProposalIds:proposalIds,auditedProposalIds:proposalIds});
  if(pass.verdict!=="PASS"||pass.metrics.unsupportedAutomaticCanonicalFacts!==0)throw new Error(`expected pilot PASS: ${pass.failures.join(",")}`);
  const scopedWrong=evaluatePilotAcceptance({publishedCandidateCount:30,publishedSpotIds:spotIds,googlePlaceIds:googleIds,openBootstrapReviews:0,incompleteBootstrapJobs:0,researchJobs:jobs,proposals:proposals.map((proposal,index)=>index===0?{...proposal,research_entity_scope:"EVENT"}:proposal),acceptedProposalIds:proposalIds,auditedProposalIds:proposalIds});
  if(scopedWrong.verdict!=="FAIL"||!scopedWrong.failures.includes("pilot_entity_scope_invalid"))throw new Error("non-SPOT evidence must fail pilot acceptance");
  const unreviewed=evaluatePilotAcceptance({publishedCandidateCount:30,publishedSpotIds:spotIds,googlePlaceIds:googleIds,openBootstrapReviews:0,incompleteBootstrapJobs:0,researchJobs:jobs,proposals:proposals.map((proposal,index)=>index===0?{...proposal,reviewed_by:null}:proposal),acceptedProposalIds:proposalIds,auditedProposalIds:proposalIds});
  if(unreviewed.verdict!=="FAIL"||unreviewed.metrics.unsupportedAutomaticCanonicalFacts!==1)throw new Error("automatic canonical fact must fail pilot acceptance");
});

Deno.test("Scale batch circuit breaker fails closed on systemic integrity anomalies", () => {
  const healthy=evaluateScaleBatchIntegrity({attemptedCandidateCount:2,publishedSpotIds:["spot-1","spot-2"],googleDuplicateGroups:0,normalizedIdentityDuplicateGroups:0,fixtureLeakage:0,publishedWithoutSpot:0,openReviews:0,failedBootstrapJobs:0,distributionIneligible:0});
  if(healthy.verdict!=="PASS")throw new Error("healthy scale batch must pass");
  const failed=evaluateScaleBatchIntegrity({attemptedCandidateCount:2,publishedSpotIds:["spot-1","spot-1"],googleDuplicateGroups:1,normalizedIdentityDuplicateGroups:1,fixtureLeakage:1,publishedWithoutSpot:1,openReviews:1,failedBootstrapJobs:1,distributionIneligible:1});
  for(const expected of ["SCALE_BATCH_IDENTITY_INVALID","GOOGLE_IDENTITY_DUPLICATE","NORMALIZED_IDENTITY_DUPLICATE","FIXTURE_LEAKAGE","PUBLISHED_WITHOUT_SPOT","OPEN_IDENTITY_REVIEW","BOOTSTRAP_QUEUE_FAILURE","DISTRIBUTION_GUARD_FAILURE"])if(!failed.failures.includes(expected))throw new Error(`missing circuit breaker: ${expected}`);
});

Deno.test("Scale finalization requires complete candidates, jobs, reviews, and contiguous PASS checkpoints", () => {
  const healthy=evaluateScaleFinalization({candidateCount:247,unfinishedCandidates:0,openReviews:0,incompleteJobs:0,failedJobs:0,websiteIdentityMismatches:0,checkpointBatches:[1,2,3],checkpointVerdicts:["PASS","PASS","PASS"]});
  if(healthy.verdict!=="PASS"||healthy.metrics.lastBatch!==3)throw new Error("healthy scale run must finalize");
  const failed=evaluateScaleFinalization({candidateCount:247,unfinishedCandidates:1,openReviews:1,incompleteJobs:1,failedJobs:1,websiteIdentityMismatches:1,checkpointBatches:[1,3],checkpointVerdicts:["PASS","FAIL"]});
  for(const expected of ["SCALE_CANDIDATES_UNFINISHED","SCALE_IDENTITY_REVIEWS_OPEN","SCALE_BOOTSTRAP_JOBS_INCOMPLETE","SCALE_BOOTSTRAP_JOBS_FAILED","SCALE_WEBSITE_IDENTITY_MISMATCH","SCALE_CHECKPOINT_LINEAGE_INVALID"])if(!failed.failures.includes(expected))throw new Error(`missing finalization guard: ${expected}`);
});

Deno.test("Scale website identity blocks stale social and sibling evidence", () => {
  if(websiteIdentityCompatible("Bridge Bar","https://facebook.com/pg/barbrutbasel/about"))throw new Error("stale social brand accepted");
  if(!websiteIdentityCompatible("Bridge Bar","https://bridge-bar.ch/"))throw new Error("canonical venue domain rejected");
  if(websiteIdentityCompatible("Robi Bachgraben","https://robi-spiel-aktionen.ch/angebot/robi-volta.html"))throw new Error("sibling venue path accepted");
  if(!websiteIdentityCompatible("Robi Bachgraben","https://robi-spiel-aktionen.ch/spielplaetze.php"))throw new Error("operator overview rejected");
  if(websiteIdentityCompatible("Oscar One","https://kitchenbrew.ch/locations/oscar-two"))throw new Error("operator sibling accepted");
  if(!websiteIdentityCompatible("Stucki","https://tanjagrandits.ch/restaurant-stucki/"))throw new Error("valid operator URL rejected");
  if(!websiteIdentityCompatible("Negishi Sushi Bar","https://negishi.ch/basel-steinen"))throw new Error("valid location path rejected");
});
