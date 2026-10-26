// Read-only menu-image audit. OCR output is a lead with image coordinates,
// never a catalog claim or proof of a complete menu.
import {createHash} from 'node:crypto';
import {execFile} from 'node:child_process';
import {mkdtemp,readFile,readdir,rm,writeFile} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {dirname,join} from 'node:path';
import {fileURLToPath} from 'node:url';
import {fetchPublicSource,discoverMenuImages} from './nuknuk-sources.mjs';

const run=(command,args,options={})=>new Promise((accept,reject)=>execFile(command,args,{encoding:'utf8',timeout:120000,maxBuffer:2000000,...options},(error,stdout)=>error?reject(error):accept(stdout)));
export const normalizeOcrText=text=>String(text).normalize('NFKC').toLocaleLowerCase().replace(/[^\p{L}\p{N}]+/gu,' ').trim().replace(/\s+/gu,' ');
const price=text=>String(text).trim().match(/^(\d{1,3})[.,](\d{1,2})$/u)?.[0]??null;
const incompleteName=text=>/^(?:klein|gro[ssß]|small|large|mit|with|ohne|without|zusätzlicher|additional|extra)(?:\s|$)|(?:[-–—,;:]|(?:^|\s)(?:dazu|mit|und|oder|with|and|of|та|і|з|із|до))\s*$/iu.test(text);
function continuationLines(head,amount,visionLines) {
  // Image coordinates have origin at the bottom. Menu item names often wrap
  // below the price row; smaller descriptive copy must not become the name.
  const ordered=visionLines.filter(line=>line!==head&&line!==amount&&typeof line.text==='string'&&line.confidence>=0.65&&line.y<head.y&&Math.abs(line.x-head.x)<=0.045&&line.x+line.width<amount.x+0.035&&line.height>=Math.max(0.013,head.height*0.72)&&!price(line.text))
    .sort((a,b)=>b.y-a.y);
  const joined=[];let previous=head;
  for(const line of ordered) {
    if(previous.y-line.y>0.026||joined.length===3)break;
    joined.push(line);previous=line;
  }
  return joined;
}
export function agreeingPricedRows(visionLines,tesseractText) {
  if(!Array.isArray(visionLines)||typeof tesseractText!=='string')return [];
  const ocrLines=tesseractText.split(/\n+/u).map(normalizeOcrText).filter(Boolean);
  const rows=[];
  for(const line of visionLines) {
    if(typeof line.text!=='string'||line.confidence<0.75)continue;
    const match=/^(.{4,90}?)\s+(?:[—–-]\s*)?(\d{1,3}[.,]\d{1,2})\s*$/u.exec(line.text.trim());
    if(!match||incompleteName(match[1])||/^(?:vegi|vegan|total|mwst|vat|summe|seite|page)$/iu.test(match[1].trim()))continue;
    const name=match[1].trim(),value=match[2];
    if(!ocrLines.some(other=>other.includes(normalizeOcrText(name))&&other.includes(normalizeOcrText(value))))continue;
    rows.push({name,price:value,vision:{name:line,price:line},tesseractAgreement:true});
  }
  for(const amount of visionLines) {
    const value=price(amount.text);
    if(!value||amount.confidence<0.65)continue;
    const matching=visionLines.filter(line=>line!==amount&&typeof line.text==='string'&&line.confidence>=0.65&&Math.abs(line.y-amount.y)<=0.014&&line.x<amount.x&&line.x+line.width<=amount.x+0.03&&!price(line.text)&&!/^vegi|vegan$/iu.test(line.text.trim()))
      .sort((a,b)=>b.x-a.x)[0];
    if(!matching)continue;
    const continuations=continuationLines(matching,amount,visionLines);
    const name=[matching,...continuations].map(line=>line.text.trim()).join(' '),normalized=normalizeOcrText(name),amountText=normalizeOcrText(value);
    if(name.length<4||name.length>90||incompleteName(name)||normalized.split(' ').length>8||!/\p{L}/u.test(name))continue;
    const first=normalizeOcrText(matching.text);
    if(!ocrLines.some(line=>line.includes(first)&&line.includes(amountText))||!continuations.every(part=>ocrLines.some(line=>line.includes(normalizeOcrText(part.text)))))continue;
    if(rows.some(row=>row.name===name&&row.price===value))continue;
    rows.push({name,price:value,vision:{name:matching,price:amount},tesseractAgreement:true});
  }
  return rows;
}

/** @param {string} officialMenuUrl
 * @param {{page?:Awaited<ReturnType<typeof fetchPublicSource>>|null,maxImages?:number,maxDurationMs?:number,maxVisionImages?:number,visionModel?:(bytes:Buffer,mime:'image/jpeg'|'image/png',audit:object,timeoutMs:number)=>Promise<object>,tessdataDir?:string|null,ocrLanguages?:string,fetchPage?:typeof fetchPublicSource,runCommand?:typeof run}} [options]
 */
