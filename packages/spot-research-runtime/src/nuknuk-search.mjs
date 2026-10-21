import { publicSourceUrl, matchesExistingWebsite, standingExperiencePath } from './nuknuk-sources.mjs';

// Search results bypass the observed-link filter. Keep dated programmes and
// event calendars out of permanent Spot research even when an engine ranks
// them highly. A dated query parameter is equally unsuitable for a countercheck.
export function permanentSpotSearchLead(url) {
  const parsed=new URL(publicSourceUrl(url));
  const path=decodeURI(parsed.pathname);
  // General web search should retrieve readable venue pages. Menu documents
  // are discovered from their official parent page with explicit provenance.
  if(/\.(?:pdf|jpe?g|png|webp|gif|zip)$/iu.test(path))return false;
  // Numeric CMS node endpoints are often stale search-index entries; the
  // canonical visitor URL is the readable page linked by the site itself.
  if(/(?:^|\/)node\/\d+\/?$/iu.test(path)||/(?:^|\/)content-access-denied(?:\/|$)/iu.test(path))return false;
  if(/(?:^|\/)(?:ihrevent|your-event|votre.?[eé]v[eé]nement)(?:\/|$)/iu.test(path))return false;
  if(/(?:^|\/)(?:[^/]*[-_])?(?:gewinnspiel|contest|competition|special|promotion|limited)(?:[-_][^/]*)?(?:\.[a-z0-9]+)?(?:\/|$)|(?:^|\/)(?:win|firmen(?:angebote)?|corporate)(?:\/|$)/iu.test(path))return false;
  if([...parsed.searchParams.keys()].some(key=>/^(?:date|datum|event|eventdate|start|end|detail)$/iu.test(key)))return false;
  return (!/(?:^|\/)(?:events?|veranstaltungen?|agenda|calendar|kalender|news|blog|konzert|concert|programme?|programm)(?:[/.]|$)/iu.test(path)||standingExperiencePath(url))
    && !/(?:^|\/)(?:ausstellungen?|exhibitions?|expositions?)(?:\.[a-z0-9]+)?(?:\/|$)/iu.test(path)
    && !/(?:^|\/)(?:press|presse|media|medien|digital|videos?)(?:[-_][^/]*)?(?:\.[a-z0-9]+)?(?:\/|$)/iu.test(path)
    && !/\b(?:\d{4}[-/]\d{1,2}[-/]\d{1,2}|\d{1,2}[.-]\d{1,2}[.-]\d{2,4})\b/u.test(path);
}

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
  const placeTypes=spot.existingValues?.['classification.place_types']?.value;
  const category=spot.existingValues?.['classification.primary_category']?.value;
  const visitorExperienceFirst=fields.some(f=>f.attributeKey==='experience.profile')&&['ACTIVITIES_PLAY','OUTDOOR_NATURE','ATTRACTIONS_LANDMARKS'].includes(category);
  if(visitorExperienceFirst)topics.push({key:'experience',query:`${identity} Erlebnisse Führungen Besuch site:${host}`});
  if(fields.some(f=>f.attributeKey==='contact.public_email')&&Array.isArray(placeTypes)&&placeTypes.includes('MUSEUM'))topics.push({key:'visitor-contact',terms:'"Visitor Services"',site:host});
  if(fields.some(f=>f.attributeKey==='contact.phone'||f.attributeKey==='contact.public_email'))topics.push({key:'contact',terms:'Kontakt Telefon E-Mail'});
  if(fields.some(f=>f.attributeKey==='hours.regular'))topics.push({key:'hours',terms:'Öffnungszeiten Besuch'});
  if(fields.some(f=>f.attributeKey==='experience.profile')&&Array.isArray(placeTypes)&&placeTypes.includes('MUSEUM')){
    topics.push({key:'visitor-offers',query:`${name} Besuch planen Führungen Atelier site:${host}`});
    topics.push({key:'workshops',query:`${name} Workshop Atelier`});
    topics.push({key:'guided-tours',query:`${name} Führungen Workshop site:${host}`});
    topics.push({key:'collection',query:`${name} Sammlung site:${host}`});
  }
  if(fields.some(f=>f.attributeKey==='experience.profile')&&!visitorExperienceFirst)topics.push({key:'experience',terms:['EAT','DRINKS','COFFEE_DAYTIME'].includes(category)?'Speisekarte Gerichte':category==='STAY'?'Zimmer Übernachten':category==='CULTURE_ARTS'?'Angebote Dauerausstellung Erlebnisse':category==='WELLNESS_RELAXATION'?'Sauna Spa Hamam Badewelt':'Angebote Erlebnisse'});
  if(fields.some(f=>f.attributeKey==='description.highlight'||f.attributeKey==='amenity.features'))topics.push({key:'overview',terms:['EAT','DRINKS','COFFEE_DAYTIME'].includes(category)?'Restaurant Küche':category==='STAY'?'Hotel Zimmer':'Besuch Angebot'});
  const queries=[{key:'official',query:`${identity} site:${host}`}];
  for(const topic of topics)queries.push({key:topic.key,query:topic.query??`${identity} ${topic.terms}${topic.site?' site:'+topic.site:''}`});
  return queries.slice(0,maxQueries);
}

