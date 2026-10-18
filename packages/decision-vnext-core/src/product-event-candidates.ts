import { EVENT_DECISION_TAGS } from "../../shared/src/event-decision.mjs";
import { librarianTerm, sameLibrarianText } from "@backyrd/world-knowledge-core";
import type { LibrarianFact } from "./product-luna-librarian.js";
import { emptyExperienceProfile, emptyExperienceConditions, parseExperienceProfile, type ExperienceProperty } from "@backyrd/world-knowledge-core";
import { contentHash, deepFreeze } from "./canonical.js";
import { schema, timestamp, type Infer } from "./schema.js";
import type { ProductWorldView } from "./product-world-resolver-binding.js";
import type { VisitWindow, MatchTruth } from "./product-librarian-time.js";

const uuid = schema.string({pattern:/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i});
const nullableUrl = schema.union([schema.string({min:1,max:2000,pattern:/^https:\/\/[^\s]+$/}),schema.literal(null)] as const);
const nullableText = schema.union([schema.string({min:1,max:500}),schema.literal(null)] as const);
const nullableTime = schema.union([timestamp,schema.literal(null)] as const);
const nullableNumber = schema.union([schema.number({min:0,max:100000}),schema.literal(null)] as const);
export const DecisionEventOccurrenceSchema = schema.object({
  eventId: uuid, occurrenceId: uuid, source: schema.literal("manual_admin"), title:schema.string({min:1,max:300}),
  categories:schema.array(schema.enum(["MUSIC","NIGHTLIFE","ART","THEATRE","FILM","FOOD_DRINK","FAMILY","SPORT","ACTIVITY","LEISURE","MARKET","WORKSHOP","COMMUNITY","OTHER"] as const),{min:1,max:12}),
  city:schema.string({min:1,max:160}), venueName:nullableText, address:nullableText, matchedSpotId:schema.union([uuid,schema.literal(null)] as const),
  startAt:timestamp,endAt:nullableTime, eventStatus:schema.enum(["PUBLISHED","SCHEDULED","POSTPONED","CANCELLED","ENDED"] as const),
  occurrenceStatus:schema.enum(["SCHEDULED","POSTPONED","CANCELLED","ENDED"] as const),
  publishedAt:timestamp, occurrencePublishedAt:timestamp, updatedAt:timestamp,
  isFree:schema.union([schema.boolean(),schema.literal(null)] as const),priceMin:nullableNumber,currency:schema.union([schema.string({pattern:/^[A-Z]{3}$/}),schema.literal(null)] as const),
  minimumAge:schema.union([schema.number({min:0,max:130,integer:true}),schema.literal(null)] as const),familyFriendly:schema.union([schema.boolean(),schema.literal(null)] as const),
  sourceUrl:nullableUrl,ticketUrl:nullableUrl,imageUrl:nullableUrl,
  tags:schema.optional(schema.array(schema.enum(["LIVE_MUSIC","DJ","JAZZ","CLASSICAL","ROCK","POP","ELECTRONIC","TECHNO","PUB_QUIZ","KARAOKE"] as const),{max:10})),
  ticketStatus:schema.optional(schema.enum(["UNKNOWN","AVAILABLE","SOLD_OUT"] as const)),
  imageStoragePath:schema.optional(nullableText),
});
export type DecisionEventOccurrence = Infer<typeof DecisionEventOccurrenceSchema>;
export const eventCandidateId = (id:string) => `event:${id}`;
export const isEventCandidateId = (id:string) => /^event:[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(id);
const local = (iso:string) => {
  const parts=new Intl.DateTimeFormat("en-CA",{timeZone:"Europe/Zurich",year:"numeric",month:"2-digit",day:"2-digit",hour:"2-digit",minute:"2-digit",hourCycle:"h23"}).formatToParts(new Date(iso));
  const part=(key:Intl.DateTimeFormatPartTypes)=>parts.find(p=>p.type===key)!.value;
  return {day:`${part("year")}-${part("month")}-${part("day")}`,minute:Number(part("hour"))*60+Number(part("minute"))};
};
const dayNumber=(day:string)=>Date.parse(`${day}T00:00:00Z`)/86400000;
/** Event times are evidence for this occurrence only. Venue opening hours and
 * ticket links are deliberately not consulted or interpreted as availability. */
export function eventVisitAvailability(event:DecisionEventOccurrence, visit:VisitWindow): {state:MatchTruth;hashes:readonly string[];reason:string} {
  const hash=contentHash(event), report=(state:MatchTruth,reason:string)=>({state,hashes:[hash],reason});
  if(!["PUBLISHED","SCHEDULED"].includes(event.eventStatus)||event.occurrenceStatus!=="SCHEDULED"||event.ticketStatus==="SOLD_OUT")return report("FAILED","EVENT_NOT_SCHEDULED");
  if(!visit.requested || visit.undatedDayPhase)return report("MET","EVENT_DATE_DISPLAYED_NO_DATED_REQUEST");
  if(!visit.complete || !visit.dates.length)return report("UNKNOWN","EVENT_VISIT_TIME_UNRESOLVED");
  const start=local(event.startAt), end=event.endAt?local(event.endAt):null;
  const first=dayNumber(start.day)*1440+start.minute, last=end?dayNumber(end.day)*1440+end.minute:null;
  // A local clock alone cannot disambiguate the repeated/missing DST hour.
  if(end && Math.round(first-Date.parse(event.startAt)/60000)!==Math.round(last!-Date.parse(event.endAt!)/60000) && visit.dates.some(day=>start.day<=day && day<=end.day)) return report("UNKNOWN","EVENT_CLOCK_CHANGE_REQUIRES_CONFIRMATION");
  for(const day of visit.dates){
    const from=dayNumber(day)*1440+visit.start,to=dayNumber(day)*1440+visit.end;
    const overlapFrom=Math.max(first,from), overlapTo=Math.min(last??first+1,to);
    const excluded=visit.excludedMinutes.filter(n=>overlapFrom<=dayNumber(day)*1440+n && dayNumber(day)*1440+n<overlapTo).length;
    if(visit.exact ? first<=from && last!==null && to<=last && !visit.excludedMinutes.includes(visit.start) : overlapTo-overlapFrom>excluded)return report("MET","EVENT_OCCURRENCE_TIME_MATCH");
    if(last===null && first<=from && day===start.day)return report("UNKNOWN","EVENT_END_TIME_UNKNOWN");
  }
  return report("FAILED","EVENT_OCCURRENCE_TIME_MISMATCH");
}
const categoryOffer:Readonly<Record<string,string>>={MUSIC:"MUSIC_EVENT",ART:"SPECIAL_EXHIBITION",THEATRE:"THEATRE_PERFORMANCE",FILM:"CINEMA_SCREENING",MARKET:"MARKET_VISIT",WORKSHOP:"WORKSHOP"};
const activities:Readonly<Record<string,string>>={MUSIC:"Musikveranstaltung",THEATRE:"Theatervorstellung",FILM:"Filmvorführung",MARKET:"Marktbesuch",WORKSHOP:"Workshop"};
/** A documented projection into the shared matching vocabulary, NOT a World
 * ledger write or fabricated World resolver binding. Event provenance stays
 * separate in eventBindings and the EVENT presentation. No venue facts bleed
 * into an event's age, cuisine, ticket, atmosphere or accessibility evidence. */
export function projectDecisionEventOccurrences(raw:unknown, city:string, now:string): readonly ProductWorldView[] {
  if(!Array.isArray(raw)||raw.length>500)throw new Error("product_event_catalog_invalid");
  const seen=new Set<string>(), key=(s:string)=>s.normalize("NFKD").replace(/\p{M}/gu,"").toLowerCase();
  return raw.map(value=>{
    if (!value || typeof value !== "object" || Array.isArray(value)) throw new Error("product_event_catalog_invalid");
    const normalized = {...value} as Record<string,unknown>;
    for (const key of ["startAt","endAt","publishedAt","occurrencePublishedAt","updatedAt"]) {
      const v = normalized[key];
      if (typeof v === "string" && /^\d{4}-\d\d-\d\dT.*(?:Z|[+-]\d\d:\d\d)$/.test(v) && Number.isFinite(Date.parse(v))) normalized[key]=new Date(v).toISOString();
    }
    const event=DecisionEventOccurrenceSchema.parse(normalized), id=eventCandidateId(event.occurrenceId);
    if(event.imageStoragePath && (event.imageStoragePath.startsWith("/") || event.imageStoragePath.includes("..") || /[?#:\\]/.test(event.imageStoragePath)))throw new Error("product_event_image_path_invalid");
    if(seen.has(id)||key(city)!==key(event.city)||Date.parse(event.publishedAt)>Date.parse(now)||Date.parse(event.occurrencePublishedAt)>Date.parse(now)
      || event.endAt!==null && Date.parse(event.endAt)<Date.parse(event.startAt)
      || event.isFree===true && event.priceMin!==null && event.priceMin>0
      || (event.priceMin===null)!==(event.currency===null))throw new Error("product_event_binding_invalid");
    seen.add(id);
    const snapshotHash=contentHash({source:"PUBLISHED_MANUAL_EVENT_OCCURRENCE@1",event});
    const conditions=emptyExperienceConditions();
    const properties:ExperienceProperty[]=event.categories.flatMap(category=>activities[category]?[{key:"experience.activity",value:activities[category]!,label:null,state:"KNOWN" as const,conditions}]:[]);
    if(event.minimumAge!==null)properties.push({key:"participation.minimum_age",value:event.minimumAge,label:null,state:"KNOWN",conditions});
    const amount=event.isFree===true?0:event.priceMin;
    const profile={...emptyExperienceProfile("TEMPORARY_PLACES"),reviewed:true,offers:[{id:event.occurrenceId,kind:categoryOffer[event.categories[0]!]??"EVENT",name:event.title.slice(0,160),areaIds:[],properties,
      prices:amount===null?[]:[{label:event.isFree===true?"Eintritt frei":"Eintritt ab",currency:event.currency??"CHF",min:amount,max:event.isFree===true?0:null,basis:"PER_PERSON" as const,minimumAge:null,maximumAge:null,mandatoryFeesIncluded:event.isFree===true?true:null,includes:"Eintritt",conditions}],schedule:[],validFrom:null,validUntil:null}]};
    const entry=(key:string,value:ProductWorldView["facts"][number]["value"]):ProductWorldView["facts"][number]=>({key,value,resolution:"KNOWN_VALUE",freshness:"CURRENT",trust:"VERIFIED",entryHash:contentHash({snapshotHash,key,value}),validFrom:null,validUntil:null,authorizedUseCases:["GENERAL_WORLD","DISCOVERY","HARD_CONSTRAINTS","EXPLANATION"]});
    const facts=[entry("identity.name",event.title),entry("location.locality",event.city),entry("location.timezone","Europe/Zurich"),entry("experience.profile",parseExperienceProfile(profile))];
    return deepFreeze({eventOccurrence:event,spot:{spotId:id,identity:{name:event.title},location:{addressLine1:event.address,locality:event.city,neighborhood:null,countryCode:null,latitude:null,longitude:null,timezone:"Europe/Zurich"},classification:{primaryCategory:"TEMPORARY_PLACES" as const,placeTypes:[]},publicContact:{publicEmail:null,website:null,phone:null,instagram:null,facebook:null,linkedin:null,tiktok:null}},facts,operationalRules:[],currentStates:[],conflicts:[],explicitUnknowns:[],exclusions:[],snapshotHash});
  }).filter(view=>{
    const e=view.eventOccurrence;
    // No invented duration: an unknown end never means indefinitely ongoing.
    return e.endAt!==null?Date.parse(e.endAt)>Date.parse(now):Date.parse(e.startAt)>=Date.parse(now)||local(e.startAt).day===local(now).day;
  });
}

/** Only declared structured tags prove a specific genre/format. A broad MUSIC
 * category or a familiar venue must never fabricate live music, Jazz or a DJ. */
export function eventFactMatch(event:DecisionEventOccurrence, fact:LibrarianFact): boolean {
  if (fact.value.kind === "TEXT" && fact.key === "atmosphere.character" && event.familyFriendly === true && sameLibrarianText(fact.value.text,"familienfreundlich")) return true;
  if (fact.value.kind !== "TEXT" || !["experience.activity","experience.theme","atmosphere.music","offer.kind"].includes(fact.key)) return false;
  if (["experience.activity","offer.kind"].includes(fact.key) && sameLibrarianText(fact.value.text,"Veranstaltung")) return true;
  const desired=librarianTerm(fact.value.text);
  return (event.tags ?? []).some(tag=>sameLibrarianText(EVENT_DECISION_TAGS[tag],desired));
}
