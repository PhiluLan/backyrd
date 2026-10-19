#!/usr/bin/env node
import { readFile, writeFile, mkdir } from 'node:fs/promises';
import { resolve } from 'node:path';
import { pathToFileURL } from 'node:url';
import { AUTHORING_FIELDS, AUTHORING_CATALOG_HASH, validateAuthoringSubmission, parseWorldResearchBatch } from '../../packages/world-knowledge-core/dist/index.js';
import { researchValueContract } from '../../packages/world-knowledge-core/dist/research-value-schema.js';
import { researchExistingSpot } from '../../packages/spot-research-runtime/src/nuknuk-research.mjs';
import { fetchPublicSource, readSourceText, matchesExistingWebsite, discoverOfficialLinks, discoverMenuImages, discoverMenuDocuments } from '../../packages/spot-research-runtime/src/nuknuk-sources.mjs';
const esc=value=>String(value).replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'})[c]);
export function reviewHtml(reports) {
  return '<!doctype html><html lang="de"><meta charset="utf-8"><title>Nuknuk Research – Prüfentwürfe</title><style>body{max-width:1100px;margin:40px auto;padding:0 24px;background:#17151b;color:#eee;font:16px system-ui;line-height:1.5}h1,h2{color:#ff80b5}article{padding:18px;border:1px solid #555;border-radius:12px;margin:18px 0}pre{white-space:pre-wrap;overflow-wrap:anywhere}a{color:#91c8ff}.status{font-weight:bold}small{color:#bbb}</style><h1>Nuknuk Research</h1><p>Prüfentwürfe für bestehende Spots. Nichts gespeichert oder veröffentlicht. AUTO_VERIFIED benötigt keine erneute Faktenprüfung. TEXT_VERIFIED bestätigt nur die genaue Quellenübernahme; offene Interpretationsfragen sind separat ausgewiesen.</p>'+reports.map(r=>`<section><h2>${esc(r.name)}</h2><p>${r.exportBound?'Aktueller Export für den Vergleich vorhanden.':'Kein aktueller Admin-Export: bestehende Werte und Konflikte noch nicht abgeglichen.'}</p>${(r.sourceFailures??[]).map(f=>`<p>Quelle nicht verarbeitet: ${esc(f.url)} – ${esc(f.reason)}</p>`).join('')}${r.results.map(f=>`<article><h3>${esc(f.attributeKey)}</h3><div class="status">${esc(f.status)}</div>${f.verification?`<p>Prüfregel: ${esc(f.verification.policy)} – ${esc(f.verification.reason)}</p>${f.verification.evidenceChecks.map(c=>`<p>${esc(c.status)}: ${esc(c.reason??'Quellentext automatisch abgeglichen; Interpretation separat.')}</p>`).join('')}`:''}${f.partialProfile?'<p>Unvollständiger Profilentwurf: nur einzeln prüfen und ergänzen, niemals das Gesamtprofil ersetzen.</p>':''}${f.value!==undefined?`<h4>Vorschlag</h4><pre>${esc(JSON.stringify(f.value,null,2))}</pre>`:''}${f.currentValue!==undefined?`<h4>Bisheriger Wert</h4><pre>${esc(JSON.stringify(f.currentValue,null,2))}</pre>`:''}${f.reason?`<p>${esc(f.reason)}</p>`:''}${(f.citations??f.reviewEvidence??[]).map(c=>`${c.layoutReviewRequired?'<p>PDF/Bildquelle: Lesefehler, Spaltenzuordnung und Aktualität im Original prüfen.</p>':''}<blockquote>${esc(c.evidence)}</blockquote><a href="${esc(c.url)}" rel="noreferrer">Quelle öffnen</a> ${c.discoveredOn?`<a href="${esc(c.discoveredOn)}" rel="noreferrer">Einbettende Website</a>`:''} <small>Abgerufen: ${esc(c.observedAt)}</small>`).join('')}</article>`).join('')}</section>`).join('')+'</html>';
}
async function main() {
  const [manifestPath,modelPath,outputPath]=process.argv.slice(2);
  if(!manifestPath||!modelPath||!outputPath)throw new Error('usage: node scripts/world-knowledge/nuknuk-research.mjs MANIFEST MODEL_PATH OUTPUT_DIRECTORY');
  const manifest=JSON.parse(await readFile(manifestPath,'utf8'));
  if(manifest.discoverLinks!==undefined&&typeof manifest.discoverLinks!=='boolean')throw new Error('manifest_discovery_invalid');
  if(!Array.isArray(manifest.spots)||!manifest.spots.length||manifest.spots.length>10)throw new Error('manifest_spots_invalid');
  if(new Set(manifest.spots.map(s=>s.spotId)).size!==manifest.spots.length)throw new Error('manifest_duplicate_spot');
  const keys=manifest.fields??['description.highlight','contact.phone','hours.regular','experience.profile'];
  if(!Array.isArray(keys)||!keys.length||keys.length>12||new Set(keys).size!==keys.length)throw new Error('manifest_fields_invalid');
  const fields=keys.map(key=>{const f=AUTHORING_FIELDS.find(f=>f.attributeKey===key&&f.roles.includes('ADMIN'));if(!f||key==='state.current')throw new Error('field_not_researchable');return {attributeKey:key,label:f.label,help:f.help,...researchValueContract(key)};});
  const exported=manifest.exportPath?parseWorldResearchBatch(JSON.parse(await readFile(manifest.exportPath,'utf8'))):null;
  const out=resolve(outputPath);await mkdir(out,{recursive:true});const reports=[];
  // One spot and one local model request at a time. Each partial result is durable.
  for(const input of manifest.spots) {
    if(!/^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(input.spotId??'')||typeof input.name!=='string'||!input.name.trim()||input.name.length>240||!Array.isArray(input.sources)||!input.sources.length||input.sources.length>6)throw new Error('manifest_spot_invalid');
    const bound=exported?.batch.spots.find(s=>s.spotId===input.spotId);
    if(exported&&!bound)throw new Error('spot_not_in_export');
    const spot={spotId:input.spotId,name:bound?.name??input.name,locality:bound?.locality??input.locality??null,existingValues:bound?.existingValues??null};
    const sources=[],sourceFailures=[];
    const queue=[...new Set(input.sources)].map(url=>({url})),explicit=new Set(input.sources);
    for(let index=0;index<queue.length&&index<6;index++) {
      const {url,discoveredOn,label}=queue[index];
      try {
        if(bound&&!matchesExistingWebsite(discoveredOn??url,bound.existingValues['contact.website']?.value))throw new Error('SOURCE_IDENTITY_REQUIRES_REVIEW');
        const page=await fetchPublicSource(url);
        const source=await readSourceText(page,`s${sources.length+1}`);
        if(discoveredOn){if(!['IMAGE_OCR','PDF_TEXT'].includes(source.format))throw new Error('embedded_asset_not_supported');source.discoveredOn=discoveredOn;if(source.format==='PDF_TEXT'&&label){const parent=sources.find(s=>s.url===discoveredOn);if(!parent)throw new Error('embedded_parent_missing');parent.linkedMenus??=[];parent.linkedMenus.push({label,url});}}
        sources.push(source);
        if(manifest.discoverLinks!==false) {
          for(const image of [...discoverMenuDocuments(page),...discoverMenuImages(page)])if(queue.length<6&&!queue.some(q=>q.url===image.url))queue.push(image);
          if(explicit.has(url))for(const link of discoverOfficialLinks(page))if(queue.length<4&&!queue.some(q=>q.url===link))queue.push({url:link});
        }
      }
      catch(error){sourceFailures.push({url,reason:String(error.message).slice(0,160)});}
    }
    await writeFile(`${out}/${spot.spotId}-sources.json`,JSON.stringify({spotId:spot.spotId,sources,sourceFailures},null,2));
    const partial=[];
    const report=sources.length?await researchExistingSpot({spot,fields,sources,modelPath,skipKnownFields:manifest.fields===undefined,exportBound:!!bound,sourceFailures},{validateValue:validateAuthoringSubmission,onField:async result=>{
      if(bound?.existingValues[result.attributeKey]) result.currentValue=bound.existingValues[result.attributeKey].value;
      partial.push(result);await writeFile(`${out}/${spot.spotId}-partial.json`,JSON.stringify({canonicalWrite:false,completed:false,results:partial},null,2));
      console.log(`${spot.name}: ${result.attributeKey}: ${result.status}${result.reason?' — '+result.reason:''}`);
    }}):{spotId:spot.spotId,name:spot.name,existingStateAvailable:!!bound,canonicalWrite:false,importable:false,humanReviewRequired:true,results:fields.map(f=>({attributeKey:f.attributeKey,status:'UNRESOLVED',reason:'NO_RETRIEVED_SOURCE'}))};
    report.exportBound=!!bound;report.sourceFailures=sourceFailures;report.catalogHash=AUTHORING_CATALOG_HASH;
    if(bound)report.baseManifestHash=bound.manifestHash;
    reports.push(report);
    await writeFile(`${out}/research.json`,JSON.stringify({completed:reports.length===manifest.spots.length,canonicalWrite:false,reports},null,2));
    await writeFile(`${out}/review.html`,reviewHtml(reports));
  }
  if(reports.some(r=>r.results.some(f=>f.status==='FAILED')))process.exitCode=1;
}
if(process.argv[1]&&import.meta.url===pathToFileURL(resolve(process.argv[1])).href)main().catch(error=>{console.error(error.message);process.exitCode=1;});