export async function searchLocalWeb(endpoint,query,{fetchImpl=fetch,timeoutMs=10000}={}) {
  if(typeof query!=='string'||query.length<4||query.length>300||!Number.isInteger(timeoutMs)||timeoutMs<1||timeoutMs>20000)throw new Error('search_request_invalid');
  const url=new URL(localSearchEndpoint(endpoint));url.searchParams.set('q',query);url.searchParams.set('format','json');url.searchParams.set('language','de-CH');url.searchParams.set('safesearch','1');
  for(let attempt=0;attempt<2;attempt++){
  // Public engines can rate-limit one another. The second request uses two
  // independently tested SearXNG engines, while source pages remain the only
  // possible evidence and are fetched separately.
  if(attempt===1)url.searchParams.set('engines','yahoo,yep');
  const response=await fetchImpl(url.href,{method:'GET',redirect:'error',headers:{accept:'application/json'},signal:AbortSignal.timeout(timeoutMs)});
  if(!response.ok)throw new Error('search_http_'+response.status);
  if(!/^application\/json\b/iu.test(response.headers.get('content-type')??''))throw new Error('search_format_invalid');
  const body=await response.text();if(body.length>250000)throw new Error('search_response_too_large');
  let parsed;try{parsed=JSON.parse(body);}catch{throw new Error('search_json_invalid');}
  if(!parsed||!Array.isArray(parsed.results))throw new Error('search_results_invalid');
  const results=parsed.results.slice(0,30).flatMap(item=>{
    if(!item||typeof item.url!=='string')return [];
    try {
      const target=publicSourceUrl(item.url);
      if(!permanentSpotSearchLead(target))return [];
      if(!/^(?:text\/html|application\/xhtml\+xml)?$/iu.test(String(item.mimetype??'')))return [];
      return [{url:target,title:String(item.title??'').slice(0,180),snippet:String(item.content??'').replace(/<[^>]*>/gu,' ').slice(0,300)}];
    }catch{return [];}
  });
  if(results.length)return results;
  // Some engines return a valid, empty JSON response without declaring a
  // rate-limit failure. A second engine set is still worth one bounded try.
  if(attempt===1){if(Array.isArray(parsed.unresponsive_engines)&&parsed.unresponsive_engines.length)throw new Error('search_engines_unavailable');return [];}
  }
  throw new Error('search_engines_unavailable');
}

export function classifySearchResults(results,spot,website,{maxOfficial=6,maxExternal=4}={}) {
  const comparable=value=>String(value??'').normalize('NFKD').replace(/\p{M}/gu,'').toLocaleLowerCase().replace(/[^\p{L}\p{N}]+/gu,' ').trim().replace(/\s+/gu,' ');
  const identity=comparable(String(spot.name??'').split(/\s+-\s+/u)[0]);
  const locality=comparable(spot.locality);
  const category=spot.existingValues?.['classification.primary_category']?.value;
  const externalType=category==='EAT'?/\b(?:restaurant|speisekarte|menu|menü|küche|essen|dining|food)\b/iu:category==='CULTURE_ARTS'?/\b(?:museum|galerie|gallery|kunst|ausstellung|exhibition)\b/iu:category==='STAY'?/\b(?:hotel|hostel|unterkunft|zimmer|rooms?|stay)\b/iu:null;
  const official=[],external=[],seen=new Set();
  for(const result of results) {
    if(!permanentSpotSearchLead(result.url))continue;
    if(seen.has(result.url))continue;seen.add(result.url);
    const description=comparable(result.title+' '+result.snippet);
    const exactIdentity=identity.length>=4&&(' '+description+' ').includes(' '+identity+' ');
    if(!exactIdentity)continue;
    const item={...result,identityMatched:true};
    if(matchesExistingWebsite(result.url,website)){if(official.length<maxOfficial)official.push(item);}
    else if((!locality||description.includes(locality))&&(!externalType||externalType.test(description))){if(external.length<maxExternal)external.push(item);}
  }
  return {official,external};
}
