#!/usr/bin/env node
import { readFile, writeFile, mkdir } from 'node:fs/promises';
import { resolve } from 'node:path';
import { pathToFileURL } from 'node:url';
import { AUTHORING_FIELDS, AUTHORING_CATALOG_HASH, validateAuthoringSubmission, parseWorldResearchBatch } from '../../packages/world-knowledge-core/dist/index.js';
import { researchValueContract } from '../../packages/world-knowledge-core/dist/research-value-schema.js';
import { researchSpotV2 } from '../../packages/spot-research-runtime/dist/nuknuk-agent.js';
const esc=value=>String(value).replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'})[c]);
export function reviewHtml(reports) {
  return '<!doctype html><html lang="de"><meta charset="utf-8"><title>Nuknuk Research – Prüfentwürfe</title><style>body{max-width:1100px;margin:40px auto;padding:0 24px;background:#17151b;color:#eee;font:16px system-ui;line-height:1.5}h1,h2{color:#ff80b5}article{padding:18px;border:1px solid #555;border-radius:12px;margin:18px 0}pre{white-space:pre-wrap;overflow-wrap:anywhere}a{color:#91c8ff}.status{font-weight:bold}small{color:#bbb}</style><h1>Nuknuk Research</h1><p>Prüfentwürfe für bestehende Spots. Nichts gespeichert oder veröffentlicht. AUTO_VERIFIED benötigt keine erneute Faktenprüfung. TEXT_VERIFIED bestätigt nur die genaue Quellenübernahme; offene Interpretationsfragen sind separat ausgewiesen.</p>'+reports.map(r=>`<section><h2>${esc(r.name)}</h2><p>${r.exportBound?'Aktueller Export für den Vergleich vorhanden.':'Kein aktueller Admin-Export: bestehende Werte und Konflikte noch nicht abgeglichen.'}</p>${r.sources?.some(s=>s.truncated)?'<p>Mindestens eine lange Quellenseite wurde gekürzt. Spätere Abschnitte und die Vollständigkeit der Recherche sind nicht geprüft.</p>':''}${r.limitations?.includes('CLIENT_RENDERED_CONTENT_MISSING')?'<p>Diese Website liefert im gelesenen Quelltext nur Vorlagen-Platzhalter. Dynamisch geladene Angaben sind nicht belegt und bleiben offen.</p>':''}${(r.sourceFailures??[]).map(f=>`<p>Quelle nicht verarbeitet: ${esc(f.url)} – ${esc(f.reason)}</p>`).join('')}${r.stopReason?`<p>Recherche beendet: ${esc(r.stopReason)} · ${esc(r.requests)} Abrufe · ${esc(r.modelCalls)} Modellaufrufe. Vollständigkeit nicht bestätigt.</p>`:''}${r.results.map(f=>`<article><h3>${esc(f.attributeKey)}</h3><div class="status">${esc(f.status)}</div>${f.verification?`<p>Prüfregel: ${esc(f.verification.policy)} – ${esc(f.verification.reason)}</p>${f.verification.evidenceChecks.map(c=>`<p>${esc(c.status)}: ${esc(c.reason??'Quellentext automatisch abgeglichen; Interpretation separat.')}</p>`).join('')}`:''}${f.partialProfile?'<p>Unvollständiger Profilentwurf: nur einzeln prüfen und ergänzen, niemals das Gesamtprofil ersetzen.</p>':''}${f.value!==undefined?`<h4>Vorschlag</h4><pre>${esc(JSON.stringify(f.value,null,2))}</pre>`:''}${f.currentValue!==undefined?`<h4>Bisheriger Wert</h4><pre>${esc(JSON.stringify(f.currentValue,null,2))}</pre>`:''}${f.reason?`<p>${esc(f.reason)}</p>`:''}${(f.citations??f.reviewEvidence??[]).map(c=>`${c.layoutReviewRequired?'<p>PDF/Bildquelle: Lesefehler, Spaltenzuordnung und Aktualität im Original prüfen.</p>':''}<blockquote>${esc(c.evidence)}</blockquote><a href="${esc(c.url)}" rel="noreferrer">Quelle öffnen</a> ${c.discoveredOn?`<a href="${esc(c.discoveredOn)}" rel="noreferrer">Einbettende Website</a>`:''} <small>Abgerufen: ${esc(c.observedAt)}</small>`).join('')}</article>`).join('')}${r.facts?`<details><summary>Fakten und zurückgehaltene Aussagen (${r.facts.length})</summary><pre>${esc(JSON.stringify(r.facts,null,2))}</pre></details>`:''}</section>`).join('')+'</html>';
}
async function main() {
  const [manifestPath,modelPath,outputPath]=process.argv.slice(2);
  if(!manifestPath||!modelPath||!outputPath)throw new Error('usage: node scripts/world-knowledge/nuknuk-research.mjs MANIFEST MODEL_PATH OUTPUT_DIRECTORY');
  const manifest=JSON.parse(await readFile(manifestPath,'utf8'));
  if(manifest.discoverLinks!==undefined&&typeof manifest.discoverLinks!=='boolean')throw new Error('manifest_discovery_invalid');
  if(!Array.isArray(manifest.spots)||!manifest.spots.length||manifest.spots.length>10)throw new Error('manifest_spots_invalid');
  if(new Set(manifest.spots.map(s=>s.spotId)).size!==manifest.spots.length)throw new Error('manifest_duplicate_spot');
  const keys=manifest.fields??['description.highlight','contact.phone','contact.public_email','hours.regular','experience.profile','offering.groups','amenity.features','operation.laptop_policy'];
  if(!Array.isArray(keys)||!keys.length||keys.length>12||new Set(keys).size!==keys.length)throw new Error('manifest_fields_invalid');
  const fields=keys.map(key=>{const f=AUTHORING_FIELDS.find(f=>f.attributeKey===key&&f.roles.includes('ADMIN'));if(!f||key==='state.current')throw new Error('field_not_researchable');return {attributeKey:key,label:f.label,help:f.help,...researchValueContract(key)};});
  const exported=manifest.exportPath?parseWorldResearchBatch(JSON.parse(await readFile(manifest.exportPath,'utf8'))):null;
  const out=resolve(outputPath);await mkdir(out,{recursive:true});const reports=[];
  // One spot and one local model request at a time. Each partial result is durable.
  for(const input of manifest.spots) {
    if(!/^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(input.spotId??'')||typeof input.name!=='string'||!input.name.trim()||input.name.length>240||(input.sources!==undefined&&(!Array.isArray(input.sources)||!input.sources.length||input.sources.length>6)))throw new Error('manifest_spot_invalid');
    const bound=exported?.batch.spots.find(s=>s.spotId===input.spotId);
    if(exported&&!bound)throw new Error('spot_not_in_export');
    const spot={spotId:input.spotId,name:bound?.name??input.name,locality:bound?.locality??input.locality??null,existingValues:bound?.existingValues??null};
    const report=await researchSpotV2({spot,fields,modelPath,sources:input.sources,discoverLinks:manifest.discoverLinks,skipKnownFields:manifest.fields===undefined,exportBound:!!bound,budgetMs:manifest.budget?.budgetMs,maxRequests:manifest.budget?.maxRequests,maxModelCalls:manifest.budget?.maxModelCalls,maxDepth:manifest.budget?.maxDepth},{validateValue:validateAuthoringSubmission,onCheckpoint:async state=>writeFile(`${out}/${spot.spotId}-checkpoint.json`,JSON.stringify(state,null,2)),onProgress:async event=>{
      if(event.stage==='COMPLETE')return;
      await writeFile(`${out}/${spot.spotId}-progress.json`,JSON.stringify({canonicalWrite:false,completed:false,lastEvent:event},null,2));
      console.log(`${spot.name}: ${event.stage}: ${event.url??event.reason??''}`);
    }});
    await writeFile(`${out}/${spot.spotId}-sources.json`,JSON.stringify({spotId:spot.spotId,sources:report.sources,sourceFailures:report.sourceFailures},null,2));
    await writeFile(`${out}/${spot.spotId}-partial.json`,JSON.stringify({canonicalWrite:false,completed:true,results:report.results,facts:report.facts},null,2));
    report.exportBound=!!bound;report.catalogHash=AUTHORING_CATALOG_HASH;
    if(bound)report.baseManifestHash=bound.manifestHash;
    reports.push(report);
    await writeFile(`${out}/research.json`,JSON.stringify({completed:reports.length===manifest.spots.length,canonicalWrite:false,reports},null,2));
    await writeFile(`${out}/review.html`,reviewHtml(reports));
  }
  if(reports.some(r=>r.results.some(f=>f.status==='FAILED')||r.modelAudit?.some(a=>a.error)||r.actions?.some(a=>String(a.stage).endsWith('_ERROR'))))process.exitCode=1;
}
if(process.argv[1]&&import.meta.url===pathToFileURL(resolve(process.argv[1])).href)main().catch(error=>{console.error(error.message);process.exitCode=1;});
