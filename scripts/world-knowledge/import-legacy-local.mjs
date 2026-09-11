import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { postgresJsonbText } from "./postgres-jsonb-canonical.mjs";
const required = (name) => { const value=process.env[name]; if(!value) throw new Error(`${name} is required`); return value; };
const url=required("WK_LOCAL_SUPABASE_URL"); if(!/^https?:\/\/(127\.0\.0\.1|localhost)(:\d+)?\/?$/.test(url)) throw new Error("local import refuses non-loopback Supabase URL");
const anon=required("WK_LOCAL_SUPABASE_ANON_KEY"), email=required("WK_LOCAL_ADMIN_EMAIL"), password=required("WK_LOCAL_ADMIN_PASSWORD");
const transform=JSON.parse(readFileSync(resolve(process.argv[2] ?? ".local/world-knowledge-import/transform.json"),"utf8"));
const source=JSON.parse(readFileSync(resolve(process.argv[3] ?? ".local/world-knowledge-import/production-export.json"),"utf8"));
const digest=(value)=>createHash("sha256").update(postgresJsonbText(value)).digest("hex");
const login=await fetch(`${url.replace(/\/$/,"")}/auth/v1/token?grant_type=password`,{method:"POST",headers:{apikey:anon,"content-type":"application/json"},body:JSON.stringify({email,password})}); if(!login.ok)throw new Error(`local admin login failed: ${login.status}`); const token=(await login.json()).access_token;
const active=new Set(source.records.filter((row)=>row.lifecycle==="ACTIVE_PUBLISHED").map((row)=>row.spotId));
const bySpot=new Map(); for(const row of transform.results){if(!active.has(row.spotId))continue; const list=bySpot.get(row.spotId)??[];list.push(row);bySpot.set(row.spotId,list);}
const body={contractVersion:"backyrd.world-knowledge.legacy-local-import@4a.1",requestId:process.env.WK_LOCAL_IMPORT_REQUEST_ID??`import:${transform.manifestHash}`,targetEnvironment:"LOCAL_FOUNDER_EVALUATION",exportBatchId:source.batchId,sourceSnapshotAt:source.sourceSnapshotAt,sourceManifestHash:source.manifestHash,transformManifestHash:transform.manifestHash,mappingHash:transform.mappingHash,registryHash:transform.registryHash,spots:[...bySpot.entries()].sort(([a],[b])=>a.localeCompare(b)).map(([spotId,values])=>({spotId,lifecycle:"ACTIVE_PUBLISHED",displayName:source.records.find((row)=>row.spotId===spotId)?.fields?.name??null,values}))};
const payload={...body,importManifestHash:digest(body)};
const response=await fetch(`${url.replace(/\/$/,"")}/rest/v1/rpc/world_admin_import_legacy_batch_v1`,{method:"POST",headers:{apikey:anon,authorization:`Bearer ${token}`,"content-type":"application/json"},body:JSON.stringify({p_payload:payload})});
if(!response.ok)throw new Error(`local import rejected: ${response.status} ${await response.text()}`); process.stdout.write(`${JSON.stringify(await response.json())}\n`);
