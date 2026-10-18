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
    const req=requestImpl(url,{method:'GET',headers:{'user-agent':'Backyrd-Nuknuk-Research/1.0','accept':'text/html,text/plain','accept-encoding':'identity'},lookup:(_host,options,callback)=>callback(null,options?.all?[{address:addresses[0].address,family:4}]:addresses[0].address,4)},res=>{
      if(res.statusCode!==200){res.resume();reject(new Error(`source_http_${res.statusCode}`));return;}
      const type=String(res.headers['content-type']??'');
      if(!/^(text\/html|text\/plain|application\/xhtml\+xml)/i.test(type)){res.resume();reject(new Error('source_format_unsupported'));return;}
      const chunks=[];let size=0;
      res.on('data',chunk=>{size+=chunk.length;if(size>maxBytes){req.destroy(new Error('source_too_large'));return;}chunks.push(chunk);});
      res.on('error',reject);
      res.on('end',()=>accept({url,contentType:type,body:Buffer.concat(chunks).toString('utf8'),observedAt:new Date().toISOString()}));
    });
    const timer=setTimeout(()=>req.destroy(new Error('source_timeout')),timeoutMs);
    req.on('close',()=>clearTimeout(timer));req.on('error',reject);req.end();
  });
}
export function sourceText(page,id) {
  const named={auml:'ä',ouml:'ö',uuml:'ü',Auml:'Ä',Ouml:'Ö',Uuml:'Ü',szlig:'ß',eacute:'é',egrave:'è',agrave:'à',ccedil:'ç',rsquo:'’',lsquo:'‘',ldquo:'“',rdquo:'”',ndash:'–',mdash:'—',euro:'€',hellip:'…',amp:'&',lt:'<',gt:'>',quot:'"',apos:"'",nbsp:' '};
  const text=page.body.replace(/<(script|style|noscript|svg)\b[^>]*>[\s\S]*?<\/\1>/gi,' ').replace(/<[^>]+>/g,' ').replace(/&([a-zA-Z]+);/g,(m,key)=>named[key]??m).replace(/&#(x[0-9a-f]+|\d+);/gi,(_m,n)=>{const c=n[0].toLowerCase()==='x'?parseInt(n.slice(1),16):Number(n);return c>0&&c<=0x10ffff?String.fromCodePoint(c):' ';}).replace(/\s+/g,' ').trim();
  if(!text)throw new Error('source_empty');
  const excerpt=text.slice(0,12000);
  return {id,url:page.url,observedAt:page.observedAt,text:excerpt,truncated:text.length>excerpt.length,hash:createHash('sha256').update(excerpt).digest('hex')};
}
