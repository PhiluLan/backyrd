#!/usr/bin/env node
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { createClient } from "@supabase/supabase-js";

if (process.env.BACKYRD_GATE7_PRODUCTION_ACCEPTANCE !== "AUTHORIZED_ISOLATED_BOUNDED") {
  throw new Error("explicit isolated bounded Production acceptance acknowledgement required");
}
const url = process.env.SUPABASE_URL;
const anonKey = process.env.SUPABASE_ANON_KEY;
const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
if (!url?.includes("hjgcrrzfjchzqoegcywn") || !anonKey || !serviceKey) throw new Error("Production credentials required");
const options = { auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false } };
const makeClient = (key = anonKey) => createClient(url, key, options);
const admin = makeClient(serviceKey);
const marker = `g7-${randomUUID().replaceAll("-", "").slice(0, 14)}`;
const password = `Gate7-${randomUUID()}-Strong!`;
const users = [];
const entities = { post: null, chat: null, review: null };
const report = {};
const percentile = (rows, p) => [...rows].sort((a,b)=>a-b)[Math.min(rows.length-1,Math.ceil(rows.length*p)-1)];
const metrics = (rows) => ({ count: rows.length, p50Ms: Math.round(percentile(rows,.5)), p95Ms: Math.round(percentile(rows,.95)), maxMs: Math.round(Math.max(...rows)) });
async function measured(fn) { const started=performance.now(); const result=await fn(); return { result, ms:performance.now()-started }; }
async function series(name,count,fn) { const rows=[]; for(let i=0;i<count;i+=1){const row=await measured(()=>fn(i)); if(row.result?.error) throw row.result.error; rows.push(row.ms);} report[name]=metrics(rows); }
async function burst(name,count,fn) { const started=performance.now(); const rows=await Promise.all(Array.from({length:count},(_,i)=>measured(()=>fn(i)))); const failures=rows.filter(row=>row.result?.error||row.result?.ok===false); report[name]={...metrics(rows.map(row=>row.ms)),wallMs:Math.round(performance.now()-started),failures:failures.length}; assert.equal(failures.length,0); }

async function createUser(suffix) {
  const email=`${marker}-${suffix}@backyrd.ch`;
  const created=await admin.auth.admin.createUser({email,password,email_confirm:true,user_metadata:{production_fixture:"gate7-capacity-v1"}});
  assert.ifError(created.error); const id=created.data.user.id; users.push(id);
  const client=makeClient(); const login=await client.auth.signInWithPassword({email,password}); assert.ifError(login.error);
  const onboard=await client.rpc("complete_profile_onboarding_v2",{p_display_name:`Gate Seven ${suffix.toUpperCase()}`,p_username:`${marker.replaceAll("-","")}${suffix}`.slice(0,24),p_age:30,p_city:"Basel",p_country:"Schweiz"}); assert.ifError(onboard.error);
  return {id,client,token:login.data.session.access_token};
}
async function cleanup() {
  if(entities.chat) await admin.from("chats").delete().eq("id",entities.chat);
  if(entities.post) await admin.from("social_posts").delete().eq("id",entities.post);
  if(entities.review) await admin.from("reviews").delete().eq("id",entities.review);
  for(const id of users){
    await admin.from("backyrd_internal_live_users_v1").delete().eq("user_id",id);
    await admin.from("user_consents").delete().eq("user_id",id);
    await admin.from("decision_sessions").delete().eq("user_id",id);
    await admin.from("safety_content_items").delete().eq("actor_user_id",id);
    const removed=await admin.auth.admin.deleteUser(id); if(removed.error) throw removed.error;
  }
}
async function decision(user,index) {
  const query=index%3===0?"Gemütliches Café in Basel":index%3===1?"Restaurant für ein ruhiges Abendessen":"Bar mit Freunden";
  const response=await fetch(`${url}/functions/v1/decision-v13`,{method:"POST",headers:{authorization:`Bearer ${user.token}`,apikey:anonKey,"content-type":"application/json"},body:JSON.stringify({city:"Basel",query,rawFreeText:query,inputMode:"free",limit:10,v12Limit:12,semanticLimit:20,excludeSpotIds:[]})});
  const payload=await response.json().catch(()=>null); return {error:response.ok&&payload?.ok===true?null:`decision_${response.status}_${payload?.error??"invalid"}`};
}

