import { execFile } from 'node:child_process';
import { lookup } from 'node:dns/promises';
import { request } from 'node:https';
import { createHash } from 'node:crypto';
export function publicSourceUrl(value) {
  const u=new URL(value);
  if(u.protocol!=='https:'||u.username||u.password||u.port||!u.hostname.includes('.')||/^[\d.]+$|:|localhost|\.local$/i.test(u.hostname)||[...u.searchParams.keys()].some(k=>/token|secret|key|auth|session|email/i.test(k)))throw new Error('source_url_rejected');
  for(const key of [...u.searchParams.keys()])if(/^(?:_gl|_ga|fbclid|gclid|msclkid|utm_.+)$/iu.test(key))u.searchParams.delete(key);
  u.hash='';return u.href;
}
function observedPageBase(page) {
  if(typeof page.body!=='string')return page.url;
  const href=page.body.slice(0,50000).match(/<base\b[^>]*\bhref\s*=\s*["']([^"']+)["'][^>]*>/iu)?.[1];
  if(!href)return page.url;
  try {
    const base=publicSourceUrl(new URL(href.replace(/&amp;/g,'&'),page.url).href);
    return new URL(base).origin===new URL(page.url).origin?base:page.url;
  }catch{return page.url;}
}
export function isPublicIPv4(ip) {
  const p=ip.split('.').map(Number);
  return p.length===4&&p.every(n=>Number.isInteger(n)&&n>=0&&n<256)&&![0,10,127].includes(p[0])&&p[0]<224&&!(p[0]===169&&p[1]===254)&&!(p[0]===172&&p[1]>=16&&p[1]<=31)&&!(p[0]===192&&p[1]===0&&p[2]===0)&&!(p[0]===192&&p[1]===168)&&!(p[0]===100&&p[1]>=64&&p[1]<=127)&&!(p[0]===198&&[18,19].includes(p[1]));
}
// Public GET only; callers constrain official-site discovery. No credentials or redirects.
export async function fetchPublicSource(value,{resolve=lookup,requestImpl=request,maxBytes=2000000,timeoutMs=15000,maxRedirects=0,allowedWebsite=value,allowObservedPdfRedirect=false}={}) {
  if(!Number.isInteger(maxBytes)||maxBytes<1||maxBytes>20000000)throw new Error('source_size_limit_invalid');
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
          const sameWebsite=matchesExistingWebsite(target,allowedWebsite);
          const linkedPdf=allowObservedPdfRedirect&&/\.pdf(?:[?#]|$)/iu.test(url)&&/\.pdf(?:[?#]|$)/iu.test(target)&&observed.protocol==='https:';
          if(!sameWebsite&&!linkedPdf)throw new Error('source_redirect_identity_rejected');
          // Only an explicitly observed official PDF link may cross to a
          // public document host. The foreign hop gets no further redirects.
          accept(fetchPublicSource(target,{resolve,requestImpl,maxBytes,timeoutMs,maxRedirects:sameWebsite?maxRedirects-1:0,allowedWebsite:sameWebsite?allowedWebsite:target,allowObservedPdfRedirect:false}).then(page=>({...page,redirectedFrom:[url,...(page.redirectedFrom??[])]})));
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
/** Remove explicitly non-published subtrees, preserving device-specific variants. */
export function visibleSourceHtml(html) {
  const token=/<\/?([a-z][a-z0-9:-]*)\b([^>]*)>/giu;
  const ranges=[]; let hidden=null,depth=0,match;
  const voidTags=new Set(['area','base','br','col','embed','hr','img','input','link','meta','param','source','track','wbr']);
  while((match=token.exec(html))){
    const closing=match[0].startsWith('</'),tag=match[1].toLowerCase();
    if(hidden){
      if(tag===hidden.tag){if(closing)depth--;else if(!voidTags.has(tag)&&!match[0].endsWith('/>'))depth++;}
      if(depth===0){ranges.push([hidden.start,token.lastIndex]);hidden=null;}continue;
    }
    if(closing)continue;
    const attrs=match[2],classes=attrs.match(/\bclass\s*=\s*["']([^"']*)["']/iu)?.[1]?.split(/\s+/u)??[];
    const allDevices=['desktop','tablet','mobile'].every(device=>classes.includes('elementor-hidden-'+device));
    const inlineHidden=/\bstyle\s*=\s*["'][^"']*(?:display\s*:\s*none|visibility\s*:\s*hidden)/iu.test(attrs);
    // Do not remove collapsed accordion/tab content or aria-hidden icons by themselves.
    const interactive=/\brole\s*=\s*["']tabpanel["']|elementor-(?:tab-content|accordion|toggle)|accordion-(?:body|content|collapse)/iu.test(attrs);
    if(!allDevices&&(!(inlineHidden&&!interactive)&&!/(?:^|\s)hidden(?:\s|=|$)/iu.test(attrs)))continue;
    if(voidTags.has(tag)||match[0].endsWith('/>'))ranges.push([match.index,token.lastIndex]);
    else {hidden={tag,start:match.index};depth=1;}
  }
  if(hidden)ranges.push([hidden.start,html.length]);
  for(const [start,end] of ranges.reverse())html=html.slice(0,start)+' '+html.slice(end);
  return html;
}
/** Legal-page policy applies to observed links, redirects and supplied seeds. */
export function researchLegalPage(url,label='') {
  const path=decodeURI(new URL(url).pathname),text=path+' '+label;
  const imprint=/impressum|imprint|mentions[-_ ]legales/iu.test(text);
  if(/(?:^|[\s/_-])(?:agb|terms(?:[-_ ](?:and|of|conditions|use|service))*|privacy|datenschutz[^\s/]*|conditions[-_ ]generales)(?:$|[\s/_.-])/iu.test(text)&&!imprint)return 'PROHIBITED';
  // Combined imprint/privacy documents may be read solely to fill missing contact data.
  return imprint?'CONTACT_ONLY':'VISITOR';
}
// Read only published navigation records from inert Next hydration JSON. No
// scripts run and no arbitrary JSON string becomes a crawl destination.
function hydrationNavigation(page) {
  const links=[];
  for(const script of page.body.matchAll(/<script\b([^>]*)>([\s\S]*?)<\/script>/giu)) {
    if(!/\bid=["']__NEXT_DATA__["']/iu.test(script[1])||script[2].length>2000000)continue;
    let data;try{data=JSON.parse(script[2]);}catch{continue;}
    const walk=(item,depth=0)=>{
      if(!item||typeof item!=='object'||depth>9||links.length>=80)return;
      if(Array.isArray(item)){for(const child of item.slice(0,80))walk(child,depth+1);return;}
      if(Array.isArray(item.menuItems))for(const nav of item.menuItems.slice(0,40)){
        if(!nav||typeof nav!=='object'||typeof nav.menuLabel!=='string'||typeof nav.pageRelation!=='string')continue;
        try{
          const url=new URL(nav.pageRelation,page.url),origin=new URL(page.url);
          if(url.protocol==='http:'&&url.hostname===origin.hostname&&!url.port&&!url.username&&!url.password)url.protocol='https:';
          const href=publicSourceUrl(url.href);
          if(!matchesExistingWebsite(href,page.url)||new URL(href).search)continue;
          links.push({href,label:nav.menuLabel.slice(0,160)});
        }catch{}
      }
      for(const [key,value] of Object.entries(item))if(key!=='menuItems'&&value&&typeof value==='object')walk(value,depth+1);
    };
    walk(data?.props?.pageProps);
  }
  return links;
}

export function sourceText(page,id,{preferMain=false}={}) {
  if(/(?:^|\/)content-access-denied(?:\/|$)/iu.test(new URL(page.url).pathname))throw new Error('source_access_denied');
  const pageBase=observedPageBase(page);
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
  const withMailto=html=>html.replace(/<a\b([^>]*)>([\s\S]*?)<\/a>/giu,(whole,attributes,label)=>{
    const cfHex=label.match(/\bdata-cfemail\s*=\s*["']([0-9a-f]{8,510})["']/iu)?.[1]
      ??attributes.match(/\bhref\s*=\s*["'][^"']*\/cdn-cgi\/l\/email-protection#([0-9a-f]{8,510})["']/iu)?.[1];
    if(cfHex&&cfHex.length%2===0){
      const bytes=Buffer.from(cfHex,'hex'),key=bytes[0];
      const address=Buffer.from(bytes.subarray(1).map(byte=>byte^key)).toString('utf8');
      if(/^[-\w.+]+@[-\w.]+\.[a-z]{2,}$/iu.test(address)&&address.length<=254)return `\n${address}\n`;
    }
    const encoded=attributes.match(/\bdata-mailto-token\s*=\s*["']([^"']{10,200})["']/iu)?.[1];
    const vector=attributes.match(/\bdata-mailto-vector\s*=\s*["'](\d{1,2})["']/iu)?.[1];
    // TYPO3's published click handler rotates only these three character
    // ranges. Decode a public mailto target, never infer an address from the
    // anti-spam display text or arbitrary JavaScript.
    if(encoded&&vector&&Number(vector)>=1&&Number(vector)<=25){
      const shift=-Number(vector);
      const rotated=[...encoded].map(char=>{
        const code=char.charCodeAt(0),range=code>=43&&code<=58?[43,58]:code>=64&&code<=90?[64,90]:code>=97&&code<=122?[97,122]:null;
        if(!range)return char;
        const [first,last]=range,size=last-first+1;
        return String.fromCharCode(first+((code-first+shift)%size+size)%size);
      }).join('');
      const address=rotated.startsWith('mailto:')?rotated.slice(7).split('?')[0]:'';
      if(/^[-\w.+]+@[-\w.]+\.[a-z]{2,}$/iu.test(address))return `\n${address}\n`;
    }
    const href=attributes.match(/\bhref\s*=\s*["']mailto:([^"']+)["']/iu)?.[1];
    if(!href)return whole;
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
  // Recover a pair of explicitly labelled schedule columns before flattening
  // DOM layout. Require complete day rows, exactly two clock intervals, and
  // adjacent labelled header/row containers. Any ambiguity leaves HTML intact.
  let separatedScheduleColumns=false;
  const balancedDiv=(html,start)=>{
    const tags=/<\/?div\b[^>]*>/giu;tags.lastIndex=start;let depth=0,tag;
    while((tag=tags.exec(html))&&tags.lastIndex-start<=40000){depth+=/^<\/div/iu.test(tag[0])?-1:1;if(depth===0)return {end:tags.lastIndex,html:html.slice(start,tags.lastIndex)};}
    return null;
  };
  const separateSchedules=html=>{
    const header=/<div\b[^>]*>\s*<h([2-3])\b[^>]*>\s*(Öffnungszeiten|Opening hours)\s*<\/h\1>\s*<p\b[^>]*>\s*(Küche|Kitchen)\s*<\/p>\s*<\/div>/giu;
    return html.replace(header,(whole,level,opening,kitchen,at)=>{
      const rest=html.slice(at+whole.length),next=rest.match(/^\s*(<div\b[^>]*>)/iu);
      if(!next)return whole;
      const start=at+whole.length+next[0].length-next[1].length,container=balancedDiv(html,start);
      if(!container)return whole;
      const rows=[...container.html.matchAll(/<h[4-6]\b[^>]*>([^<>]{2,60})<\/h[4-6]>\s*<div\b[^>]*>\s*<div\b[^>]*>([^<>]+)<\/div>\s*<div\b[^>]*>([^<>]+)<\/div>\s*<\/div>/giu)];
      const day=/^(?:Montag|Dienstag|Mittwoch|Donnerstag|Freitag|Samstag|Sonntag|Monday|Tuesday|Wednesday|Thursday|Friday|Saturday|Sunday)(?:\s*[-–]\s*(?:Montag|Dienstag|Mittwoch|Donnerstag|Freitag|Samstag|Sonntag|Monday|Tuesday|Wednesday|Thursday|Friday|Saturday|Sunday))?$/iu;
      const clock=/^\d{1,2}:\d{2}\s*[-–]\s*\d{1,2}:\d{2}$/u;
      if(!rows.length||rows.length>7||!rows.every(row=>day.test(plain(row[1]))&&clock.test(plain(row[2]))&&clock.test(plain(row[3]))))return whole;
      const expected=rows.map(row=>[row[1],row[2],row[3]].map(plain).join(' ')).join(' ');
      if(plain(container.html).replace(/\s+/gu,' ')!==expected)return whole;
      separatedScheduleColumns=true;
      // Replacement occurs separately below so replace cannot reprocess its output.
      scheduleReplacements.push({start:at,end:container.end,value:`<h${level}>${opening}</h${level}>`+rows.map(row=>`<p>${row[1]} ${row[2]}</p>`).join('')+`<h${level}>${kitchen}</h${level}>`+rows.map(row=>`<p>${row[1]} ${row[3]}</p>`).join('')});
      return whole;
    });
  };
  const scheduleReplacements=[];
  let htmlWithTabs=pairTabs(visibleSourceHtml(page.body));
  separateSchedules(htmlWithTabs);
  for(const replacement of scheduleReplacements.reverse())htmlWithTabs=htmlWithTabs.slice(0,replacement.start)+replacement.value+htmlWithTabs.slice(replacement.end);

  // Semantic footer wrappers occur as divs on CMS pages. Normalize only
  // explicit footer identities, with balanced boundaries, so their contact
  // evidence can be retained without becoming main-profile assertions.
  if(preferMain){
    htmlWithTabs=htmlWithTabs.replace(/<(script|style|noscript)\b[^>]*>[\s\S]*?<\/\1>/giu,' ');
    const semanticFooters=[];
    for(const opening of htmlWithTabs.matchAll(/<div\b(?=[^>]*(?:\brole\s*=\s*["']contentinfo["']|\bid\s*=\s*["'](?:footer|footer-page|site-footer|socket)["']))[^>]*>/giu)){
      if(semanticFooters.some(region=>opening.index>=region.start&&opening.index<region.end))continue;
      const tags=/<\/?div\b[^>]*>/giu;tags.lastIndex=opening.index+opening[0].length;
      let depth=1,tag;
      while((tag=tags.exec(htmlWithTabs))&&tags.lastIndex-opening.index<=100000){
        depth+=/^<\/div/iu.test(tag[0])?-1:1;
        if(depth===0){semanticFooters.push({start:opening.index,end:tags.lastIndex,inner:htmlWithTabs.slice(opening.index+opening[0].length,tag.index)});break;}
      }
    }
    for(const region of semanticFooters.reverse())htmlWithTabs=htmlWithTabs.slice(0,region.start)+'<footer>'+region.inner+'</footer>'+htmlWithTabs.slice(region.end);
  }

  let primaryMatch=/<main\b[^>]*>([\s\S]*?)<\/main>/i.exec(htmlWithTabs);
  // Some CMSs use a nested <div id="content"> instead of <main>. Match its
  // balanced div boundary so navigation and the corporate footer cannot be
  // mistaken for facts about the visited venue. An incomplete container is
  // left to the existing full-page fallback rather than silently truncated.
  if(preferMain&&(!primaryMatch||clean(primaryMatch[1]).length<80)) {
    // Chain sites sometimes omit <main> but wrap the individual branch in
    // schema.org/Hotel. That bounded block starts after the global hotel
    // navigation and carries the branch's own address and contact details.
    const opening=/<div\b(?=[^>]*\bid\s*=\s*["'](?:main|content|main-content)["'])[^>]*>/i.exec(htmlWithTabs)
      ??/<div\b(?=[^>]*\bitemscope\b)(?=[^>]*\bitemtype\s*=\s*["']https?:\/\/schema\.org\/Hotel["'])[^>]*>/i.exec(htmlWithTabs);
    if(opening&&opening.index<500000) {
      const tags=/<\/?div\b[^>]*>/gi;
      tags.lastIndex=opening.index+opening[0].length;
      let depth=1,tag;
      while((tag=tags.exec(htmlWithTabs))&&tag.index-opening.index<500000) {
        depth+=/^<\/div\b/i.test(tag[0])?-1:1;
        if(depth===0) {
          const inner=htmlWithTabs.slice(opening.index+opening[0].length,tag.index);
          const preceding=htmlWithTabs.slice(Math.max(0,opening.index-6000),opening.index);
          const hero=[...preceding.matchAll(/<h1\b[^>]*>[\s\S]*?<\/h1>/gi)].at(-1)?.[0]??'';
          if(/<h1\b/i.test(inner)||hero||/\bitemtype\s*=\s*["']https?:\/\/schema\.org\/Hotel["']/iu.test(opening[0])&&/\bitemprop\s*=\s*["'](?:streetAddress|addressLocality)["']/iu.test(inner)) {
            const whole=htmlWithTabs.slice(opening.index,tags.lastIndex);
            primaryMatch=Object.assign([whole,/<h1\b/i.test(inner)?inner:hero+inner],{index:opening.index});
          }
          break;
        }
      }
    }
  }
  const primary=primaryMatch?.[1];
  // Some CMS layouts close <main> after the hero and render the actual page
  // content in sibling element sections. Include only that bounded region,
  // never the footer or unrelated navigation and sidebar material.
  const afterMain=primaryMatch?htmlWithTabs.slice(primaryMatch.index+primaryMatch[0].length):'';
  const beforeFooter=afterMain.split(/<footer\b/i,1)[0];
  const siblingContent=primaryMatch?.[0].startsWith('<main')&&beforeFooter.length<=250000&&/<section\b[^>]*\bclass\s*=\s*["'][^"']*\belement\b[^"']*["']/i.test(beforeFooter)?beforeFooter:'';
  const contentHtml=preferMain&&primary?primary+siblingContent:htmlWithTabs;
  const selectedHtml=preferMain?contentHtml.replace(/<(footer|nav|header|aside)\b[^>]*>[\s\S]*?<\/\1>/gi,' '):contentHtml;
  const mainText=clean(selectedHtml);
  const outsideHtml=preferMain&&primary?htmlWithTabs.replace(primaryMatch[0],' ').replace(siblingContent,' ').replace(/<(nav|aside)\b[^>]*>[\s\S]*?<\/\1>/giu,' '):'';
  const outside=clean(outsideHtml);
  const identityHeadings=[...outsideHtml.matchAll(/<h1\b[^>]*>([\s\S]*?)<\/h1>/giu)].map(match=>clean(match[1])).filter(label=>label.length>=3&&label.length<=160&&!mainText.includes(label)).slice(0,3);
  const windows=[];
  for(const match of outside.matchAll(/(?:öffnungs(?:zeiten)?|oeffnungs(?:zeiten)?|opening\s+hours|adresse|address|(?:\+|\b00)\d[\d ()/.-]{7,}\d|[-\w.+]+@[\w.-]+\.[a-z]{2,})/giu)) {
    if(windows.length>=14)break;
    const start=Math.max(0,outside.lastIndexOf('\n',match.index)+1);
    const lineEnd=outside.indexOf('\n',match.index);
    const contextLabel=/öffnungs|oeffnungs|opening\s+hours|adresse|address/iu.test(match[0]);
    const end=Math.min(outside.length,match.index+420,contextLabel||lineEnd<0?outside.length:lineEnd);
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
  // Preserve explicitly published social-profile hrefs; icon-only links have
  // no URL in ordinary rendered text. These are evidence links, never crawled.
  const socialLinks=[];
  for(const match of visibleSourceHtml(page.body).replace(/<(script|style|template)\b[\s\S]*?<\/\1>/giu,'').replace(/<!--[\s\S]*?-->/gu,'').matchAll(/<a\b[^>]*\bhref\s*=\s*["']([^"']+)["'][^>]*>[\s\S]*?<\/a>/giu)) {
    try {
      const url=publicSourceUrl(new URL(match[1].replace(/&amp;/g,'&'),page.url).href),u=new URL(url);
      const platform=({'instagram.com':'Instagram','facebook.com':'Facebook','tiktok.com':'TikTok','linkedin.com':'LinkedIn'})[u.hostname.replace(/^(?:www\.|m\.)/u,'')];
      if(!platform||!u.pathname.replace(/\//gu,'')||/\/(?:share|sharer(?:\.php)?|intent|login|signup|privacy|accounts|p|reel)(?:\/|$)/iu.test(u.pathname))continue;
      const item=platform+': '+url;if(!socialLinks.includes(item))socialLinks.push(item);
      if(socialLinks.length>=12)break;
    }catch{}
  }
  // Preserve bounded, visibly labelled contact panels even when a CMS div
  // replaces <main>. Keep the published branch context; this is source text,
  // never an assertion that every footer contact belongs to the target.
  const contactPanels=[];
  if(preferMain)for(const footer of htmlWithTabs.matchAll(/<footer\b[^>]*>([\s\S]*?)<\/footer>/giu)) {
    const html=footer[1];
    for(const opening of html.matchAll(/<div\b(?=[^>]*\bclass\s*=\s*["'][^"']*\bcontact-data\b[^"']*["'])[^>]*>/giu)) {
      const tags=/<\/?div\b[^>]*>/giu;tags.lastIndex=opening.index+opening[0].length;
      let depth=1,tag;
      while((tag=tags.exec(html))&&tags.lastIndex-opening.index<=12000) {
        depth+=/^<\/div/iu.test(tag[0])?-1:1;
        if(depth===0){
          const panel=clean(html.slice(opening.index,tags.lastIndex));
          if(panel.length<=2200&&/\b\d{4,5}\s+\p{L}/u.test(panel)&&/(?:tel:|mailto:)/iu.test(html.slice(opening.index,tags.lastIndex))&&!mainText.includes(panel))contactPanels.push(panel);
          break;
        }
      }
      if(contactPanels.length>=4)break;
    }
  }
  // Preserve a small visible postal block with its preceding venue label.
  // Do not copy the whole footer, scripts, JSON-LD, affiliate navigation or
  // surrounding claims into the profile. Each address keeps its own context;
  // downstream branch checks must still establish who it belongs to.
  if(preferMain)for(const footer of htmlWithTabs.matchAll(/<(footer|address)\b[^>]*>([\s\S]*?)<\/\1>/giu)) {
    const visible=clean(footer[2].replace(/<(nav|aside)\b[^>]*>[\s\S]*?<\/\1>/giu,' '));
    const lines=visible.split(/\n+/u).map(line=>line.trim()).filter(Boolean);
    const directContacts=lines.filter(line=>line.length<=180&&/(?:[-\w.+]+@[-\w.-]+\.[a-z]{2,}|(?:\+|00)\d[\d ()/.-]{7,}\d)/iu.test(line)&&!mainText.includes(line)&&!contactPanels.some(panel=>panel.includes(line))).slice(0,8);
    if(directContacts.length&&contactPanels.length<8)contactPanels.push(directContacts.join('\n'));
    for(let i=1;i<lines.length&&contactPanels.length<8;i++) {
      const inline=lines[i].match(/^(.{4,100}?)\s*[,·]\s*(\d{4,5}\s+\p{L}[\p{L} .'-]{1,70})$/u);
      if(!inline&&(i<2||!/^\d{4,5}\s+\p{L}[\p{L} .'-]{1,70}$/u.test(lines[i])))continue;
      const street=inline?inline[1]:lines[i-1],name=lines[i-(inline?1:2)];
      if(!/^(?:\p{L}[\p{L} .'-]{2,80}\s+\d{1,4}[a-z]?|\d{1,4}[a-z]?\s+\p{L}[\p{L} .'-]{2,80})$/iu.test(street)||name.length<3||name.length>120||!/\p{L}/u.test(name)||/[@]|https?:/iu.test(name))continue;
      const extra=[];
      for(let j=i+1;j<Math.min(lines.length,i+4);j++){if(!/(?:[-\w.+]+@[\w.-]+\.[a-z]{2,}|(?:\+|00)\d[\d ()/.-]{7,}\d)/iu.test(lines[j]))break;extra.push(lines[j]);}
      const panel=[name,...(inline?[lines[i]]:[street,lines[i]]),...extra].join('\n');
      if(!mainText.includes(panel)&&!contactPanels.some(known=>known.replace(/\s+/gu,' ').includes(panel.replace(/\s+/gu,' '))))contactPanels.push(panel);
    }
  }
  const documentTitle=plain(page.body.match(/<title\b[^>]*>([\s\S]*?)<\/title>/iu)?.[1]??'');
  const publicPanel=[...(documentTitle.length>=3&&documentTitle.length<=200?['Veröffentlichter Seitentitel\n'+documentTitle]:[]),...identityHeadings,publicInfo,...contactPanels,...(emailLinks.length?['Öffentliche E-Mail-Links\n'+emailLinks.join('\n')]:[]),...(socialLinks.length?['Veröffentlichte Social-Profile\n'+socialLinks.join('\n')]:[])].filter(Boolean).join('\n\n');
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
  // CMS themes may render a standalone semantic headline without an h tag.
  // Keep its exact source position and bind it to its following body. Only
  // explicit heading roles/classes with short plain text qualify, not arbitrary
  // styled wrappers, footer/nav content or a whole nested section.
  if(preferMain)for(const match of selectedHtml.matchAll(/<(div|p|span)\b([^>]*)>([^<>]{4,400})<\/\1>/giu)) {
    const attributes=match[2],className=attributes.match(/\bclass\s*=\s*["']([^"']*)["']/iu)?.[1]??'';
    const roleHeading=/\brole\s*=\s*["']heading["']/iu.test(attributes);
    if(!roleHeading&&!/(?:^|\s)(?:headline|heading|section-title)(?:$|\s)/iu.test(className))continue;
    const label=clean(match[3]);if(label.length<4||label.length>160)continue;
    const expected=clean(selectedHtml.slice(0,match.index)).length;
    const offset=text.indexOf(label,Math.max(0,expected-12));
    if(offset<0||Math.abs(offset-expected)>20||headings.some(h=>h.offset===offset))continue;
    const level=Number(attributes.match(/\baria-level\s*=\s*["']([1-6])["']/iu)?.[1]??3);
    headings.push({level,text:label,offset});if(headings.length>=80)break;
  }
  headings.sort((a,b)=>a.offset-b.offset);
  const descriptionHtml=preferMain&&primary?selectedHtml:(primary??htmlWithTabs).replace(/<(footer|nav|header|aside)\b[^>]*>[\s\S]*?<\/\1>/gi,' ');
  const descriptionText=boundedExcerpt(clean(descriptionHtml)).text;
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
  for(const match of descriptionHtml.matchAll(/<a\b([^>]*)>([\s\S]*?)<\/a>/gi)) {
    const href=match[1].match(/\bhref\s*=\s*["']([^"']+)["']/i)?.[1],label=clean(match[2]);
    if(!href||!menuOfferingGroup(label))continue;
    try {
      const target=publicSourceUrl(new URL(href.replace(/&amp;/g,'&'),pageBase).href);
      // An official menu button may delegate its document to a public CDN
      // or QR viewer. Retain the original on-page label as evidence metadata;
      // this does not authorize fetching or trusting the external destination.
      if(!excerpt.includes(label))continue;
      // Dated menus require their own validity evaluation. Do not treat an old
      // weekly menu still linked by the site as proof of a current offering.
      if(/\d{1,2}[.-]\d{1,2}[.-]\d{2,4}/u.test(target))continue;
      linkedMenus.push({label,url:target});if(linkedMenus.length>=12)break;
    }catch{}
  }
  const tableBookingLinks=[];
  const visibleLinks=visibleSourceHtml(page.body).replace(/<(script|style|template)\b[\s\S]*?<\/\1>/giu,'').replace(/<!--[\s\S]*?-->/gu,'');
  for(const match of visibleLinks.matchAll(/<a\b([^>]*)>([\s\S]*?)<\/a>/giu)) {
    const label=clean(match[2]),href=match[1].match(/\bhref\s*=\s*["']([^"']+)["']/iu)?.[1];
    if(!href||/\b(?:disabled|aria-disabled\s*=\s*["']?true)/iu.test(match[1])||! /^(?:Tisch\s+(?:reservieren|buchen)|Book\s+a\s+table|Réserver\s+une\s+table|Prenot(?:a|are)\s+un\s+tavolo)$/iu.test(label)||!excerpt.includes(label))continue;
    try {const url=publicSourceUrl(new URL(href.replace(/&amp;/gu,'&'),pageBase).href);if(!tableBookingLinks.some(link=>link.url===url&&link.label===label))tableBookingLinks.push({label,url});if(tableBookingLinks.length>=4)break;}catch{}
  }
  const month='(?:Januar|Februar|März|Maerz|April|Mai|Juni|Juli|August|September|Oktober|November|Dezember|January|February|March|May|June|July|August|October|December)';
  const seasonalSchedule=new RegExp('\\b'+month+'\\s*(?:bis|to|[-–—])\\s*'+month+'\\b[^\\n]{0,70}\\b\\d{1,2}(?:[.:]\\d{2})?\\s*[-–—]\\s*\\d{1,2}(?:[.:]\\d{2})?\\s*(?:Uhr|h)?\\b','iu').test(excerpt)||
    /(?:Öffnung|Öffnungszeiten|Opening hours?)\s+während\s+der\s+(?:Sommerzeit|Winterzeit|Adventszeit)|(?:Summer|Winter|Advent)\s+(?:opening\s+)?hours?/iu.test(excerpt);
  return {id,url:page.url,observedAt:page.observedAt,text:excerpt,descriptionText,linkedMenus,...(tableBookingLinks.length?{tableBookingLinks}:{}),truncated:text.length>excerpt.length,seasonalSchedule,separatedScheduleColumns,...(documentTitle?{publishedTitle:documentTitle}:{}),hash:createHash('sha256').update(excerpt).digest('hex'),...(preferMain?{textSelection:primary?publicPanel?'MAIN_WITH_PUBLIC_INFO':'MAIN_CONTENT':'FULL_PAGE',headings:keptHeadings,identityOffset:keptIdentityOffset>=0?keptIdentityOffset:undefined,assetHash:createHash('sha256').update(page.body).digest('hex')}:{})};
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
  if(!Buffer.isBuffer(page.body)||page.body.length>20000000||page.body.subarray(0,5).toString()!=='%PDF-')throw new Error('source_pdf_invalid');
  const body=await new Promise((resolve,reject)=>{
    const child=execFile(pdfCommand,['-raw','-f','1','-l','20','-','-'],{timeout:10000,maxBuffer:200000,encoding:'utf8'},(error,stdout)=>error?reject(new Error('source_pdf_extraction_failed')):resolve(stdout));
    child.stdin.on('error',()=>{});child.stdin.end(page.body);
  });
  const text=body.replace(/\r\n/g,'\n').replace(/\n{3,}/g,'\n\n').trim();
  if(!text)throw new Error('source_pdf_needs_ocr');
  const excerpt=text.slice(0,12000);
  // Preserve a second reading order for multi-column menus. It only guides
  // which literal rows to inspect; citations still point into `text` above.
  let layoutText;
  try {
    const layout=await new Promise((resolve,reject)=>{
      const child=execFile(pdfCommand,['-layout','-f','1','-l','20','-','-'],{timeout:10000,maxBuffer:200000,encoding:'utf8'},(error,stdout)=>error?reject(new Error('source_pdf_layout_failed')):resolve(stdout));
      child.stdin.on('error',()=>{});child.stdin.end(page.body);
    });
    if(typeof layout==='string'&&layout.trim())layoutText=layout.replace(/\r\n/g,'\n').trim().slice(0,16000);
  }catch{ /* Raw text remains usable when the optional layout pass fails. */ }
  return {id,url:page.url,observedAt:page.observedAt,text:excerpt,...(layoutText?{layoutText}:{}),truncated:text.length>12000,format:'PDF_TEXT',extractionOrder:'CONTENT_STREAM',layoutReviewRequired:true,pageLimit:20,assetHash:createHash('sha256').update(page.body).digest('hex'),hash:createHash('sha256').update(excerpt).digest('hex')};
}

// One-hop discovery on the supplied official host; links are candidates, not
// identity proof. The caller retains the total six-request limit and export gate.
export function discoverOfficialLinks(page) {
  if(typeof page.body!=='string'||!/^(text\/html|application\/xhtml\+xml)/i.test(page.contentType??''))return [];
  const pageBase=observedPageBase(page);
  const links=[];
  for(const match of page.body.matchAll(/<a\b[^>]*\bhref\s*=\s*["']([^"']+)["'][^>]*>([\s\S]*?)<\/a>/gi)) {
    const href=match[1].replace(/&amp;/g,'&');
    if(!/men[uü]|speise|karte|contact|kontakt|öffnung|opening|hours|impressum|about|über.uns|\.pdf/i.test(href+' '+match[2].replace(/<[^>]*>/g,'')))continue;
    try {const url=publicSourceUrl(new URL(href,pageBase).href);if(matchesExistingWebsite(url,page.url)&&url!==page.url&&!links.includes(url))links.push(url);}catch{}
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
  const pageBase=observedPageBase(page);
  for(const match of page.body.matchAll(/<img\b[^>]*>/gi)) {
    const src=match[0].match(/\bsrc\s*=\s*["']([^"']+)["']/i)?.[1];
    const alt=match[0].match(/\balt\s*=\s*["']([^"']+)["']/i)?.[1]??'';
    if(!src||/\.svg(?:[?#\s]|$)|menu[-_ ]?(?:toggle|icon|button)|hamburger|navigation/i.test(src+' '+alt))continue;
    try {
      const url=publicSourceUrl(new URL(src.replace(/&amp;/g,'&'),pageBase).href);
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
function observedPdfDocuments(page,kind) {
  if(typeof page.body!=='string')return [];
  const documents=[],pageBase=observedPageBase(page);
  const practical=/spielregeln|hausordnung|besuchsregeln|besucherinformationen|besucherinfo|besuchsinfo|zutrittsregeln|visitor[ -]?(?:guide|information|rules)|house[ -]?rules|accessibility[ -]?(?:guide|information)|barrierefreiheit|eintrittspreise|preisliste|tarife/iu;
  for(const m of page.body.matchAll(/<a\b[^>]*\bhref\s*=\s*["']([^"']+)["'][^>]*>([\s\S]*?)<\/a>/gi)) {
    const label=m[2].replace(/<[^>]*>/g,' ').replace(/\s+/g,' ').trim();
    if(!label||/datenschutz|privacy|agb|terms|impressum|annual report|jahresbericht|presse|press kit/iu.test(label))continue;
    if(kind==='menu'?!/menu|menü|karte|alla[ -]carta|carta[ -]dei[ -]vini/iu.test(label):!practical.test(label))continue;
    try{const url=publicSourceUrl(new URL(m[1].replace(/&amp;/g,'&'),pageBase).href);if(!/\.pdf(?:[?#]|$)/iu.test(url)&&!(kind==='menu'&&/(?:^|\/)pdfdownload\/[^/]+\/?$/iu.test(new URL(url).pathname))||documents.some(d=>d.url===url))continue;documents.push({url,discoveredOn:page.url,label});}catch{}
    if(documents.length===4)break;
  }
  return documents;
}
export function discoverMenuDocuments(page) { return observedPdfDocuments(page,'menu'); }
/** Practical visitor documents, explicitly linked by the actual official page.
 * Their contents remain untrusted evidence; a link is never a verified rule. */
export function discoverPracticalDocuments(page) { return observedPdfDocuments(page,'practical'); }

// Bounded official-site frontier for Research v2. Only observed links; no guessed
// URLs, browser instructions, authenticated actions or automatic domain aliases.
export function standingExperiencePath(url) {
  const path=decodeURI(new URL(url).pathname);
  const leaf=path.split('/').filter(Boolean).at(-1)??'';
  return !/\b(?:19|20)\d{2}\b/u.test(leaf)&&/(?:atelier|workshops?|f(?:ü|ue|u)hrungen?|guided[-_]?tours?|education|vermittlung)/iu.test(leaf);
}
export function discoverResearchLinks(page,{spotProfile=false}={}) {
  if(/^application\/json\b/iu.test(page.contentType??'')&&typeof page.body==='string') {
    let data;try{data=JSON.parse(page.body);}catch{return [];}
    const language=new URL(page.url).pathname.match(/\/Website\/(de|en|fr)\//iu)?.[1]?.toLowerCase()??'de';
    const observed=[];
    const walk=(item,depth=0)=>{
      if(depth>7||observed.length>=80||!item||typeof item!=='object')return;
      if(Array.isArray(item)){for(const child of item.slice(0,80))walk(child,depth+1);return;}
      const href=item['Link_'+language];
      const label=item['InfoTitel_'+language]??item['RubrikTitel_'+language]??item['Titel_'+language]??item['LinkText_'+language];
      if(typeof href==='string'&&typeof label==='string'&&label.trim()&&href.length<1000)observed.push({href,label:label.replace(/<[^>]*>/gu,' ').trim()});
      for(const child of Object.values(item))if(child&&typeof child==='object')walk(child,depth+1);
    };
    walk(data);
    const escape=value=>value.replace(/&/gu,'&amp;').replace(/"/gu,'&quot;').replace(/</gu,'&lt;').replace(/>/gu,'&gt;');
    return discoverResearchLinks({...page,contentType:'text/html',body:observed.map(({href,label})=>`<a href="${escape(href)}">${escape(label)}</a>`).join('\n')});
  }
  if(typeof page.body!=='string'||!/^(text\/html|application\/xhtml\+xml)/i.test(page.contentType??''))return [];
  const links=[];
  const pageBase=observedPageBase(page);
  const topicPatterns={contact:/kontakt|contact|impressum|anschrift|adresse/iu,hours:/öffnungs|oeffnungs|opening|hours|zeiten/iu,menu:/men[uü]|speise|karte|alla[ -]carta|carta[ -]dei[ -]vini|(?<!\p{L})(?:food|drinks?)(?!\p{L})|getränk|essen|restaurant|brasserie|bistro|gastronom/iu,stay:/hotel|zimmer|rooms?|suites?|guest|gäste|accommodation|übernacht/iu,experience:/feier(?:e|n)?|anl[aä]sse|eventlocation|private[-_ ]events|celebrations?|raum[-_ ]?mieten|angebot|erlebnis|erleben|experience|ausstellung|exhibition|sammlung|collection|mitmach|hands[-\s]?on|zimmer|rooms?|aktivität|activities|bouldern|klettern|climb|sport|spiel|play|workshop|führung|guided|turmbesteig|tower|krypt|crypt|kreuzgang|cloister|kinderzoo|f[uü]tterung|feeding|pinguin|badewelt|actionwelt|relaxwelt|wellness|sauna|hamam|massage|spa|therme|thermal|pool|rutsch|shiatsu/iu,about:/(?:^|[\s/|])(?:über[-\s](?:uns|das|die|den)|ueber[-\s](?:uns|das|die|den)|about(?:[-\s]us)?|portrait|konzept|concept)(?:$|[\s/|])/iu,visit:/besuch|visit|information|praktisch|practical|anreise/iu,access:/barriere|access|famil|kinder|children|ausstattung|facilities|faq|park(?:en|ing|pl[aä]tze)?|anfahrt|directions|fitness|(?:^|[\s/|])(?:services|vorteile|advantages|amenities)(?:$|[\s/|])/iu};
  topicPatterns.contact=/kontakt|contact|impressum|anschrift|adresse|mitarbeitende|team|staff|employees|equipe|équipe/iu;
  const escapeNav=value=>value.replace(/&/gu,'&amp;').replace(/"/gu,'&quot;').replace(/</gu,'&lt;').replace(/>/gu,'&gt;');
  const navigationHtml=page.body+'\n'+hydrationNavigation(page).map(({href,label})=>`<a href="${escapeNav(href)}">${escapeNav(label)}</a>`).join('\n');
  for(const m of navigationHtml.matchAll(/<a\b[^>]*\bhref\s*=\s*["']([^"']+)["'][^>]*>([\s\S]*?)<\/a>/gi)) {
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
      const url=publicSourceUrl(new URL(href,pageBase).href);
      // Profile research reads descriptions of real spaces and recurring
      // group services too. This only admits observed public GET pages; account,
      // payment, booking transactions and calendar detail URLs remain excluded.
      const profileUrl=new URL(url);
      const profileDescription=spotProfile&&!/\b(?:19|20)\d{2}\b|\d{1,2}[._-]\d{1,2}[._-]\d{2,4}/u.test(profileUrl.pathname+' '+label)&&/(?:^|\/)(?:feier(?:e|n)?(?:[-_][^/]+)?|anl[aä]sse|eventlocation|private[-_]events|celebrations|r[aä]ume|raeume|spaces|terrasse|terrace|garten|garden|room[-_]hire|room[-_]rental|raumvermietung|location-de-salle|angebote|offers|group[-_]offers|group[-_]tours|school[-_]offers|ihr[-_]anlass|your[-_]event)(?:[/.]|$)/iu.test(profileUrl.pathname);
      if(profileDescription&&matchesExistingWebsite(url,page.url)&&url!==page.url&&!profileUrl.search&&!/login|logout|sign.?in|checkout|booking|reservation|register|privacy|datenschutz|shop|warenkorb|(?:^|\/)(?:cart|shopping-cart)(?:[/.]|$)|membership|donate/iu.test(profileUrl.pathname)){
        if(!links.some(link=>link.url===url)&&links.length<500)links.push({url,label,topics:['experience','areas','visit','access']});
        continue;
      }
      if(!matchesExistingWebsite(url,page.url)||url===page.url||/(?:^|\/)[&;]+(?:\/|$)/u.test(new URL(url).pathname)||/login|logout|sign.?in|register|checkout|booking|reservation|reservieren|warenkorb|(?:^|\/)(?:cart|shopping-cart)(?:[/.]|$)|privacy|datenschutz|(?:^|\/)(?:shop|jobs?|stellenangebote|karriere|careers?|buchen|[^/]*-buchen|anmeldung(?:-[^/]*)?|request-for[^/]*|demande-de[^/]*|anfrage[^/]*|formular[^/]*|room-rental|raumvermietung|location-de-salle|mitglied(?:-werden)?|membership|members?|unterstuetzen|unterstützen|spenden|donate|fundraising)(?:\.[a-z0-9]+)?(?:\/|$)/iu.test(new URL(url).pathname))continue;
      if(/\.(?:pdf|jpe?g|png|webp|gif)(?:[?#]|$)/iu.test(url))continue;
      // Dated events are useful to a different product flow, but cannot prove
      // a permanent venue offering or regular opening hours. Do not spend the
      // bounded Spot-research budget crawling individual event/news pages.
      const pathname=decodeURI(new URL(url).pathname).replace(/\/+$/u,'');
      if(/(?:^|\/)node\/\d+$/iu.test(pathname)||/(?:^|\/)content-access-denied$/iu.test(pathname))continue;
      if(/(?:^|\/)(?:[^/]*[-_])?(?:gewinnspiel|contest|competition|special|promotion|limited)(?:[-_][^/]*)?(?:\.[a-z0-9]+)?(?:\/|$)|(?:^|\/)(?:win|firmen(?:angebote)?|corporate)(?:\/|$)/iu.test(pathname))continue;
      if(/(?:^|\/)(?:ihr[-_]anlass|ihrevent|your-event|votre.?[eé]v[eé]nement|room[-_]hire)(?:\/|$)/iu.test(pathname))continue;
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
      if(/(?:^|[\s/|])(?:gruppen|groups?|familien|families)(?:$|[\s/|])/iu.test(material))topics.push('experience');
      if(/(?:sitzungszimmer|meeting[-_]?rooms?|conference[-_]?rooms?|seminar[-_]?rooms?)/iu.test(material))for(const topic of ['stay','experience']){const at=topics.indexOf(topic);if(at>=0)topics.splice(at,1);}
      // Flat CMS sites often use /dinner.html, /info.html and an HTML-entity
      // encoded "Über uns" slug. These are observed links, not guessed paths.
      const leaf=pathname.split('/').at(-1)??'';
      if(/^(?:dinner|lunch|breakfast|brunch)(?:\.html)?$/iu.test(leaf))topics.push('menu');
      // Classify observed visitor-service labels even when a CMS slug adds a
      // prefix (Deluxe Brunch) or uses dining rather than restaurant. These
      // are crawl leads only; actual services/spaces still need source evidence.
      if(!topics.includes('menu')&&/(?:brunch|breakfast|fr[uü]hst[uü]ck|lunch|dinner|dining|chef[’'s\s-]*table)/iu.test(material))topics.push('menu','experience');
      if(/(?:private[-_\s]+dining|chef[’'s\s-]*table)/iu.test(material))topics.push('areas');
      if(/^(?:g(?:ä|ae|a)ste[-_]?infos?|guest[-_]?(?:info(?:rmation)?|services?)|faq)(?:\.html)?$/iu.test(leaf))topics.push('visit','hours','access','stay');
      if(/^(?:hostel|meeting|meetings)(?:\.html)?$/iu.test(leaf))topics.push('experience','areas','stay');
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

// A venue may explicitly delegate one visitor activity to another operator.
// Follow only the exact published link, when both its label and destination
// identify that activity and the named venue. It cannot authorize contacts,
// hours, other pages on the partner host, or a search-result URL.
export function discoverDelegatedExperienceLinks(page,spotName) {
  if(typeof page.body!=='string'||!/^(text\/html|application\/xhtml\+xml)/i.test(page.contentType??''))return [];
  const tokens=String(spotName).toLocaleLowerCase().replace(/ä/gu,'ae').replace(/ö/gu,'oe').replace(/ü/gu,'ue').replace(/ß/gu,'ss').split(/[^a-z0-9]+/u)
    .filter(token=>token.length>=6&&!/^(?:basel|basler|zuerich|zurich|geneve|gen[eè]ve|bern|berner|swiss|schweiz)$/u.test(token));
  if(!tokens.length)return [];
  const links=[];
  for(const match of page.body.matchAll(/<a\b[^>]*\bhref\s*=\s*["']([^"']+)["'][^>]*>([\s\S]*?)<\/a>/giu)) {
    const label=match[2].replace(/<[^>]*>/gu,' ').replace(/&amp;/gu,'&').replace(/\s+/gu,' ').trim().slice(0,160);
    if(!/(?:f(?:ü|ue|u)hrung|guided[- ]?tour|gruppenbesuch|group visit|turmbesteig|tower visit)/iu.test(label))continue;
    try {
      const url=publicSourceUrl(new URL(match[1].replace(/&amp;/gu,'&'),observedPageBase(page)).href);
      if(matchesExistingWebsite(url,page.url)||/\.(?:pdf|jpe?g|png|webp|gif)(?:[?#]|$)/iu.test(url))continue;
      const location=(new URL(url).hostname+new URL(url).pathname).toLocaleLowerCase();
      if(!tokens.some(token=>location.includes(token))||/(?:^|\/)(?:login|logout|account|register|checkout|privacy|datenschutz)(?:\/|$)/iu.test(new URL(url).pathname))continue;
      if(!links.some(link=>link.url===url))links.push({url,label,topics:['experience'],delegatedBy:page.url});
      if(links.length>=3)break;
    }catch{}
  }
  return links;
}

// Some official pages print template placeholders but declare read-only public
// data sources. Follow only observed same-host GET endpoints with parameters
// taken from the page URL; never execute the page's scripts or action endpoints.
export function discoverPublicDataSources(page) {
  if(typeof page.body!=='string'||!/^(text\/html|application\/xhtml\+xml)/iu.test(page.contentType??'')||!page.body.includes('{{'))return [];
  const found=[],pageUrl=new URL(page.url),routeId=pageUrl.pathname.match(/(?:^|\/)r\/(\d{1,8})(?:\/|$)/u)?.[1];
  const pageBase=observedPageBase(page);
  for(const tag of page.body.matchAll(/<dmx-serverconnect\b[^>]*>/giu)) {
    if(/\bnoload\b/iu.test(tag[0]))continue;
    const id=tag[0].match(/\bid=["']([^"']+)["']/iu)?.[1]??'';
    const href=tag[0].match(/\burl=["']([^"']+)["']/iu)?.[1];
    const sidebar=id==='scSidebar'&&/\/includes\/Sidebar\.php(?:[?#]|$)/iu.test(href)&&/(?:scSidebar\.data\.sqrySidebarContact|scSidebar\.data\.qryOeffnungszeiten)/u.test(page.body);
    const routeBody=id==='scRubrik'&&/\/Rubrik\/Rubrik\.php(?:[?#]|$)/iu.test(href)&&!!routeId&&
      !/(?:^|\/)(?:eintrittspreise?|ticket[-_]?preise?|admission[-_]?prices?|pricing|oeffnungszeiten|öffnungszeiten|opening[-_]?hours?|ihr[-_]anlass|ihrevent|your[-_]?event)(?:\/|$)/iu.test(pageUrl.pathname);
    const visitorGrid=id==='scGrid'&&/\/Grid\.php(?:[?#]|$)/iu.test(href)&&/(?:erlebnis|experience|besuch|visit|activit)/iu.test(pageUrl.pathname);
    const hours=/(?:oeffnungs?|öffnungs?|opening|hours|zeiten)/iu.test(id+' '+href);
    const contact=/(?:kontakt|contact)/iu.test(id+' '+href);
    // CMS templates may declare an opening-hours endpoint on every route,
    // where unrelated route IDs return an empty array. Queue it only when
    // the observed page itself is about opening hours.
    if(!href||/\{\{|\}\}|(?:^|[./])(?:window|document|browser\d*)\./iu.test(href)||!sidebar&&!routeBody&&!visitorGrid&&!hours&&!contact||/(?:stats|cookies?|tracking|analytics)/iu.test(id+' '+href))continue;
    if(hours&&!sidebar&&!/(?:oeffnungs?|öffnungs?|opening|hours|zeiten)/iu.test(pageUrl.pathname)&&!routeBody&&!visitorGrid)continue;
    try {
      const target=new URL(href,pageBase);
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
      const routeTopics=/(?:anreise|arrival|directions|parking|parkieren)/iu.test(pageUrl.pathname)?['access']:
        /(?:erlebnis|experience|f[uü]tterung|feeding|pinguin|f[uü]hrung|guided|kinderzoo|visit|besuch)/iu.test(pageUrl.pathname)?['experience','about','visit']:['about','visit'];
      found.push({url,label:id,discoveredOn:page.url,topics:sidebar?['contact','hours']:routeBody?routeTopics:visitorGrid?['experience']:[hours?'hours':'contact']});
      if(found.length>=4)break;
    }catch{}
  }
  return found;
}