export async function auditMenuImages(officialMenuUrl,{page:providedPage=null,maxImages=24,maxDurationMs=60000,maxVisionImages=4,visionModel=null,tessdataDir=process.env.NUKNUK_TESSDATA_DIR??null,ocrLanguages=process.env.NUKNUK_OCR_LANGUAGES??'eng',fetchPage=fetchPublicSource,runCommand=run}={}) {
  if(!Number.isInteger(maxDurationMs)||maxDurationMs<1000||maxDurationMs>600000||!Number.isInteger(maxVisionImages)||maxVisionImages<1||maxVisionImages>4)throw new Error('menu_audit_duration_invalid');
  const deadline=Date.now()+maxDurationMs;
  const page=providedPage??await fetchPage(officialMenuUrl,{maxBytes:2000000,timeoutMs:15000,maxRedirects:1,allowedWebsite:officialMenuUrl});
  if(page.url!==officialMenuUrl)throw new Error('menu_page_identity_mismatch');
  if(!/^text\/html/iu.test(page.contentType??''))throw new Error('menu_page_not_html');
  const images=discoverMenuImages(page,{maxImages});
  const temp=await mkdtemp(join(tmpdir(),'nuknuk-menu-'));
  try {
    const candidates=[];
    let truncated=false;
    // Image subrequests are bounded independently of the ordinary page crawl.
    // Sequential fetch avoids burst traffic and keeps each result attributable.
    for(let i=0;i<images.length;i++) {
      if(Date.now()>deadline-5000){truncated=true;break;}
      const item=images[i];
      try {
        const fetched=await fetchPage(item.url,{maxBytes:4000000,timeoutMs:Math.min(15000,Math.max(1000,deadline-Date.now()-3000)),maxRedirects:0});
        if(!/^image\/(?:jpeg|png)/iu.test(fetched.contentType??'')||!Buffer.isBuffer(fetched.body))throw new Error('menu_image_format_invalid');
        const path=join(temp,`${i}.img`);await writeFile(path,fetched.body);
        candidates.push({...item,index:i,path,mimeType:fetched.contentType.split(';')[0],assetHash:createHash('sha256').update(fetched.body).digest('hex'),bytes:fetched.body.length});
      }catch(error){candidates.push({...item,index:i,error:error instanceof Error?error.message:'menu_image_fetch_failed'});}
    }
    return await inspectMenuCandidates(candidates,{page,images,deadline,truncated,visionModel,maxVisionImages,tessdataDir,ocrLanguages,runCommand});
  }finally{await rm(temp,{recursive:true,force:true});}
}

async function inspectMenuCandidates(candidates,{page,images,deadline,truncated,visionModel,maxVisionImages,tessdataDir,ocrLanguages,runCommand}) {
    const readable=candidates.filter(item=>item.path);
    if(!readable.length)return {officialMenuUrl:page.url,observedAt:page.observedAt,images:candidates.map(({path,...item})=>item),candidateRows:0,fetchFailures:candidates.filter(item=>item.error).map(({path,...item})=>item),catalogWrites:0,certifiedComplete:false,truncated,error:'NO_READABLE_MENU_IMAGES'};
    const visionPath=join(dirname(fileURLToPath(import.meta.url)),'..','src','nuknuk-vision-ocr.swift');
    const visionRaw=await runCommand('swift',[visionPath,...readable.map(item=>item.path)],{timeout:Math.max(1000,deadline-Date.now())});
    const visionPages=visionRaw.trim().split(/\n+/u).map(line=>JSON.parse(line));
    if(visionPages.length!==readable.length)throw new Error('menu_vision_page_count_mismatch');
    const inspected=[];
    for(let i=0;i<readable.length;i++) {
      if(Date.now()>deadline-1000){truncated=true;break;}
      const item=readable[i],lines=visionPages[i].lines;
      if(visionPages[i].path!==item.path||!Array.isArray(lines)||lines.length>500||lines.some(line=>typeof line.text!=='string'||line.text.length>500||![line.confidence,line.x,line.y,line.width,line.height].every(value=>Number.isFinite(value)&&value>=0&&value<=1)))throw new Error('menu_vision_output_invalid');
      const args=[item.path,'stdout',...(tessdataDir?['--tessdata-dir',tessdataDir]:[]),'-l',ocrLanguages];
      const tesseract=await runCommand('tesseract',args,{timeout:Math.min(20000,Math.max(1000,deadline-Date.now()))});
      let tesseractLayout='',layoutError=null;
      if(Date.now()<deadline-1000)try {tesseractLayout=await runCommand('tesseract',[...args,'--psm','4'],{timeout:Math.min(20000,Math.max(1000,deadline-Date.now()))});}
      catch(error){layoutError=error instanceof Error?error.message:'menu_tesseract_layout_failed';}
      const rows=agreeingPricedRows(lines,tesseract+'\n'+tesseractLayout);
      const ocrLines=text=>text.split(/\n+/u).map(line=>line.trim()).filter(Boolean);
      inspected.push({url:item.url,discoveredOn:item.discoveredOn,index:item.index,...(item.pageNumber?{pageNumber:item.pageNumber,documentAssetHash:item.documentAssetHash}:{}),assetHash:item.assetHash,bytes:item.bytes,visionLines:lines,tesseractLines:ocrLines(tesseract),tesseractLayoutLines:ocrLines(tesseractLayout),tesseractTextHash:createHash('sha256').update(tesseract+'\n'+tesseractLayout).digest('hex'),...(layoutError?{layoutError}:{}),pricedRows:rows});
    }
    if(visionModel) {
      const ranked=[...inspected].sort((a,b)=>{
        const count=item=>item.visionLines.filter(line=>/^\d{1,3}[.,]\d{1,2}$/u.test(line.text.trim())).length;
        return count(b)-count(a)||a.index-b.index;
      }).slice(0,maxVisionImages).sort((a,b)=>a.index-b.index);
      for(const item of ranked) {
        if(Date.now()>deadline-1200){truncated=true;break;}
        const candidate=candidates.find(source=>source.index===item.index);
        try {item.localVision=await visionModel(await readFile(candidate.path),candidate.mimeType,item,Math.min(240000,Math.max(1000,deadline-Date.now())));}
        catch(error){item.visionError=error instanceof Error?error.message:'menu_vision_failed';}
      }
    }
    return {officialMenuUrl:page.url,observedAt:page.observedAt,images:inspected,discoveredImages:images.length,fetchFailures:candidates.filter(item=>item.error).map(({path,...item})=>item),candidateRows:inspected.reduce((n,item)=>n+item.pricedRows.length,0),visionPages:inspected.filter(item=>item.localVision).length,visionErrors:inspected.filter(item=>item.visionError).length,catalogWrites:0,certifiedComplete:false,truncated:truncated||inspected.length<images.length};
}

