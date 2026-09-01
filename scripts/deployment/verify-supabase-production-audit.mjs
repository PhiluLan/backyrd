#!/usr/bin/env node
import { readFileSync, writeFileSync } from "node:fs";
import { createHash } from "node:crypto";

const args = Object.fromEntries(process.argv.slice(2).reduce((rows,value,index,all)=>value.startsWith("--")?rows.concat([[value.slice(2),all[index+1]]]):rows,[]));
const read = (path) => JSON.parse(readFileSync(path,"utf8"));
const plan=read(args.plan),before=read(args.before),after=read(args.after);
const bySlug=(rows)=>new Map(rows.map((row)=>[row.slug,row]));
const old=bySlug(before),current=bySlug(after),deployed=new Set(plan.deployFunctions);
for(const item of plan.functions){
  const next=current.get(item.slug); if(!next)throw new Error(`active_function_missing:${item.slug}`);
  if(Boolean(next.verify_jwt)!==item.verifyJwt)throw new Error(`verify_jwt_identity_mismatch:${item.slug}`);
  if(!/^[0-9a-f]{64}$/.test(String(next.ezbr_sha256??"")))throw new Error(`bundle_identity_missing:${item.slug}`);
  const previous=old.get(item.slug);
  if(deployed.has(item.slug)&&previous&&Number(next.version)<=Number(previous.version))throw new Error(`planned_function_version_did_not_advance:${item.slug}`);
  if(!deployed.has(item.slug)&&previous&&Number(next.version)!==Number(previous.version))throw new Error(`unplanned_function_version_changed:${item.slug}`);
}
const evidence={result:"PASS",canonicalMainSha:plan.canonicalMainSha,planHash:plan.planHash,deployFunctions:plan.deployFunctions,migrations:plan.migrations,activeFunctions:plan.functions.map((item)=>{const row=current.get(item.slug);return{slug:item.slug,version:row.version,verifyJwt:row.verify_jwt,bundleHash:row.ezbr_sha256,sourceSetHash:item.sourceSetHash};})};
evidence.auditHash=createHash("sha256").update(JSON.stringify(evidence)).digest("hex");
writeFileSync(args.output,`${JSON.stringify(evidence,null,2)}\n`,{encoding:"utf8",flag:"wx"});
