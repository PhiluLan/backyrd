import { randomUUID } from "node:crypto";
import { performance } from "node:perf_hooks";
import { createClient } from "@supabase/supabase-js";
import { buildCanonicalRuntimeInput, buildN5_8_4UserCard, runQueueOnce, drainQueue, SupabaseUserIntelligenceRepository } from "../../packages/user-intelligence-runtime/src/index.mjs";

const url=process.env.SUPABASE_URL,serviceKey=process.env.SUPABASE_SERVICE_ROLE_KEY,anonKey=process.env.SUPABASE_ANON_KEY;
if(!url||!serviceKey||!anonKey) throw new Error("SUPABASE_URL_SUPABASE_SERVICE_ROLE_KEY_SUPABASE_ANON_KEY_required");
if(!/^https?:\/\/(127\.0\.0\.1|localhost)(:|\/)/.test(url)&&process.env.ALLOW_NONLOCAL_EXECUTION_VALIDATION!=="true") throw new Error("execution_validation_requires_local_or_explicit_nonlocal_authorization");
class DisabledRealtimeTransport { constructor(){throw new Error("realtime_disabled_for_server_worker")} }
const clientOptions={auth:{persistSession:false,autoRefreshToken:false},realtime:{transport:DisabledRealtimeTransport}};
const service=createClient(url,serviceKey,clientOptions),repository=new SupabaseUserIntelligenceRepository(service);
const must=(error,label)=>{if(error)throw new Error(`${label}:${error.message}`)};
const id=()=>randomUUID(),suffix=randomUUID().slice(0,8),password=`Local-${randomUUID()}!`;
const users={a:null,b:null},cleanupUsers=[],spots={a:id(),b:id(),c:id()},reviews={a:id(),b:id(),c:id()},decision=id();
const output={identity:`s2-execution-${suffix}`,cards:[],ledger:[],failures:{},security:{},performance:{},trace:[]};
const summarizeNodes=(nodes=[])=>nodes.map((node)=>({nodeKey:node.nodeKey,concept:node.concept,scope:node.scope,polarity:node.polarity,knowledgeState:node.knowledgeState,affinity:node.affinity,confidence:node.confidence,highEligible:node.highEligibility?.eligible??false,evidenceComposition:node.evidenceComposition}));

