import { classifyMachineAcceptanceResult, classifyPopulationWorkerInvocations, evaluateIntelligenceCanaryReadiness, evaluatePilotAcceptance, evaluatePopulationTickReadiness, evaluateScaleBatchIntegrity, evaluateScaleFinalization, googleMatch, planProviderCreditCanary, planRefreshCandidates, populationResearchConcurrencyLimit, proposalBelongsToResearchJobs, selectIntelligenceCanary, selectResearchCohort, selectResearchEligible, systemicResearchFailure, unresolvedResearchFailures, websiteIdentityCompatible, type Candidate } from "./index.ts";

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

Deno.test("Intelligence canary is deterministic, archetype-breadth first and always includes the physical regression Spot", () => {
  const reference="545a8ee5-14bd-4887-b4e3-42d3271aa736";
  const rows=[{id:reference,category_id:"hotel",website:"https://reference.example/"},...Array.from({length:18},(_,index)=>({id:`61000000-0000-4000-8000-${String(index).padStart(12,"0")}`,category_id:["museum","cafe","activity"][index%3],website:index===17?null:`https://spot-${index}.example/`}))];
  const first=selectIntelligenceCanary(rows,reference,"canary-seed",10),second=selectIntelligenceCanary([...rows].reverse(),reference,"canary-seed",10);
  if(first.length!==10||first[0].id!==reference)throw new Error("reference Spot or canary bound missing");
  if(first.map((row)=>row.id).join(",")!==second.map((row)=>row.id).join(","))throw new Error("canary selection depends on input order");
  if(new Set(first.slice(1,4).map((row)=>row.category_id)).size!==3)throw new Error("canary lacks archetype breadth");
  if(first.some((row)=>!row.website))throw new Error("canary included a Spot without a researchable official website");
});

Deno.test("Intelligence canary cannot pass while either research cohort is still active", () => {
  const proposal={id:"61000000-0000-4000-8000-000000000099",field_key:"contact.phone",status:"ACCEPTED",research_entity_scope:"SPOT",research_durability:"PERSISTENT",research_scope_resolution:"PASS",machine_evidence_fingerprint:"a".repeat(64),resolution_note:"SYSTEM_POLICY:backyrd-machine-acceptance-v1"};
  const items=Array.from({length:8},()=>({terminal_state:"PROCESSED_WITH_SUPPORTED_FACTS"}));
  const result=evaluateIntelligenceCanaryReadiness({items,jobs:[{state:"READY_FOR_REVIEW",failure_code:null},{state:"QUEUED",failure_code:null}],accepted:[proposal],inspectedProposalIds:[proposal.id]});
  if(!result.failures.includes("CANARY_JOBS_INCOMPLETE"))throw new Error("active continued research cohort did not block canary finalization");
});

Deno.test("Population tick queues only after the prior cohort is terminal and finalizes only at full coverage", () => {
  const active=evaluatePopulationTickReadiness({runningRuns:1,activeJobs:1,pendingSpots:405,machineAcceptanceFailures:0});
  if(active.shouldQueue||active.shouldFinalize)throw new Error("active cohort allowed overlapping Population work");
  const next=evaluatePopulationTickReadiness({runningRuns:1,activeJobs:0,pendingSpots:405,machineAcceptanceFailures:0});
  if(!next.ok||!next.shouldQueue||next.shouldFinalize)throw new Error("terminal cohort did not allow the next bounded queue");
  const done=evaluatePopulationTickReadiness({runningRuns:1,activeJobs:0,pendingSpots:0,machineAcceptanceFailures:0});
  if(!done.ok||done.shouldQueue||!done.shouldFinalize)throw new Error("complete coverage did not route to finalization");
});

Deno.test("Population tick fails closed for concurrent runs and Machine Acceptance failures", () => {
  const concurrent=evaluatePopulationTickReadiness({runningRuns:2,activeJobs:0,pendingSpots:415,machineAcceptanceFailures:0});
  if(concurrent.ok||!concurrent.failures.includes("MULTIPLE_RUNNING_POPULATION_RUNS"))throw new Error("multiple Population runs were not rejected");
  const acceptance=evaluatePopulationTickReadiness({runningRuns:1,activeJobs:0,pendingSpots:400,machineAcceptanceFailures:1});
  if(acceptance.ok||!acceptance.failures.includes("MACHINE_ACCEPTANCE_FAILURE"))throw new Error("Machine Acceptance failure did not trip the circuit breaker");
});