try {
  const spotResult=await admin.from("spots").select("id").eq("status","approved").limit(1).single(); assert.ifError(spotResult.error);
  const [a,b]=await Promise.all([createUser("a"),createUser("b")]);
  await admin.from("user_consents").insert({user_id:a.id,purpose_key:"personalized_recommendations",status:"granted",granted_at:new Date().toISOString(),source:"system_migration"});
  await admin.from("backyrd_internal_live_users_v1").insert({user_id:a.id,enabled:true,n2_enabled:false,user_intelligence_enabled:false,decision_enabled:true,n6_enabled:false,activation_reason:"GO_LIVE_GATE_7_CAPACITY"});
  const cold=await measured(()=>decision(a,0)); assert.equal(cold.result.error,null); report.decisionCold={count:1,p50Ms:Math.round(cold.ms),p95Ms:Math.round(cold.ms),maxMs:Math.round(cold.ms)};
  await series("decisionWarm",5,(index)=>decision(a,index));
  await burst("decision10Concurrent",10,(index)=>decision(a,index));
  await burst("decision25Concurrent",25,(index)=>decision(a,index));
  await series("profile",20,()=>a.client.rpc("get_social_profile_v2",{p_user_id:b.id}));
  await series("favorite",10,async(index)=> index%2===0 ? a.client.from("favorites").upsert({user_id:a.id,spot_id:spotResult.data.id},{onConflict:"user_id,spot_id"}) : a.client.from("favorites").delete().eq("user_id",a.id).eq("spot_id",spotResult.data.id));
  await series("follow",10,async(index)=> index%2===0 ? a.client.rpc("follow_user_v2",{p_user_id:b.id}) : a.client.rpc("unfollow_user_v2",{p_user_id:b.id}));
  entities.post=randomUUID(); const post=await b.client.from("social_posts").insert({id:entities.post,user_id:b.id,spot_id:spotResult.data.id,caption:marker,status:"published",visibility:"public"}); assert.ifError(post.error);
  await series("like",10,(index)=>a.client.rpc("react_to_social_post_v1",{p_post_id:entities.post,p_reaction_type:"like",p_active:index%2===0}));
  await series("comment",5,(index)=>a.client.rpc("create_social_comment_v2",{p_post_id:entities.post,p_body:`${marker} comment ${index}`,p_client_request_id:randomUUID()}));
  const chat=await a.client.rpc("get_or_create_direct_chat_v1",{p_other_user_id:b.id}); assert.ifError(chat.error); entities.chat=Array.isArray(chat.data)?chat.data[0]?.chat_id:chat.data?.chat_id??chat.data; assert(entities.chat);
  await series("message",5,(index)=>a.client.rpc("send_message_v2",{p_chat_id:entities.chat,p_text:`${marker} message ${index}`,p_image_url:null,p_client_request_id:randomUUID()}));
  const review=await measured(()=>a.client.functions.invoke("create-review-with-photos",{body:{spot_id:spotResult.data.id,text:`${marker} latency review`,mood_a:"gemütlich",photo_urls:[],city:"Basel"}})); assert.ifError(review.result.error); assert(review.result.data?.ok); entities.review=review.result.data.review_id; report.reviewCreate={count:1,p50Ms:Math.round(review.ms),p95Ms:Math.round(review.ms),maxMs:Math.round(review.ms)};
  process.stdout.write(`${JSON.stringify({result:"PASS",measuredAt:new Date().toISOString(),report},null,2)}\n`);
} finally { await cleanup(); }
