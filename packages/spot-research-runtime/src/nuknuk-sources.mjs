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
  return p.length===4&&p.every(n=>Number.isInteger(n)&&n>=0&&n<256)&&![0,10,127].includes(p[0])&&p[0]<224&&!(p[0]===169&&p[1]===254)&&!(p[0]===172&&p[1]>=16&&p[1]<=31)&&!(p[0]===192&&p[1]===0&&p[2]===0)&&!(p[0]===192&&p[1]===168)&&!(p[0]===100&&p[1]>=64&&p[1]<=127)&&!(p[0]===198&&[18,19].includes(p[1]));
}
// Public GET only; callers constrain official-site discovery. No credentials or redirects.
export async function fetchPublicSource(value,{resolve=lookup,requestImpl=request,maxBytes=2000000,timeoutMs=15000,maxRedirects=0,allowedWebsite=value}={}) {
  if(!Number.isInteger(maxRedirects)||maxRedirects<0||maxRedirects>3)throw new Error('source_redirect_limit_invalid');
  const url=publicSourceUrl(value),u=new URL(url);
  let dnsTimer;
  const addresses=await Promise.race([resolve(u.hostname,{family:4,all:true}),new Promise((_,reject)=>{dnsTimer=setTimeout(()=>reject(new Error('source_dns_timeout')),timeoutMs);})]).finally(()=>clearTimeout(dnsTimer));
  if(!addresses.length||addresses.some(a=>!isPublicIPv4(a.address)))throw new Error('source_private_address');
  return new Promise((accept,reject)=>{
    const req=requestImpl(url,{method:'GET',headers:{'user-agent':'Backyrd-Nuknuk-Research/1.0','accept':'text/html,text/plain,application/pdf,image/jpeg,image/png','accept-encoding':'identity'},lookup:(_host,options,callback)=>callback(null,options?.all?[{address:addresses[0].address,family:4}]:addresses[0].address,4)},res=>{
      if([301,302,303,307,308].includes(res.statusCode)&&maxRedirects>0){
        res.destroy();
        try{
          if(typeof res.headers.location!=='string')throw new Error('source_redirect_location_missing');
          const observed=new URL(res.headers.location,url);
          // An official site may advertise an HTTP redirect to its www alias.
          // Probe the observed host/path over HTTPS only; never send the
          // research request to the insecure Location or a foreign host.
          if(observed.protocol==='http:'&&matchesExistingWebsite(observed.href,allowedWebsite))observed.protocol='https:';
          const target=publicSourceUrl(observed.href);
          if(!matchesExistingWebsite(target,allowedWebsite))throw new Error('source_redirect_identity_rejected');
          accept(fetchPublicSource(target,{resolve,requestImpl,maxBytes,timeoutMs,maxRedirects:maxRedirects-1,allowedWebsite}).then(page=>({...page,redirectedFrom:[url,...(page.redirectedFrom??[])]})));
        }catch(error){reject(error);}return;
      }
      if(res.statusCode!==200){res.destroy();reject(new Error(`source_http_${res.statusCode}`));return;}
      const type=String(res.headers['content-type']??'').toLowerCase();
      if(!/^(text\/html|text\/plain|application\/xhtml\+xml|application\/json|application\/pdf|image\/jpeg|image\/png)/i.test(type)){res.destroy();reject(new Error('source_format_unsupported'));return;}
      const chunks=[];let size=0;
      res.on('data',chunk=>{size+=chunk.length;if(size>maxBytes){req.destroy(new Error('source_too_large'));return;}chunks.push(chunk);});
      res.on('error',reject);
      res.on('end',()=>accept({url,contentType:type,body:/^(application\/pdf|image\/)/.test(type)?Buffer.concat(chunks):Buffer.concat(chunks).toString('utf8'),observedAt:new Date().toISOString()}));
    });
    const timer=setTimeout(()=>req.destroy(new Error('source_timeout')),timeoutMs);
    req.on('close',()=>clearTimeout(timer));req.on('error',reject);req.end();
  });
}
// Shared classification used at extraction and independent output validation.
// A menu title describes only its explicit group; a generic food/drinks menu
// cannot establish every kind of food or drink served by a venue.
export function menuOfferingGroup(label) {
  const text=String(label??'').normalize('NFKC').replace(/\s+/gu,' ').trim();
  if(/\b(?:sample|example|Beispiel|Christmas|Weihnacht|Silvester|New Year)\b/iu.test(text))return null;
  if(/^(?:Mittags?\s*(?:menü|menu|karte)|Lunch(?: menu)?|Lunchkarte|(?:[\p{L}'’-]+\s+){1,4}Lunch\s+(?:Sharefood\s+)?Menu)$/iu.test(text))return 'LUNCH';
  if(/^(?:Abend\s*(?:menü|menu|karte)|Dinner(?: menu)?|Dinnerkarte)$/iu.test(text))return 'DINNER';
  if(/^(?:Wein(?:karte|e)?|Offen(?:e )?weine|Wine ?(?:list|menu)|Wines)$/iu.test(text))return 'WINE';
  return null;
}
export function sourceText(page,id,{preferMain=false}={}) {
  const boundedExcerpt=(value,focusOffsets=[])=>{
    if(value.length<=12000)return {text:value,offset:at=>at};
    const marker='\n\n[Auszug: mittlerer Seitenteil ausgelassen]\n\n';
    if(focusOffsets.length){
      const two=focusOffsets.length>1;
      const headSize=two?2000:3000,tailSize=two?3300:4500,focusSize=two?3200:4300;
      const ranges=[[0,headSize],...focusOffsets.slice(0,2).map(at=>[at,Math.min(value.length,at+focusSize)]),[value.length-tailSize,value.length]];
      ranges.sort((a,b)=>a[0]-b[0]);
      const merged=[];
      for(const [start,end] of ranges){
        const last=merged.at(-1);
        if(last&&start<=last[1])last[1]=Math.max(last[1],end);
        else merged.push([start,end]);
      }
      let excerpt='',positions=[];
      for(const [start,end] of merged){
        if(excerpt)excerpt+=marker;
        positions.push([start,end,excerpt.length]);
        excerpt+=value.slice(start,end);
      }
      if(excerpt.length<=12000)return {text:excerpt,offset:at=>{
        const range=positions.find(([start,end])=>at>=start&&at<end);
        return range?range[2]+at-range[0]:-1;
      }};
    }
    const headBreak=value.lastIndexOf('\n',4000),headEnd=headBreak>=0?headBreak:4000;
    const targetStart=value.length-(12000-headEnd-marker.length),tailBreak=value.indexOf('\n',targetStart);
    const tailStart=Math.max(headEnd+1,tailBreak>=0?tailBreak+1:targetStart);
    return {text:value.slice(0,headEnd)+marker+value.slice(tailStart),offset:at=>at<headEnd?at:at>=tailStart?headEnd+marker.length+at-tailStart:-1};
  };
  const named={auml:'ä',ouml:'ö',uuml:'ü',Auml:'Ä',Ouml:'Ö',Uuml:'Ü',szlig:'ß',eacute:'é',egrave:'è',agrave:'à',ccedil:'ç',rsquo:'’',lsquo:'‘',ldquo:'“',rdquo:'”',bdquo:'„',sbquo:'‚',ndash:'–',mdash:'—',euro:'€',hellip:'…',sup2:'²',amp:'&',lt:'<',gt:'>',quot:'"',apos:"'",nbsp:' ',thinsp:' ',ensp:' ',emsp:' ',laquo:'«',raquo:'»',copy:'©'};
  const withMailto=html=>html.replace(/<a\b[^>]*\bhref\s*=\s*["']mailto:([^"']+)["'][^>]*>([\s\S]*?)<\/a>/giu,(whole,href,label)=>{
    let address;try{address=decodeURIComponent(href.split('?')[0]).trim();}catch{return label;}
    if(!/^[-\w.+]+@[-\w.]+\.[a-z]{2,}$/iu.test(address))return label;
    return label.includes(address)?label:`\n${label} (${address})\n`;
  });
  const plain=html=>withMailto(html).replace(/<(script|style|noscript|svg)\b[^>]*>[\s\S]*?<\/\1>/gi,' ').replace(/<\/?(?:p|h[1-6]|li|div|section|article|tr|br)\b[^>]*>/gi,'\n').replace(/<[^>]+>/g,' ').replace(/&([a-zA-Z][a-zA-Z0-9]*);/g,(m,key)=>named[key]??m).replace(/&#(x[0-9a-f]+|\d+);/gi,(_m,n)=>{const c=n[0].toLowerCase()==='x'?parseInt(n.slice(1),16):Number(n);return c>0&&c<=0x10ffff?String.fromCodePoint(c):' ';}).replace(/[ \t\r]+/g,' ').replace(/ *\n */g,'\n').replace(/\n{3,}/g,'\n\n').trim();
  const pairTabs=html=>{
    const labels=new Map();
    for(const match of html.matchAll(/<a\b([^>]*)>([\s\S]*?)<\/a>/giu)){
      if(!/\brole\s*=\s*["']tab["']/iu.test(match[1]))continue;
      const key=match[1].match(/\baria-controls\s*=\s*["']([a-z0-9_-]{1,64})["']/iu)?.[1];
      const label=plain(match[2]);
      if(key&&label.length>=3&&label.length<=80&&labels.size<24)labels.set(key,label);
    }
    if(!labels.size)return html;
    return html.replace(/<div\b([^>]*)>/giu,(opening,attributes)=>{
      if(!/\brole\s*=\s*["']tabpanel["']/iu.test(attributes))return opening;
      const key=attributes.match(/\bid\s*=\s*["']([a-z0-9_-]{1,64})["']/iu)?.[1],label=labels.get(key);
      return label?opening+'<h4>'+label.replace(/&/gu,'&amp;').replace(/</gu,'&lt;').replace(/>/gu,'&gt;')+'</h4>':opening;
    });
  };
  const clean=html=>plain(html.replace(/<tr\b[^>]*>([\s\S]*?)<\/tr>/gi,(row,inner)=>{
    const cells=[...inner.matchAll(/<t[dh]\b[^>]*>([\s\S]*?)<\/t[dh]>/gi)].map(m=>plain(m[1]).split(/\n+/u).map(x=>x.trim()).filter(Boolean));
    if(cells.length!==2||cells[0].length<2||cells[0].length!==cells[1].length||!/^(?:mon|tue|wed|thu|fri|sat|sun|mo\b|di\b|mi\b|do\b|fr\b|sa\b|so\b|montag|dienstag|mittwoch|donnerstag|freitag|samstag|sonntag)/iu.test(cells[0][0])||!cells[1].every(x=>/^\d{1,2}[:.]\d{2}\s*[-–]\s*\d{1,2}[:.]\d{2}$/u.test(x)))return row;
    return '\n'+cells[0].map((label,i)=>label+' '+cells[1][i]).join('\n')+'\n';
  }));
  const htmlWithTabs=pairTabs(page.body);
  const primary=htmlWithTabs.match(/<main\b[^>]*>([\s\S]*?)<\/main>/i)?.[1];
  const selectedHtml=preferMain&&primary?primary.replace(/<(footer|nav|header|aside)\b[^>]*>[\s\S]*?<\/\1>/gi,' '):htmlWithTabs;
  const mainText=clean(selectedHtml);
  const outside=preferMain&&primary?clean(page.body.replace(/<main\b[^>]*>[\s\S]*?<\/main>/i,' ')):'';
  const windows=[];
  for(const match of outside.matchAll(/(?:öffnungs(?:zeiten)?|oeffnungs(?:zeiten)?|opening\s+hours|adresse|address|(?:\+|\b00)\d[\d ()/.-]{7,}\d|[-\w.+]+@[\w.-]+\.[a-z]{2,})/giu)) {
    if(windows.length>=14)break;
    const start=Math.max(0,outside.lastIndexOf('\n',match.index)+1),end=Math.min(outside.length,match.index+420);
    const last=windows.at(-1);if(last&&start<=last[1])last[1]=Math.max(last[1],end);else windows.push([start,end]);
  }
  const publicInfo=windows.map(([start,end])=>outside.slice(start,end)).join('\n\n').slice(0,3200).trim();
  const emailLinks=[];
  const contactPage=/(?:^|\/)(?:kontakt|contact|impressum)(?:\.html|\/|$)/iu.test(new URL(page.url).pathname)||new URL(page.url).pathname==='/' ;
  for(const match of contactPage?page.body.matchAll(/<a\b[^>]*\bhref\s*=\s*["']mailto:([^"']+)["'][^>]*>([\s\S]*?)<\/a>/giu):[]) {
    const label=plain(match[2]).trim();
    if(!/^(?:e-?mail|kontakt|contact|info|[-\w.+]+@[-\w.]+\.[a-z]{2,})$/iu.test(label))continue;
    let address;try{address=decodeURIComponent(match[1].split('?')[0]).trim();}catch{continue;}
    if(!/^[-\w.+]+@[-\w.]+\.[a-z]{2,}$/iu.test(address)||emailLinks.includes(address)||mainText.includes(address)||publicInfo.includes(address))continue;
    emailLinks.push(address);if(emailLinks.length>=8)break;
  }
  const publicPanel=[publicInfo,...(emailLinks.length?['Öffentliche E-Mail-Links\n'+emailLinks.join('\n')]:[])].filter(Boolean).join('\n\n');
  const identityOffset=publicPanel?mainText.length+2:undefined;
  const text=publicPanel?mainText+'\n\nWebsite-Kontakt und Öffnungszeiten\n'+publicPanel:mainText;
  const headings=[];
  if(preferMain)for(const match of selectedHtml.matchAll(/<h([1-6])\b[^>]*>([\s\S]*?)<\/h\1>/gi)) {
    const label=clean(match[2]);if(!label||label.length>160)continue;
    const expected=clean(selectedHtml.slice(0,match.index)).length;
    const offset=text.indexOf(label,Math.max(0,expected-12));
    if(offset<0||Math.abs(offset-expected)>20)continue;
    headings.push({level:Number(match[1]),text:label,offset});if(headings.length===80)break;
  }
  const main=page.body.match(/<main\b[^>]*>([\s\S]*?)<\/main>/i)?.[1]??page.body;
  const descriptionText=boundedExcerpt(clean(main.replace(/<(footer|nav|header|aside)\b[^>]*>[\s\S]*?<\/\1>/gi,' '))).text;
  if(!text)throw new Error('source_empty');
  // Long CMS pages often put the actual menu between a short introduction and
  // a long footer or wine list. Keep price-bearing food and drink sections in
  // addition to the beginning and end, preserving offsets for exact citations.
  const pricedSection=(pattern)=>headings.find(h=>{
    if(!pattern.test(h.text)||h.offset<=2000||h.offset>=text.length-3300)return false;
    const next=headings.find(other=>other.offset>h.offset&&other.level<=h.level)?.offset??text.length;
    return /(?:\bCHF\s*\d|\b\d{1,3}[.,]\d{2}\b)/iu.test(text.slice(h.offset,Math.min(next,h.offset+1800)));
  })?.offset;
  const menuFocus=[pricedSection(/(?:speise|essen|food|sharing|appetizer|seasonal|classic|sweets|dessert|hauptgericht|gerichte)/iu),pricedSection(/(?:cocktail|drinks|getränke|wein(?:karte)?)/iu)].filter(at=>at!==undefined);
  const bounded=boundedExcerpt(text,menuFocus),excerpt=bounded.text;
  if(identityOffset!==undefined)headings.push({level:1,text:'Website-Kontakt und Öffnungszeiten',offset:identityOffset});
  const keptHeadings=headings.map(h=>({...h,offset:bounded.offset(h.offset)})).filter(h=>h.offset>=0&&h.offset+h.text.length<=excerpt.length);
  const keptIdentityOffset=identityOffset===undefined?undefined:bounded.offset(identityOffset);
  const linkedMenus=[];
  for(const match of main.replace(/<(footer|nav|header|aside)\b[^>]*>[\s\S]*?<\/\1>/gi,' ').matchAll(/<a\b([^>]*)>([\s\S]*?)<\/a>/gi)) {
    const href=match[1].match(/\bhref\s*=\s*["']([^"']+)["']/i)?.[1],label=clean(match[2]);
    if(!href||!menuOfferingGroup(label))continue;
    try {
      const target=publicSourceUrl(new URL(href.replace(/&amp;/g,'&'),page.url).href);
      if(new URL(target).hostname!==new URL(page.url).hostname||!excerpt.includes(label))continue;
      // Dated menus require their own validity evaluation. Do not treat an old
      // weekly menu still linked by the site as proof of a current offering.
      if(/\d{1,2}[.-]\d{1,2}[.-]\d{2,4}/u.test(target))continue;
      linkedMenus.push({label,url:target});if(linkedMenus.length>=12)break;
    }catch{}
  }
  return {id,url:page.url,observedAt:page.observedAt,text:excerpt,descriptionText,linkedMenus,truncated:text.length>excerpt.length,hash:createHash('sha256').update(excerpt).digest('hex'),...(preferMain?{textSelection:primary?publicPanel?'MAIN_WITH_PUBLIC_INFO':'MAIN_CONTENT':'FULL_PAGE',headings:keptHeadings,identityOffset:keptIdentityOffset>=0?keptIdentityOffset:undefined,assetHash:createHash('sha256').update(page.body).digest('hex')}:{})};
}

function jsonSourceText(page,id) {
  let parsed;try{parsed=JSON.parse(page.body);}catch{throw new Error('source_json_invalid');}
  if(!parsed||typeof parsed!=='object'||Array.isArray(parsed))throw new Error('source_json_invalid');
  // Public sidebar responses often mix venue contacts and hours with dated
  // event cards. Keep only the two arrays explicitly bound by the HTML page.
  if(/\/includes\/Sidebar\.php$/iu.test(new URL(page.url).pathname))parsed={sqrySidebarContact:parsed.sqrySidebarContact,qryOeffnungszeiten:parsed.qryOeffnungszeiten};
  const language=new URL(page.url).pathname.match(/\/Website\/(de|en|fr)\//iu)?.[1]?.toLowerCase()??'de';
  const lines=[],headings=[];let length=0;
  const add=line=>{if(length>16000)return;const at=length;lines.push(line);length+=line.length+1;return at;};
  const walk=(value,key='',depth=0)=>{
    if(depth>7||length>16000)return;
    if(Array.isArray(value)){for(const item of value.slice(0,80))walk(item,key,depth+1);return;}
    if(value&&typeof value==='object'){
      const keys=Object.keys(value).filter(k=>!/^qry/u.test(k)||!Object.hasOwn(value,'repeat'+k.slice(3)));
      keys.sort((a,b)=>Number(b.toLowerCase()==='kategorie_'+language)-Number(a.toLowerCase()==='kategorie_'+language)||Number(/^repeat/u.test(b))-Number(/^repeat/u.test(a)));
      for(const child of keys)walk(value[child],child,depth+1);return;
    }
    if(typeof value!=='string'||!value.trim()||!((key.toLowerCase().endsWith('_'+language))||/^(?:META_Description|phone|telefon|email|address|adresse|adresszeile1|plz)$/iu.test(key)))return;
    const cleaned=sourceText({url:page.url,observedAt:page.observedAt,body:value},id).text.trim();
    if(!cleaned||cleaned.length>3200)return;
    const label=key.toLowerCase()==='kategorie_'+language?'Kategorie':key.replace(/_(?:de|en|fr)$/iu,'');
    const at=add(label+': '+cleaned);
    if(key.toLowerCase()==='kategorie_'+language&&at!==undefined)headings.push({level:2,text:cleaned,offset:at});
  };
  walk(parsed);
  const full=lines.join('\n').trim(),text=full.slice(0,12000);
  if(!text)throw new Error('source_json_empty');
  return {id,url:page.url,observedAt:page.observedAt,text,descriptionText:text,headings:headings.filter(h=>h.offset<text.length),truncated:full.length>text.length,format:'JSON_TEXT',seasonalSchedule:/\b(?:Januar|Februar|März|Maerz|April|Mai|Juni|Juli|August|September|Oktober|November|Dezember)\s+(?:bis|–|-)\s*(?:Januar|Februar|März|Maerz|April|Mai|Juni|Juli|August|September|Oktober|November|Dezember)\b/iu.test(text),hash:createHash('sha256').update(text).digest('hex')};
}

// A different host is a review item, not an automatically trusted alias/branch.
export function matchesExistingWebsite(sourceUrl, existingWebsite) {
  try {
    const host = value => new URL(value).hostname.toLowerCase().replace(/^www\./, '');
    return host(sourceUrl) === host(existingWebsite);
  } catch { return false; }
}

export async function readSourceText(page,id,{pdfCommand=process.env.NUKNUK_PDFTOTEXT??'pdftotext',ocrCommand=process.env.NUKNUK_TESSERACT??'tesseract',ocrLanguages=process.env.NUKNUK_OCR_LANGUAGES??'eng',preferMain=false}={}) {
  if(/^application\/json\b/i.test(page.contentType??''))return jsonSourceText(page,id);
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
  if(!String(page.contentType??'').toLowerCase().startsWith('application/pdf'))return sourceText(page,id,{preferMain});
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
/** @param {Parameters<typeof sourceText>[0]} page
 * @param {{maxImages?:number}} [options]
 */
export function discoverMenuImages(page,{maxImages=4}={}) {
  if(!Number.isInteger(maxImages)||maxImages<1||maxImages>24)throw new Error('menu_image_limit_invalid');
  if(typeof page.body!=='string')return [];
  const observed=[];
  for(const match of page.body.matchAll(/<img\b[^>]*>/gi)) {
    const src=match[0].match(/\bsrc\s*=\s*["']([^"']+)["']/i)?.[1];
    const alt=match[0].match(/\balt\s*=\s*["']([^"']+)["']/i)?.[1]??'';
    if(!src||/\.svg(?:[?#\s]|$)|menu[-_ ]?(?:toggle|icon|button)|hamburger|navigation/i.test(src+' '+alt))continue;
    try {
      const url=publicSourceUrl(new URL(src.replace(/&amp;/g,'&'),page.url).href);
      if(!observed.some(item=>item.url===url))observed.push({url,discoveredOn:page.url,explicit:/menu|speisekarte|menü/i.test(src+' '+alt)});
    }catch{}
    if(observed.length===100)break;
  }
  // Some sites omit alt text on a middle page of a contiguous image menu.
  // An observed, unlabeled asset is a lead only when flanked by explicit
  // menu images on the same asset host; never bridge into unrelated reviews.
  const images=observed.filter((item,index)=>item.explicit||index>0&&index+1<observed.length&&observed[index-1].explicit&&observed[index+1].explicit&&new URL(item.url).hostname===new URL(observed[index-1].url).hostname&&new URL(item.url).hostname===new URL(observed[index+1].url).hostname);
  return images.slice(0,maxImages).map(({url,discoveredOn})=>({url,discoveredOn}));
}

// Public menu documents may be hosted by a CDN. Identity comes from the actual
// embedding official page; the caller must preserve and validate that parent.
export function discoverMenuDocuments(page) {
  if(typeof page.body!=='string')return [];
  const documents=[];
  for(const m of page.body.matchAll(/<a\b[^>]*\bhref\s*=\s*["']([^"']+)["'][^>]*>([\s\S]*?)<\/a>/gi)) {
    const label=m[2].replace(/<[^>]*>/g,' ').replace(/\s+/g,' ').trim();
    if(!/menu|menü|karte/iu.test(label))continue;
    try{const url=publicSourceUrl(new URL(m[1].replace(/&amp;/g,'&'),page.url).href);if(!/\.pdf(?:[?#]|$)/iu.test(url)||documents.some(d=>d.url===url))continue;documents.push({url,discoveredOn:page.url,label});}catch{}
    if(documents.length===4)break;
  }
  return documents;
}

// Bounded official-site frontier for Research v2. Only observed links; no guessed
// URLs, browser instructions, authenticated actions or automatic domain aliases.
export function standingExperiencePath(url) {
  const path=decodeURI(new URL(url).pathname);
  const leaf=path.split('/').filter(Boolean).at(-1)??'';
  return !/\b(?:19|20)\d{2}\b/u.test(leaf)&&/(?:atelier|workshops?|f(?:ü|ue|u)hrungen?|guided[-_]?tours?|education|vermittlung)/iu.test(leaf);
}
export function discoverResearchLinks(page) {
  if(typeof page.body!=='string'||!/^(text\/html|application\/xhtml\+xml)/i.test(page.contentType??''))return [];
  const links=[];
  const topicPatterns={contact:/kontakt|contact|impressum|anschrift|adresse/iu,hours:/öffnungs|oeffnungs|opening|hours|zeiten/iu,menu:/men[uü]|speise|karte|food|drink|getränk|essen|restaurant|brasserie|bistro|gastronom/iu,stay:/hotel|zimmer|rooms?|suites?|guest|gäste|accommodation|übernacht/iu,experience:/angebot|erlebnis|erleben|experience|ausstellung|exhibition|sammlung|collection|mitmach|hands[-\s]?on|zimmer|rooms?|aktivität|activities|bouldern|klettern|climb|sport|spiel|play|workshop|führung|guided|badewelt|actionwelt|relaxwelt|wellness|sauna|hamam|massage|spa|therme|thermal|pool|rutsch|shiatsu/iu,about:/(?:^|[\s/|])(?:über[-\s](?:uns|das|die|den)|ueber[-\s](?:uns|das|die|den)|about(?:[-\s]us)?|portrait|konzept|concept)(?:$|[\s/|])/iu,visit:/besuch|visit|information|praktisch|practical|anreise/iu,access:/barriere|access|famil|kinder|children|ausstattung|facilities|faq/iu};
  topicPatterns.contact=/kontakt|contact|impressum|anschrift|adresse|mitarbeitende|team|staff|employees|equipe|équipe/iu;
  for(const m of page.body.matchAll(/<a\b[^>]*\bhref\s*=\s*["']([^"']+)["'][^>]*>([\s\S]*?)<\/a>/gi)) {
    const href=m[1].replace(/&amp;/g,'&');
    if(/^[\s&;]+$/u.test(href))continue;
    if(/\{\{|\}\}|(?:^|[./])(?:window|document|browser\d*)\.|\.contains\(|\.data\.|(?:^|[/?=])(?:MenuURL|LinkURL|RouteURL|RubrikMenuURL)|(?:==|!=|\?\s*['"])/iu.test(href))continue;
    // Icon-only navigation commonly carries its meaning in the link's
    // accessible name. It is still an observed link, never a guessed URL.
    const accessible=m[0].match(/\b(?:aria-label|title)\s*=\s*["']([^"']+)["']/iu)?.[1]
      ??m[2].match(/<img\b[^>]*\balt\s*=\s*["']([^"']+)["']/iu)?.[1]
      ??'';
    const label=(m[2].replace(/<[^>]*>/g,' ').trim()||accessible).replace(/&amp;/g,'&').replace(/\s+/g,' ').trim().slice(0,200);
    try {
      const url=publicSourceUrl(new URL(href,page.url).href);
      if(!matchesExistingWebsite(url,page.url)||url===page.url||/(?:^|\/)[&;]+(?:\/|$)/u.test(new URL(url).pathname)||/login|logout|sign.?in|register|checkout|booking|reservation|reservieren|warenkorb|cart|privacy|datenschutz|(?:^|\/)(?:shop|jobs?|stellenangebote|karriere|careers?|buchen|[^/]*-buchen|anmeldung(?:-[^/]*)?|request-for[^/]*|demande-de[^/]*|anfrage[^/]*|formular[^/]*|room-rental|raumvermietung|location-de-salle|mitglied(?:-werden)?|membership|members?|unterstuetzen|unterstützen|spenden|donate|fundraising)(?:\.[a-z0-9]+)?(?:\/|$)/iu.test(new URL(url).pathname))continue;
      if(/\.(?:pdf|jpe?g|png|webp|gif)(?:[?#]|$)/iu.test(url))continue;
      // Dated events are useful to a different product flow, but cannot prove
      // a permanent venue offering or regular opening hours. Do not spend the
      // bounded Spot-research budget crawling individual event/news pages.
      const pathname=decodeURI(new URL(url).pathname).replace(/\/+$/u,'');
      if(/(?:^|\/)(?:ihrevent|your-event|votre.?[eé]v[eé]nement)(?:\/|$)/iu.test(pathname))continue;
      if(/(?:^|\/)(?:press|presse|media|medien|digital|videos?)(?:[-_][^/]*)?(?:\.[a-z0-9]+)?(?:\/|$)/iu.test(pathname))continue;
      // Some museums place a permanent-exhibition overview behind an
      // "Aktuell" navigation item. Follow only an observed link explicitly
      // labelled as an exhibition or hands-on activity, never a generic news
      // link or an individual dated event.
      const permanentOverview=/^(?:\/(?:de|en|fr|it))?\/(?:aktuell|actualites|actualités)$/iu.test(pathname)&&/\b(?:ausstellung|dauerausstellung|exposition permanente|mitmachstationen|hands[-\s]?on activities)\b/iu.test(label);
      if((/(?:^|\/)(?:konzert|concert|events?|veranstaltung|veranstaltungen|agenda|calendar|kalender|news(?:[-_][^/]*)?|blog|aktuelles?|actualit[eé]s?|[^/]*(?:programme?|programm))(?:\.html)?(?:\/|$)/iu.test(pathname)&&!permanentOverview&&!standingExperiencePath(url))||/\b(?:\d{1,2}[.\/-]\d{1,2}[.\/-]\d{2,4}|\d{4}[.\/-]\d{1,2}[.\/-]\d{1,2})\b/u.test(label))continue;
      // Exhibition/programme pages describe time-bounded offerings. The
      // permanent Spot profile cannot encode their validity yet.
      if(/(?:^|\/)(?:ausstellungen?|exhibitions?|expositions?|group[-_]offers?|group[-_]tours?|school[-_]offers?|press|presse|media|medien)(?:\.[a-z0-9]+)?(?:\/|$)/iu.test(new URL(url).pathname))continue;
      // Campaigns, member deals and artist programmes do not establish a
      // permanent venue profile, and their contact details may be departmental.
      if(/(?:^|\/)(?:offers?|angebote?|deals?|specials?|special-offers?|promotions?|stay-for-goods|artist-in-(?:hotel-)?residence)(?:\/|$)/iu.test(pathname))continue;
      // Parent paths name a site section, not necessarily the linked page.
      // /informationen/pv-anlage.html is not visitor information merely
      // because it sits under /informationen/.
      const material=(pathname.split('/').at(-1)??'')+' '+label;
      const topics=Object.entries(topicPatterns).filter(([,pattern])=>pattern.test(material)).map(([key])=>key);
      // Flat CMS sites often use /dinner.html, /info.html and an HTML-entity
      // encoded "Über uns" slug. These are observed links, not guessed paths.
      const leaf=pathname.split('/').at(-1)??'';
      if(/^(?:dinner|lunch|breakfast|brunch)(?:\.html)?$/iu.test(leaf))topics.push('menu');
      if(/^info(?:rmation(?:en)?)?(?:\.html)?$/iu.test(leaf))topics.push('visit','hours','contact');
      if(/^(?:uumlber[-_]uns|ueber[-_]uns|uber[-_]uns)(?:\.html)?$/iu.test(leaf))topics.push('about');
      if(/^Deutsch$/iu.test(label)&&/^(?:\/|\/de\/?|\/de\/home(?:-[0-9]+)?\/?)$/iu.test(new URL(url).pathname))topics.push('language');
      if(!topics.length&&(!label||/\.(?:jpg|png|zip|mp4)$/iu.test(url)||/\/(?:products|collections|blogs|policies)\//iu.test(new URL(url).pathname)))continue;
      const existing=links.find(l=>l.url===url);
      if(existing){existing.topics=[...new Set([...existing.topics,...topics])];existing.label=(existing.label+' | '+label).slice(0,200);continue;}
      if(links.length<500)links.push({url,label,topics});
    }catch{}
  }
  if(links.length<=120)return links;
  const score=link=>link.topics.reduce((n,topic)=>n+({contact:8,hours:8,visit:3,about:3,access:2,stay:2,experience:2,menu:1}[topic]??0),0);
  return links.map((link,index)=>({link,index})).sort((a,b)=>score(b.link)-score(a.link)||a.index-b.index).slice(0,120).map(x=>x.link);
}

// Some official pages print template placeholders but declare read-only public
// data sources. Follow only observed same-host GET endpoints with parameters
// taken from the page URL; never execute the page's scripts or action endpoints.
export function discoverPublicDataSources(page) {
  if(typeof page.body!=='string'||!/^(text\/html|application\/xhtml\+xml)/iu.test(page.contentType??'')||!page.body.includes('{{'))return [];
  const found=[],pageUrl=new URL(page.url),routeId=pageUrl.pathname.match(/(?:^|\/)r\/(\d{1,8})(?:\/|$)/u)?.[1];
  for(const tag of page.body.matchAll(/<dmx-serverconnect\b[^>]*>/giu)) {
    if(/\bnoload\b/iu.test(tag[0]))continue;
    const id=tag[0].match(/\bid=["']([^"']+)["']/iu)?.[1]??'';
    const href=tag[0].match(/\burl=["']([^"']+)["']/iu)?.[1];
    const sidebar=id==='scSidebar'&&/\/includes\/Sidebar\.php(?:[?#]|$)/iu.test(href)&&/(?:scSidebar\.data\.sqrySidebarContact|scSidebar\.data\.qryOeffnungszeiten)/u.test(page.body);
    if(!href||/\{\{|\}\}|(?:^|[./])(?:window|document|browser\d*)\./iu.test(href)||!sidebar&&!/(?:oeffnungs?|öffnungs?|opening|hours|zeiten|kontakt|contact)/iu.test(id+' '+href)||/(?:stats|cookies?|tracking|analytics)/iu.test(id+' '+href))continue;
    try {
      const target=new URL(href,page.url);
      if(!target.pathname.startsWith('/dmxConnect/api/Website/')||!matchesExistingWebsite(target.href,page.url))continue;
      let valid=true;
      for(const parameter of tag[0].matchAll(/\bdmx-param:([\w-]+)=["']([^"']+)["']/giu)) {
        const variable=parameter[2].match(/^query\.([\w-]+)$/u);
        const value=variable&&(pageUrl.searchParams.get(variable[1])??(variable[1]==='wrid'?routeId:null));
        if(!value||value.length>80||!/^[-\w]+$/u.test(value)){valid=false;break;}
        target.searchParams.set(parameter[1],value);
      }
      if(!valid)continue;
      const url=publicSourceUrl(target.href);
      if(found.some(item=>item.url===url))continue;
      found.push({url,label:id,discoveredOn:page.url,topics:sidebar?['contact','hours']: [/(?:oeffnungs?|öffnungs?|opening|hours|zeiten)/iu.test(id+' '+href)?'hours':'contact']});
      if(found.length>=4)break;
    }catch{}
  }
  return found;
}