Deno.test("Population throughput cannot exceed the Founder-approved concurrency-four canary result", () => {
  if(populationResearchConcurrencyLimit!==4)throw new Error("Population concurrency limit drifted from the measured canary");
});

Deno.test("Population skips isolated transient worker invocation failures without weakening hard boundaries", () => {
  const isolated=classifyPopulationWorkerInvocations([
    {status:200,errorCode:null,transportError:false},
    {status:200,errorCode:null,transportError:false},
    {status:200,errorCode:null,transportError:false},
    {status:503,errorCode:null,transportError:false},
  ],4);
  if(!isolated.ok||isolated.transientSkipped.length!==1||isolated.hardFailures.length)throw new Error("isolated platform 503 did not skip safely");
  const transport=classifyPopulationWorkerInvocations([{status:0,errorCode:null,transportError:true}],1);
  if(!transport.ok||transport.transientSkipped[0]!=="TRANSPORT_ERROR")throw new Error("isolated transport failure did not defer to the next checkpoint tick");
  for(const failure of [
    {status:403,errorCode:"forbidden",transportError:false},
    {status:503,errorCode:"server_configuration_missing",transportError:false},
    {status:503,errorCode:"research_agent_disabled",transportError:false},
  ])if(classifyPopulationWorkerInvocations([failure],1).ok)throw new Error(`hard worker boundary was skipped: ${failure.errorCode}`);
  if(classifyPopulationWorkerInvocations([],1).ok)throw new Error("missing worker result did not fail closed");
});

Deno.test("Machine Acceptance isolates explicit truth conflicts for review and keeps all other denials fail-closed", () => {
  for(const code of ["machine_acceptance_source_conflict","machine_acceptance_existing_truth_conflict"]){
    const result=classifyMachineAcceptanceResult(code);
    if(result.disposition!=="REVIEW_REQUIRED"||result.errorCode!==code)throw new Error(`review conflict was not isolated: ${code}`);
  }
  for(const code of ["machine_acceptance_fingerprint_stale","machine_acceptance_scope_invalid","machine_acceptance_source_identity_invalid","machine_acceptance_evidence_malformed","machine_acceptance_policy_invalid","forbidden"]){
    if(classifyMachineAcceptanceResult(code).disposition!=="HARD_FAILURE")throw new Error(`hard Machine Acceptance boundary was weakened: ${code}`);
  }
  if(classifyMachineAcceptanceResult(null).disposition!=="ACCEPTED")throw new Error("successful Machine Acceptance was not classified as accepted");
});

