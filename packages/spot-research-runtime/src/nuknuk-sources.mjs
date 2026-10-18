import { execFile } from 'node:child_process';
import { lookup } from 'node:dns/promises';
import { request } from 'node:https';
import { createHash } from 'node:crypto';
export function publicSourceUrl(value) {
  const u=new URL(value);
  if(u.protocol!=='https:'||u.username||u.password||u.port||!u.hostname.includes('.')||/^[\d.]+$|:|localhost|\.local$/i.test(u.hostname)||[...u.searchParams.keys()].some(k=>/token|secret|key|auth|session|email/i.test(k)))throw new Error('source_url_rejected');
  u.hash='';return u.href;
}
export function isPublicIPv4(ip) {
  const p=ip.split('.').map(Number);
  return p.length===4&&p.every(n=>Number.isInteger(n)&&n>=0&&n<256)&&![0,10,127].includes(p[0])&&p[0]<224&&!(p[0]===169&&p[1]===254)&&!(p[0]===172&&p[1]>=16&&p[1]<=31)&&!(p[0]===192&&[0,168].includes(p[1]))&&!(p[0]===100&&p[1]>=64&&p[1]<=127)&&!(p[0]===198&&[18,19].includes(p[1]));
}
// Explicit operator-approved URLs only. No recursive crawl, credentials or redirect following.
export async function fetchPublicSource(value,{resolve=lookup,requestImpl=request,maxBytes=2000000,timeoutMs=15000}={}) {
  const url=publicSourceUrl(value),u=new URL(url);
  let dnsTimer;
  const addresses=await Promise.race([resolve(u.hostname,{family:4,all:true}),new Promise((_,reject)=>{dnsTimer=setTimeout(()=>reject(new Error('source_dns_timeout')),timeoutMs);})]).finally(()=>clearTimeout(dnsTimer));
  if(!addresses.length||addresses.some(a=>!isPublicIPv4(a.address)))throw new Error('source_private_address');
  return new Promise((accept,reject)=>{
    const req=requestImpl(url,{method:'GET',headers:{'user-agent':'Backyrd-Nuknuk-Research/1.0','accept':'text/html,text/plain,application/pdf,image/jpeg,image/png','accept-encoding':'identity'},lookup:(_host,options,callback)=>callback(null,options?.all?[{address:addresses[0].address,family:4}]:addresses[0].address,4)},res=>{
      if(res.statusCode!==200){res.destroy();reject(new Error(`source_http_${res.statusCode}`));return;}
      const type=String(res.headers['content-type']??'').toLowerCase();
      if(!/^(text\/html|text\/plain|application\/xhtml\+xml|application\/pdf|image\/jpeg|image\/png)/i.test(type)){res.destroy();reject(new Error('source_format_unsupported'));return;}
      const chunks=[];let size=0;
      res.on('data',chunk=>{size+=chunk.length;if(size>maxBytes){req.destroy(new Error('source_too_large'));return;}chunks.push(chunk);});
      res.on('error',reject);
      res.on('end',()=>accept({url,contentType:type,body:/^(application\/pdf|image\/)/.test(type)?Buffer.concat(chunks):Buffer.concat(chunks).toString('utf8'),observedAt:new Date().toISOString()}));
    });
    const timer=setTimeout(()=>req.destroy(new Error('source_timeout')),timeoutMs);
    req.on('close',()=>clearTimeout(timer));req.on('error',reject);req.end();
  });
}
export function sourceText(page,id) {
  const named={auml:'ä',ouml:'ö',uuml:'ü',Auml:'Ä',Ouml:'Ö',Uuml:'Ü',szlig:'ß',eacute:'é',egrave:'è',agrave:'à',ccedil:'ç',rsquo:'’',lsquo:'‘',ldquo:'“',rdquo:'”',ndash:'–',mdash:'—',euro:'€',hellip:'…',amp:'&',lt:'<',gt:'>',quot:'"',apos:"'",nbsp:' '};
  const clean=html=>html.replace(/<(script|style|noscript|svg)\b[^>]*>[\s\S]*?<\/\1>/gi,' ').replace(/<\/?(?:p|h[1-6]|li|div|section|article|tr|br)\b[^>]*>/gi,'\n').replace(/<[^>]+>/g,' ').replace(/&([a-zA-Z]+);/g,(m,key)=>named[key]??m).replace(/&#(x[0-9a-f]+|\d+);/gi,(_m,n)=>{const c=n[0].toLowerCase()==='x'?parseInt(n.slice(1),16):Number(n);return c>0&&c<=0x10ffff?String.fromCodePoint(c):' ';}).replace(/[ \t\r]+/g,' ').replace(/ *\n */g,'\n').replace(/\n{3,}/g,'\n\n').trim();
  const text=clean(page.body);
  const main=page.body.match(/<main\b[^>]*>([\s\S]*?)<\/main>/i)?.[1]??page.body;
  const descriptionText=clean(main.replace(/<(footer|nav|header|aside)\b[^>]*>[\s\S]*?<\/\1>/gi,' ')).slice(0,12000);
  if(!text)throw new Error('source_empty');
  const excerpt=text.slice(0,12000);
  return {id,url:page.url,observedAt:page.observedAt,text:excerpt,descriptionText,truncated:text.length>excerpt.length,hash:createHash('sha256').update(excerpt).digest('hex')};
}

// A different host is a review item, not an automatically trusted alias/branch.
export function matchesExistingWebsite(sourceUrl, existingWebsite) {
  try {
    const host = value => new URL(value).hostname.toLowerCase().replace(/^www\./, '');
    return host(sourceUrl) === host(existingWebsite);
  } catch { return false; }
}

export async function readSourceText(page,id,{pdfCommand=process.env.NUKNUK_PDFTOTEXT??'pdftotext',ocrCommand=process.env.NUKNUK_TESSERACT??'tesseract',ocrLanguages=process.env.NUKNUK_OCR_LANGUAGES??'eng'}={}) {
  const image=/^image\/(jpeg|png)$/i.test(page.contentType??'');
  if(image) {
    const b=page.body;
    if(!Buffer.isBuffer(b)||b.length>2000000||!(b[0]===0xff&&b[1]===0xd8||b.subarray(0,8).equals(Buffer.from([137,80,78,71,13,10,26,10]))))throw new Error('source_image_invalid');
    const body=await new Promise((resolve,reject)=>{
      const child=execFile(ocrCommand,['stdin','stdout','-l',ocrLanguages],{timeout:15000,maxBuffer:200000,encoding:'utf8'},(error,stdout)=>error?reject(new Error('source_ocr_failed')):resolve(stdout));
      child.stdin.on('error',()=>{});child.stdin.end(b);
    });
    const text=body.trim().slice(0,12000);if(!text)throw new Error('source_ocr_empty');
    return {id,url:page.url,observedAt:page.observedAt,text,truncated:body.trim().length>12000,format:'IMAGE_OCR',layoutReviewRequired:true,ocrLanguage:ocrLanguages,assetHash:createHash('sha256').update(b).digest('hex'),hash:createHash('sha256').update(text).digest('hex')};
  }
  if(!String(page.contentType??'').toLowerCase().startsWith('application/pdf'))return sourceText(page,id);
  if(!Buffer.isBuffer(page.body)||page.body.length>2000000||page.body.subarray(0,5).toString()!=='%PDF-')throw new Error('source_pdf_invalid');
  const body=await new Promise((resolve,reject)=>{
    const child=execFile(pdfCommand,['-raw','-f','1','-l','10','-','-'],{timeout:10000,maxBuffer:200000,encoding:'utf8'},(error,stdout)=>error?reject(new Error('source_pdf_extraction_failed')):resolve(stdout));
    child.stdin.on('error',()=>{});child.stdin.end(page.body);
  });
  const text=body.replace(/\r\n/g,'\n').replace(/\n{3,}/g,'\n\n').trim();
  if(!text)throw new Error('source_pdf_needs_ocr');
  const excerpt=text.slice(0,12000);
  return {id,url:page.url,observedAt:page.observedAt,text:excerpt,truncated:text.length>12000,format:'PDF_TEXT',extractionOrder:'CONTENT_STREAM',layoutReviewRequired:true,pageLimit:10,hash:createHash('sha256').update(excerpt).digest('hex')};
}

// One-hop discovery on the supplied official host; links are candidates, not
// identity proof. The caller retains the total six-request limit and export gate.
export function discoverOfficialLinks(page) {
  if(typeof page.body!=='string'||!/^(text\/html|application\/xhtml\+xml)/i.test(page.contentType??''))return [];
  const links=[];
  for(const match of page.body.matchAll(/<a\b[^>]*\bhref\s*=\s*["']([^"']+)["'][^>]*>([\s\S]*?)<\/a>/gi)) {
    const href=match[1].replace(/&amp;/g,'&');
    if(!/men[uü]|speise|karte|contact|kontakt|öffnung|opening|hours|impressum|about|über.uns|\.pdf/i.test(href+' '+match[2].replace(/<[^>]*>/g,'')))continue;
    try {const url=publicSourceUrl(new URL(href,page.url).href);if(matchesExistingWebsite(url,page.url)&&url!==page.url&&!links.includes(url))links.push(url);}catch{}
  }
  return links.slice(0,6);
}

// Only actual image URLs embedded by the approved official page, not guessed
// CDN paths. Preserve that parent URL so asset hosting cannot masquerade as identity.
export function discoverMenuImages(page) {
  if(typeof page.body!=='string')return [];
  const images=[];
  for(const match of page.body.matchAll(/<img\b[^>]*>/gi)) {
    const src=match[0].match(/\bsrc\s*=\s*["']([^"']+)["']/i)?.[1];
    const alt=match[0].match(/\balt\s*=\s*["']([^"']+)["']/i)?.[1]??'';
    if(!src||!/menu|speisekarte|menü/i.test(src+' '+alt))continue;
    try {const url=publicSourceUrl(new URL(src.replace(/&amp;/g,'&'),page.url).href);if(!images.some(i=>i.url===url))images.push({url,discoveredOn:page.url});}catch{}
    if(images.length===4)break;
  }
  return images;
}
