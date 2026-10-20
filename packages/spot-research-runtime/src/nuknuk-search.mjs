import { publicSourceUrl, matchesExistingWebsite } from './nuknuk-sources.mjs';

// The search service runs on the operator's machine. Result URLs are leads,
// never evidence; every selected page is fetched and checked separately.
export function localSearchEndpoint(value) {
  const url=new URL(value);
  if(url.protocol!=='http:'||!['127.0.0.1','[::1]'].includes(url.hostname)||url.username||url.password||!url.port||!['/','/search'].includes(url.pathname)||url.search||url.hash)throw new Error('local_search_endpoint_required');
  return url.origin+'/search';
}

export function planSpotSearches(spot,fields,website,{maxQueries=3}={}) {
  if(!Number.isInteger(maxQueries)||maxQueries<1||maxQueries>6)throw new Error('search_query_limit_invalid');
  const name=String(spot.name??'').split(/\s+-\s+/u)[0].replace(/["'`]/gu,'').trim();
  const locality=String(spot.locality??'').replace(/["'`]/gu,'').trim();
  if(name.length<4||name.length>160)throw new Error('search_identity_invalid');
  const host=new URL(publicSourceUrl(website)).hostname;
  const identity=`"${name}" ${locality}`.trim();
  const topics=[];
  if(fields.some(f=>f.attributeKey==='contact.phone'||f.attributeKey==='contact.public_email'))topics.push({key:'contact',terms:'Kontakt Telefon E-Mail'});
  if(fields.some(f=>f.attributeKey==='hours.regular'))topics.push({key:'hours',terms:'Öffnungszeiten Besuch'});
  if(fields.some(f=>f.attributeKey==='experience.profile'))topics.push({key:'experience',terms:'Angebote Dauerausstellung Erlebnisse'});
  if(fields.some(f=>f.attributeKey==='description.highlight'||f.attributeKey==='amenity.features'))topics.push({key:'overview',terms:'Besuch Angebot'});
  const queries=[{key:'official',query:`${identity} site:${host}`}];
  for(const topic of topics)queries.push({key:topic.key,query:`${identity} ${topic.terms}`});
  return queries.slice(0,maxQueries);
}

export async function searchLocalWeb(endpoint,query,{fetchImpl=fetch,timeoutMs=10000}={}) {
  if(typeof query!=='string'||query.length<4||query.length>300||!Number.isInteger(timeoutMs)||timeoutMs<1||timeoutMs>20000)throw new Error('search_request_invalid');
  const url=new URL(localSearchEndpoint(endpoint));url.searchParams.set('q',query);url.searchParams.set('format','json');url.searchParams.set('language','de-CH');url.searchParams.set('safesearch','1');
  const response=await fetchImpl(url.href,{method:'GET',redirect:'error',headers:{accept:'application/json'},signal:AbortSignal.timeout(timeoutMs)});
  if(!response.ok)throw new Error('search_http_'+response.status);
  if(!/^application\/json\b/iu.test(response.headers.get('content-type')??''))throw new Error('search_format_invalid');
  const body=await response.text();if(body.length>250000)throw new Error('search_response_too_large');
  let parsed;try{parsed=JSON.parse(body);}catch{throw new Error('search_json_invalid');}
  if(!parsed||!Array.isArray(parsed.results))throw new Error('search_results_invalid');
  return parsed.results.slice(0,30).flatMap(item=>{
    if(!item||typeof item.url!=='string')return [];
    try {
      const target=publicSourceUrl(item.url);
      if(!/^(?:text\/html|application\/xhtml\+xml)?$/iu.test(String(item.mimetype??'')))return [];
      return [{url:target,title:String(item.title??'').slice(0,180),snippet:String(item.content??'').replace(/<[^>]*>/gu,' ').slice(0,300)}];
    }catch{return [];}
  });
}

export function classifySearchResults(results,spot,website,{maxOfficial=6,maxExternal=4}={}) {
  const identity=String(spot.name??'').split(/\s+-\s+/u)[0].toLocaleLowerCase();
  const locality=String(spot.locality??'').toLocaleLowerCase();
  const official=[],external=[],seen=new Set();
  for(const result of results) {
    if(seen.has(result.url))continue;seen.add(result.url);
    const description=(result.title+' '+result.snippet).toLocaleLowerCase();
    const exactIdentity=description.includes(identity);
    if(!exactIdentity)continue;
    const item={...result,identityMatched:true};
    if(matchesExistingWebsite(result.url,website)){if(official.length<maxOfficial)official.push(item);}
    else if(!locality||description.includes(locality)){if(external.length<maxExternal)external.push(item);}
  }
  return {official,external};
}
