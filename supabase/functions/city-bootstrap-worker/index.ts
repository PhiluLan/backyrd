import { createClient } from "npm:@supabase/supabase-js@2";

const json = (body: unknown, status = 200) => new Response(JSON.stringify(body), { status, headers: { "content-type": "application/json", "cache-control": "no-store" } });
const clean = (value: unknown) => typeof value === "string" ? value.trim() : "";
const normalize = (value: unknown) => clean(value).normalize("NFKD").replace(/[\u0300-\u036f]/g, "").toLowerCase().replace(/[^a-z0-9]+/g, " ").trim();
const tokens = (value: unknown) => new Set(normalize(value).split(" ").filter((part) => part.length > 1));
const similarity = (a: unknown, b: unknown) => { const x=tokens(a),y=tokens(b),union=new Set([...x,...y]); return union.size ? [...x].filter((part)=>y.has(part)).length/union.size : 0; };
const distance = (aLat:number,aLng:number,bLat:number,bLng:number) => { const r=6371000,dLat=(bLat-aLat)*Math.PI/180,dLng=(bLng-aLng)*Math.PI/180,s=Math.sin(dLat/2)**2+Math.cos(aLat*Math.PI/180)*Math.cos(bLat*Math.PI/180)*Math.sin(dLng/2)**2;return 2*r*Math.asin(Math.sqrt(s)); };
async function sha256(value: unknown) { const bytes=new TextEncoder().encode(JSON.stringify(value));return [...new Uint8Array(await crypto.subtle.digest("SHA-256",bytes))].map((byte)=>byte.toString(16).padStart(2,"0")).join(""); }
const permittedCategory = new Set(["Restaurant","Bar","Café","Museum","Aktivität","Besonderes Erlebnis","Spaziergang","Unterkunft / Hotel","Aussichtspunkt","Wellness / Spa"]);
export type Candidate = {sourceFamily:string;sourceIdentity:string;name:string;normalizedName?:string;address:string;normalizedAddress?:string;city:string;country:string;lat:number;lng:number;website:string;phone?:string|null;externalTypes:string[];relevance:{state:string;reason?:string;confidence:string;categoryName:string};identity:{state:string;confidence:string;spotId?:string};lifecycleState:string;sourceQuality?:number};

export function selectResearchCohort<T extends { canonical_category_name?: unknown }>(rows: T[], limit = 10) {
  const groups=new Map<string,T[]>();for(const row of rows){const key=clean(row.canonical_category_name)||"UNKNOWN",group=groups.get(key)??[];group.push(row);groups.set(key,group);}const selected:T[]=[];while(selected.length<limit&&[...groups.values()].some((group)=>group.length)){for(const key of [...groups.keys()].sort()){const row=groups.get(key)?.shift();if(row)selected.push(row);if(selected.length>=limit)break;}}return selected;
}

const stableSeedRank = (value: string) => { let hash=2166136261;for(const char of value){hash^=char.charCodeAt(0);hash=Math.imul(hash,16777619);}return hash>>>0; };
export function selectIntelligenceCanary<T extends { id?: unknown; category_id?: unknown; website?: unknown }>(rows:T[],referenceSpotId:string,seed:string,limit=10){
  const eligible=rows.filter((row)=>/^[0-9a-f-]{36}$/.test(clean(row.id))&&publicHost(row.website));
  const reference=eligible.find((row)=>clean(row.id)===referenceSpotId),groups=new Map<string,T[]>();
  for(const row of eligible.filter((item)=>item!==reference)){const key=clean(row.category_id)||"UNKNOWN",group=groups.get(key)??[];group.push(row);groups.set(key,group);}
  for(const [key,group] of groups)group.sort((a,b)=>stableSeedRank(`${seed}:${key}:${clean(a.id)}`)-stableSeedRank(`${seed}:${key}:${clean(b.id)}`)||clean(a.id).localeCompare(clean(b.id)));
  const selected:T[]=reference?[reference]:[];
  while(selected.length<limit&&[...groups.values()].some((group)=>group.length)){for(const key of [...groups.keys()].sort()){const row=groups.get(key)?.shift();if(row)selected.push(row);if(selected.length>=limit)break;}}
  return selected;
}

export function evaluateIntelligenceCanaryReadiness(input:{items:any[];jobs:any[];accepted:any[];inspectedProposalIds:string[]}){
  const terminal=new Set(["PROCESSED_WITH_SUPPORTED_FACTS","PROCESSED_UNKNOWN","REVIEW_REQUIRED","NOT_APPLICABLE","FAILED_WITH_EXPLICIT_REASON"]),failures:string[]=[];
  const actualIds=input.accepted.map((proposal:any)=>clean(proposal.id)).sort(),inspected=[...input.inspectedProposalIds].sort();
  if(input.items.length<8||input.items.length>12)failures.push("CANARY_SIZE_INVALID");
  if(input.items.some((item:any)=>!terminal.has(clean(item.terminal_state))))failures.push("CANARY_NOT_TERMINAL");
  if(input.jobs.some((job:any)=>!["READY_FOR_REVIEW","FAILED"].includes(clean(job.state))))failures.push("CANARY_JOBS_INCOMPLETE");
  if(input.items.some((item:any)=>item.terminal_state==="FAILED_WITH_EXPLICIT_REASON")||input.jobs.some((job:any)=>job.state==="FAILED"||clean(job.failure_code)))failures.push("CANARY_RESEARCH_FAILED");
  if(!input.accepted.length)failures.push("CANARY_AUTO_ACCEPTANCE_UNPROVEN");
  if(actualIds.join(",")!==inspected.join(","))failures.push("CANARY_MANUAL_INSPECTION_INCOMPLETE");
  if(input.accepted.some((proposal:any)=>!["contact.website","contact.phone","contact.email","opening.regular"].includes(clean(proposal.field_key))||proposal.status!=="ACCEPTED"||proposal.research_entity_scope!=="SPOT"||proposal.research_durability!=="PERSISTENT"||proposal.research_scope_resolution!=="PASS"||!clean(proposal.machine_evidence_fingerprint)||proposal.resolution_note!=="SYSTEM_POLICY:backyrd-machine-acceptance-v1"))failures.push("UNSUPPORTED_AUTO_ACCEPTED_FACT");
  return {failures,actualIds};
}

const publicHost = (value: unknown) => { try { const url=new URL(clean(value));return url.protocol==="https:"&&!url.username&&!url.password?url.hostname.toLowerCase().replace(/^www\./,""):"";}catch{return "";} };
const genericWebsiteNameTokens=new Set(["basel","restaurant","restaurants","cafe","bar","bars","hotel","hotels","hostel","museum","museums","theater","theatre","fitness","studio","club","zentrum","center","centre","schweiz","switzerland","official","page","about","www","com","ch","de","und","and","am","an","der","die","das","zum","zur","im","in","of","at","place","brewery","kitchen","soulfood","pizza","pizzeria","sushi","food","confiserie","konditorei","tea","room","bistrot","gasthof","restauration"]);
const genericWebsitePathTokens=new Set([...genericWebsiteNameTokens,"angebot","angebote","location","locations","standort","standorte","detail","index","html","php","store","locator","search","spielplatz","spielplaetze","schwimmbad","reservieren","suite","suites","stadt"]);
const identityStrictWebsiteHosts=["facebook.com","instagram.com","linkedin.com","tiktok.com","twitter.com","x.com","linktr.ee","wixsite.com"];

export function websiteIdentityCompatible(name: unknown,website: unknown) {
  if(!clean(website))return true;
  let parsed:URL;try{parsed=new URL(clean(website));}catch{return false;}
  if(parsed.protocol!=="https:"||parsed.username||parsed.password)return false;
  const subjectTokens=normalize(name).split(" ").filter((token)=>token.length>=2&&!genericWebsiteNameTokens.has(token));
  if(!subjectTokens.length)return false;
  const websiteIdentity=normalize(`${parsed.hostname} ${parsed.pathname} ${parsed.search}`).replaceAll(" ","");
  const matches=subjectTokens.map((token)=>websiteIdentity.includes(token));
  if(matches.every(Boolean))return true;
  const host=parsed.hostname.toLowerCase().replace(/^www\./,"").replace(/\.$/,"");
  if(identityStrictWebsiteHosts.some((expected)=>host===expected||host.endsWith(`.${expected}`)))return false;
  if(!matches.some(Boolean))return true;
  const subjectSet=new Set(subjectTokens),pathHasCompetingIdentity=normalize(parsed.pathname).split(" ").some((token)=>/^[a-z]{2,}$/.test(token)&&!subjectSet.has(token)&&!genericWebsitePathTokens.has(token));
  return !pathHasCompetingIdentity;
}

async function websiteIdentityMismatches(db:any,runId:string) {
  const {data,error}=await db.from("backyrd_city_bootstrap_candidates_v1").select("id,display_name,website,lifecycle_state").eq("run_id",runId).in("lifecycle_state",["PRODUCT_ELIGIBLE","PUBLISHED"]);if(error)throw error;
  return (data??[]).filter((row:any)=>!websiteIdentityCompatible(row.display_name,row.website));
}

export function selectResearchEligible<T extends { matched_spot_id?: unknown }>(rows: T[], spots: Array<{ id?: unknown; website?: unknown }>, exclusions: { spotIds?: Iterable<string>; hosts?: Iterable<string> } = {}) {
  const excludedSpotIds=new Set(exclusions.spotIds??[]),excludedHosts=new Set(exclusions.hosts??[]);
  const readySpotIds=new Set(spots.filter((spot)=>{const id=clean(spot.id),host=publicHost(spot.website);return id&&host&&!excludedSpotIds.has(id)&&!excludedHosts.has(host);}).map((spot)=>clean(spot.id)));
  return rows.filter((row)=>readySpotIds.has(clean(row.matched_spot_id)));
}

export type PilotAcceptanceInput = {
  publishedCandidateCount: number;
  publishedSpotIds: string[];
  googlePlaceIds: string[];
  openBootstrapReviews: number;
  incompleteBootstrapJobs: number;
  researchJobs: Array<{ id: string; state: string; proposal_count: number; failure_code?: string | null }>;
  proposals: Array<{ id: string; status: string; reviewed_by?: string | null; idempotency_key: string; research_entity_scope?: string | null; research_durability?: string | null; research_scope_resolution?: string | null }>;
  acceptedProposalIds: string[];
  auditedProposalIds: string[];
};

export function evaluatePilotAcceptance(input: PilotAcceptanceInput) {
  const jobIds=new Set(input.researchJobs.map((job)=>job.id)),proposalIds=new Set(input.proposals.map((proposal)=>proposal.id));
  const safeFailure=(job:PilotAcceptanceInput["researchJobs"][number])=>job.state==="FAILED"&&/^research_source_not_official:[1-4]$/.test(clean(job.failure_code));
  const failures:string[]=[];
  if(input.publishedCandidateCount<20||input.publishedCandidateCount>30)failures.push("pilot_published_count_invalid");
  if(new Set(input.publishedSpotIds).size!==input.publishedCandidateCount)failures.push("pilot_spot_identity_duplicate");
  if(new Set(input.googlePlaceIds).size!==input.publishedCandidateCount)failures.push("pilot_google_identity_duplicate");
  if(input.openBootstrapReviews!==0)failures.push("pilot_bootstrap_reviews_open");
  if(input.incompleteBootstrapJobs!==0)failures.push("pilot_bootstrap_jobs_incomplete");
  if(input.researchJobs.length!==10||jobIds.size!==10)failures.push("pilot_research_cohort_invalid");
  if(input.researchJobs.some((job)=>job.state!=="READY_FOR_REVIEW"&&!safeFailure(job)))failures.push("pilot_research_failure_unexplained");
  const expectedProposalCount=input.researchJobs.reduce((sum,job)=>sum+job.proposal_count,0);
  if(input.proposals.length!==expectedProposalCount||proposalIds.size!==expectedProposalCount)failures.push("pilot_proposal_set_incomplete");
  if(input.proposals.some((proposal)=>proposal.status!=="ACCEPTED"||!clean(proposal.reviewed_by)))failures.push("pilot_human_review_incomplete");
  if(input.proposals.some((proposal)=>proposal.research_entity_scope!=="SPOT"||proposal.research_durability!=="PERSISTENT"||proposal.research_scope_resolution!=="PASS"))failures.push("pilot_entity_scope_invalid");
  if(input.proposals.some((proposal)=>![...jobIds].some((jobId)=>proposal.idempotency_key.startsWith(`research-v2.1:${jobId}:`))))failures.push("pilot_proposal_lineage_invalid");
  if(new Set(input.acceptedProposalIds).size!==proposalIds.size||input.acceptedProposalIds.some((id)=>!proposalIds.has(id)))failures.push("pilot_accepted_fact_incomplete");
  if(new Set(input.auditedProposalIds).size!==proposalIds.size||input.auditedProposalIds.some((id)=>!proposalIds.has(id)))failures.push("pilot_review_audit_incomplete");
  return {verdict:failures.length?"FAIL":"PASS",failures,metrics:{publishedCandidates:input.publishedCandidateCount,researchJobs:input.researchJobs.length,researchReady:input.researchJobs.filter((job)=>job.state==="READY_FOR_REVIEW").length,researchSafeFailures:input.researchJobs.filter(safeFailure).length,proposals:input.proposals.length,accepted:input.proposals.filter((proposal)=>proposal.status==="ACCEPTED").length,unsupportedAutomaticCanonicalFacts:input.proposals.filter((proposal)=>proposal.status==="ACCEPTED"&&!clean(proposal.reviewed_by)).length}};
}

