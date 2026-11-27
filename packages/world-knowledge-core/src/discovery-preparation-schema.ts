import { DISCOVERY_KINDS } from "./discovery.js";
const text=(max=1000)=>({type:"string",minLength:1,maxLength:max});
const record=(properties:Record<string,unknown>)=>({type:"object",additionalProperties:false,properties,required:Object.keys(properties)});
const nullable=(value:unknown)=>({anyOf:[value,{type:"null"}]});
const price=record({currency:{type:"string",pattern:"^[A-Z]{3}$"},min:{type:"number",minimum:0,maximum:100000},max:{type:"number",minimum:0,maximum:100000},basis:{type:"string",enum:["PER_PERSON","PER_GROUP"]},mandatoryFeesIncluded:nullable({type:"boolean"})});
export const discoveryPreparationSchema=record({offerings:{type:"array",maxItems:30,items:record({id:text(60),name:text(160),description:text(1000),price:nullable(price)})},assertions:{type:"array",maxItems:60,items:record({id:text(60),kind:{type:"string",enum:DISCOVERY_KINDS},concepts:{type:"array",minItems:1,maxItems:8,items:text(160)},offeringId:nullable(text(60)),state:{type:"string",enum:["PRESENT","ABSENT"]},evidence:text(1000),validFrom:nullable(text(40)),validUntil:nullable(text(40)),conditions:nullable(text(500))})}});