async function createUser(label){const email=`s2-${label}-${suffix}-${id().slice(0,6)}@fixture.invalid`;const {data,error}=await service.auth.admin.createUser({email,password,email_confirm:true});must(error,`create_${label}`);const userId=data.user.id;cleanupUsers.push(userId);const {error:profileError}=await service.from("profiles").upsert({id:userId});must(profileError,`profile_${label}`);return{email,id:userId};}
async function signIn(user){const client=createClient(url,anonKey,clientOptions);const{error}=await client.auth.signInWithPassword({email:user.email,password});must(error,"sign_in");return client;}
async function bridge(){const{data,error}=await service.rpc("backyrd_memory_bridge_process_v1",{p_limit:100});must(error,"bridge_process");return data;}
async function card(){const{data,error}=await service.rpc("backyrd_read_latest_shared_user_card_v1",{p_user_id:users.a.id});must(error,"read_card");return data;}
async function ledgerCount(){const{count,error}=await service.from("backyrd_user_intelligence_change_ledger_v1").select("id",{count:"exact",head:true}).eq("user_id",users.a.id);must(error,"ledger_count");return count;}
async function snapshot(){const{data,error}=await service.from("backyrd_user_intelligence_latest_v1").select("snapshot_id,source_watermark").eq("user_id",users.a.id).maybeSingle();must(error,"latest_snapshot");if(!data)return null;const{data:s,error:e}=await service.from("backyrd_user_intelligence_snapshots_v2").select("snapshot_id,snapshot_hash,node_count,card").eq("snapshot_id",data.snapshot_id).single();must(e,"snapshot");return s;}
async function runStage(name){const bridgeResult=await bridge();const started=performance.now(),runs=await drainQueue({repository,limit:25});const latest=await snapshot(),count=await ledgerCount();output.cards.push({name,snapshotHash:latest?.snapshot_hash??null,nodeCount:latest?.node_count??0,nodes:summarizeNodes(latest?.card?.nodes)});output.ledger.push({name,count});output.trace.push({name,bridge:bridgeResult,runner:runs.map(({status,claim,snapshotHash,failureCode})=>({status,workIds:claim?.workIds?.length??0,watermark:claim?.watermark,snapshotHash,failureCode})),durationMs:Number((performance.now()-started).toFixed(3))});if(runs.some((run)=>run.status.endsWith("FAILED")))throw new Error(`stage_failed:${name}:${JSON.stringify(output.trace.at(-1))}`);return{latest,runs};}
async function runTargetUser(userId){const runs=await drainQueue({repository,limit:100});const target=runs.findLast((run)=>run.claim?.userId===userId);if(!target)throw new Error(`target_user_work_not_processed:${userId}`);if(target.status.endsWith("FAILED"))throw new Error(`target_user_work_failed:${target.failureCode}`);return target;}
async function ingest(userId,key,eventType,spotId,sessionId,sourceEventId){const at=new Date(Date.now()-60_000).toISOString();const{data,error}=await service.rpc("backyrd_ingest_memory_event_v1",{p_event:{userId,idempotencyKey:key,eventType,contractVersion:"backyrd-memory-event-contract-v1",occurredAt:at,observedAt:at,spotId,sessionId,momentSignature:{audience:"solo"},spotEvidence:{},provenance:{source:"execution_validation",sourceEventId,sourceVersion:"v1"},consentPurpose:"personalized_recommendations",consentState:"granted"}});must(error,"ingest");return data;}
async function raceUser(label){const user=await createUser(label);must((await service.from("user_consents").insert({user_id:user.id,purpose_key:"personalized_recommendations",status:"granted",granted_at:new Date().toISOString(),source:"system_migration"})).error,`${label}_consent`);await ingest(user.id,`${label}:${suffix}`,"spot_opened",spots.a,`${label}-${suffix}`,`${label}-${suffix}`);return user;}
async function latestFor(userId){const{data,error}=await service.from("backyrd_user_intelligence_latest_v1").select("snapshot_id").eq("user_id",userId).maybeSingle();must(error,"race_latest");return data;}

