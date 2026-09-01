#!/usr/bin/env node
import { createHash } from "node:crypto";
import { readFileSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";
import { Parser } from "@deno/eszip";

const sha256=(value)=>createHash("sha256").update(value).digest("hex");
const args=Object.fromEntries(process.argv.slice(2).reduce((rows,value,index,all)=>value.startsWith("--")?rows.concat([[value.slice(2),all[index+1]]]):rows,[]));
if(!args.eszip||!args.manifest||!args.repo||!args.output)throw new Error("--eszip, --manifest, --repo and --output are required");

const body=readFileSync(resolve(args.eszip));
if(body.subarray(0,8).toString("utf8")!=="ESZIP2.3")throw new Error("unsupported_or_invalid_eszip_identity");
const embedded=new Map();
const parser=await Parser.createInstance();
const specifiers=await parser.parseBytes(body);
await parser.load();
for(const specifier of specifiers){
  const normalized=String(specifier).replace(/^file:\/\//,"").replace(/^\//,"");
  if(!normalized.startsWith("app/"))continue;
  const path=normalized.slice(4),content=await parser.getModuleSource(specifier);
  if(typeof content!=="string")throw new Error(`production_source_content_missing:${path}`);
  if(embedded.has(path)&&embedded.get(path)!==content)throw new Error(`conflicting_embedded_production_source:${path}`);
  embedded.set(path,content);
}

// TypeScript modules are stored as executable transpiled source in ESZIP. The
// original byte identity is retained in their embedded source maps. Overlay
// only repository-rooted source-map content; JavaScript/MJS modules remain the
// lossless module source returned by the canonical parser above.
const sourceMapMarker=Buffer.from('{"version":3,"sources":[');
const parseJsonObjectAt=(start)=>{
  let depth=0,inString=false,escaped=false;
  for(let index=start;index<body.length;index+=1){
    const byte=body[index];
    if(inString){
      if(escaped)escaped=false;
      else if(byte===0x5c)escaped=true;
      else if(byte===0x22)inString=false;
      continue;
    }
    if(byte===0x22){inString=true;continue;}
    if(byte===0x7b)depth+=1;
    else if(byte===0x7d){depth-=1;if(depth===0)return body.subarray(start,index+1).toString("utf8");}
  }
  throw new Error(`unterminated_embedded_source_map:${start}`);
};
let sourceMapOffset=0;
while((sourceMapOffset=body.indexOf(sourceMapMarker,sourceMapOffset))!==-1){
  let map;
  try{map=JSON.parse(parseJsonObjectAt(sourceMapOffset));}catch{sourceMapOffset+=sourceMapMarker.length;continue;}
  for(let index=0;index<(map.sources?.length??0);index+=1){
    const normalized=String(map.sources[index]??"").replace(/^file:\/\//,"").replace(/^\//,"");
    if(!normalized.startsWith("app/")||typeof map.sourcesContent?.[index]!=="string")continue;
    embedded.set(normalized.slice(4),map.sourcesContent[index]);
  }
  sourceMapOffset+=sourceMapMarker.length;
}

const manifest=JSON.parse(readFileSync(resolve(args.manifest),"utf8"));
const decision=manifest.functions?.find((item)=>item.slug==="decision-v13");
if(!decision||decision.files.length!==40)throw new Error("decision_v13_40_file_manifest_required");
const expected=new Map(decision.files.map((item)=>[item.path,item.sha256]));
const productionPaths=[...embedded.keys()].filter((path)=>expected.has(path)).sort();
const missing=[...expected.keys()].filter((path)=>!embedded.has(path)).sort();
const unexpected=[...embedded.keys()].filter((path)=>path.startsWith("supabase/functions/decision-v13/")||expected.has(path)).filter((path)=>!expected.has(path)).sort();
const mismatches=[];
for(const [path,expectedHash] of expected){
  if(!embedded.has(path))continue;
  const productionHash=sha256(Buffer.from(embedded.get(path),"utf8"));
  const repositoryHash=sha256(readFileSync(resolve(args.repo,path)));
  if(productionHash!==expectedHash||repositoryHash!==expectedHash)mismatches.push({path,expectedHash,productionHash,repositoryHash});
}
if(missing.length||unexpected.length||mismatches.length||productionPaths.length!==40)throw new Error(`production_source_identity_mismatch:${JSON.stringify({missing,unexpected,mismatches,matched:productionPaths.length})}`);
const entrypoint="supabase/functions/decision-v13/index.deploy.ts";
const entrypointSource=embedded.get(entrypoint);
if(entrypointSource!=='import "./live-index.ts";\n')throw new Error("production_entrypoint_contract_mismatch");
const evidence={
  version:"backyrd-production-eszip-source-verification-v1",
  eszipFormat:"ESZIP2.3",
  eszipBodySha256:sha256(body),
  sourceSetHash:decision.sourceSetHash,
  configHash:decision.configHash,
  verifyJwt:decision.verifyJwt,
  deployedFileCount:productionPaths.length,
  repositoryMatchedFileCount:productionPaths.length,
  entrypointPath:entrypoint,
  entrypointSha256:sha256(Buffer.from(entrypointSource,"utf8")),
  missingSources:missing,
  unexpectedDecisionSources:unexpected,
  mismatches,
  sources:productionPaths.map((path)=>({path,sha256:expected.get(path)})),
  result:"PASS",
};
evidence.evidenceHash=sha256(JSON.stringify(evidence));
writeFileSync(resolve(args.output),`${JSON.stringify(evidence,null,2)}\n`,{encoding:"utf8",flag:"wx"});