export type ScaleBatchIntegrity = { attemptedCandidateCount:number;publishedSpotIds:string[];googleDuplicateGroups:number;normalizedIdentityDuplicateGroups:number;fixtureLeakage:number;publishedWithoutSpot:number;openReviews:number;failedBootstrapJobs:number;distributionIneligible:number };
export function evaluateScaleBatchIntegrity(input: ScaleBatchIntegrity) {
  const failures:string[]=[];
  if(input.attemptedCandidateCount<1||input.attemptedCandidateCount>20||input.publishedSpotIds.length!==input.attemptedCandidateCount||new Set(input.publishedSpotIds).size!==input.publishedSpotIds.length)failures.push("SCALE_BATCH_IDENTITY_INVALID");
  if(input.googleDuplicateGroups>0)failures.push("GOOGLE_IDENTITY_DUPLICATE");
  if(input.normalizedIdentityDuplicateGroups>0)failures.push("NORMALIZED_IDENTITY_DUPLICATE");
  if(input.fixtureLeakage>0)failures.push("FIXTURE_LEAKAGE");
  if(input.publishedWithoutSpot>0)failures.push("PUBLISHED_WITHOUT_SPOT");
  if(input.openReviews>0)failures.push("OPEN_IDENTITY_REVIEW");
  if(input.failedBootstrapJobs>0)failures.push("BOOTSTRAP_QUEUE_FAILURE");
  if(input.distributionIneligible>0)failures.push("DISTRIBUTION_GUARD_FAILURE");
  return {verdict:failures.length?"FAIL":"PASS",failures};
}

export type ScaleFinalizationInput = { candidateCount:number;unfinishedCandidates:number;openReviews:number;incompleteJobs:number;failedJobs:number;websiteIdentityMismatches:number;checkpointBatches:number[];checkpointVerdicts:string[] };
export function evaluateScaleFinalization(input: ScaleFinalizationInput) {
  const failures:string[]=[];
  const sorted=[...input.checkpointBatches].sort((a,b)=>a-b),contiguous=sorted.length>0&&sorted.every((batch,index)=>batch===index+1);
  if(input.candidateCount<1)failures.push("SCALE_CANDIDATES_EMPTY");
  if(input.unfinishedCandidates>0)failures.push("SCALE_CANDIDATES_UNFINISHED");
  if(input.openReviews>0)failures.push("SCALE_IDENTITY_REVIEWS_OPEN");
  if(input.incompleteJobs>0)failures.push("SCALE_BOOTSTRAP_JOBS_INCOMPLETE");
  if(input.failedJobs>0)failures.push("SCALE_BOOTSTRAP_JOBS_FAILED");
  if(input.websiteIdentityMismatches>0)failures.push("SCALE_WEBSITE_IDENTITY_MISMATCH");
  if(!contiguous||input.checkpointVerdicts.length!==sorted.length||input.checkpointVerdicts.some((verdict)=>verdict!=="PASS"))failures.push("SCALE_CHECKPOINT_LINEAGE_INVALID");
  return {verdict:failures.length?"FAIL":"PASS",failures,metrics:{candidateCount:input.candidateCount,checkpointCount:sorted.length,lastBatch:sorted.at(-1)??null}};
}

type RefreshPrevious = {
  identity_key?: unknown;
  source_fingerprint?: unknown;
  identity_state?: unknown;
  identity_confidence?: unknown;
  matched_spot_id?: unknown;
  google_place_id?: unknown;
};

export type RefreshDecision = {
  candidate: Candidate;
  identityKey: string;
  sourceFingerprint: string;
  previous: RefreshPrevious | null;
  reason: "UNCHANGED_SOURCE_SKIP" | "SOURCE_CHANGED" | "NEW_CANDIDATE";
};

async function candidateIdentityHash(candidate: Candidate) {
  return sha256({sourceFamily:candidate.sourceFamily,sourceIdentity:candidate.sourceIdentity});
}

async function candidateSourceHash(candidate: Candidate) {
  return sha256({sourceIdentity:candidate.sourceIdentity,name:normalize(candidate.name),address:normalize(candidate.address),lat:candidate.lat,lng:candidate.lng,website:candidate.website,types:candidate.externalTypes});
}

export async function planRefreshCandidates(candidates: Candidate[], previousRows: RefreshPrevious[]) {
  const previousByIdentity=new Map<string,RefreshPrevious>();
  for(const row of previousRows){const key=clean(row.identity_key);if(key&&!previousByIdentity.has(key))previousByIdentity.set(key,row);}
  return Promise.all(candidates.map(async(candidate):Promise<RefreshDecision>=>{
    const identityKey=await candidateIdentityHash(candidate),sourceFingerprint=await candidateSourceHash(candidate),previous=previousByIdentity.get(identityKey)??null;
    const reason=!previous?"NEW_CANDIDATE":clean(previous.source_fingerprint)===sourceFingerprint?"UNCHANGED_SOURCE_SKIP":"SOURCE_CHANGED";
    return {candidate,identityKey,sourceFingerprint,previous,reason};
  }));
}

export async function googleMatch(candidate: Candidate, apiKey: string) {
  const started=Date.now(),controller=new AbortController(),timer=setTimeout(()=>controller.abort(),15_000);
  try {
    const response=await fetch("https://places.googleapis.com/v1/places:searchText",{method:"POST",signal:controller.signal,headers:{"content-type":"application/json","x-goog-api-key":apiKey,"x-goog-fieldmask":"places.id,places.displayName,places.formattedAddress,places.location"},body:JSON.stringify({textQuery:`${candidate.name}, ${candidate.address}, Basel, Switzerland`,pageSize:5,languageCode:"de",regionCode:"CH",locationBias:{circle:{center:{latitude:candidate.lat,longitude:candidate.lng},radius:500}}})});
    if(!response.ok) return {ok:false,code:`google_http_${response.status}`,latency:Date.now()-started};
    const payload=await response.json(),places=Array.isArray(payload?.places)?payload.places:[];
    const candidateAddress=normalize(candidate.address);
    const matches=places.map((place:any)=>({id:clean(place?.id),name:place?.displayName?.text,address:place?.formattedAddress,lat:Number(place?.location?.latitude),lng:Number(place?.location?.longitude)})).filter((place:any)=>place.id&&Number.isFinite(place.lat)&&Number.isFinite(place.lng)).map((place:any)=>({...place,meters:distance(candidate.lat,candidate.lng,place.lat,place.lng),score:similarity(candidate.name,place.name),addressMatch:Boolean(candidateAddress&&normalize(place.address).includes(candidateAddress))})).filter((place:any)=>place.meters<=250&&(place.score>=.65||(place.addressMatch&&place.score>=.45))).sort((a:any,b:any)=>Number(b.addressMatch)-Number(a.addressMatch)||b.score-a.score||a.meters-b.meters);
    if(!matches.length) return {ok:false,code:"google_identity_unmatched",latency:Date.now()-started};
    if(matches.length>1&&Math.abs(matches[0].score-matches[1].score)<.08&&Math.abs(matches[0].meters-matches[1].meters)<35) return {ok:false,code:"google_identity_ambiguous",latency:Date.now()-started};
    return {ok:true,placeId:matches[0].id,confidence:matches[0].addressMatch&&matches[0].score>=.85&&matches[0].meters<=100?"EXACT":"STRONG",latency:Date.now()-started};
  } catch(error) { return {ok:false,code:error instanceof DOMException&&error.name==="AbortError"?"google_timeout":"google_transport_error",latency:Date.now()-started}; }
  finally { clearTimeout(timer); }
}

async function googleHealth(apiKey: string) {
  const started=Date.now(),controller=new AbortController(),timer=setTimeout(()=>controller.abort(),15_000);
  try { const response=await fetch("https://places.googleapis.com/v1/places:searchNearby",{method:"POST",signal:controller.signal,headers:{"content-type":"application/json","x-goog-api-key":apiKey,"x-goog-fieldmask":"places.id"},body:JSON.stringify({maxResultCount:1,rankPreference:"DISTANCE",locationRestriction:{circle:{center:{latitude:47.5596,longitude:7.5886},radius:100}}})});if(!response.ok)return {ok:false,code:`google_http_${response.status}`,latency:Date.now()-started};const payload=await response.json();return {ok:Array.isArray(payload?.places),code:Array.isArray(payload?.places)?null:"google_schema_invalid",latency:Date.now()-started}; }
  catch(error){return {ok:false,code:error instanceof DOMException&&error.name==="AbortError"?"google_timeout":"google_transport_error",latency:Date.now()-started};}finally{clearTimeout(timer);}
}

export function evaluatePopulationTickReadiness(input:{runningRuns:number;activeJobs:number;pendingSpots:number;machineAcceptanceFailures:number}) {
  const failures:string[]=[];
  if(input.runningRuns>1)failures.push("MULTIPLE_RUNNING_POPULATION_RUNS");
  if(input.activeJobs<0||input.pendingSpots<0)failures.push("POPULATION_COUNTS_INVALID");
  if(input.machineAcceptanceFailures>0)failures.push("MACHINE_ACCEPTANCE_FAILURE");
  return {ok:failures.length===0,failures,shouldQueue:input.runningRuns===1&&input.activeJobs===0&&input.pendingSpots>0,shouldFinalize:input.runningRuns===1&&input.activeJobs===0&&input.pendingSpots===0};
}

async function kickPopulationResearch(db:any,url:string,serviceKey:string,populationRunId:string,workers=2) {
  const statuses:number[]=[];
  await Promise.all(Array.from({length:workers},async()=>{const response=await fetch(`${url}/functions/v1/research-spot-worker`,{method:"POST",headers:{authorization:`Bearer ${serviceKey}`,"content-type":"application/json"},body:JSON.stringify({populationRunId})});statuses.push(response.status);await response.body?.cancel();}));
  const {data:jobs,error:jobsError}=await db.from("backyrd_spot_research_jobs_v1").select("id").eq("population_run_id",populationRunId);if(jobsError)throw jobsError;
  const jobPrefixes=(jobs??[]).map((job:any)=>`research-v2.1:${job.id}:`),machineAccepted:any[]=[];
  if(jobPrefixes.length){
    const proposalScope=jobPrefixes.map((prefix:string)=>`idempotency_key.like.${prefix}*`).join(",");
    const {data:proposals,error:proposalError}=await db.from("backyrd_spot_fact_proposals_v1").select("id,idempotency_key,machine_evidence_fingerprint,field_key,status").eq("status","PENDING").in("field_key",["contact.website","contact.phone","contact.email","opening.regular"]).not("machine_evidence_fingerprint","is",null).or(proposalScope).limit(100);if(proposalError)throw proposalError;
    for(const proposal of (proposals??[]).filter((proposal:any)=>jobPrefixes.some((prefix:string)=>clean(proposal.idempotency_key).startsWith(prefix)))){const accepted=await db.rpc("backyrd_machine_accept_v1",{p_proposal_id:proposal.id,p_policy_version:"backyrd-machine-acceptance-v1",p_expected_evidence_fingerprint:proposal.machine_evidence_fingerprint});machineAccepted.push({proposalId:proposal.id,fieldKey:proposal.field_key,accepted:!accepted.error,error:accepted.error?.message??null});}
  }
  return {ok:statuses.every((status)=>status===200)&&machineAccepted.every((item)=>item.accepted),workers,statuses,machineAccepted};
}

