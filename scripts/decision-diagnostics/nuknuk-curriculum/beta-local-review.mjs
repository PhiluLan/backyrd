/** Offline replay of saved DEV outputs through the existing Product host. Never calls a model or provider. */
import {readFile,writeFile,mkdir,readdir} from 'node:fs/promises';
import {createHash} from 'node:crypto';
import {resolve,dirname} from 'node:path';
import {fileURLToPath} from 'node:url';
import {execFileSync} from 'node:child_process';
import ts from 'typescript';
import {scoreCatalogResults,pairedCatalogReports} from './beta-evaluation.mjs';
import {trainingStratum} from './beta-mixture.mjs';
import {validateNuknukCompactSearch,validateCompactTurn} from '../../../packages/decision-vnext-core/dist/nuknuk-understanding.js';
import {mergeNuknukDialogueUpdate} from '../../../packages/decision-vnext-core/dist/nuknuk-dialogue.js';
import {parseProductWorldResolverBinding} from '../../../packages/decision-vnext-core/dist/product-world-resolver-binding.js';
import {compileLibrarianPlan} from '../../../packages/decision-vnext-core/dist/product-librarian-plan.js';
import {exercise} from '../../../packages/decision-vnext-core/test/librarian-active-route-fixtures.mjs';
import {binding,profile,offer,area,prop,price,worldFact} from '../../../packages/decision-vnext-core/test/librarian-matching-fixtures.mjs';
const repo=resolve(dirname(fileURLToPath(import.meta.url)),'../../..');
const hash=x=>createHash('sha256').update(x).digest('hex');
const bytes=x=>JSON.stringify(x,null,2)+'\n';
const load=async path=>JSON.parse(await readFile(path,'utf8'));
const put=async(path,data)=>writeFile(path,bytes(data),{flag:'wx',mode:0o600});
const assert=(ok,reason)=>{if(!ok)throw Error(reason);};
export function selectForty(catalog,comparison){
 const byId=new Map(catalog.cases.map(r=>[r.id,r])),used=new Set(),selected=[];
 const add=(id,bucket)=>{assert(/^[a-z0-9_-]+$/.test(id),'local_review_unsafe_case_id');const row=byId.get(id);assert(row&&row.split==='DEV'&&!used.has(id),'local_review_roster_invalid');used.add(id);selected.push({id,bucket,family:row.family,scenarioGroup:row.scenarioGroup,stratum:trainingStratum(row),query:row.query,turns:row.turns??[],reference:row.reference});};
 assert(comparison.comparison.regressions.length===10,'local_review_expected_ten_regressions');
 for(const id of [...comparison.comparison.regressions].sort())add(id,'REGRESSION');
 const diversity=(pool,bucket)=>{
  const remaining=pool.map(id=>byId.get(id)).filter(r=>r&&r.split==='DEV'&&!used.has(r.id));const families=new Map(),themes=new Map(),groups=new Map();
  for(let n=0;n<10;n++){
   remaining.sort((a,b)=>(families.get(a.family)??0)-(families.get(b.family)??0)||(themes.get(a.theme)??0)-(themes.get(b.theme)??0)||(groups.get(a.scenarioGroup)??0)-(groups.get(b.scenarioGroup)??0)||hash(a.id).localeCompare(hash(b.id)));
   const row=remaining.shift();assert(row,'local_review_bucket_incomplete');add(row.id,bucket);families.set(row.family,(families.get(row.family)??0)+1);themes.set(row.theme,(themes.get(row.theme)??0)+1);groups.set(row.scenarioGroup,(groups.get(row.scenarioGroup)??0)+1);
  }
 };
 diversity(comparison.comparison.improvements,'IMPROVEMENT');
 diversity(catalog.cases.filter(r=>trainingStratum(r)==='COMPOSITION').map(r=>r.id),'COMPOSITION');
 diversity(catalog.cases.filter(r=>trainingStratum(r)==='DIALOGUE').map(r=>r.id),'DIALOGUE');
 assert(selected.length===40&&used.size===40,'local_review_requires_forty_unique');return selected;
}
export function syntheticProbeCatalog(reference){
 const week=Array.from({length:7},(_,index)=>({weekday:index+1,start:'00:00',end:'23:59'}));
 const hours=['MONDAY','TUESDAY','WEDNESDAY','THURSDAY','FRIDAY','SATURDAY','SUNDAY'].map(day=>({day,intervals:[{start:'00:00',end:'23:59'}]}));
 const kinds=[['CAFE','COFFEE_DAYTIME','CAFE'],['BREAKFAST','RESTAURANT','RESTAURANT'],['DINNER','RESTAURANT','RESTAURANT'],['PERMANENT_EXHIBITION','MUSEUM','MUSEUM'],['CINEMA_SCREENING','ENTERTAINMENT','CINEMA'],['BOULDERING','SPORT','BOULDER_GYM'],['CLIMBING','SPORT','CLIMBING_GYM'],['SWIMMING','SPORT','SWIMMING_POOL'],['MOVEMENT_PLAY','ACTIVITIES_PLAY','SPORTS_CENTRE'],['WORKSHOP','ACTIVITIES_PLAY','WORKSHOP_STUDIO'],['WALK','OUTDOOR_NATURE','PARK']];
 const localDay=new Intl.DateTimeFormat('en-CA',{timeZone:'Europe/Zurich',year:'numeric',month:'2-digit',day:'2-digit'}).format(new Date(reference.now));
 let index=88000;const catalog=[];
 for(const[kind,category,placeType]of kinds)for(const variant of ['CHEAP','EXPENSIVE','MINIMUM_AGE_6','OUTDOOR','DAY_0','DAY_1','STAIRS','LIVELY','QUIET']){
  const outdoor=variant==='OUTDOOR',properties=[prop('participation.age_suitability','all ages'),...(kind==='CAFE'?[prop('food.drink','coffee')]:[]),...(['DINNER','BREAKFAST'].includes(kind)?[prop('food.diet','vegetarian')]:[])];
  const o={...offer('main',kind,['inside'],properties,[price(variant==='EXPENSIVE'?65:10,{includes:kind==='CAFE'?'Kaffee':['BREAKFAST','DINNER'].includes(kind)?'Essen':'Eintritt',label:kind==='CAFE'?'Kaffee':'Angebot'})]),schedule:week};
  if(variant.startsWith('DAY_')){const d=new Date(localDay+'T12:00:00Z');d.setUTCDate(d.getUTCDate()+Number(variant.slice(4)));o.validFrom=d.toISOString().slice(0,10);o.validUntil=o.validFrom;}
  const p=profile([o],[{...area('inside',variant==='LIVELY'?[prop('atmosphere.character','lively')]:variant==='QUIET'?[prop('atmosphere.character','quiet')]:[]),kind:outdoor?'OUTDOOR':'INDOOR'}],category);
  const b=binding(++index,p,[worldFact('rule.age_access',{policy:variant==='MINIMUM_AGE_6'?'MINIMUM_AGE':'ALL_AGES',minimumAge:variant==='MINIMUM_AGE_6'?6:null,appliesFromTime:null}),worldFact('accessibility.step_free_entrance',variant!=='STAIRS',{resolution:variant==='STAIRS'?'KNOWN_FALSE':'KNOWN_TRUE'})]);
  b.resolvedAt=new Date(reference.now).toISOString();b.decisionProjection.facts=b.decisionProjection.facts.map(f=>f.key==='identity.name'?worldFact(f.key,'Synthetic probe '+kind+' '+variant):f.key==='hours.regular'?worldFact(f.key,hours):f.key==='classification.place_types'?worldFact(f.key,[placeType]):f);
  catalog.push(b);
 }
 for(const kind of ['CINEMA_SCREENING','WORKSHOP'])for(const amount of [10,30,65]){
  const offers=[{...offer('main',kind,['inside'],kind==='WORKSHOP'?[prop('experience.activity','pottery')]:[],[price(amount)]),schedule:week},{...offer('meal','DINNER',['inside'],[],[price(amount)]),schedule:week},{...offer('tea','CAFE',['inside'],[prop('food.drink','tea')],[price(amount,{includes:'Tee',label:'Tee'})]),schedule:week}];
  const b=binding(++index,profile(offers,[area()],'ENTERTAINMENT'));b.resolvedAt=new Date(reference.now).toISOString();b.decisionProjection.facts=b.decisionProjection.facts.map(f=>f.key==='hours.regular'?worldFact(f.key,hours):f.key==='classification.place_types'?worldFact(f.key,[kind==='CINEMA_SCREENING'?'CINEMA':'WORKSHOP_STUDIO']):f);catalog.push(b);
 }
 for(const world of catalog)parseProductWorldResolverBinding(world,'Basel');
 return catalog;
}
export function parseSavedMeaning(row,raw){
 const merged=row.task==='DIALOGAKTUALISIERUNG_V3'?mergeNuknukDialogueUpdate(row.previousMeaning,raw,row.turns):raw;
 return row.task==='DIALOGAKTUALISIERUNG_V3'?validateCompactTurn(merged,row,row.turns.map(t=>t.answer).join(' ')):validateNuknukCompactSearch(merged,row);
}
function observableSignature(response,search){
 const body=response.body;
 const context=body.interpretation??{};
 return {httpStatus:response.status,status:body.status??null,primaryCandidateId:body.primaryCandidateId??null,
  candidates:(body.candidates??[]).map(c=>({spotId:c.spotId,tier:c.tier,rank:c.rank,coreIntentCoverage:c.coreIntentCoverage,actualAvailability:c.actualAvailability,
   contextFit:c.rankVector?.contextFit??null})),
  context:{targetCity:context.targetCity??null,dateTime:context.dateTime??null,group:context.group??null,budget:context.budget??null,stayDuration:context.stayDuration??null},
  search:search?Object.fromEntries(['ranked','excluded','unresolved'].map(key=>[key,search[key].map(c=>({spotId:c.spotId,status:c.status,offerIds:[...c.offerIds].sort(),areaIds:[...c.areaIds].sort(),conditionalPlans:c.conditionalPlans.map(p=>({status:p.status,offerIds:[...p.offerIds].sort(),areaIds:[...p.areaIds].sort(),truth:p.conditions.map(x=>x.truth)}))})).sort((a,b)=>a.spotId.localeCompare(b.spotId))])):null,
  clarification:body.clarification??null,limitations:body.limitations??[],diagnostics:response.diagnostics};
}
export function dimensionCoverage(observation){
 const meaning=observation.meaning??{facts:[],extensions:[]};
 const mappings={date:f=>f.key?.startsWith('time.date'),budget:f=>f.key?.startsWith('budget.'),age:f=>f.key==='people.age',accessibility:f=>['participation.accessibility','offer.access'].includes(f.key),atmosphere:f=>f.key?.startsWith('atmosphere.'),modality:f=>['EXCLUDED','PREFERRED','NOT_REQUIRED'].includes(f.modality)};
 const assessed=['ranked','excluded','unresolved'].flatMap(key=>observation.search?.[key]??[]).flatMap(c=>c.facts);
 const coverage=Object.fromEntries(Object.entries(mappings).map(([name,predicate])=>{
  const facts=meaning.facts.filter(predicate),ids=new Set(facts.map(f=>f.id));
  if(!facts.length)return[name,{state:'NOT_APPLICABLE_IN_THIS_CASE',factIds:[]}];
  const covered=facts.filter(f=>{const states=new Set(assessed.filter(a=>a.factId===f.id).map(a=>a.state));return states.has('MET')&&states.has('FAILED');});
  return[name,{state:covered.length===facts.length?'CONTRASTING_HOST_ASSESSMENTS':'WITNESS_MISSING_OR_PARTIAL',factIds:[...ids],coveredFactIds:covered.map(f=>f.id),limitation:'Contrasting recorded assessments are dimension coverage, not a model correctness score.'}];
 }));
 const participants=new Set((meaning.entities??[]).filter(e=>['PERSON','GROUP'].includes(e.kind)).map(e=>e.id));
 coverage.personReferences={state:meaning.facts.some(f=>f.subjectIds?.some(id=>participants.has(id)))?'WITNESS_MISSING_OR_PARTIAL':'NOT_APPLICABLE_IN_THIS_CASE',limitation:'No universal equivalence of participant bindings was tested.'};
 const structured=meaning.logic!=null||(meaning.bindings??[]).length>0||(meaning.weatherConditions??[]).length>0;
 const hostLimits=[...new Set(assessed.filter(f=>/NOT_SUPPORTED|UNSUPPORTED/u.test(f.reason)).map(f=>f.reason))];
 coverage.logicAndBindings={state:!structured?'NOT_APPLICABLE_IN_THIS_CASE':hostLimits.length?'HOST_CAPABILITY_LIMIT':'WITNESS_MISSING_OR_PARTIAL',hostLimits};
 coverage.extensions={state:!(meaning.extensions??[]).length?'NOT_APPLICABLE_IN_THIS_CASE':observation.unsupportedRequirements?.some(r=>r.family==='extension')?'HOST_UNSUPPORTED_EXTENSION':'WITNESS_MISSING_OR_PARTIAL',count:(meaning.extensions??[]).length};
 return coverage;
}
export function compareHostObservations(gold,candidate){
 if(gold.error||candidate.error)return {state:'VALIDATION_OR_HOST_ERROR',equivalenceProven:false,goldError:gold.error??null,candidateError:candidate.error??null,errorAttribution:gold.error?'GOLD_OR_HARNESS_REQUIRES_REVIEW':'CANDIDATE_VALIDATION_OR_HOST',dimensions:dimensionCoverage(gold)};
 const same=hash(bytes(gold.signature))===hash(bytes(candidate.signature));
 const positive=(gold.signature.candidates??[]).some(c=>c.rank!==null&&c.rank!==undefined)||(gold.signature.search?.unresolved??[]).some(c=>c.conditionalPlans.some(p=>p.status==='CONFIRMED'&&p.offerIds.length>0));
 return {state:!same?'OBSERVED_HOST_DIFFERENCE':positive?'SAME_ON_SYNTHETIC_PROBES':'NO_POSITIVE_WITNESS',equivalenceProven:false,
  observedSame:same,positiveWitness:positive,dimensions:dimensionCoverage(gold),limitation:'Finite synthetic observations do not prove general semantic equivalence or live suitability.'};
}
export async function replayOne(row,raw,catalog){
 try{
  const parsed=parseSavedMeaning(row,raw);
  if(!parsed.plan)return {error:'NO_EXECUTABLE_PLAN',requestState:parsed.requestState,meaning:parsed.output,clarification:parsed.clarification??null};
  let search=null;
  const response=await exercise({text:row.query,catalog,runtimeReference:row.reference,runtimeAuthority:{city:'Basel',now:row.reference.now},
   understandOverride:async()=>parsed.plan,onSearch:value=>{search=value;}});
  assert(response.calls===0,'local_review_unexpected_model_call');
  if(response.status>=400)return {error:'HOST_HTTP_'+response.status,diagnostics:response.diagnostics,body:response.body};
  return {signature:observableSignature(response,search),unsupportedRequirements:compileLibrarianPlan(parsed.plan).requirements.filter(r=>r.support==='UNSUPPORTED'||r.support==='NEEDS_POLICY'),requestState:parsed.requestState,meaning:parsed.output,projectedMeaning:parsed.searchMeaning,
   plan:compileLibrarianPlan(parsed.plan),search,body:response.body,syntheticRpcReads:response.reads};
 }catch(error){return {error:error.message};}
}
export async function importBindings(entry,bindings={}){
 const path=resolve(entry);if(path in bindings)return bindings;
 const source=await readFile(path);bindings[path]=hash(source);
 if(!/\.(?:mjs|js|cjs)$/.test(path))return bindings;
 const tree=ts.createSourceFile(path,source.toString(),ts.ScriptTarget.Latest,true,ts.ScriptKind.JS);assert(!tree.parseDiagnostics.length,'local_review_import_parse_failed');
 const specifiers=[];
 const visit=node=>{
  if((ts.isImportDeclaration(node)||ts.isExportDeclaration(node))&&node.moduleSpecifier){assert(ts.isStringLiteralLike(node.moduleSpecifier),'local_review_nonliteral_import');specifiers.push(node.moduleSpecifier.text);}
  if(ts.isCallExpression(node)&&node.expression.kind===ts.SyntaxKind.ImportKeyword){assert(node.arguments[0]&&ts.isStringLiteralLike(node.arguments[0]),'local_review_nonliteral_dynamic_import');specifiers.push(node.arguments[0].text);}
  ts.forEachChild(node,visit);
 };visit(tree);
 for(const specifier of specifiers){
  if(specifier.startsWith('node:'))continue;
  if(specifier==='typescript'){
   const entry=fileURLToPath(import.meta.resolve('typescript'));bindings[entry]=hash(await readFile(entry));const pkg=resolve(dirname(entry),'../package.json');bindings[pkg]=hash(await readFile(pkg));continue;
  }
  const target=specifier.startsWith('.')?fileURLToPath(new URL(specifier,'file://'+path)):specifier.startsWith('@backyrd/')?fileURLToPath(import.meta.resolve(specifier)):null;
  assert(target,'local_review_unbound_external_import:'+specifier);await importBindings(target,bindings);
 }
 return bindings;
}
async function compiledBindings(){
 const out={};
 for(const folder of [resolve(repo,'packages/decision-vnext-core/dist'),dirname(fileURLToPath(import.meta.resolve('@backyrd/world-knowledge-core'))),dirname(fileURLToPath(import.meta.resolve('@backyrd/user-intelligence-vnext-core')))]){
  async function visit(path){for(const entry of await readdir(path,{withFileTypes:true})){const p=resolve(path,entry.name);if(entry.isDirectory())await visit(p);else if(entry.name.endsWith('.js'))out[p]=hash(await readFile(p));}}
  await visit(resolve(repo,folder));
 }
 await importBindings(fileURLToPath(import.meta.url),out);
 for(const name of ['@backyrd/world-knowledge-core','@backyrd/user-intelligence-vnext-core'])out['PACKAGE_ENTRY:'+name]=import.meta.resolve(name);
 return out;
}
export async function prepareLocalReview(root,output){
 await mkdir(output,{mode:0o700});const state=await load(resolve(root,'run/state.json')),snapshot=state.results??state.latestResults;
 const paths={catalog:resolve(root,'catalog/catalog.json'),catalogManifest:resolve(root,'catalog/manifest.json'),bundle:resolve(root,'gpu-bundle/product-gpu-manifest.json'),comparison:resolve(root,'run/dev-comparison.json'),parent:resolve(snapshot,'parent-development/result.json'),candidate:resolve(snapshot,'candidate-development/result.json')};
 const inputs=Object.fromEntries(await Promise.all(Object.entries(paths).map(async([k,path])=>[k,{path,sha256:hash(await readFile(path))}])));
 const catalog=await load(paths.catalog),comparison=await load(paths.comparison);const selected=selectForty(catalog,comparison);
 const manifest={version:'backyrd.nuknuk-local-forty-review@1',purpose:'POST_HOC_ENGINEERING_DIAGNOSIS_NOT_NEW_ACCEPTANCE',sourceSha:execFileSync('git',['rev-parse','HEAD'],{cwd:repo,encoding:'utf8'}).trim(),inputs,compiledBindings:await compiledBindings(),nodeVersion:process.version,selectionPolicy:'Ten regressions; ten family-diverse improvements; ten additional composition and ten additional dialogue DEV cases. No duplicate IDs. Frozen before host replay.',selected,caseIdsSha256:hash(bytes(selected.map(r=>r.id))),humanGoldVerified:false,modelCallsAuthorized:false,providerCallsAuthorized:false,liveStateChanged:false};
 await put(resolve(output,'manifest.json'),manifest);return manifest;
}
export async function runLocalReview(folder){
 const manifest=await load(resolve(folder,'manifest.json'));
 assert(manifest.version==='backyrd.nuknuk-local-forty-review@1'&&manifest.selected.length===40&&new Set(manifest.selected.map(r=>r.id)).size===40,'local_review_manifest_invalid');
 assert(hash(bytes(manifest.selected.map(r=>r.id)))===manifest.caseIdsSha256,'local_review_selection_changed');
 assert(manifest.nodeVersion===process.version,'local_review_runtime_changed');
 for(const{path,sha256}of Object.values(manifest.inputs))assert(hash(await readFile(path))===sha256,'local_review_input_changed');
 assert(bytes(await compiledBindings())===bytes(manifest.compiledBindings),'local_review_host_or_harness_changed');
 const values=Object.fromEntries(await Promise.all(Object.entries(manifest.inputs).map(async([k,v])=>[k,await load(v.path)])));
 assert(bytes(selectForty(values.catalog,values.comparison))===bytes(manifest.selected),'local_review_frozen_metadata_changed');
 const byId=new Map(values.catalog.cases.map(r=>[r.id,r]));const parent=scoreCatalogResults(values.catalog,values.catalogManifest,values.bundle,values.parent),candidate=scoreCatalogResults(values.catalog,values.catalogManifest,values.bundle,values.candidate);
 for(const[label,derived]of[['parent',parent],['candidate',candidate]])assert(derived.passed===values.comparison[label].passed&&derived.cases.every(r=>values.comparison[label].cases.find(old=>old.id===r.id)?.status===r.status),'local_review_original_score_changed');
 await put(resolve(folder,'diagnostics-all-538.json'),{parent,candidate,comparison:pairedCatalogReports(parent,candidate),originalScoresUnchanged:true});
 const rawMaps=Object.fromEntries(['parent','candidate'].map(label=>[label,new Map(values[label].cases.map(r=>[r.id,r]))]));const results=[];let networkAttempts=0;
 const previousFetch=globalThis.fetch;globalThis.fetch=()=>{networkAttempts++;throw Error('local_review_network_forbidden');};
 try{
  for(const selected of manifest.selected){
   const row=byId.get(selected.id);assert(row?.split==='DEV','local_review_only_dev_allowed');const catalog=syntheticProbeCatalog(row.reference);
   const gold=await replayOne(row,row.expected,catalog),baseline=await replayOne(row,rawMaps.parent.get(row.id).raw,catalog),actual=await replayOne(row,rawMaps.candidate.get(row.id).raw,catalog);
   const result={...selected,rubric:row.rubric,fixtureCount:catalog.length,fixtureHash:hash(bytes(catalog)),gold,baseline,candidate:actual,comparison:compareHostObservations(gold,actual),originalStrictStatuses:{parent:values.comparison.parent.cases.find(r=>r.id===row.id).status,candidate:values.comparison.candidate.cases.find(r=>r.id===row.id).status},dialogueContextSource:row.task==='DIALOGAKTUALISIERUNG_V3'?'FROZEN_DEV_PREVIOUS_MEANING_NOT_A_LIVE_CONVERSATION':null,humanAdjudication:'NOT_PERFORMED',betaActivationAuthorized:false};
   await put(resolve(folder,row.id+'.json'),result);results.push(result);console.log(JSON.stringify({id:row.id,bucket:selected.bucket,host:result.comparison.state}));
  }
 }finally{globalThis.fetch=previousFetch;}
 assert(networkAttempts===0,'local_review_attempted_network');
 assert(bytes(await compiledBindings())===bytes(manifest.compiledBindings),'local_review_host_changed_during_run');
 for(const{path,sha256}of Object.values(manifest.inputs))assert(hash(await readFile(path))===sha256,'local_review_original_changed_during_run');
 const summary={version:manifest.version,purpose:manifest.purpose,total:results.length,counts:Object.fromEntries([...new Set(results.map(r=>r.comparison.state))].map(k=>[k,results.filter(r=>r.comparison.state===k).length])),modelCalls:0,providerCalls:0,fetchAttempts:networkAttempts,networkPolicy:'Global fetch denied during replay; known auth/RPC/persistence ports are synthetic. This is not an OS-level network sandbox.',originalScoresUnchanged:true,goldSideErrors:results.filter(r=>r.gold.error).map(r=>({id:r.id,error:r.gold.error})),candidateSideErrors:results.filter(r=>r.candidate.error).map(r=>({id:r.id,error:r.candidate.error})),goldUnsupportedRequirements:results.filter(r=>r.gold.unsupportedRequirements?.length).map(r=>({id:r.id,requirements:r.gold.unsupportedRequirements})),humanGoldVerified:false,betaActivationAuthorized:false,manifestSha256:hash(await readFile(resolve(folder,'manifest.json')))};
 await put(resolve(folder,'summary.json'),summary);await sealLocalReview(folder);return summary;
}
export async function sealLocalReview(folder){
 const bindings={};async function visit(path,prefix=''){
  for(const entry of await readdir(path,{withFileTypes:true})){
   const name=prefix+entry.name;if(entry.isDirectory())await visit(resolve(path,entry.name),name+'/');
   else if(entry.isFile()&&name!=='completion-manifest.json')bindings[name]=hash(await readFile(resolve(path,entry.name)));
  }
 }await visit(folder);
 const receipt={version:'backyrd.nuknuk-local-forty-completion@1',files:bindings,manifestSha256:bindings['manifest.json'],humanGoldVerified:false,betaActivationAuthorized:false};
 await writeFile(resolve(folder,'completion-manifest.json'),bytes(receipt),{mode:0o600});return receipt;
}
export async function verifyLocalReviewSeal(folder){
 const receipt=await load(resolve(folder,'completion-manifest.json'));
 for(const[name,sha256]of Object.entries(receipt.files)){assert(!name.startsWith('/')&&!name.split('/').includes('..'),'local_review_unsafe_seal_path');assert(hash(await readFile(resolve(folder,name)))===sha256,'local_review_result_changed:'+name);}
 return true;
}
if(process.argv[1]&&resolve(process.argv[1])===fileURLToPath(import.meta.url)){
 const[command,root,output]=process.argv.slice(2);
 if(command==='prepare'&&root&&output)console.log(JSON.stringify(await prepareLocalReview(resolve(root),resolve(output))));
 else if(command==='run'&&root&&!output)console.log(JSON.stringify(await runLocalReview(resolve(root))));
 else throw Error('usage: beta-local-review.mjs prepare OPERATION_ROOT NEW_OUTPUT | run FROZEN_OUTPUT');
}