Deno.test("Population systemic failure circuit breaker counts distinct Spots, not dual research cohorts", () => {
  const duplicated=systemicResearchFailure([
    {spot_id:"spot-1",failure_code:"research_source_not_official:0"},
    {spot_id:"spot-1",failure_code:"research_source_not_official:0"},
    {spot_id:"spot-2",failure_code:"research_source_not_official:0"},
  ]);
  if(duplicated)throw new Error("one Spot with two cohorts incorrectly tripped the systemic circuit breaker");
  const systemic=systemicResearchFailure([
    {spot_id:"spot-1",failure_code:"research_source_not_official:0"},
    {spot_id:"spot-2",failure_code:"research_source_not_official:0"},
    {spot_id:"spot-3",failure_code:"research_source_not_official:0"},
  ]);
  if(systemic?.failureCode!=="research_source_not_official:0"||systemic.count!==3)throw new Error("three distinct Spots did not trip the systemic circuit breaker");
  const remediated=systemicResearchFailure([
    {spot_id:"spot-1",failure_code:"research_source_invalid:0",created_at:"2026-08-29T10:00:00Z"},
    {spot_id:"spot-2",failure_code:"research_source_invalid:0",created_at:"2026-08-29T10:00:00Z"},
    {spot_id:"spot-3",failure_code:"research_source_invalid:0",created_at:"2026-08-29T12:00:01Z"},
    {spot_id:"spot-4",failure_code:"research_source_invalid:0",created_at:"2026-08-29T12:00:02Z"},
  ],3,"2026-08-29T12:00:00Z");
  if(remediated)throw new Error("acknowledged historical failures incorrectly retripped the circuit breaker");
  const retripped=systemicResearchFailure([
    {spot_id:"spot-3",failure_code:"research_source_invalid:0",created_at:"2026-08-29T12:00:01Z"},
    {spot_id:"spot-4",failure_code:"research_source_invalid:0",created_at:"2026-08-29T12:00:02Z"},
    {spot_id:"spot-5",failure_code:"research_source_invalid:0",created_at:"2026-08-29T12:00:03Z"},
  ],3,"2026-08-29T12:00:00Z");
  if(retripped?.count!==3)throw new Error("three post-remediation Spots did not retrip the circuit breaker");
  const independentlyReset=unresolvedResearchFailures([
    {failure_code:"research_source_invalid:0",created_at:"2026-08-29T10:00:00Z"},
    {failure_code:"research_provider_failed",created_at:"2026-08-29T11:00:00Z"},
    {failure_code:"research_provider_failed",created_at:"2026-08-29T13:00:00Z"},
  ],{"research_source_invalid:0":"2026-08-29T12:00:00Z","research_provider_failed":"2026-08-29T12:00:00Z"});
  if(independentlyReset.length!==1||independentlyReset[0].created_at!=="2026-08-29T13:00:00Z")throw new Error("failure-class-specific circuit resets are not isolated");
  const coverageReset=unresolvedResearchFailures([
    {failure_code:"research_fact_coverage_incomplete",created_at:"2026-08-29T11:00:00Z"},
    {failure_code:"research_fact_coverage_incomplete",created_at:"2026-08-29T13:00:00Z"},
  ],{"research_fact_coverage_incomplete":"2026-08-29T12:00:00Z"});
  if(coverageReset.length!==1||coverageReset[0].created_at!=="2026-08-29T13:00:00Z")throw new Error("coverage remediation reset is not failure-class specific");
});

Deno.test("Provider-credit resume preserves bounded queued checkpoint jobs in the canary", () => {
  const plan=planProviderCreditCanary([
    {spot_id:"spot-b",state:"QUEUED"},{spot_id:"spot-b",state:"QUEUED"},
    {spot_id:"spot-a",state:"QUEUED"},{spot_id:"spot-a",state:"QUEUED"},
  ],["spot-c","spot-d","spot-e","spot-f"]);
  if(!plan.ok||plan.canarySpotIds.join(",")!=="spot-a,spot-b,spot-c,spot-d,spot-e")throw new Error(`checkpoint canary invalid: ${plan.failures.join(",")}`);
  const running=planProviderCreditCanary([{spot_id:"spot-a",state:"RUNNING"}], ["spot-b","spot-c","spot-d","spot-e"]);
  if(running.ok||!running.failures.includes("ACTIVE_JOB_NOT_QUEUED"))throw new Error("RUNNING checkpoint job did not fail closed");
  const duplicate=planProviderCreditCanary([{spot_id:"spot-a",state:"QUEUED"},{spot_id:"spot-a",state:"QUEUED"},{spot_id:"spot-a",state:"QUEUED"}], ["spot-b","spot-c","spot-d","spot-e"]);
  if(duplicate.ok||!duplicate.failures.includes("QUEUED_JOB_DUPLICATE_COHORT"))throw new Error("duplicate queued cohort did not fail closed");
});

Deno.test("Machine Acceptance proposal scan retains exact Research job lineage", () => {
  const jobId="61000000-0000-4000-8000-000000000001",jobs=new Set([jobId]);
  if(!proposalBelongsToResearchJobs(`research-v2.1:${jobId}:A:0`,jobs))throw new Error("exact run job proposal was excluded");
  if(proposalBelongsToResearchJobs("research-v2.1:61000000-0000-4000-8000-000000000002:A:0",jobs))throw new Error("foreign run job proposal was included");
  if(proposalBelongsToResearchJobs(`research-v2.1:${jobId}x:A:0`,jobs)||proposalBelongsToResearchJobs(`other:${jobId}:A:0`,jobs))throw new Error("malformed proposal lineage was included");
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
