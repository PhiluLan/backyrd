#!/usr/bin/env node
import { readFile, writeFile, mkdir } from 'node:fs/promises';
import { createHash } from 'node:crypto';
import { resolve } from 'node:path';
import { pathToFileURL } from 'node:url';
import { AUTHORING_FIELDS, EXPERIENCE_QUESTIONS, OFFER_CATALOG, AREA_CATALOG, parseExperienceProfile, AUTHORING_CATALOG_HASH, validateAuthoringSubmission, parseWorldResearchBatch } from '../../packages/world-knowledge-core/dist/index.js';
import { researchValueContract } from '../../packages/world-knowledge-core/dist/research-value-schema.js';
import { researchSpotV2, researchFieldRelevance } from '../../packages/spot-research-runtime/dist/nuknuk-agent.js';
import {RESTAURANT_RESEARCH_FIELDS} from '../../packages/spot-research-runtime/dist/nuknuk-research-context.js';
import {DEFAULT_SPOT_RESEARCH_FIELDS} from '../../packages/spot-research-runtime/dist/nuknuk-spot-plan.js';
const esc=value=>String(value).replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'})[c]);
export function profileReviewHtml(value) {
  let profile;try{profile=parseExperienceProfile(value,false);}catch{return null;}
  const properties=(items)=>items.length?'<dl>'+items.map(p=>`<dt>${esc(EXPERIENCE_QUESTIONS.find(q=>q.key===p.key)?.label??p.label??p.key)}</dt><dd>${esc(p.state==='UNKNOWN'?'Noch unbekannt':p.state==='NOT_APPLICABLE'?'Nicht zutreffend':typeof p.value==='boolean'?p.value?'Ja':'Nein':p.value)}</dd>`).join('')+'</dl>':'<p>Weitere Eigenschaften sind noch nicht belegt.</p>';
  const areas=profile.areas.map(area=>`<article><h4>${esc(area.name)}</h4><small>${esc(AREA_CATALOG.find(a=>a.kind===area.kind)?.label??area.kind)}</small>${properties(area.properties)}</article>`).join('');
  const offers=profile.offers.map(offer=>`<article><h4>${esc(offer.name)}</h4><small>${esc(OFFER_CATALOG.find(o=>o.kind===offer.kind)?.label??offer.kind)}</small>${properties(offer.properties)}${offer.areaIds.length?`<p>Bereiche: ${offer.areaIds.map(id=>esc(profile.areas.find(a=>a.id===id)?.name??id)).join(', ')}</p>`:'<p>Zuordnung zu Bereichen noch nicht belegt.</p>'}${offer.prices.length?'<p>Preise: '+offer.prices.map(p=>esc(`${p.min}${p.max===null?'':'–'+p.max} ${p.currency} · ${{PER_PERSON:'pro Person',PER_GROUP:'pro Gruppe',PER_ITEM:'pro Stück',PER_ROOM_NIGHT:'pro Zimmer und Nacht',PER_PERSON_NIGHT:'pro Person und Nacht',PER_SITE_NIGHT:'pro Stellplatz und Nacht'}[p.basis]??p.basis} · ${p.includes}`)).join('<br>')+'</p>':''}</article>`).join('');
  return `<section><h4>Für den gesamten Ort</h4>${properties(profile.properties)}<h4>Besuchsangebote (${profile.offers.length})</h4>${offers||'<p>Besuchsangebote noch nicht ausreichend belegt.</p>'}<h4>Räume und Bereiche (${profile.areas.length})</h4>${areas||'<p>Räume und Bereiche noch nicht ausreichend belegt. Das bedeutet nicht, dass keine vorhanden sind.</p>'}<details><summary>Alle strukturierten Angaben mit Zeiten und Bedingungen</summary><pre>${esc(JSON.stringify(profile,null,2))}</pre></details></section>`;
}
export function decisionAuditHtml(report) {
  if(!Array.isArray(report.decisionAudit)||!report.decisionAudit.length)return '';
  return '<details><summary>Entscheidungen mit Begründung und Beleg ('+report.decisionAudit.length+')</summary>'+report.decisionAudit.map(item=>`<article><h4>${esc(item.field)} · ${esc(item.factId)}</h4><p>Software: ${esc(item.software.state)} · Regel: ${esc(item.software.rule)}</p>${item.model?`<p>Modellurteil: ${esc(item.model.verdict)} · ${esc(item.model.reasonCode)}</p><p>${esc(item.model.explanation||'Begründung fehlt – Prüfproblem')}</p>${item.model.validationError?`<p>Prüfproblem: ${esc(item.model.validationError)}</p>`:''}`:'<p>Deterministische Regelentscheidung; kein Modellurteil.</p>'}<blockquote>${esc(item.evidence.decisionQuote)}</blockquote><p>Beleg gefunden: ${item.evidence.decisionQuoteVerified?'Ja':'Nein'} · Quellenhash geprüft: ${item.evidence.sourceHashVerified?'Ja':'Nein'}</p><small>${esc(item.evidence.url)} · ${esc(item.evidence.sourceHash)}</small></article>`).join('')+'</details>';
}
export function reviewHtml(reports) {
  return '<!doctype html><html lang="de"><meta charset="utf-8"><title>Nuknuk Research – Prüfentwürfe</title><style>body{max-width:1100px;margin:40px auto;padding:0 24px;background:#17151b;color:#eee;font:16px system-ui;line-height:1.5}h1,h2{color:#ff80b5}article{padding:18px;border:1px solid #555;border-radius:12px;margin:18px 0}pre{white-space:pre-wrap;overflow-wrap:anywhere}a{color:#91c8ff}.status{font-weight:bold}small{color:#bbb}</style><h1>Nuknuk Research</h1>'+ (reports.some(r=>r.limitations?.includes('MENU_LAYOUT_REQUIRES_REVIEW'))?'<p>Bild- oder PDF-Speisekarten brauchen eine Layoutprüfung. Bildnamen im unfreigegebenen Entwurf bleiben prüfpflichtig; Preise werden nicht übernommen.</p>':'') + '<p>Prüfentwürfe für bestehende Spots. Nichts im Spotkatalog gespeichert oder veröffentlicht. AUTO_VERIFIED benötigt keine erneute Faktenprüfung. TEXT_VERIFIED bestätigt nur die genaue Quellenübernahme; offene Interpretationsfragen sind separat ausgewiesen.</p>'+reports.map(r=>`<section><h2>${esc(r.name)}</h2><p>${r.exportBound?'Aktueller Export für den Vergleich vorhanden.':'Kein aktueller Admin-Export: bestehende Werte und Konflikte noch nicht abgeglichen.'}</p>${r.sources?.some(s=>s.truncated)?'<p>Mindestens eine lange Quellenseite wurde gekürzt. Spätere Abschnitte und die Vollständigkeit der Recherche sind nicht geprüft.</p>':''}${r.limitations?.includes('CLIENT_RENDERED_CONTENT_MISSING')?'<p>Diese Website liefert im gelesenen Quelltext nur Vorlagen-Platzhalter. Dynamisch geladene Angaben sind nicht belegt und bleiben offen.</p>':''}${(r.sourceFailures??[]).map(f=>`<p>Quelle nicht verarbeitet: ${esc(f.url)} – ${esc(f.reason)}</p>`).join('')}${r.stopReason?`<p>Recherche beendet: ${esc(r.stopReason)} · ${esc(r.requests)} Abrufe · ${esc(r.modelCalls)} Modellaufrufe. Vollständigkeit nicht bestätigt.</p>`:''}${r.results.map(f=>`<article><h3>${esc(f.attributeKey)}</h3><div class="status">${esc(f.status)}</div>${f.verification?`<p>Prüfregel: ${esc(f.verification.policy)} – ${esc(f.verification.reason)}</p>${f.verification.evidenceChecks.map(c=>`<p>${esc(c.status)}: ${esc(c.reason??'Quellentext automatisch abgeglichen; Interpretation separat.')}</p>`).join('')}`:''}${f.derivation?`<p><strong>Backyrd-Regel:</strong> ${esc(f.derivation.explanation)} Diese Ergänzung ist keine wörtliche Angabe der Website.</p>`:''}${f.partialProfile?'<p>Unvollständiger Profilentwurf: nur einzeln prüfen und ergänzen, niemals das Gesamtprofil ersetzen.</p>':''}${f.partialHours?'<p>Teilweiser Wochenplan: Nicht genannte Wochentage sind unbekannt, nicht geschlossen. Bestehende Öffnungszeiten nicht durch diesen Teilentwurf ersetzen.</p>':''}${f.value!==undefined?`<h4>Vorschlag</h4>${f.attributeKey==='experience.profile'&&profileReviewHtml(f.value)||`<pre>${esc(JSON.stringify(f.value,null,2))}</pre>`}`:''}${f.currentValue!==undefined?`<h4>Bisheriger Wert</h4><pre>${esc(JSON.stringify(f.currentValue,null,2))}</pre>`:''}${f.reason?`<p>${esc(f.reason)}</p>`:''}${(f.citations??[]).map(c=>`${c.layoutReviewRequired?'<p>PDF/Bildquelle: Lesefehler, Spaltenzuordnung und Aktualität im Original prüfen.</p>':''}<blockquote>${esc(c.evidence)}</blockquote><a href="${esc(c.url)}" rel="noreferrer">Quelle öffnen</a> ${c.discoveredOn?`<a href="${esc(c.discoveredOn)}" rel="noreferrer">Einbettende Website</a>`:''} <small>Abgerufen: ${esc(c.observedAt)}</small>`).join('')}${f.reviewEvidence?.length?`<details><summary>Weitere Prüfhinweise (${f.reviewEvidence.length})</summary>${f.reviewEvidence.map(c=>`<p>${c.reviewReason?`<strong>${esc(c.entityName)} · ${esc(c.propertyKey)}</strong>: ${esc(c.reviewExplanation)} (${esc(c.reviewReason)})<br>`:''}${esc(c.evidence)} – <a href="${esc(c.url)}" rel="noreferrer">Quelle prüfen</a></p>`).join('')}</details>`:''}</article>`).join('')}${decisionAuditHtml(r)}${r.facts?`<details><summary>Fakten und zurückgehaltene Aussagen (${r.facts.length})</summary><pre>${esc(JSON.stringify(r.facts,null,2))}</pre></details>`:''}</section>`).join('')+'</html>';
}
export function searchReviewHtml(reports) {
  const sections=reports.map(report=>{
    const search=report.search??{configured:false,queries:[],leads:[],externalSources:[],discrepancies:[]};
    const queries=(search.queries??[]).map(item=>`<li>${esc(item.query)} – ${esc(item.error??`${item.resultCount} Treffer`)}</li>`).join('');
    const leads=(search.leads??[]).map(item=>`<li><a href="${esc(item.url)}" rel="noreferrer">${esc(item.title||item.url)}</a> – Suchtreffer, kein Beleg</li>`).join('');
    const checked=(search.externalSources??[]).map(item=>`<li><a href="${esc(item.url)}" rel="noreferrer">${esc(item.url)}</a> – Identität ${esc(item.identity)}; unabhängig von Vorschlägen prüfen<details><summary>Gelesener Seitenauszug</summary><pre>${esc(item.excerpt)}</pre></details></li>`).join('');
    const discrepancies=(search.discrepancies??[]).map(item=>`<li>${esc(item.field)}: Katalog/offiziell ${esc(item.officialValue)}; externe Seite ${esc(item.externalValue)}. <a href="${esc(item.url)}" rel="noreferrer">Quelle prüfen</a>. Noch nicht entschieden.</li>`).join('');
    const semantic=(search.semanticCounterchecks??[]).map(item=>`<li>${esc(item.field)}: ${esc(item.verdict)} – <a href="${esc(item.url)}" rel="noreferrer">Quelle</a>${item.quote?`<blockquote>${esc(item.quote)}</blockquote>`:''}${item.modelDecision?`<p>${esc(item.modelDecision.explanation)}</p>`:''}${item.reason?` · Nicht belegt: ${esc(item.reason)}`:''}. Modellhinweis, keine Entscheidung.</li>`).join('');
    return `<section><h2>${esc(report.name)}</h2><p>${search.configured?'Lokale Websuche aktiv.':'Keine Websuche konfiguriert.'} Externe Seiten dienen nur als Gegencheck und belegen keine Katalogänderung.</p><h3>Suchanfragen</h3><ul>${queries}</ul><h3>Weitere Treffer</h3><ul>${leads}</ul><h3>Abgerufene externe Seiten</h3><ul>${checked}</ul><h3>Mögliche Kontakt-Widersprüche</h3><ul>${discrepancies}</ul><h3>Semantischer Gegencheck</h3><ul>${semantic}</ul></section>`;
  }).join('');
  return `<!doctype html><html lang="de"><meta charset="utf-8"><title>Nuknuk – Websuche und Gegencheck</title><style>body{max-width:1000px;margin:40px auto;padding:0 24px;background:#17151b;color:#eee;font:16px system-ui;line-height:1.5}a{color:#91c8ff}h1,h2{color:#ff80b5}section{padding:18px;border:1px solid #555;border-radius:12px;margin:18px 0}pre{white-space:pre-wrap;overflow-wrap:anywhere}</style><h1>Websuche und Gegencheck</h1>${sections}</html>`;
}
const known=value=>['KNOWN_VALUE','KNOWN_TRUE','KNOWN_FALSE','NOT_APPLICABLE'].includes(value?.knowledgeState);
export function selectResearchSpots(exported,keys,{maxSpots}={}) {
  if(!exported?.batch?.spots||!Number.isInteger(maxSpots)||maxSpots<1||maxSpots>10)throw new Error('automatic_selection_invalid');
  const missing=spot=>keys.filter(key=>researchFieldRelevance(spot,key).relevant&&!known(spot.existingValues?.[key])).length;
  return exported.batch.spots.filter(spot=>{
    const website=spot.existingValues?.['contact.website'];
    return known(website)&&typeof website.value==='string'&&/^https?:\/\//iu.test(website.value)&&missing(spot)>0;
  }).sort((a,b)=>{
    return missing(b)-missing(a)||a.spotId.localeCompare(b.spotId);
  }).slice(0,maxSpots).map(spot=>({spotId:spot.spotId,name:spot.name}));
}
export function summarizeResearchReports(reports,selectedCount) {
  if(!Array.isArray(reports)||!Number.isInteger(selectedCount)||selectedCount<reports.length)throw new Error('research_summary_invalid');
  const fields=reports.flatMap(report=>report.results??[]);
  const statuses=Object.fromEntries(['AUTO_VERIFIED','REQUIRES_REVIEW','UNRESOLVED','FAILED','SKIPPED'].map(status=>[status,fields.filter(field=>field.status===status).length]));
  return {selectedSpots:selectedCount,completedSpots:reports.length,deferredSpots:selectedCount-reports.length,
    proposedFields:statuses.AUTO_VERIFIED+statuses.REQUIRES_REVIEW,fieldStatuses:statuses,
    sourceFailures:reports.reduce((count,report)=>count+(report.sourceFailures?.length??0),0),
    modelFailures:reports.reduce((count,report)=>count+(report.modelAudit?.filter(call=>call.error).length??0),0),
    budgetStopped:reports.filter(report=>report.stopReason?.endsWith('BUDGET_EXHAUSTED')).length,
    catalogWrites:0,readinessCertified:false};
}
export function resumeResearchReports(previous,runKey,inputs) {
  if(!previous||previous.runKey!==runKey||previous.canonicalWrite!==false||previous.selectedCount!==inputs.length||!Array.isArray(previous.reports)||previous.reports.length>inputs.length||previous.reports.some((report,index)=>report.spotId!==inputs[index].spotId||report.canonicalWrite!==false||report.importable!==false))throw new Error('research_resume_mismatch');
  return previous.reports;
}
async function main() {
  const [manifestPath,modelPath,outputPath]=process.argv.slice(2);
  if(!manifestPath||!modelPath||!outputPath)throw new Error('usage: node scripts/world-knowledge/nuknuk-research.mjs MANIFEST MODEL_PATH OUTPUT_DIRECTORY');
  const manifestText=await readFile(manifestPath,'utf8'),manifest=JSON.parse(manifestText);
  if(manifest.restaurantWorkingContext!==undefined&&typeof manifest.restaurantWorkingContext!=='boolean')throw new Error('manifest_restaurant_context_invalid');
  if(manifest.discoverLinks!==undefined&&typeof manifest.discoverLinks!=='boolean')throw new Error('manifest_discovery_invalid');
  if(manifest.inspectMenuImages!==undefined&&typeof manifest.inspectMenuImages!=='boolean')throw new Error('manifest_menu_image_audit_invalid');
  if(manifest.inspectMenuImagesWithModel!==undefined&&(typeof manifest.inspectMenuImagesWithModel!=='boolean'||manifest.inspectMenuImagesWithModel===true&&manifest.inspectMenuImages!==true))throw new Error('manifest_menu_vision_invalid');
  if(manifest.resume!==undefined&&typeof manifest.resume!=='boolean')throw new Error('manifest_resume_invalid');
  const automatic=manifest.selection?.mode==='MISSING_FIELDS';
  if(automatic===Array.isArray(manifest.spots))throw new Error('manifest_selection_mode_invalid');
  if(!automatic&&(!manifest.spots.length||manifest.spots.length>10))throw new Error('manifest_spots_invalid');
  if(!automatic&&new Set(manifest.spots.map(s=>s.spotId)).size!==manifest.spots.length)throw new Error('manifest_duplicate_spot');
  const keys=manifest.fields??(manifest.restaurantWorkingContext?RESTAURANT_RESEARCH_FIELDS:DEFAULT_SPOT_RESEARCH_FIELDS);
  if(!Array.isArray(keys)||!keys.length||keys.length>(manifest.restaurantWorkingContext?24:12)||new Set(keys).size!==keys.length)throw new Error('manifest_fields_invalid');
  const fields=keys.map(key=>{const f=AUTHORING_FIELDS.find(f=>f.attributeKey===key&&f.roles.includes('ADMIN'));if(!f||key==='state.current')throw new Error('field_not_researchable');return {attributeKey:key,label:f.label,help:f.help,...researchValueContract(key),...(manifest.restaurantWorkingContext?{profileCategory:'EAT'}:{})};});
  const exportText=manifest.exportPath?await readFile(manifest.exportPath,'utf8'):null;
  const exported=exportText?parseWorldResearchBatch(JSON.parse(exportText)):null;
  if(automatic&&!exported)throw new Error('automatic_selection_requires_admin_export');
  if(automatic&&Object.keys(manifest.selection).some(key=>!['mode','maxSpots','totalBudgetMs'].includes(key)))throw new Error('automatic_selection_invalid');
  const totalBudgetMs=automatic?(manifest.selection.totalBudgetMs??3600000):null;
  if(automatic&&(!Number.isInteger(totalBudgetMs)||totalBudgetMs<30000||totalBudgetMs>3600000))throw new Error('automatic_budget_invalid');
  const inputs=automatic?selectResearchSpots(exported,keys,manifest.selection):manifest.spots;
  if(!inputs.length)throw new Error('no_spots_need_research');
  if(manifest.webSearch!==undefined&&(!manifest.webSearch||typeof manifest.webSearch.endpoint!=='string'||Object.keys(manifest.webSearch).some(key=>!['endpoint','maxQueries','maxExternalPages'].includes(key))))throw new Error('manifest_web_search_invalid');
  const code=await Promise.all(['../../packages/spot-research-runtime/dist/nuknuk-agent.js','../../packages/spot-research-runtime/dist/nuknuk-spot-plan.js','../../packages/spot-research-runtime/dist/nuknuk-research-context.js','../../packages/spot-research-runtime/dist/nuknuk-sources.mjs','../../packages/spot-research-runtime/dist/nuknuk-search.mjs','../../packages/spot-research-runtime/dist/nuknuk-research.mjs','../../packages/spot-research-runtime/src/nuknuk-menu-media.mjs','../../packages/spot-research-runtime/src/nuknuk-menu-vision.mjs','../../packages/spot-research-runtime/src/nuknuk-vision-ocr.swift',import.meta.url].map(path=>readFile(new URL(path,import.meta.url))));
  const runKey=createHash('sha256').update(JSON.stringify({manifestText,exportText,modelPath,catalogHash:AUTHORING_CATALOG_HASH})).update(Buffer.concat(code)).digest('hex');
  const out=resolve(outputPath);await mkdir(out,{recursive:true});
  let reports=[];
  if(manifest.resume) {
    let previous;
    try{previous=JSON.parse(await readFile(`${out}/research.json`,'utf8'));}catch(error){if(error?.code!=='ENOENT')throw error;}
    if(previous)reports=resumeResearchReports(previous,runKey,inputs);
  }
  const started=Date.now();let deferred=0;
  // One spot and one local model request at a time. Each partial result is durable.
  for(const input of inputs.slice(reports.length)) {
    const remaining=totalBudgetMs===null?null:totalBudgetMs-(Date.now()-started);
    if(remaining!==null&&remaining<30000){deferred=inputs.length-reports.length;break;}
    if(!/^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(input.spotId??'')||typeof input.name!=='string'||!input.name.trim()||input.name.length>240||(input.sources!==undefined&&(!Array.isArray(input.sources)||!input.sources.length||input.sources.length>6)))throw new Error('manifest_spot_invalid');
    const bound=exported?.batch.spots.find(s=>s.spotId===input.spotId);
    if(exported&&!bound)throw new Error('spot_not_in_export');
    const spot={spotId:input.spotId,name:bound?.name??input.name,locality:bound?.locality??input.locality??null,existingValues:bound?.existingValues??null};
    const budgetMs=manifest.budget?.budgetMs; // Explicit emergency deadline only; batch budget controls dispatch, not an in-progress source.
    const report=await researchSpotV2({spot,fields,modelPath,sources:input.sources,restaurantWorkingContext:manifest.restaurantWorkingContext,discoverLinks:manifest.discoverLinks,inspectMenuImages:manifest.inspectMenuImages,inspectMenuImagesWithModel:manifest.inspectMenuImagesWithModel,skipKnownFields:automatic||manifest.fields===undefined,exportBound:!!bound,budgetMs,maxRequests:manifest.budget?.maxRequests,maxModelCalls:manifest.budget?.maxModelCalls,maxDepth:manifest.budget?.maxDepth,webSearchEndpoint:manifest.webSearch?.endpoint,maxSearchQueries:manifest.webSearch?.maxQueries,maxExternalPages:manifest.webSearch?.maxExternalPages},{validateValue:validateAuthoringSubmission,onCheckpoint:async state=>writeFile(`${out}/${spot.spotId}-checkpoint.json`,JSON.stringify(state,null,2)),onProgress:async event=>{
      if(event.stage==='COMPLETE')return;
      await writeFile(`${out}/${spot.spotId}-progress.json`,JSON.stringify({canonicalWrite:false,completed:false,lastEvent:event},null,2));
      console.log(`${spot.name}: ${event.stage}: ${event.url??event.reason??''}`);
    }});
    await writeFile(`${out}/${spot.spotId}-sources.json`,JSON.stringify({spotId:spot.spotId,sources:report.sources,sourceFailures:report.sourceFailures},null,2));
    await writeFile(`${out}/${spot.spotId}-partial.json`,JSON.stringify({canonicalWrite:false,completed:true,results:report.results,facts:report.facts},null,2));
    report.exportBound=!!bound;report.catalogHash=AUTHORING_CATALOG_HASH;
    if(bound)report.baseManifestHash=bound.manifestHash;
    reports.push(report);
    await writeFile(`${out}/research.json`,JSON.stringify({completed:reports.length===inputs.length,canonicalWrite:false,runKey,automaticSelection:automatic,selectedCount:inputs.length,deferredCount:inputs.length-reports.length,summary:summarizeResearchReports(reports,inputs.length),reports},null,2));
    await writeFile(`${out}/review.html`,reviewHtml(reports));
    await writeFile(`${out}/search-review.html`,searchReviewHtml(reports));
  }
  if(deferred)await writeFile(`${out}/research.json`,JSON.stringify({completed:false,canonicalWrite:false,runKey,automaticSelection:true,selectedCount:inputs.length,deferredCount:deferred,summary:summarizeResearchReports(reports,inputs.length),reports},null,2));
  if(reports.some(r=>r.results.some(f=>f.status==='FAILED')||r.modelAudit?.some(a=>a.error)||r.actions?.some(a=>String(a.stage).endsWith('_ERROR'))))process.exitCode=1;
}
if(process.argv[1]&&import.meta.url===pathToFileURL(resolve(process.argv[1])).href)main().catch(error=>{console.error(error.message);process.exitCode=1;});