/** Render a bounded document, then inspect page images through the same two
 * independent OCR engines used for HTML menu images. Never clear the PDF's
 * unresolved layout flag or reinterpret item prices as complete meal prices. */
export async function auditMenuPdf(page,{maxPages=20,maxDurationMs=180000,tessdataDir=process.env.NUKNUK_TESSDATA_DIR??null,ocrLanguages=process.env.NUKNUK_OCR_LANGUAGES??'eng',runCommand=run}={}) {
  if(!Buffer.isBuffer(page.body)||page.body.length>20000000||page.body.subarray(0,5).toString()!=='%PDF-'||!/^application\/pdf\b/iu.test(page.contentType??''))throw new Error('menu_pdf_invalid');
  if(!Number.isInteger(maxPages)||maxPages<1||maxPages>20||!Number.isInteger(maxDurationMs)||maxDurationMs<1000||maxDurationMs>600000)throw new Error('menu_pdf_bounds_invalid');
  const started=Date.now(),deadline=started+maxDurationMs,temp=await mkdtemp(join(tmpdir(),'nuknuk-pdf-layout-'));
  const documentAssetHash=createHash('sha256').update(page.body).digest('hex');
  try {
    const input=join(temp,'menu.pdf');await writeFile(input,page.body);
    const info=await runCommand('pdfinfo',[input],{timeout:Math.min(15000,Math.max(1000,deadline-Date.now()))});
    const count=Number(/^Pages:\s*(\d+)\s*$/mu.exec(info)?.[1]);
    if(!Number.isSafeInteger(count)||count<1)throw new Error('menu_pdf_page_count_unknown');
    const selected=Math.min(count,maxPages);
    await runCommand('pdftoppm',['-f','1','-l',String(selected),'-scale-to','1800','-png',input,join(temp,'page')],{timeout:Math.max(1000,deadline-Date.now())});
    const paths=(await readdir(temp)).filter(name=>/^page-\d+\.png$/u.test(name)).sort((a,b)=>Number(a.match(/\d+/u)[0])-Number(b.match(/\d+/u)[0]));
    if(paths.length!==selected)throw new Error('menu_pdf_render_page_count_mismatch');
    const candidates=[];
    for(const filename of paths){const pageNumber=Number(filename.match(/\d+/u)[0]),path=join(temp,filename),bytes=await readFile(path);candidates.push({url:page.url+'#page='+pageNumber,discoveredOn:page.url,index:pageNumber-1,pageNumber,documentAssetHash,path,mimeType:'image/png',assetHash:createHash('sha256').update(bytes).digest('hex'),bytes:bytes.length});}
    const audit=await inspectMenuCandidates(candidates,{page,images:candidates,deadline,truncated:count>selected,visionModel:null,maxVisionImages:1,tessdataDir,ocrLanguages,runCommand});
    return {...audit,format:'PDF_PAGE_OCR',latencyMs:Date.now()-started,documentAssetHash,totalDocumentPages:count,renderedPages:selected,layoutPagesInspected:audit.images.length,layoutCheckComplete:count===selected&&audit.images.length===count&&!audit.truncated};
  }finally{await rm(temp,{recursive:true,force:true});}
}
