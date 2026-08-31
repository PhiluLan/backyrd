#!/usr/bin/env node

const required=(name)=>{const value=process.env[name]?.trim();if(!value)throw new Error(`Missing ${name}`);return value;};
const url=required("SUPABASE_URL").replace(/\/$/,"");
const serviceKey=required("SUPABASE_SERVICE_ROLE_KEY");
const spotIds=required("BACKYRD_MOOD_CANARY_SPOT_IDS").split(",").map((value)=>value.trim()).filter(Boolean);
if(process.env.BACKYRD_PRODUCTION_CANARY_ACK!=="READ_ONLY_CANONICAL_MOOD_V1")throw new Error("Set BACKYRD_PRODUCTION_CANARY_ACK=READ_ONLY_CANONICAL_MOOD_V1");
if(spotIds.length<1||spotIds.length>20)throw new Error("Canary requires 1-20 explicit Spot IDs");
if(spotIds.some((id)=>!/^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(id)))throw new Error("Invalid canary Spot ID");

const headers={apikey:serviceKey,authorization:`Bearer ${serviceKey}`,"content-type":"application/json"};
const rpc=async(name,body)=>{const response=await fetch(`${url}/rest/v1/rpc/${name}`,{method:"POST",headers,body:JSON.stringify(body)});const text=await response.text();if(!response.ok)throw new Error(`${name} failed ${response.status}: ${text}`);return text?JSON.parse(text):null;};
const query="gemütlicher und urbaner Ort zum Kaffee trinken";
const resolved=await rpc("backyrd_resolve_decision_mood_query_v1",{p_query:query,p_mood_a:null,p_mood_b:null});
const signal=await rpc("backyrd_decision_community_mood_signal_v1",{p_spot_ids:spotIds,p_query:query,p_mood_a:null,p_mood_b:null});
const profileResponse=await fetch(`${url}/rest/v1/backyrd_spot_mood_profile_v1?select=spot_id,concept_key,concept_contributors,eligible_contributors,percentage,evidence_state,rank&spot_id=in.(${spotIds.join(",")})`,{headers});
if(!profileResponse.ok)throw new Error(`canonical profile read failed ${profileResponse.status}: ${await profileResponse.text()}`);
const profiles=await profileResponse.json();

const failures=[];
if(JSON.stringify((resolved??[]).map((row)=>row.concept_key).sort())!==JSON.stringify(["mood.cozy","mood.urban"]))failures.push("QUERY_RESOLUTION_MISMATCH");
for(const row of signal??[]){const strength=Number(row.signal_strength);if(!Number.isFinite(strength)||strength<=0||strength>1)failures.push(`INVALID_SIGNAL:${row.spot_id}`);if(Number(row.eligible_contributors)<3)failures.push(`LOW_EVIDENCE_SIGNAL:${row.spot_id}`);}
for(const row of profiles??[]){if(row.evidence_state==="ESTABLISHED"&&Number(row.eligible_contributors)<3)failures.push(`PROFILE_THRESHOLD_MISMATCH:${row.spot_id}`);}

console.log(JSON.stringify({
  status:failures.length?"FAIL":"PASS",
  mode:"READ_ONLY",
  queryConcepts:(resolved??[]).map(({concept_key,label})=>({concept_key,label})),
  requestedSpotCount:spotIds.length,
  profileRowCount:profiles.length,
  establishedProfileRowCount:profiles.filter((row)=>row.evidence_state==="ESTABLISHED").length,
  signalSpotCount:(signal??[]).length,
  failures,
},null,2));
if(failures.length)process.exitCode=1;
