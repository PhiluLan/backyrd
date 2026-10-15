import { hashBody } from "./canonical.js";
import { OFFER_CATALOG, AREA_CATALOG } from "./spot-catalog.js";
import { EXPERIENCE_PROFILE_VERSION, EXPERIENCE_CATEGORIES, EXPERIENCE_QUESTIONS } from "./experience-profile.js";
const record = (properties: Record<string, unknown>) => ({type:"object",additionalProperties:false,required:Object.keys(properties),properties});
const text = (maxLength=1000) => ({type:"string",minLength:1,maxLength,pattern:"\\S"});
const list = (items: unknown,maxItems=30) => ({type:"array",items,maxItems});
const enumeration = (values: readonly unknown[]) => ({enum:values});
const nullable = (schema: unknown) => ({anyOf:[schema,{type:"null"}]});
const integer = (maximum=100000) => ({type:"integer",minimum:0,maximum});
const day = {type:"string",format:"date",pattern:"^\\d{4}-\\d{2}-\\d{2}$"};
const id = {type:"string",pattern:"^[a-zA-Z0-9_-]{1,60}$"};
const clock = {type:"string",pattern:"^(?:[01]\\d|2[0-3]):[0-5]\\d$"};
const conditions=record({weekdays:{...list({type:"integer",minimum:1,maximum:7},7),uniqueItems:true},dayparts:{...list(enumeration(["MORNING","MIDDAY","AFTERNOON","EVENING","NIGHT"]),5),uniqueItems:true},event:nullable(text(160)),validFrom:nullable(day),validUntil:nullable(day)});
const property = (scope: string) => ({...record({key:enumeration([...EXPERIENCE_QUESTIONS.filter(q=>q.scopes.includes(scope as "SPOT"|"OFFER"|"AREA")).map(q=>q.key),"custom.detail"]),label:nullable(text(160)),state:enumeration(["KNOWN","UNKNOWN","NOT_APPLICABLE"]),value:{anyOf:[text(),integer(),{type:"boolean"},{type:"null"}]},conditions}),allOf:[
 {if:{properties:{state:{enum:["UNKNOWN","NOT_APPLICABLE"]}}},then:{properties:{value:{type:"null"}}}},
 {if:{properties:{key:{const:"custom.detail"}}},then:{properties:{label:text(160)}}},
 ...EXPERIENCE_QUESTIONS.map(q=>({if:{properties:{state:{const:"KNOWN"},key:{const:q.key}}},then:{properties:{value:q.control==="NUMBER"?integer(q.unit==="Jahre"?130:100000):q.control==="YES_NO"?{type:"boolean"}:text()}}})),
 ...["stay.check_in","stay.check_out"].map(key=>({if:{properties:{state:{const:"KNOWN"},key:{const:key}}},then:{properties:{value:{type:"string",pattern:"^(?:[01]\\d|2[0-3]):[0-5]\\d$"}}}})),
 {if:{properties:{state:{const:"KNOWN"},key:{const:"custom.detail"}}},then:{properties:{value:text()}}},
]});
const price=record({label:text(160),currency:{type:"string",pattern:"^[A-Z]{3}$"},min:{type:"number",minimum:0,maximum:100000,multipleOf:0.01},max:nullable({type:"number",minimum:0,maximum:100000,multipleOf:0.01}),basis:enumeration(["PER_PERSON","PER_GROUP","PER_ITEM","PER_ROOM_NIGHT","PER_PERSON_NIGHT","PER_SITE_NIGHT"]),minimumAge:nullable(integer(130)),maximumAge:nullable(integer(130)),mandatoryFeesIncluded:nullable({type:"boolean"}),includes:{type:"string",maxLength:1000},conditions});
export const EXPERIENCE_PROFILE_SCHEMA = {
  ...record({
    contractVersion: {const: EXPERIENCE_PROFILE_VERSION}, category: enumeration(EXPERIENCE_CATEGORIES),
    properties: list(property("SPOT"),100),
    areas: list(record({id,kind:enumeration([...AREA_CATALOG.map(a=>a.kind),"OTHER"]),name:text(160),properties:list(property("AREA"),100)})),
    offers: list(record({id,kind:enumeration([...OFFER_CATALOG.map(o=>o.kind),"OTHER"]),name:text(160),areaIds:{...list(id),uniqueItems:true},properties:list(property("OFFER"),100),prices:list(price),schedule:list(record({weekday:{type:"integer",minimum:1,maximum:7},start:clock,end:clock}),56),validFrom:nullable(day),validUntil:nullable(day)})),
    reviewed: {type:"boolean"},
  }),
};

export const EXPERIENCE_PROFILE_SCHEMA_HASH = hashBody(EXPERIENCE_PROFILE_SCHEMA,[]);