if (import.meta.main) Deno.serve(async (request) => {
  if(request.method!=="POST") return json({ok:false,error:"method_not_allowed"},405);
  const url=Deno.env.get("CITY_BOOTSTRAP_SUPABASE_URL"),serviceKey=Deno.env.get("CITY_BOOTSTRAP_SUPABASE_SERVICE_KEY"),googleKey=Deno.env.get("GOOGLE_PLACES_API_KEY");
  const researchKey=Deno.env.get("OPENAI_API_KEY"),researchEnabled=Deno.env.get("SPOT_RESEARCH_AGENT_ENABLED")==="true",researchModel=Deno.env.get("SPOT_RESEARCH_MODEL");
  if(!url||!serviceKey||!googleKey) return json({ok:false,error:"server_configuration_missing"},503);
  if(request.headers.get("authorization")!==`Bearer ${serviceKey}`) return json({ok:false,error:"forbidden"},403);
  const db=createClient(url,serviceKey,{auth:{persistSession:false,autoRefreshToken:false}});
  const body=await request.json().catch(()=>({})),action=clean(body?.action);
  try {
    if(action==="HEALTH") {
      const probe=await googleHealth(googleKey);
      return json({ok:probe.ok,contracts:{googlePlaces:true,cityDatabaseUrl:true,cityServiceKey:true,researchProvider:Boolean(researchKey),researchEnabled,researchModel:Boolean(researchModel)},boundaries:{serverOnly:true,cityUrlMatchesRuntime:url===Deno.env.get("SUPABASE_URL"),cityServiceMatchesRuntime:serviceKey===Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")},googleProbe:{ok:probe.ok,code:probe.ok?null:probe.code,latencyMs:probe.latency}},probe.ok&&researchKey&&researchEnabled?200:503);
    }
    if(action==="ACTIVATE_POPULATION_AUTOMATION") {
      const {data:runs,error:runError}=await db.from("backyrd_city_bootstrap_runs_v1").select("id,mode,status,target_configuration").eq("mode","INTELLIGENCE").eq("status","RUNNING").eq("target_configuration->>phase","FULL_LAUNCH_CURATION").limit(2);if(runError)throw runError;
      if((runs??[]).length!==1)return json({ok:false,error:"single_running_population_required",runningRuns:(runs??[]).length},409);
      const configured=await db.rpc("backyrd_configure_intelligence_population_worker_v1",{p_worker_url:`${url}/functions/v1/city-bootstrap-worker`});if(configured.error)throw configured.error;
      return json({ok:true,runId:runs[0].id,schedule:"*/2 * * * *",researchConcurrencyLimit:2,discoveryEnabled:false});
    }
    if(action==="POPULATION_TICK") {
      if(!researchKey||!researchEnabled)return json({ok:false,error:"research_provider_unhealthy"},503);
      const {data:runs,error:runError}=await db.from("backyrd_city_bootstrap_runs_v1").select("id,requested_by,target_configuration").eq("mode","INTELLIGENCE").eq("status","RUNNING").eq("target_configuration->>phase","FULL_LAUNCH_CURATION").limit(2);if(runError)throw runError;
      const preflight=evaluatePopulationTickReadiness({runningRuns:(runs??[]).length,activeJobs:0,pendingSpots:0,machineAcceptanceFailures:0});
      if(!preflight.ok)return json({ok:false,error:"population_tick_preflight_failed",failures:preflight.failures},409);
      if(!(runs??[]).length)return json({ok:true,idle:true,reason:"NO_RUNNING_POPULATION"});
      const run=runs[0],leaseToken=crypto.randomUUID();
      const claim=await db.rpc("backyrd_intelligence_population_tick_control_v1",{p_run_id:run.id,p_action:"CLAIM",p_lease_token:leaseToken});if(claim.error)throw claim.error;
      if(!claim.data?.claimed)return json({ok:true,idle:true,reason:"LEASE_HELD",runId:run.id});
      let release=true;
      try {
        const [{data:actor},{data:active,error:activeError},{data:failedJobs,error:failedError},{count:pending,error:pendingError}]=await Promise.all([
          db.from("admin_users").select("user_id,role").eq("user_id",run.requested_by).in("role",["admin","super_admin"]).maybeSingle(),
          db.from("backyrd_spot_research_jobs_v1").select("id").eq("population_run_id",run.id).in("state",["QUEUED","RUNNING"]),
          db.from("backyrd_spot_research_jobs_v1").select("failure_code").eq("population_run_id",run.id).eq("state","FAILED"),
          db.from("backyrd_spot_intelligence_population_v1").select("spot_id",{count:"exact",head:true}).eq("run_id",run.id).eq("terminal_state","PENDING")
        ]);if(activeError||failedError||pendingError)throw activeError??failedError??pendingError;if(!actor)return json({ok:false,error:"population_tick_actor_lineage_invalid"},403);
        const failureCounts=(failedJobs??[]).reduce((counts:Record<string,number>,job:any)=>{const code=clean(job.failure_code)||"UNCLASSIFIED";counts[code]=(counts[code]??0)+1;return counts;},{}),systemicFailure=Object.entries(failureCounts).find(([,count])=>count>=3);
        if(systemicFailure){await db.from("backyrd_city_bootstrap_runs_v1").update({status:"PAUSED",stop_reason:`CIRCUIT_BREAKER:SYSTEMATIC_RESEARCH_FAILURE:${systemicFailure[0]}`.slice(0,500)}).eq("id",run.id).eq("status","RUNNING");const stopped=await db.rpc("backyrd_intelligence_population_tick_control_v1",{p_run_id:run.id,p_action:"STOP",p_lease_token:leaseToken});if(stopped.error)throw stopped.error;release=false;return json({ok:false,runId:run.id,status:"PAUSED",error:"systematic_research_failure",failureCode:systemicFailure[0],count:systemicFailure[1]},409);}
        const readiness=evaluatePopulationTickReadiness({runningRuns:1,activeJobs:(active??[]).length,pendingSpots:pending??0,machineAcceptanceFailures:0});
        if(readiness.shouldFinalize){const finalized=await db.rpc("backyrd_intelligence_population_tick_control_v1",{p_run_id:run.id,p_action:"FINALIZE",p_lease_token:leaseToken});if(finalized.error)throw finalized.error;release=false;return json({ok:true,runId:run.id,status:"COMPLETED",...finalized.data});}
        let queued=0;
        if(readiness.shouldQueue){const {data:spots,error:spotsError}=await db.from("backyrd_spot_intelligence_population_v1").select("spot_id").eq("run_id",run.id).eq("terminal_state","PENDING").order("spot_id").limit(5);if(spotsError)throw spotsError;for(const spot of spots??[]){const result=await db.rpc("backyrd_enqueue_spot_intelligence_population_job_v1",{p_run_id:run.id,p_spot_id:spot.spot_id});if(result.error)throw result.error;queued++;}}
        const kicked=await kickPopulationResearch(db,url,serviceKey,run.id,2);
        const post=evaluatePopulationTickReadiness({runningRuns:1,activeJobs:(active??[]).length,pendingSpots:pending??0,machineAcceptanceFailures:kicked.machineAccepted.filter((item:any)=>!item.accepted).length});
        if(!kicked.ok||!post.ok){await db.from("backyrd_city_bootstrap_runs_v1").update({status:"PAUSED",stop_reason:`CIRCUIT_BREAKER:${post.failures.join(",")||"RESEARCH_WORKER_FAILURE"}`.slice(0,500)}).eq("id",run.id).eq("status","RUNNING");const stopped=await db.rpc("backyrd_intelligence_population_tick_control_v1",{p_run_id:run.id,p_action:"STOP",p_lease_token:leaseToken});if(stopped.error)throw stopped.error;release=false;return json({ok:false,runId:run.id,status:"PAUSED",failures:post.failures,statuses:kicked.statuses},409);}
        return json({ok:true,runId:run.id,status:"RUNNING",queued,researchWorkers:2,machineAccepted:kicked.machineAccepted});
      } finally {if(release)await db.rpc("backyrd_intelligence_population_tick_control_v1",{p_run_id:run.id,p_action:"RELEASE",p_lease_token:leaseToken});}
    }
    if(action==="SET_SCALE_STATE") {
      const runId=clean(body?.runId),requestedBy=clean(body?.requestedBy),stateAction=clean(body?.stateAction),reason=clean(body?.reason);
      if(!/^[0-9a-f-]{36}$/.test(runId)||!/^[0-9a-f-]{36}$/.test(requestedBy)||!["PAUSE","RESUME"].includes(stateAction)||!reason.match(/^[A-Z0-9_:,-]{4,160}$/))return json({ok:false,error:"scale_state_request_invalid"},400);
      const [{data:run},{data:actor}]=await Promise.all([db.from("backyrd_city_bootstrap_runs_v1").select("id,mode,status,requested_by").eq("id",runId).maybeSingle(),db.from("admin_users").select("user_id,role").eq("user_id",requestedBy).in("role",["admin","super_admin"]).maybeSingle()]);
      if(!run||run.mode!=="SCALE"||!actor||run.requested_by!==requestedBy)return json({ok:false,error:"scale_state_actor_or_run_invalid"},403);
      if(stateAction==="PAUSE"){
        if(!["RUNNING","PAUSED"].includes(run.status))return json({ok:false,error:"scale_run_not_pausable",status:run.status},409);
        const paused=await db.from("backyrd_city_bootstrap_runs_v1").update({status:"PAUSED",stop_reason:`CIRCUIT_BREAKER:${reason}`.slice(0,500)}).eq("id",runId).in("status",["RUNNING","PAUSED"]).select("id,status").single();if(paused.error)throw paused.error;
        return json({ok:true,runId,status:"PAUSED",reason});
      }
      if(run.status!=="PAUSED")return json({ok:false,error:"scale_run_not_paused",status:run.status},409);
      const [checkpointResult,mismatches,reviewsResult,jobsResult]=await Promise.all([db.from("backyrd_city_bootstrap_checkpoints_v1").select("verdict").eq("run_id",runId).order("batch_number",{ascending:false}).limit(1).maybeSingle(),websiteIdentityMismatches(db,runId),db.from("backyrd_city_bootstrap_reviews_v1").select("id",{count:"exact",head:true}).eq("run_id",runId).eq("state","OPEN"),db.from("backyrd_city_bootstrap_jobs_v1").select("id",{count:"exact",head:true}).eq("run_id",runId).eq("state","FAILED")]);
      const blockerError=checkpointResult.error??reviewsResult.error??jobsResult.error;if(blockerError)throw blockerError;const checkpoint=checkpointResult.data;
      if(checkpoint?.verdict!=="PASS"||mismatches.length||(reviewsResult.count??0)>0||(jobsResult.count??0)>0)return json({ok:false,error:"scale_resume_gates_failed",checkpoint:checkpoint?.verdict??null,websiteIdentityMismatches:mismatches.length,openReviews:reviewsResult.count??0,failedJobs:jobsResult.count??0},409);
      const resumed=await db.from("backyrd_city_bootstrap_runs_v1").update({status:"RUNNING",stop_reason:`RESUMED_AFTER:${reason}`.slice(0,500)}).eq("id",runId).eq("status","PAUSED").select("id,status").single();if(resumed.error)throw resumed.error;
      return json({ok:true,runId,status:"RUNNING",reason});
    }
    if(action==="STAGE_PILOT") {
      const candidates=Array.isArray(body?.candidates)?body.candidates as Candidate[]:[],commit=clean(body?.commit),runKey=clean(body?.runKey),requestedBy=clean(body?.requestedBy);
      if(candidates.length<20||candidates.length>80||!/^[0-9a-f]{40}$/.test(commit)||!/^basel-pilot-[a-z0-9-]{4,80}$/.test(runKey)||!/^[0-9a-f-]{36}$/.test(requestedBy)) return json({ok:false,error:"pilot_request_invalid"},400);
      const {data:actor}=await db.from("admin_users").select("user_id,role").eq("user_id",requestedBy).in("role",["admin","super_admin"]).maybeSingle();if(!actor)return json({ok:false,error:"pilot_actor_invalid"},403);
      const {data:prior}=await db.from("backyrd_city_bootstrap_runs_v1").select("id,status,canonical_repository_commit,requested_by").eq("run_key",runKey).maybeSingle();
      let run:any=prior;
      if(prior){if(prior.canonical_repository_commit!==commit||prior.requested_by!==requestedBy)return json({ok:false,error:"pilot_replay_contract_mismatch"},409);const [{data:priorCandidates},{data:checkpoint}]=await Promise.all([db.from("backyrd_city_bootstrap_candidates_v1").select("lifecycle_state").eq("run_id",prior.id),db.from("backyrd_city_bootstrap_checkpoints_v1").select("verdict,snapshot").eq("run_id",prior.id).eq("batch_number",0).maybeSingle()]);if(checkpoint){const eligible=(priorCandidates??[]).filter((candidate:any)=>["PRODUCT_ELIGIBLE","PUBLISHED"].includes(candidate.lifecycle_state)).length,passed=checkpoint.verdict==="PASS"&&eligible>=20;return json({ok:passed,runId:prior.id,status:prior.status,verdict:checkpoint.verdict,replayed:true,counts:{requested:candidates.length,providerCalls:0,eligible}},passed?200:409);}if(prior.status!=="RUNNING")return json({ok:false,error:"pilot_run_incomplete",runId:prior.id,status:prior.status},409);}
      const {data:existing}=await db.from("spots").select("id,name,lat,lng,google_place_id").eq("city","Basel").eq("status","approved");
      const accepted:any[]=[],failures:Record<string,number>={},failureDetails:Array<{sourceFamily:string;sourceIdentity:string;code:string}>=[];let calls=0,totalLatency=0,validCandidates:Candidate[]=[];
      const recordFailure=(candidate:Candidate,code:string)=>{failures[code]=(failures[code]??0)+1;if(failureDetails.length<80)failureDetails.push({sourceFamily:"OPENSTREETMAP",sourceIdentity:clean(candidate?.sourceIdentity),code});};
      for(const candidate of candidates){const valid=candidate?.sourceFamily==="OPENSTREETMAP"&&clean(candidate.sourceIdentity)&&clean(candidate.address)&&/^https:\/\/[^\s]+$/.test(clean(candidate.website))&&Number.isFinite(candidate.lat)&&Number.isFinite(candidate.lng)&&candidate.relevance?.state==="RELEVANT"&&["EXACT","HIGH"].includes(candidate.relevance?.confidence)&&permittedCategory.has(candidate.relevance?.categoryName);if(valid)validCandidates.push(candidate);else recordFailure(candidate,"candidate_contract_invalid");}
      for(let offset=0;offset<validCandidates.length&&accepted.length<30;offset+=3){const batch=validCandidates.slice(offset,offset+3),matches=await Promise.all(batch.map((candidate)=>googleMatch(candidate,googleKey)));for(let index=0;index<batch.length&&accepted.length<30;index++){const candidate=batch[index],match=matches[index];calls++;totalLatency+=match.latency;if(!match.ok){recordFailure(candidate,match.code??"google_unknown_error");continue;}const sameGoogle=(existing??[]).find((spot:any)=>spot.google_place_id===match.placeId),near=(existing??[]).filter((spot:any)=>Number.isFinite(spot.lat)&&Number.isFinite(spot.lng)&&distance(candidate.lat,candidate.lng,spot.lat,spot.lng)<=45&&similarity(candidate.name,spot.name)>=.82);if(near.length>1&&!sameGoogle){recordFailure(candidate,"existing_identity_ambiguous");continue;}accepted.push({candidate,placeId:match.placeId,identity:sameGoogle??near[0]??null,confidence:sameGoogle?"EXACT":near[0]?"STRONG":match.confidence});}}
      const acceptedSourceIdentities=accepted.map((item:any)=>({sourceFamily:"OPENSTREETMAP",sourceIdentity:clean(item.candidate.sourceIdentity)}));
      const verdict=accepted.length>=20?"PASS":"FAIL",status=verdict==="PASS"?"RUNNING":"PAUSED";
      if(!run){const created=await db.from("backyrd_city_bootstrap_runs_v1").insert({run_key:runKey,city_key:"basel",city_name:"Basel",geography:{definition:"OSM_ADMINISTRATIVE_AREA",osmName:"Basel",osmAdminLevel:"8"},source_configuration:{openStreetMap:"ODbL-1.0",googlePlaces:"identifier-only"},target_configuration:{pilotSize:30,minPilotSize:20},pipeline_version:"backyrd-city-bootstrap-v1",canonical_repository_commit:commit,mode:"PILOT",status,requested_by:requestedBy,started_at:new Date().toISOString(),stop_reason:verdict==="FAIL"?"PILOT_MINIMUM_NOT_REACHED":null}).select("id,status").single();if(created.error)throw created.error;run=created.data;}else if(verdict==="FAIL"){const paused=await db.from("backyrd_city_bootstrap_runs_v1").update({status:"PAUSED",stop_reason:"PILOT_MINIMUM_NOT_REACHED"}).eq("id",run.id);if(paused.error)throw paused.error;run.status="PAUSED";}
      if(!run) throw new Error("run_creation_failed");
      const {data:priorCost}=await db.from("backyrd_city_bootstrap_cost_events_v1").select("id,request_count,latency_ms").eq("run_id",run.id).eq("stage","IDENTITY").eq("provider","GOOGLE_PLACES").eq("operation","TEXT_IDENTIFIER_LINK").maybeSingle();
      const costWrite=priorCost?await db.from("backyrd_city_bootstrap_cost_events_v1").update({request_count:priorCost.request_count+calls,latency_ms:priorCost.latency_ms+totalLatency}).eq("id",priorCost.id):await db.from("backyrd_city_bootstrap_cost_events_v1").insert({run_id:run.id,stage:"IDENTITY",provider:"GOOGLE_PLACES",operation:"TEXT_IDENTIFIER_LINK",request_count:calls,latency_ms:totalLatency});if(costWrite.error)throw costWrite.error;
      if(verdict==="FAIL"){
        const checkpointWrite=await db.from("backyrd_city_bootstrap_checkpoints_v1").upsert({run_id:run.id,batch_number:0,snapshot:{requested:candidates.length,providerCalls:calls,eligible:accepted.length,failures,failureDetails,acceptedSourceIdentities},verdict},{onConflict:"run_id,batch_number"});if(checkpointWrite.error)throw checkpointWrite.error;
        return json({ok:false,runId:run.id,status:"PAUSED",verdict,counts:{requested:candidates.length,providerCalls:calls,eligible:accepted.length},failures,failureDetails,acceptedSourceIdentities},409);
      }
      for(let index=0;index<accepted.length;index++){
        const item=accepted[index],candidate=item.candidate,identityKey=await sha256({sourceFamily:candidate.sourceFamily,sourceIdentity:candidate.sourceIdentity}),sourceFingerprint=await sha256({sourceIdentity:candidate.sourceIdentity,name:normalize(candidate.name),address:normalize(candidate.address),lat:candidate.lat,lng:candidate.lng,website:candidate.website,types:candidate.externalTypes});
        const row={run_id:run.id,identity_key:identityKey,display_name:candidate.name,normalized_name:normalize(candidate.name),address:candidate.address,normalized_address:normalize(candidate.address),city:"Basel",country:"Switzerland",lat:candidate.lat,lng:candidate.lng,website:candidate.website,phone:candidate.phone??null,google_place_id:item.placeId,external_types:candidate.externalTypes??[],canonical_category_name:candidate.relevance.categoryName,relevance_state:"RELEVANT",relevance_reason:candidate.relevance.reason??"SUPPORTED_TYPE",relevance_confidence:candidate.relevance.confidence,identity_state:item.identity?"MATCHED_EXISTING":"NEW_IDENTITY",identity_confidence:item.confidence,matched_spot_id:item.identity?.id??null,lifecycle_state:"EVIDENCE_PENDING",source_fingerprint:sourceFingerprint,enrichment_priority:Math.min(1000,Math.max(0,Math.round((candidate.sourceQuality??0)*100)))};
        const {data:persisted,error}=await db.from("backyrd_city_bootstrap_candidates_v1").upsert(row,{onConflict:"run_id,identity_key"}).select("id").single();if(error)throw error;
        const osmFingerprint=await sha256({candidateId:persisted.id,source:candidate.sourceIdentity}),googleFingerprint=await sha256({candidateId:persisted.id,googlePlaceId:item.placeId});
        const evidence=[{candidate_id:persisted.id,source_family:"OPENSTREETMAP",source_identity:candidate.sourceIdentity,fact_family:"IDENTITY",normalized_value:{source:"OPENSTREETMAP"},evidence_fingerprint:osmFingerprint,authority_class:"STRUCTURED_OPEN_DATA",legal_use_status:"PERMITTED",observed_at:new Date().toISOString(),pipeline_version:"backyrd-city-bootstrap-v1"},{candidate_id:persisted.id,source_family:"GOOGLE_PLACE_ID",source_identity:item.placeId,fact_family:"IDENTITY",normalized_value:{identifierOnly:true},evidence_fingerprint:googleFingerprint,authority_class:"IDENTIFIER_ONLY",legal_use_status:"IDENTIFIER_ONLY",observed_at:new Date().toISOString(),pipeline_version:"backyrd-city-bootstrap-v1"}];
        const evidenceWrite=await db.from("backyrd_city_bootstrap_evidence_v1").upsert(evidence,{onConflict:"candidate_id,source_family,source_identity,evidence_fingerprint"});if(evidenceWrite.error)throw evidenceWrite.error;
        const queryWrite=await db.from("backyrd_city_bootstrap_queries_v1").upsert({run_id:run.id,query_key:`google-link:${identityKey.slice(0,24)}`,source_family:"GOOGLE_PLACES",category_batch:candidate.externalTypes??[],center_lat:candidate.lat,center_lng:candidate.lng,radius_m:150,state:"COMPLETE",result_count:1,unique_result_count:1,provider_calls:1,started_at:new Date(Date.now()-totalLatency).toISOString(),completed_at:new Date().toISOString()},{onConflict:"run_id,query_key"});if(queryWrite.error)throw queryWrite.error;
        const validation=await db.rpc("backyrd_city_bootstrap_validate_candidate_v1",{p_candidate_id:persisted.id});if(validation.error)throw validation.error;
      }
      await db.from("backyrd_city_bootstrap_checkpoints_v1").upsert({run_id:run.id,batch_number:0,snapshot:{requested:candidates.length,providerCalls:calls,eligible:accepted.length,failures,failureDetails,acceptedSourceIdentities},verdict},{onConflict:"run_id,batch_number"});
      return json({ok:verdict==="PASS",runId:run.id,status,verdict,counts:{requested:candidates.length,providerCalls:calls,eligible:accepted.length},failures,failureDetails,acceptedSourceIdentities},verdict==="PASS"?200:409);
    }
    if(action==="STAGE_REFRESH") {
      const candidates=Array.isArray(body?.candidates)?body.candidates as Candidate[]:[],commit=clean(body?.commit),runKey=clean(body?.runKey),requestedBy=clean(body?.requestedBy),sourceRunId=clean(body?.sourceRunId);
      if(candidates.length<1||candidates.length>80||!/^[0-9a-f]{40}$/.test(commit)||!/^basel-refresh-[a-z0-9-]{4,80}$/.test(runKey)||!/^[0-9a-f-]{36}$/.test(requestedBy)||!/^[0-9a-f-]{36}$/.test(sourceRunId))return json({ok:false,error:"refresh_request_invalid"},400);
      const validCandidates=candidates.filter((candidate)=>candidate?.sourceFamily==="OPENSTREETMAP"&&clean(candidate.sourceIdentity)&&clean(candidate.address)&&/^https:\/\/[^\s]+$/.test(clean(candidate.website))&&Number.isFinite(candidate.lat)&&Number.isFinite(candidate.lng)&&candidate.relevance?.state==="RELEVANT"&&["EXACT","HIGH"].includes(candidate.relevance?.confidence)&&permittedCategory.has(candidate.relevance?.categoryName));
      if(validCandidates.length!==candidates.length)return json({ok:false,error:"refresh_candidate_contract_invalid"},400);
      const refreshInput=await Promise.all(validCandidates.map(async(candidate)=>({identityKey:await candidateIdentityHash(candidate),sourceFingerprint:await candidateSourceHash(candidate)}))),inputFingerprint=await sha256([...refreshInput].sort((a,b)=>a.identityKey.localeCompare(b.identityKey)));
      const [{data:actor},{data:sourceRun},{data:prior}]=await Promise.all([
        db.from("admin_users").select("user_id,role").eq("user_id",requestedBy).in("role",["admin","super_admin"]).maybeSingle(),
        db.from("backyrd_city_bootstrap_runs_v1").select("id,city_key,city_name").eq("id",sourceRunId).maybeSingle(),
        db.from("backyrd_city_bootstrap_runs_v1").select("id,status,canonical_repository_commit,requested_by,source_configuration").eq("run_key",runKey).maybeSingle(),
      ]);
      if(!actor)return json({ok:false,error:"refresh_actor_invalid"},403);
      if(!sourceRun||sourceRun.city_key!=="basel")return json({ok:false,error:"refresh_source_run_invalid"},409);
      if(prior){
        if(prior.canonical_repository_commit!==commit||prior.requested_by!==requestedBy||clean(prior.source_configuration?.sourceRunId)!==sourceRunId||clean(prior.source_configuration?.inputFingerprint)!==inputFingerprint)return json({ok:false,error:"refresh_replay_contract_mismatch"},409);
        const {data:checkpoint}=await db.from("backyrd_city_bootstrap_checkpoints_v1").select("verdict,snapshot").eq("run_id",prior.id).eq("batch_number",0).maybeSingle();
        if(!checkpoint)return json({ok:false,error:"refresh_run_incomplete",runId:prior.id,status:prior.status},409);
        return json({ok:checkpoint.verdict==="PASS",runId:prior.id,status:prior.status,verdict:checkpoint.verdict,replayed:true,...checkpoint.snapshot},checkpoint.verdict==="PASS"?200:409);
      }
      const identities=refreshInput.map((row)=>row.identityKey);
      const {data:previousRows,error:previousError}=await db.from("backyrd_city_bootstrap_candidates_v1").select("identity_key,source_fingerprint,identity_state,identity_confidence,matched_spot_id,google_place_id,created_at").eq("city","Basel").in("identity_key",identities).order("created_at",{ascending:false}).limit(5000);if(previousError)throw previousError;
      const decisions=await planRefreshCandidates(validCandidates,previousRows??[]),unchanged=decisions.filter((row)=>row.reason==="UNCHANGED_SOURCE_SKIP"),changed=decisions.filter((row)=>row.reason==="SOURCE_CHANGED"),fresh=decisions.filter((row)=>row.reason==="NEW_CANDIDATE"),reviewRequired=changed.length+fresh.length;
      const created=await db.from("backyrd_city_bootstrap_runs_v1").insert({run_key:runKey,city_key:"basel",city_name:sourceRun.city_name,geography:{definition:"OSM_ADMINISTRATIVE_AREA",osmName:"Basel",osmAdminLevel:"8"},source_configuration:{openStreetMap:"ODbL-1.0",sourceRunId,inputFingerprint,refreshPolicy:"SOURCE_FINGERPRINT_V1"},target_configuration:{inputSize:candidates.length},pipeline_version:"backyrd-city-bootstrap-v1",canonical_repository_commit:commit,mode:"REFRESH",status:reviewRequired?"REVIEW_REQUIRED":"COMPLETED",requested_by:requestedBy,started_at:new Date().toISOString(),completed_at:reviewRequired?null:new Date().toISOString()}).select("id,status").single();if(created.error)throw created.error;const run=created.data;
      for(const decision of [...changed,...fresh]){
        const candidate=decision.candidate,previous=decision.previous;
        const persisted=await db.from("backyrd_city_bootstrap_candidates_v1").insert({run_id:run.id,identity_key:decision.identityKey,display_name:candidate.name,normalized_name:normalize(candidate.name),address:candidate.address,normalized_address:normalize(candidate.address),city:"Basel",country:"Switzerland",lat:candidate.lat,lng:candidate.lng,website:candidate.website,phone:candidate.phone??null,google_place_id:clean(previous?.google_place_id)||null,external_types:candidate.externalTypes??[],canonical_category_name:candidate.relevance.categoryName,relevance_state:"RELEVANT",relevance_reason:candidate.relevance.reason??"SUPPORTED_TYPE",relevance_confidence:candidate.relevance.confidence,identity_state:clean(previous?.identity_state)||"UNRESOLVED",identity_confidence:clean(previous?.identity_confidence)||null,matched_spot_id:clean(previous?.matched_spot_id)||null,lifecycle_state:"REVIEW_REQUIRED",source_fingerprint:decision.sourceFingerprint,enrichment_priority:Math.min(1000,Math.max(0,Math.round((candidate.sourceQuality??0)*100)))}).select("id").single();if(persisted.error)throw persisted.error;
        const evidence=await db.from("backyrd_city_bootstrap_evidence_v1").insert({candidate_id:persisted.data.id,source_family:"OPENSTREETMAP",source_identity:candidate.sourceIdentity,fact_family:"IDENTITY",normalized_value:{source:"OPENSTREETMAP",refreshReason:decision.reason},evidence_fingerprint:decision.sourceFingerprint,authority_class:"STRUCTURED_OPEN_DATA",legal_use_status:"PERMITTED",observed_at:new Date().toISOString(),pipeline_version:"backyrd-city-bootstrap-v1"});if(evidence.error)throw evidence.error;
        const review=await db.rpc("backyrd_city_bootstrap_open_review_v1",{p_candidate_id:persisted.data.id,p_reason:decision.reason==="SOURCE_CHANGED"?"MOVE_OR_RENAME_AMBIGUOUS":"IDENTITY_AMBIGUOUS",p_priority:decision.reason==="SOURCE_CHANGED"?"HIGH":"MEDIUM",p_evidence_fingerprint:decision.sourceFingerprint,p_proposed_action:decision.reason==="SOURCE_CHANGED"?"Review changed source identity before canonical mutation":"Resolve new refresh candidate identity before publication"});if(review.error)throw review.error;
        const job=await db.from("backyrd_city_bootstrap_jobs_v1").insert({run_id:run.id,candidate_id:persisted.data.id,stage:"REFRESH",idempotency_key:`refresh:${decision.identityKey}:${decision.sourceFingerprint}`,state:"COMPLETE",completed_at:new Date().toISOString()});if(job.error)throw job.error;
      }
      const snapshot={sourceRunId,requested:candidates.length,unchangedSkipped:unchanged.length,sourceChanged:changed.length,newCandidates:fresh.length,reviewRequired,providerCalls:0,deepResearchJobs:0,canonicalFactsWritten:0,productWrites:0};
      const checkpoint=await db.from("backyrd_city_bootstrap_checkpoints_v1").insert({run_id:run.id,batch_number:0,snapshot,verdict:"PASS"});if(checkpoint.error)throw checkpoint.error;
      return json({ok:true,runId:run.id,status:run.status,verdict:"PASS",replayed:false,...snapshot});
    }
    if(action==="PUBLISH_PILOT") {
      const runId=clean(body?.runId);if(clean(body?.confirm)!==`PUBLISH:${runId}`)return json({ok:false,error:"publication_confirmation_required"},400);
      const {data:run}=await db.from("backyrd_city_bootstrap_runs_v1").select("id,mode,status").eq("id",runId).maybeSingle();if(!run||run.mode!=="PILOT"||run.status!=="RUNNING")return json({ok:false,error:"pilot_not_publishable"},409);
      const {data:rows}=await db.from("backyrd_city_bootstrap_candidates_v1").select("id").eq("run_id",runId).eq("lifecycle_state","PRODUCT_ELIGIBLE").order("enrichment_priority",{ascending:false}).limit(30);let publicationAttempts=0,canonicalSpotsCreated=0,matchedExisting=0;
      for(const row of rows??[]){const publication=await db.rpc("backyrd_city_bootstrap_publish_candidate_v1",{p_candidate_id:row.id});if(publication.error)throw publication.error;publicationAttempts++;if(publication.data?.published)canonicalSpotsCreated++;if(publication.data?.matchedExisting)matchedExisting++;}
      const {data:publishedRows,error:publishedError}=await db.from("backyrd_city_bootstrap_candidates_v1").select("id,matched_spot_id,canonical_category_name,enrichment_priority,created_at").eq("run_id",runId).eq("lifecycle_state","PUBLISHED").order("enrichment_priority",{ascending:false}).order("created_at",{ascending:true});if(publishedError)throw publishedError;
      const publishedSpotIds=[...new Set((publishedRows??[]).map((row:any)=>clean(row.matched_spot_id)).filter(Boolean))];
      const [{data:researchSpots,error:researchSpotsError},{data:priorResearch,error:priorResearchError}]=await Promise.all([publishedSpotIds.length?db.from("spots").select("id,website").in("id",publishedSpotIds):Promise.resolve({data:[],error:null}),db.from("backyrd_spot_research_jobs_v1").select("spot_id,source_scope").limit(5000)]);if(researchSpotsError||priorResearchError)throw researchSpotsError??priorResearchError;
      const excludedSpotIds=new Set((priorResearch??[]).map((row:any)=>clean(row.spot_id)).filter(Boolean)),excludedHosts=new Set((priorResearch??[]).map((row:any)=>publicHost(row.source_scope?.officialWebsite)).filter(Boolean));
      const researchEligible=selectResearchEligible(publishedRows??[],researchSpots??[],{spotIds:excludedSpotIds,hosts:excludedHosts}),researchCohort=selectResearchCohort(researchEligible,10);
      let researchQueued=0,researchDeduplicated=0;for(const row of researchCohort){const research=await db.rpc("backyrd_city_bootstrap_enqueue_research_v1",{p_candidate_id:row.id});if(research.error)throw research.error;researchQueued++;if(research.data?.deduplicated)researchDeduplicated++;}
      return json({ok:true,runId,publicationAttempts,canonicalSpotsCreated,matchedExisting,publishedTotal:(publishedRows??[]).length,researchEligibleTotal:researchEligible.length,researchQueued,researchDeduplicated,researchDeferred:Math.max(0,researchEligible.length-researchCohort.length),researchIneligible:Math.max(0,(publishedRows??[]).length-researchEligible.length),researchPreviouslySeen:excludedSpotIds.size,researchPilotLimit:10,independentResearchCohort:true,canonicalFactsWritten:0,n4Writes:0});
    }
    if(action==="FINALIZE_PILOT") {
      const runId=clean(body?.runId),requestedBy=clean(body?.requestedBy),researchJobIds:string[]=Array.isArray(body?.researchJobIds)?[...new Set<string>(body.researchJobIds.map(clean).filter(Boolean))]:[],proposalIds:string[]=Array.isArray(body?.proposalIds)?[...new Set<string>(body.proposalIds.map(clean).filter(Boolean))]:[];
      if(clean(body?.confirm)!==`FINALIZE:${runId}`||!/^[0-9a-f-]{36}$/.test(runId)||!/^[0-9a-f-]{36}$/.test(requestedBy)||researchJobIds.length!==10||proposalIds.length<1||proposalIds.length>16||[...researchJobIds,...proposalIds].some((id)=>!/^[0-9a-f-]{36}$/.test(id)))return json({ok:false,error:"pilot_finalization_request_invalid"},400);
      const [{data:run},{data:actor},{data:candidates},{data:reviews},{data:bootstrapJobs},{data:researchJobs},{data:proposals},{data:acceptedFacts},{data:audits}]=await Promise.all([
        db.from("backyrd_city_bootstrap_runs_v1").select("id,mode,status,requested_by,started_at,stop_reason").eq("id",runId).maybeSingle(),
        db.from("admin_users").select("user_id,role").eq("user_id",requestedBy).in("role",["admin","super_admin"]).maybeSingle(),
        db.from("backyrd_city_bootstrap_candidates_v1").select("id,lifecycle_state,matched_spot_id,google_place_id").eq("run_id",runId),
        db.from("backyrd_city_bootstrap_reviews_v1").select("state").eq("run_id",runId),
        db.from("backyrd_city_bootstrap_jobs_v1").select("state").eq("run_id",runId),
        db.from("backyrd_spot_research_jobs_v1").select("id,spot_id,actor_id,state,proposal_count,failure_code,created_at").in("id",researchJobIds),
        db.from("backyrd_spot_fact_proposals_v1").select("id,spot_id,status,reviewed_by,idempotency_key,research_entity_scope,research_durability,research_scope_resolution").in("id",proposalIds),
        db.from("backyrd_spot_accepted_facts_v1").select("proposal_id").in("proposal_id",proposalIds).eq("status","ACTIVE"),
        db.from("backyrd_spot_gold_authoring_audit_v1").select("subject_id,action").in("subject_id",proposalIds),
      ]);
      if(!run||run.mode!=="PILOT"||!actor||run.requested_by!==requestedBy)return json({ok:false,error:"pilot_finalization_actor_or_run_invalid"},403);
      if(run.status==="COMPLETED") { const {data:checkpoint}=await db.from("backyrd_city_bootstrap_checkpoints_v1").select("verdict,snapshot").eq("run_id",runId).eq("batch_number",1).maybeSingle();return json({ok:checkpoint?.verdict==="PASS",runId,status:run.status,replayed:true,verdict:checkpoint?.verdict??"FAIL",snapshot:checkpoint?.snapshot??null},checkpoint?.verdict==="PASS"?200:409); }
      if(!["RUNNING","PAUSED","REVIEW_REQUIRED"].includes(run.status))return json({ok:false,error:"pilot_not_finalizable",status:run.status},409);
      const published=(candidates??[]).filter((candidate:any)=>candidate.lifecycle_state==="PUBLISHED"),publishedSpotIds=published.map((candidate:any)=>clean(candidate.matched_spot_id)).filter(Boolean),publishedGoogleIds=published.map((candidate:any)=>clean(candidate.google_place_id)).filter(Boolean),publishedSpotSet=new Set(publishedSpotIds);
      const cohortValid=(researchJobs??[]).length===10&&(researchJobs??[]).every((job:any)=>publishedSpotSet.has(clean(job.spot_id))&&job.actor_id===requestedBy&&new Date(job.created_at)>=new Date(run.started_at));
      const proposalsValid=(proposals??[]).length===proposalIds.length&&(proposals??[]).every((proposal:any)=>publishedSpotSet.has(clean(proposal.spot_id)));
      const evaluation=evaluatePilotAcceptance({publishedCandidateCount:published.length,publishedSpotIds,googlePlaceIds:publishedGoogleIds,openBootstrapReviews:(reviews??[]).filter((review:any)=>review.state==="OPEN").length,incompleteBootstrapJobs:(bootstrapJobs??[]).filter((job:any)=>!["COMPLETE","SKIPPED"].includes(job.state)).length,researchJobs:cohortValid?(researchJobs as any[]):[],proposals:proposalsValid?(proposals as any[]):[],acceptedProposalIds:(acceptedFacts??[]).map((fact:any)=>clean(fact.proposal_id)).filter(Boolean),auditedProposalIds:(audits??[]).filter((audit:any)=>audit.action==="ACCEPT").map((audit:any)=>clean(audit.subject_id)).filter(Boolean)});
      if(!cohortValid)evaluation.failures.push("pilot_research_lineage_invalid");if(!proposalsValid)evaluation.failures.push("pilot_proposal_spot_invalid");evaluation.verdict=evaluation.failures.length?"FAIL":"PASS";
      const snapshot={...evaluation.metrics,failures:evaluation.failures,humanReviewPrecision:evaluation.metrics.proposals?evaluation.metrics.accepted/evaluation.metrics.proposals:0,proposalCoverage:evaluation.metrics.researchJobs?evaluation.metrics.proposals/evaluation.metrics.researchJobs:0,priorStopReason:run.stop_reason??null,entitySubentityScopeValidation:evaluation.failures.includes("pilot_entity_scope_invalid")?"FAIL":"PASS",qualityStandardLowered:false};
      const checkpoint=await db.from("backyrd_city_bootstrap_checkpoints_v1").upsert({run_id:runId,batch_number:1,snapshot,verdict:evaluation.verdict},{onConflict:"run_id,batch_number"});if(checkpoint.error)throw checkpoint.error;
      if(evaluation.verdict!=="PASS")return json({ok:false,runId,status:run.status,verdict:"FAIL",snapshot},409);
      const completed=await db.from("backyrd_city_bootstrap_runs_v1").update({status:"COMPLETED",completed_at:new Date().toISOString()}).eq("id",runId).in("status",["RUNNING","PAUSED","REVIEW_REQUIRED"]).select("id,status,completed_at,stop_reason").single();if(completed.error)throw completed.error;
      return json({ok:true,runId,status:completed.data.status,verdict:"PASS",replayed:false,snapshot});
    }
    if(action==="FINALIZE_SCALE") {
      const runId=clean(body?.runId),requestedBy=clean(body?.requestedBy);
      if(clean(body?.confirm)!==`FINALIZE_SCALE:${runId}`||!/^[0-9a-f-]{36}$/.test(runId)||!/^[0-9a-f-]{36}$/.test(requestedBy))return json({ok:false,error:"scale_finalization_request_invalid"},400);
      const [{data:run,error:runError},{data:actor,error:actorError},{data:candidates,error:candidatesError},{data:reviews,error:reviewsError},{data:jobs,error:jobsError},{data:checkpoints,error:checkpointsError}]=await Promise.all([
        db.from("backyrd_city_bootstrap_runs_v1").select("id,mode,status,requested_by,completed_at,stop_reason").eq("id",runId).maybeSingle(),
        db.from("admin_users").select("user_id,role").eq("user_id",requestedBy).in("role",["admin","super_admin"]).maybeSingle(),
        db.from("backyrd_city_bootstrap_candidates_v1").select("id,lifecycle_state").eq("run_id",runId),
        db.from("backyrd_city_bootstrap_reviews_v1").select("state").eq("run_id",runId),
        db.from("backyrd_city_bootstrap_jobs_v1").select("state").eq("run_id",runId),
        db.from("backyrd_city_bootstrap_checkpoints_v1").select("batch_number,verdict").eq("run_id",runId).order("batch_number",{ascending:true}),
      ]);
      const readError=runError??actorError??candidatesError??reviewsError??jobsError??checkpointsError;if(readError)throw readError;
      if(!run||run.mode!=="SCALE"||!actor||run.requested_by!==requestedBy)return json({ok:false,error:"scale_finalization_actor_or_run_invalid"},403);
      if(run.status==="COMPLETED")return json({ok:true,runId,status:"COMPLETED",verdict:"PASS",replayed:true,completedAt:run.completed_at,reason:run.stop_reason});
      if(run.status!=="RUNNING")return json({ok:false,error:"scale_run_not_finalizable",status:run.status},409);
      const mismatches=await websiteIdentityMismatches(db,runId),evaluation=evaluateScaleFinalization({
        candidateCount:(candidates??[]).length,
        unfinishedCandidates:(candidates??[]).filter((candidate:any)=>!["PUBLISHED","REJECTED"].includes(candidate.lifecycle_state)).length,
        openReviews:(reviews??[]).filter((review:any)=>review.state==="OPEN").length,
        incompleteJobs:(jobs??[]).filter((job:any)=>!["COMPLETE","SKIPPED"].includes(job.state)).length,
        failedJobs:(jobs??[]).filter((job:any)=>job.state==="FAILED").length,
        websiteIdentityMismatches:mismatches.length,
        checkpointBatches:(checkpoints??[]).map((checkpoint:any)=>Number(checkpoint.batch_number)),
        checkpointVerdicts:(checkpoints??[]).map((checkpoint:any)=>clean(checkpoint.verdict)),
      });
      if(evaluation.verdict!=="PASS")return json({ok:false,runId,status:run.status,verdict:"FAIL",failures:evaluation.failures,metrics:evaluation.metrics},409);
      const completed=await db.from("backyrd_city_bootstrap_runs_v1").update({status:"COMPLETED",completed_at:new Date().toISOString(),stop_reason:"COMPLETED:CURATED_SELECTION_EXHAUSTED"}).eq("id",runId).eq("status","RUNNING").select("id,status,completed_at,stop_reason").single();if(completed.error)throw completed.error;
      return json({ok:true,runId,status:completed.data.status,verdict:"PASS",replayed:false,completedAt:completed.data.completed_at,reason:completed.data.stop_reason,metrics:evaluation.metrics});
    }
    if(action==="PUBLISH_SCALE_BATCH") {
      const runId=clean(body?.runId),requestedBy=clean(body?.requestedBy),batchNumber=Number(body?.batchNumber),researchLimit=Number(body?.researchLimit??0);
      if(clean(body?.confirm)!==`PUBLISH_SCALE:${runId}:${batchNumber}`||!/^[0-9a-f-]{36}$/.test(runId)||!/^[0-9a-f-]{36}$/.test(requestedBy)||!Number.isInteger(batchNumber)||batchNumber<1||batchNumber>50||!Number.isInteger(researchLimit)||researchLimit<0||researchLimit>2)return json({ok:false,error:"scale_batch_request_invalid"},400);
      const [{data:run},{data:actor},{data:priorCheckpoint}]=await Promise.all([
        db.from("backyrd_city_bootstrap_runs_v1").select("id,mode,status,requested_by").eq("id",runId).maybeSingle(),
        db.from("admin_users").select("user_id,role").eq("user_id",requestedBy).in("role",["admin","super_admin"]).maybeSingle(),
        db.from("backyrd_city_bootstrap_checkpoints_v1").select("verdict,snapshot").eq("run_id",runId).eq("batch_number",batchNumber).maybeSingle(),
      ]);
      if(!run||run.mode!=="SCALE"||!actor||run.requested_by!==requestedBy)return json({ok:false,error:"scale_batch_actor_or_run_invalid"},403);
      if(priorCheckpoint)return json({ok:priorCheckpoint.verdict==="PASS",runId,batchNumber,replayed:true,verdict:priorCheckpoint.verdict,snapshot:priorCheckpoint.snapshot},priorCheckpoint.verdict==="PASS"?200:409);
      if(run.status!=="RUNNING")return json({ok:false,error:"scale_run_not_running",status:run.status},409);
      if(batchNumber>1){const {data:previous}=await db.from("backyrd_city_bootstrap_checkpoints_v1").select("verdict").eq("run_id",runId).eq("batch_number",batchNumber-1).maybeSingle();if(previous?.verdict!=="PASS")return json({ok:false,error:"scale_previous_checkpoint_not_pass"},409);}
      const websiteAudit=await websiteIdentityMismatches(db,runId);if(websiteAudit.length){const paused=await db.from("backyrd_city_bootstrap_runs_v1").update({status:"PAUSED",stop_reason:"CIRCUIT_BREAKER:WEBSITE_IDENTITY_EVIDENCE_MISMATCH"}).eq("id",runId).eq("status","RUNNING");if(paused.error)throw paused.error;return json({ok:false,runId,batchNumber,status:"PAUSED",verdict:"FAIL",error:"website_identity_evidence_mismatch",mismatchCount:websiteAudit.length},409);}
      const {data:rows,error:rowsError}=await db.from("backyrd_city_bootstrap_candidates_v1").select("id").eq("run_id",runId).eq("lifecycle_state","PRODUCT_ELIGIBLE").order("enrichment_priority",{ascending:false}).order("created_at",{ascending:true}).limit(20);if(rowsError)throw rowsError;if(!(rows??[]).length)return json({ok:false,error:"scale_batch_empty"},409);
      const publicationResults:any[]=[];for(const row of rows??[]){const publication=await db.rpc("backyrd_city_bootstrap_publish_candidate_v1",{p_candidate_id:row.id});if(publication.error)throw publication.error;publicationResults.push(publication.data);}
      const batchSpotIds=[...new Set(publicationResults.map((result:any)=>clean(result?.spotId)).filter(Boolean))];
      const [allSpotsResult,runCandidatesResult,reviewsResult,bootstrapJobsResult,distributionResult]=await Promise.all([
        db.from("spots").select("id,name,address,google_place_id,data_origin,status").eq("city","Basel").eq("status","approved").limit(1000),
        db.from("backyrd_city_bootstrap_candidates_v1").select("lifecycle_state,matched_spot_id").eq("run_id",runId),
        db.from("backyrd_city_bootstrap_reviews_v1").select("state").eq("run_id",runId),
        db.from("backyrd_city_bootstrap_jobs_v1").select("state").eq("run_id",runId),
        batchSpotIds.length?db.rpc("distribution_trust_filter_entities_v1",{p_entity_type:"spot",p_entity_ids:batchSpotIds,p_surface:"decision"}):Promise.resolve({data:[],error:null}),
      ]);
      const readError=allSpotsResult.error??runCandidatesResult.error??reviewsResult.error??bootstrapJobsResult.error??distributionResult.error;if(readError)throw readError;
      const allSpots=allSpotsResult.data,runCandidates=runCandidatesResult.data,reviews=reviewsResult.data,bootstrapJobs=bootstrapJobsResult.data,distribution=distributionResult.data;
      const duplicateGroupCount=(values:string[])=>{const counts=new Map<string,number>();for(const value of values)counts.set(value,(counts.get(value)??0)+1);return [...counts.values()].filter((count)=>count>1).length;};
      const googleDuplicateGroups=duplicateGroupCount((allSpots??[]).map((spot:any)=>clean(spot.google_place_id)).filter(Boolean)),normalizedIdentityDuplicateGroups=duplicateGroupCount((allSpots??[]).map((spot:any)=>{const name=normalize(spot.name),address=normalize(spot.address);return name&&address?`${name}|${address}`:"";}).filter(Boolean));
      const integrity=evaluateScaleBatchIntegrity({attemptedCandidateCount:(rows??[]).length,publishedSpotIds:batchSpotIds,googleDuplicateGroups,normalizedIdentityDuplicateGroups,fixtureLeakage:(allSpots??[]).filter((spot:any)=>["TEST","FIXTURE"].includes(spot.data_origin)).length,publishedWithoutSpot:(runCandidates??[]).filter((candidate:any)=>candidate.lifecycle_state==="PUBLISHED"&&!clean(candidate.matched_spot_id)).length,openReviews:(reviews??[]).filter((review:any)=>review.state==="OPEN").length,failedBootstrapJobs:(bootstrapJobs??[]).filter((job:any)=>job.state==="FAILED").length,distributionIneligible:(distribution??[]).filter((row:any)=>!row.eligible).length});
      let researchQueued=0,researchDeduplicated=0;
      if(integrity.verdict==="PASS"&&researchLimit>0){const {data:publishedRows}=await db.from("backyrd_city_bootstrap_candidates_v1").select("id,matched_spot_id,canonical_category_name").in("id",(rows??[]).map((row:any)=>row.id));const {data:researchSpots}=batchSpotIds.length?await db.from("spots").select("id,website").in("id",batchSpotIds):{data:[]};const {data:priorResearch}=await db.from("backyrd_spot_research_jobs_v1").select("spot_id,source_scope").limit(5000);const eligible=selectResearchEligible(publishedRows??[],researchSpots??[],{spotIds:(priorResearch??[]).map((row:any)=>clean(row.spot_id)).filter(Boolean),hosts:(priorResearch??[]).map((row:any)=>publicHost(row.source_scope?.officialWebsite)).filter(Boolean)});for(const row of selectResearchCohort(eligible,researchLimit)){const research=await db.rpc("backyrd_city_bootstrap_enqueue_research_v1",{p_candidate_id:(row as any).id});if(research.error)throw research.error;researchQueued++;if(research.data?.deduplicated)researchDeduplicated++;}}
      const snapshot={attempted:(rows??[]).length,publishedSpotIds:batchSpotIds,newProductSpots:publicationResults.filter((result:any)=>result?.published===true).length,duplicatesPrevented:publicationResults.filter((result:any)=>result?.matchedExisting===true).length,writeFailures:0,queueFailures:(bootstrapJobs??[]).filter((job:any)=>job.state==="FAILED").length,openReviews:(reviews??[]).filter((review:any)=>review.state==="OPEN").length,distributionIneligible:(distribution??[]).filter((row:any)=>!row.eligible).length,googleDuplicateGroups,normalizedIdentityDuplicateGroups,researchQueued,researchDeduplicated,canonicalFactsWritten:0,n4Writes:0,failures:integrity.failures};
      const checkpoint=await db.from("backyrd_city_bootstrap_checkpoints_v1").insert({run_id:runId,batch_number:batchNumber,snapshot,verdict:integrity.verdict});if(checkpoint.error)throw checkpoint.error;
      if(integrity.verdict!=="PASS"){const paused=await db.from("backyrd_city_bootstrap_runs_v1").update({status:"PAUSED",stop_reason:`CIRCUIT_BREAKER:${integrity.failures.join(",")}`.slice(0,500)}).eq("id",runId);if(paused.error)throw paused.error;return json({ok:false,runId,batchNumber,status:"PAUSED",verdict:"FAIL",snapshot},409);}
      return json({ok:true,runId,batchNumber,status:"RUNNING",verdict:"PASS",replayed:false,snapshot});
    }
    if(action==="KICK_RESEARCH") {
      if(!researchKey||!researchEnabled)return json({ok:false,error:"research_provider_unhealthy"},503);const workers=Math.max(1,Math.min(Number(body?.workers??1),3)),statuses:number[]=[];
      const populationRunId=clean(body?.populationRunId);let machineAccepted:any[]=[];
      if(populationRunId){
        if(!/^[0-9a-f-]{36}$/.test(populationRunId))return json({ok:false,error:"population_run_invalid"},400);
        const {data:run}=await db.from("backyrd_city_bootstrap_runs_v1").select("id,mode,status").eq("id",populationRunId).maybeSingle();if(!run||run.mode!=="INTELLIGENCE"||run.status!=="RUNNING")return json({ok:false,error:"population_run_not_running"},409);
      }
      if(populationRunId){const result=await kickPopulationResearch(db,url,serviceKey,populationRunId,workers);return json(result);}
      await Promise.all(Array.from({length:workers},async()=>{const response=await fetch(`${url}/functions/v1/research-spot-worker`,{method:"POST",headers:{authorization:`Bearer ${serviceKey}`,"content-type":"application/json"},body:"{}"});statuses.push(response.status);await response.body?.cancel();}));
      return json({ok:statuses.every((status)=>status===200),workers,statuses,machineAccepted});
    }
    if(action==="START_INTELLIGENCE_CANARY") {
      const sourceRunId=clean(body?.sourceRunId),commit=clean(body?.commit),runKey=clean(body?.runKey),seed=clean(body?.seed),referenceSpotId="545a8ee5-14bd-4887-b4e3-42d3271aa736",sampleSize=Number(body?.sampleSize??10);
      if(!/^[0-9a-f-]{36}$/.test(sourceRunId)||!/^[0-9a-f]{40}$/.test(commit)||!/^basel-intelligence-canary-[a-z0-9-]{4,80}$/.test(runKey)||!/^[a-z0-9-]{4,80}$/.test(seed)||!Number.isInteger(sampleSize)||sampleSize<8||sampleSize>12)return json({ok:false,error:"intelligence_canary_request_invalid"},400);
      const [{data:sourceRun},{data:spots,count},{data:existingRun}]=await Promise.all([
        db.from("backyrd_city_bootstrap_runs_v1").select("id,mode,status,requested_by").eq("id",sourceRunId).maybeSingle(),
        db.from("spots").select("id,category_id,website,data_origin",{count:"exact"}).eq("city","Basel").eq("status","approved").limit(1000),
        db.from("backyrd_city_bootstrap_runs_v1").select("id,status,requested_by,canonical_repository_commit").eq("run_key",runKey).maybeSingle()
      ]);if(!sourceRun||sourceRun.mode!=="SCALE"||sourceRun.status!=="COMPLETED"||!sourceRun.requested_by)return json({ok:false,error:"intelligence_canary_source_lineage_invalid"},403);const {data:actor}=await db.from("admin_users").select("user_id,role").eq("user_id",sourceRun.requested_by).in("role",["admin","super_admin"]).maybeSingle();if(!actor)return json({ok:false,error:"intelligence_canary_actor_lineage_invalid"},403);if(count!==415||(spots??[]).some((spot:any)=>["TEST","FIXTURE"].includes(clean(spot.data_origin))))return json({ok:false,error:"basel_corpus_guard_failed",count},409);
      if(existingRun){if(existingRun.requested_by!==sourceRun.requested_by||existingRun.canonical_repository_commit!==commit)return json({ok:false,error:"intelligence_canary_replay_mismatch"},409);const {data:items}=await db.from("backyrd_spot_intelligence_population_v1").select("spot_id,terminal_state,research_job_id").eq("run_id",existingRun.id);return json({ok:true,replayed:true,runId:existingRun.id,status:existingRun.status,items});}
      const selected=selectIntelligenceCanary(spots??[],referenceSpotId,seed,sampleSize);if(selected.length!==sampleSize||!selected.some((spot:any)=>spot.id===referenceSpotId))return json({ok:false,error:"intelligence_canary_selection_incomplete"},409);
      const created=await db.from("backyrd_city_bootstrap_runs_v1").insert({run_key:runKey,city_key:"basel",city_name:"Basel",geography:{definition:"CURRENT_CANONICAL_CORPUS",spotCount:415},source_configuration:{researchProvider:"CANONICAL_PRODUCTION_SECRET",officialWebsitesOnly:true,sourceRunId},target_configuration:{phase:"MACHINE_ACCEPTANCE_CANARY",researchConcurrencyLimit:2,researchCoverageTarget:sampleSize,fullCoverageTarget:415,discoveryEnabled:false},pipeline_version:"backyrd-intelligence-population-v1",canonical_repository_commit:commit,mode:"INTELLIGENCE",status:"RUNNING",requested_by:sourceRun.requested_by,started_at:new Date().toISOString()}).select("id,status").single();if(created.error)throw created.error;
      const items:any[]=[];for(const spot of selected){const result=await db.rpc("backyrd_enqueue_spot_intelligence_population_job_v1",{p_run_id:created.data.id,p_spot_id:spot.id});if(result.error)throw result.error;items.push(result.data);}
      return json({ok:true,replayed:false,runId:created.data.id,status:created.data.status,researchConcurrencyLimit:2,researchCoverageTarget:sampleSize,corpusGuard:415,items});
    }
    if(action==="FINALIZE_INTELLIGENCE_CANARY") {
      const runId=clean(body?.runId),inspectedProposalIds=Array.isArray(body?.inspectedProposalIds)?[...new Set<string>(body.inspectedProposalIds.map(clean).filter(Boolean))].sort():[];
      if(!/^[0-9a-f-]{36}$/.test(runId)||clean(body?.confirm)!==`FINALIZE_INTELLIGENCE_CANARY:${runId}:UNSUPPORTED_0`||inspectedProposalIds.some((id)=>!/^[0-9a-f-]{36}$/.test(id)))return json({ok:false,error:"intelligence_canary_finalization_invalid"},400);
      const [{data:run},{data:items},{data:jobs}]=await Promise.all([
        db.from("backyrd_city_bootstrap_runs_v1").select("id,mode,status,requested_by,target_configuration").eq("id",runId).maybeSingle(),
        db.from("backyrd_spot_intelligence_population_v1").select("spot_id,terminal_state,relevant_fact_count,researched_fact_count,auto_accepted_count,review_required_count").eq("run_id",runId),
        db.from("backyrd_spot_research_jobs_v1").select("id,state,failure_code").eq("population_run_id",runId)
      ]);
      if(!run||run.mode!=="INTELLIGENCE"||run.target_configuration?.phase!=="MACHINE_ACCEPTANCE_CANARY"||!run.requested_by)return json({ok:false,error:"intelligence_canary_run_invalid"},403);
      const {data:actor}=await db.from("admin_users").select("user_id,role").eq("user_id",run.requested_by).in("role",["admin","super_admin"]).maybeSingle();if(!actor)return json({ok:false,error:"intelligence_canary_actor_lineage_invalid"},403);
      if(run.status==="COMPLETED"){const {data:checkpoint}=await db.from("backyrd_city_bootstrap_checkpoints_v1").select("verdict,snapshot").eq("run_id",runId).eq("batch_number",0).maybeSingle();return json({ok:checkpoint?.verdict==="PASS",runId,status:"COMPLETED",replayed:true,...checkpoint},checkpoint?.verdict==="PASS"?200:409);}
      const jobPrefixes=(jobs??[]).map((job:any)=>`research-v2.1:${job.id}:`);
      const proposalScope=jobPrefixes.map((prefix:string)=>`idempotency_key.like.${prefix}*`).join(","),{data:proposalRows,error:proposalError}=jobPrefixes.length?await db.from("backyrd_spot_fact_proposals_v1").select("id,field_key,status,machine_policy_version,machine_evidence_fingerprint,research_entity_scope,research_durability,research_scope_resolution,resolution_note,idempotency_key").eq("machine_policy_version","backyrd-machine-acceptance-v1").or(proposalScope).limit(200):{data:[],error:null};if(proposalError)throw proposalError;
      const accepted=(proposalRows??[]).filter((proposal:any)=>jobPrefixes.some((prefix:string)=>clean(proposal.idempotency_key).startsWith(prefix))).sort((a:any,b:any)=>clean(a.id).localeCompare(clean(b.id))),evaluation=evaluateIntelligenceCanaryReadiness({items:items??[],jobs:jobs??[],accepted,inspectedProposalIds}),failures=evaluation.failures,actualIds=evaluation.actualIds;
      const snapshot={phase:"MACHINE_ACCEPTANCE_CANARY",spots:(items??[]).length,researchAttempted:(items??[]).filter((item:any)=>Number(item.researched_fact_count)>0).length,relevantFacts:(items??[]).reduce((sum:number,item:any)=>sum+Number(item.relevant_fact_count??0),0),autoAcceptedFacts:accepted.length,reviewRequiredFacts:(items??[]).reduce((sum:number,item:any)=>sum+Number(item.review_required_count??0),0),unsupportedAutoAcceptedFacts:failures.includes("UNSUPPORTED_AUTO_ACCEPTED_FACT")?1:0,manuallyInspectedProposalIds:actualIds,failures};
      await db.from("backyrd_city_bootstrap_checkpoints_v1").upsert({run_id:runId,batch_number:0,snapshot,verdict:failures.length?"FAIL":"PASS"},{onConflict:"run_id,batch_number"});
      if(failures.length){await db.from("backyrd_city_bootstrap_runs_v1").update({status:"PAUSED",stop_reason:`CIRCUIT_BREAKER:${failures.join(",")}`.slice(0,500)}).eq("id",runId);return json({ok:false,runId,status:"PAUSED",verdict:"FAIL",snapshot},409);}
      const completed=await db.from("backyrd_city_bootstrap_runs_v1").update({status:"COMPLETED",completed_at:new Date().toISOString(),stop_reason:"COMPLETED:MACHINE_ACCEPTANCE_CANARY_PASS"}).eq("id",runId).eq("status","RUNNING").select("id,status").single();if(completed.error)throw completed.error;
      return json({ok:true,runId,status:"COMPLETED",verdict:"PASS",snapshot});
    }
    if(action==="START_INTELLIGENCE_POPULATION") {
      const commit=clean(body?.commit),runKey=clean(body?.runKey),canaryRunId=clean(body?.canaryRunId);
      if(!/^[0-9a-f-]{36}$/.test(canaryRunId)||!/^[0-9a-f]{40}$/.test(commit)||!/^basel-intelligence-population-[a-z0-9-]{4,80}$/.test(runKey))return json({ok:false,error:"intelligence_population_request_invalid"},400);
      const [{data:canary},{data:checkpoint},{data:spots,count},{data:existing}]=await Promise.all([
        db.from("backyrd_city_bootstrap_runs_v1").select("id,status,requested_by,target_configuration").eq("id",canaryRunId).maybeSingle(),
        db.from("backyrd_city_bootstrap_checkpoints_v1").select("verdict,snapshot").eq("run_id",canaryRunId).eq("batch_number",0).maybeSingle(),
        db.from("spots").select("id,data_origin",{count:"exact"}).eq("city","Basel").eq("status","approved").limit(1000),
        db.from("backyrd_city_bootstrap_runs_v1").select("id,status,requested_by,canonical_repository_commit").eq("run_key",runKey).maybeSingle()
      ]);
      if(!canary||canary.status!=="COMPLETED"||!canary.requested_by||canary.target_configuration?.phase!=="MACHINE_ACCEPTANCE_CANARY"||checkpoint?.verdict!=="PASS"||Number(checkpoint?.snapshot?.unsupportedAutoAcceptedFacts)!==0)return json({ok:false,error:"intelligence_canary_pass_required"},403);
      const {data:actor}=await db.from("admin_users").select("user_id,role").eq("user_id",canary.requested_by).in("role",["admin","super_admin"]).maybeSingle();if(!actor)return json({ok:false,error:"intelligence_population_actor_lineage_invalid"},403);
      if(count!==415||(spots??[]).some((spot:any)=>["TEST","FIXTURE"].includes(clean(spot.data_origin))))return json({ok:false,error:"basel_corpus_guard_failed",count},409);
      if(existing){if(existing.requested_by!==canary.requested_by||existing.canonical_repository_commit!==commit)return json({ok:false,error:"intelligence_population_replay_mismatch"},409);return json({ok:true,replayed:true,runId:existing.id,status:existing.status,researchCoverageTarget:415});}
      const created=await db.from("backyrd_city_bootstrap_runs_v1").insert({run_key:runKey,city_key:"basel",city_name:"Basel",geography:{definition:"CURRENT_CANONICAL_CORPUS",spotCount:415},source_configuration:{researchProvider:"CANONICAL_PRODUCTION_SECRET",officialWebsitesOnly:true,canaryRunId},target_configuration:{phase:"FULL_LAUNCH_CURATION",researchConcurrencyLimit:2,researchQueueBatchSize:5,researchCoverageTarget:415,discoveryEnabled:false},pipeline_version:"backyrd-intelligence-population-v1",canonical_repository_commit:commit,mode:"INTELLIGENCE",status:"RUNNING",requested_by:canary.requested_by,started_at:new Date().toISOString()}).select("id,status").single();if(created.error)throw created.error;
      const ledger=await db.from("backyrd_spot_intelligence_population_v1").insert((spots??[]).map((spot:any)=>({run_id:created.data.id,spot_id:spot.id,terminal_state:"PENDING"})));if(ledger.error)throw ledger.error;
      return json({ok:true,replayed:false,runId:created.data.id,status:"RUNNING",researchConcurrencyLimit:2,researchQueueBatchSize:5,researchCoverageTarget:415,discoveryEnabled:false});
    }
    if(action==="QUEUE_INTELLIGENCE_BATCH") {
      const runId=clean(body?.runId),batchSize=Number(body?.batchSize??5);
      if(!/^[0-9a-f-]{36}$/.test(runId)||!Number.isInteger(batchSize)||batchSize<1||batchSize>5)return json({ok:false,error:"intelligence_batch_request_invalid"},400);
      const [{data:run},{data:active}]=await Promise.all([db.from("backyrd_city_bootstrap_runs_v1").select("id,mode,status,requested_by,target_configuration").eq("id",runId).maybeSingle(),db.from("backyrd_spot_research_jobs_v1").select("id").eq("population_run_id",runId).in("state",["QUEUED","RUNNING"])]);
      if(!run||run.mode!=="INTELLIGENCE"||run.status!=="RUNNING"||!run.requested_by||run.target_configuration?.phase!=="FULL_LAUNCH_CURATION")return json({ok:false,error:"intelligence_batch_run_invalid"},403);
      const {data:actor}=await db.from("admin_users").select("user_id,role").eq("user_id",run.requested_by).in("role",["admin","super_admin"]).maybeSingle();if(!actor)return json({ok:false,error:"intelligence_batch_actor_lineage_invalid"},403);
      if((active??[]).length)return json({ok:true,runId,queued:0,waitingForActiveJobs:(active??[]).length});
      const {data:pending,error:pendingError}=await db.from("backyrd_spot_intelligence_population_v1").select("spot_id").eq("run_id",runId).eq("terminal_state","PENDING").order("spot_id").limit(batchSize);if(pendingError)throw pendingError;
      const items:any[]=[];for(const item of pending??[]){const queued=await db.rpc("backyrd_enqueue_spot_intelligence_population_job_v1",{p_run_id:runId,p_spot_id:item.spot_id});if(queued.error)throw queued.error;items.push(queued.data);}
      const {count:remaining}=await db.from("backyrd_spot_intelligence_population_v1").select("spot_id",{count:"exact",head:true}).eq("run_id",runId).eq("terminal_state","PENDING");
      return json({ok:true,runId,queued:items.length,researchJobsQueued:items.length*2,remainingCoverageTarget:remaining??0,items});
    }
    if(action==="STATUS") {
      const runId=clean(body?.runId),[{data:run},{data:candidates},{data:reviews},{data:bootstrapJobs}]=await Promise.all([db.from("backyrd_city_bootstrap_runs_v1").select("id,run_key,mode,status,started_at,completed_at,stop_reason").eq("id",runId).maybeSingle(),db.from("backyrd_city_bootstrap_candidates_v1").select("lifecycle_state,matched_spot_id").eq("run_id",runId),db.from("backyrd_city_bootstrap_reviews_v1").select("state,reason").eq("run_id",runId),db.from("backyrd_city_bootstrap_jobs_v1").select("stage,state,attempts,failure_class,failure_code").eq("run_id",runId)]);if(!run)return json({ok:false,error:"run_not_found"},404);
      const spotIds=(candidates??[]).map((row:any)=>row.matched_spot_id).filter(Boolean);const {data:research}=spotIds.length?await db.from("backyrd_spot_research_jobs_v1").select("state,phase,technical_attempts,input_tokens,output_tokens,total_tokens,web_search_calls,provider_latency_ms,failure_code,proposal_count").in("spot_id",spotIds):{data:[]};
      const count=(rows:any[],key:string)=>rows.reduce((out:any,row:any)=>(out[row[key]]=(out[row[key]]??0)+1,out),{});return json({ok:true,run,candidates:count(candidates??[],"lifecycle_state"),reviews:count(reviews??[],"state"),bootstrapJobs:count(bootstrapJobs??[],"state"),research:{states:count(research??[],"state"),jobs:(research??[]).length,inputTokens:(research??[]).reduce((n:number,r:any)=>n+r.input_tokens,0),outputTokens:(research??[]).reduce((n:number,r:any)=>n+r.output_tokens,0),webSearchCalls:(research??[]).reduce((n:number,r:any)=>n+r.web_search_calls,0),proposals:(research??[]).reduce((n:number,r:any)=>n+r.proposal_count,0),technicalAttempts:(research??[]).reduce((n:number,r:any)=>n+r.technical_attempts,0)}});
    }
    return json({ok:false,error:"action_invalid"},400);
  } catch(error) { return json({ok:false,error:"city_bootstrap_worker_failed",code:error instanceof Error&&/^[a-z0-9_:-]{1,160}$/i.test(error.message)?error.message:"internal_error"},500); }
});