try{
 users.a=await createUser("a");users.b=await createUser("b");const clientA=await signIn(users.a);
 const{error:purposeError}=await service.from("consent_purposes").upsert({key:"personalized_recommendations",title_de:"Personalization",description_de:"Execution fixture",category:"personalization",legal_basis:"consent",requires_consent:true,is_required:false,default_enabled:false,sort_order:1,is_active:true});must(purposeError,"purpose");
 for(const user of Object.values(users)){const{error}=await service.from("user_consents").insert({user_id:user.id,purpose_key:"personalized_recommendations",status:"granted",granted_at:new Date().toISOString(),source:"system_migration"});must(error,"consent");}
 must((await service.from("backyrd_memory_bridge_settings_v1").update({enabled:true}).eq("singleton",true)).error,"bridge_enable");must((await service.from("backyrd_user_intelligence_runtime_settings_v1").update({enabled:true}).eq("singleton",true)).error,"runtime_enable");
 must((await service.from("spots").insert([{id:spots.a,name:"Execution A",lat:47.55,lng:7.59,status:"approved"},{id:spots.b,name:"Execution B",lat:47.56,lng:7.60,status:"approved"},{id:spots.c,name:"Execution C",lat:47.57,lng:7.61,status:"approved"}])).error,"spots");
 must((await service.from("backyrd_spot_intelligence_evidence_v1").insert([{spot_id:spots.a,dimension_key:"vibe.cozy",value_kind:"INTERPRETATION",value:.92,source_family:"backyrd_derived",source_reference:`execution:${suffix}:a`,signal_confidence:.91,observed_at:new Date().toISOString(),valid_from:new Date().toISOString(),provenance:{fixture:true}},{spot_id:spots.b,dimension_key:"vibe.lively",value_kind:"INTERPRETATION",value:.9,source_family:"backyrd_derived",source_reference:`execution:${suffix}:b`,signal_confidence:.9,observed_at:new Date().toISOString(),valid_from:new Date().toISOString(),provenance:{fixture:true}}])).error,"n4");
 must((await service.from("backyrd_spot_intelligence_snapshots_v1").insert([{spot_id:spots.a,context_key:"global",intelligence:{placeType:"bar"},confidence:.9,completeness:.8,contradictions:[],evidence_watermark:new Date().toISOString(),fingerprint:"a".repeat(64),calculated_at:new Date().toISOString()},{spot_id:spots.b,context_key:"global",intelligence:{placeType:"bar"},confidence:.9,completeness:.8,contradictions:[],evidence_watermark:new Date().toISOString(),fingerprint:"b".repeat(64),calculated_at:new Date().toISOString()}])).error,"n4_snapshots");
 output.cards.push({name:"CARD_0_NO_EVIDENCE",snapshotHash:null,nodeCount:0,nodes:[]});

 must((await service.from("decision_sessions").insert({id:decision,user_id:users.a.id,city:"Basel"})).error,"decision");
 must((await service.from("decision_impressions").insert([{decision_id:decision,spot_id:spots.a,rank:1},{decision_id:decision,spot_id:spots.b,rank:2},{decision_id:decision,spot_id:spots.c,rank:3}])).error,"impressions");
 let{error}=await clientA.rpc("backyrd_record_memory_product_action_v1",{p_client_event_id:id(),p_action_type:"spot_opened",p_spot_id:spots.a,p_decision_id:decision,p_entry_surface:"decision",p_occurred_at:new Date().toISOString()});must(error,"open");
 ({error}=await clientA.from("favorites").insert({user_id:users.a.id,spot_id:spots.a}));must(error,"save");
 const stage1=await runStage("CARD_1_OPEN_SAVE");if(stage1.latest?.card?.nodes?.some((node)=>node.polarity!=="UNKNOWN"))throw new Error("open_save_invented_satisfaction");

 must((await service.from("reviews").insert({id:reviews.a,user_id:users.a.id,spot_id:spots.a,product_evidence_origin:"smart_review_v1",mood_a:"gemütlich",text:"Super gemütlich, komme wieder."})).error,"review_a");
 must((await service.from("review_photos").insert({review_id:reviews.a,url:`https://fixture.invalid/${reviews.a}.jpg`,uploaded_by:users.a.id})).error,"photo_a");
 await runStage("CARD_2_POSITIVE_REVIEW");

 must((await service.from("reviews").insert({id:reviews.b,user_id:users.a.id,spot_id:spots.b,product_evidence_origin:"smart_review_v1",mood_a:"laut",text:"Viel zu laut und hektisch, komme nicht wieder."})).error,"review_b");
 must((await service.from("review_photos").insert({review_id:reviews.b,url:`https://fixture.invalid/${reviews.b}.jpg`,uploaded_by:users.a.id})).error,"photo_b");
 await runStage("CARD_3_CONTRASTING_REVIEW");

 must((await service.from("reviews").insert({id:reviews.c,user_id:users.a.id,spot_id:spots.c,product_evidence_origin:"smart_review_v1",mood_a:"unmapped-mood",text:"War gut."})).error,"review_c");
 must((await service.from("review_photos").insert({review_id:reviews.c,url:`https://fixture.invalid/${reviews.c}.jpg`,uploaded_by:users.a.id})).error,"photo_c");
 const stageMissing=await runStage("CARD_4_MISSING_N4");if(stageMissing.latest?.card?.nodes?.some((node)=>node.concept==null))throw new Error("missing_n4_imputed_concept");

 const progressiveHash=stageMissing.latest.snapshot_hash,ledgerBeforeDelete=await ledgerCount();
 const{data:reviewMemory,error:memoryError}=await service.from("backyrd_memory_events_v1").select("id").eq("user_id",users.a.id).contains("provenance",{sourceEventId:`smart_review:${reviews.b}`});must(memoryError,"review_memory");
 must((await service.from("backyrd_memory_events_v1").delete().eq("id",reviewMemory[0].id)).error,"delete_memory");must((await service.from("reviews").delete().eq("id",reviews.b)).error,"delete_review");
 must((await service.rpc("backyrd_enqueue_user_intelligence_rebuild_v1",{p_user_id:users.a.id,p_reason:"SOURCE_EVIDENCE_REMOVED"})).error,"enqueue_delete_rebuild");
 const deleted=await runStage("CARD_5_AFTER_DELETION"),ledgerAfterDelete=await ledgerCount();
 must((await service.rpc("backyrd_enqueue_user_intelligence_rebuild_v1",{p_user_id:users.a.id,p_reason:"IDENTICAL_FULL_REBUILD"})).error,"enqueue_rebuild");
 const rebuilt=await runStage("CARD_6_IDENTICAL_REBUILD"),ledgerAfterRebuild=await ledgerCount();
 if(deleted.latest.snapshot_hash!==rebuilt.latest.snapshot_hash||ledgerAfterDelete!==ledgerAfterRebuild)throw new Error("identical_rebuild_not_deterministic");

 // Response loss after a real atomic commit is reconciled as committed.
 await ingest(users.a.id,`response-loss:${suffix}`,"spot_opened",spots.a,`response-${suffix}`,`response-${suffix}`);
 const responseLossRepo=Object.create(repository);responseLossRepo.persistAtomically=async(value)=>{await repository.persistAtomically(value);throw new Error("simulated_response_loss")};
 const responseLoss=await runQueueOnce({repository:responseLossRepo});output.failures.responseLoss=responseLoss.status;if(responseLoss.status!=="COMMITTED_RECOVERED")throw new Error(`response_loss_not_reconciled:${JSON.stringify(responseLoss)}`);

 // One active user lease means parallel runners cannot claim the same generation.
 await ingest(users.a.id,`parallel:${suffix}`,"spot_opened",spots.a,`parallel-${suffix}`,`parallel-${suffix}`);
 const parallel=await Promise.all([runQueueOnce({repository}),runQueueOnce({repository})]);output.failures.parallel=parallel.map((x)=>x.status);if(parallel.filter((x)=>x.status.startsWith("COMMITTED")).length!==1)throw new Error("parallel_claim_not_exclusive");

 // A post-claim event remains queued beyond the fixed watermark.
 await ingest(users.a.id,`watermark-a:${suffix}`,"spot_opened",spots.a,`watermark-a-${suffix}`,`watermark-a-${suffix}`);
 const firstWatermark=await runQueueOnce({repository,hooks:{afterClaim:async()=>{await ingest(users.a.id,`watermark-b:${suffix}`,"saved",spots.a,`watermark-b-${suffix}`,`watermark-b-${suffix}`)}}});
 const secondWatermark=await runQueueOnce({repository});output.failures.watermark=[firstWatermark.status,secondWatermark.status];if(!secondWatermark.status.startsWith("COMMITTED"))throw new Error("new_event_lost_after_watermark");

 // Crash-after-claim recovery is lease-driven and restartable.
 const crashUser=await raceUser("crash");const abandoned=await repository.claimWork(30);if(abandoned.userId!==crashUser.id)throw new Error("crash_claim_wrong_user");must((await service.from("backyrd_user_intelligence_user_leases_v1").update({expires_at:new Date(Date.now()-1000).toISOString()}).eq("lease_token",abandoned.leaseToken)).error,"expire_lease");const crashRecovery=await runQueueOnce({repository});output.failures.crashAfterClaim=crashRecovery.status;if(!crashRecovery.status.startsWith("COMMITTED"))throw new Error("expired_lease_not_recovered");

 // Temporary N4/source failure is retryable and succeeds without duplicate semantics.
 const n4User=await raceUser("n4-failure"),n4FailureRepo=Object.create(repository);n4FailureRepo.readCanonicalSources=async()=>{throw new Error("temporary_n4_failure")};const n4Failed=await runQueueOnce({repository:n4FailureRepo});must((await service.from("backyrd_user_intelligence_work_v1").update({available_at:new Date().toISOString()}).eq("user_id",n4User.id)).error,"release_n4_retry");const n4Recovered=await runQueueOnce({repository});output.failures.n4Retry=[n4Failed.status,n4Recovered.status];if(n4Failed.status!=="RETRYABLE_FAILED"||!n4Recovered.status.startsWith("COMMITTED"))throw new Error("n4_retry_failed");

 // A malformed transaction rolls back and the same work can be retried safely.
 const txUser=await raceUser("tx-failure"),txRepo=Object.create(repository);txRepo.persistAtomically=async(value)=>{const{error}=await service.rpc("backyrd_persist_shared_user_intelligence_v2",{p_user_id:value.userId,p_runtime_version:value.runtimeVersion,p_input_contract_version:"backyrd-production-input-adapter-v1",p_source_watermark:value.sourceWatermark,p_source_hash:"a".repeat(64),p_snapshot_hash:value.card.userCardHash,p_card:value.card,p_nodes:value.nodes,p_ledger:value.ledger,p_work_ids:value.workIds,p_lease_token:id()});if(!error)throw new Error("transaction_failure_not_injected");throw new Error(`temporary_transaction_failure:${error.message}`)};const txFailed=await runQueueOnce({repository:txRepo});if(await latestFor(txUser.id))throw new Error("failed_transaction_created_snapshot");must((await service.from("backyrd_user_intelligence_work_v1").update({available_at:new Date().toISOString()}).eq("user_id",txUser.id)).error,"release_tx_retry");const txRecovered=await runQueueOnce({repository});output.failures.transaction=[txFailed.status,txRecovered.status];if(txFailed.status!=="RETRYABLE_FAILED"||!txRecovered.status.startsWith("COMMITTED"))throw new Error("transaction_retry_failed");

 // Consent and account identity are checked again by the atomic commit RPC.
 const consentUser=await raceUser("consent-race"),consentRepo=Object.create(repository);consentRepo.persistAtomically=async(value)=>{must((await service.from("user_consents").update({status:"withdrawn",granted_at:null,withdrawn_at:new Date().toISOString()}).eq("user_id",value.userId).eq("purpose_key","personalized_recommendations")).error,"withdraw_during_commit");return repository.persistAtomically(value)};const consentRace=await runQueueOnce({repository:consentRepo});output.failures.consentRace=consentRace.status;if(await latestFor(consentUser.id))throw new Error("consent_race_resurrected_card");
 const deletedUser=await raceUser("delete-race"),deleteRepo=Object.create(repository);deleteRepo.persistAtomically=async(value)=>{const{error}=await service.auth.admin.deleteUser(value.userId);must(error,"delete_during_commit");return repository.persistAtomically(value)};const deletionRace=await runQueueOnce({repository:deleteRepo});output.failures.accountDeletionRace=deletionRace.status;if(await latestFor(deletedUser.id))throw new Error("account_deletion_resurrected_card");

 // Cross-user client boundaries.
 const{data:foreignCards,error:foreignCardError}=await clientA.from("backyrd_user_intelligence_snapshots_v2").select("snapshot_id").eq("user_id",users.b.id);output.security.foreignCardHidden=Boolean(foreignCardError)||foreignCards.length===0;
 output.security.foreignLedgerDenied=Boolean((await clientA.from("backyrd_user_intelligence_change_ledger_v1").select("id").eq("user_id",users.b.id)).error);
 output.security.forgeNodeDenied=Boolean((await clientA.from("backyrd_user_intelligence_snapshot_nodes_v1").insert({snapshot_id:id(),node_key:"forged",node:{}})).error);
 output.security.rebuildDenied=Boolean((await clientA.rpc("backyrd_enqueue_user_intelligence_rebuild_v1",{p_user_id:users.b.id,p_reason:"FORGED"})).error);
 if(Object.values(output.security).some((value)=>!value))throw new Error(`cross_user_security_failed:${JSON.stringify(output.security)}`);

 // Active-user burst benchmark through the real queue and persistence path.
 const burstStart=performance.now();await Promise.all(Array.from({length:100},(_,index)=>ingest(users.a.id,`burst:${suffix}:${index}`,"candidate_exposed",spots.a,`burst-${suffix}-${index}`,`burst-${suffix}-${index}`)));const burstRun=await runTargetUser(users.a.id);output.performance.hundredEventBurstMs=Number((performance.now()-burstStart).toFixed(3));output.performance.hundredEventBurstStatus=burstRun.status;const postBurstHash=(await snapshot()).snapshot_hash;
 const rebuildStart=performance.now();must((await service.rpc("backyrd_enqueue_user_intelligence_rebuild_v1",{p_user_id:users.a.id,p_reason:"PERFORMANCE_FULL_REBUILD"})).error,"enqueue_perf_rebuild");const fullRebuild=await runTargetUser(users.a.id);output.performance.fullRebuildMs=Number((performance.now()-rebuildStart).toFixed(3));output.performance.fullRebuildStatus=fullRebuild.status;const finalSnapshot=await snapshot();if(postBurstHash!==finalSnapshot.snapshot_hash)throw new Error("progressive_full_rebuild_mismatch");
 const directSource=await repository.readCanonicalSources(users.a.id),directInput=buildCanonicalRuntimeInput(directSource),directCard=buildN5_8_4UserCard(directInput,{asOf:directSource.asOf,spotIntelligence:directSource.n4BySpot}).userCard;if(directCard.userCardHash!==finalSnapshot.snapshot_hash)throw new Error("direct_shared_runtime_persisted_snapshot_mismatch");
 output.progressiveHash=progressiveHash;output.progressiveFinalHash=postBurstHash;output.finalHash=finalSnapshot.snapshot_hash;output.parityHash=directCard.userCardHash;output.ledgerBeforeDelete=ledgerBeforeDelete;output.ledgerAfterDelete=ledgerAfterDelete;output.ledgerAfterIdenticalRebuild=ledgerAfterRebuild;const finalCard=await card();output.actualCard={userId:finalCard.userId,userCardHash:finalCard.userCardHash,maturity:finalCard.maturity,memorySummary:finalCard.memorySummary,nodes:summarizeNodes(finalCard.nodes)};
 const report=process.env.VALIDATION_SUMMARY_ONLY==="true"?{identity:output.identity,cards:output.cards.map(({name,snapshotHash,nodeCount})=>({name,snapshotHash,nodeCount})),ledger:output.ledger,failures:output.failures,security:output.security,performance:output.performance,trace:output.trace,progressiveFinalHash:output.progressiveFinalHash,finalHash:output.finalHash,parityHash:output.parityHash}:output;
 console.log(JSON.stringify(report,null,2));
}finally{
 try{await service.from("backyrd_memory_bridge_settings_v1").update({enabled:false}).eq("singleton",true)}catch{}
 try{await service.from("backyrd_user_intelligence_runtime_settings_v1").update({enabled:false}).eq("singleton",true)}catch{}
 for(const userId of cleanupUsers) await service.auth.admin.deleteUser(userId).catch(()=>{});
}
