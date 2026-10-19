import type { ResearchSource } from './nuknuk-sources.mjs';
export interface ResearchField {attributeKey:string;valueSchema:Record<string,unknown>;profileCategory?:string;valueRules?:string[]}
export interface SpotContext {spotId:string;name:string;locality?:string|null;existingValues?:Record<string,{value:unknown;knowledgeState?:string}>|null}
export interface Citation {url:string;evidence:string;observedAt:string;sourceHash:string;sourceOffset?:number;layoutReviewRequired?:boolean;sourceFormat?:string;discoveredOn?:string|null}
export interface FieldResult {attributeKey:string;status:string;reason?:string;value?:unknown;knowledgeState?:string;citations?:Citation[];partialProfile?:boolean;currentValue?:unknown;humanReviewRequired?:boolean;verification?:unknown}
export type ValueValidator=(key:string,state:string,value:unknown)=>{ok:boolean;value?:unknown};
export const NUKNUK_MODEL_REVISION:string;
export function localModelEndpoint(value:string):string;
export function normalizePhone(phone:string,country:unknown):string;
export function sourceQuote(text:string,quote:string):string|null;
export function parseHoursRow(quote:string):{day:string;intervals:{start:string;end:string}[]}[];
export function projectOffers(value:unknown,context:{field:ResearchField;sources:ResearchSource[]}):unknown;
export function verifyResearchProposal(proposal:FieldResult,context:{spot:SpotContext;sources:ResearchSource[];exportBound?:boolean;sourceFailures?:unknown[];now?:number}):FieldResult;

export function fieldCandidates(field:ResearchField,sources:ResearchSource[]):{id:string;sourceId:string;quote:string;context:string}[]|null;

export function emailCandidates(sources:ResearchSource[]):{id:string;sourceId:string;quote:string;email:string}[];

export function enumFactCandidates(field:ResearchField,sources:ResearchSource[]):{value:string;quote:string;sourceId:string}[]|null;

export function extractedProposal(raw:unknown,context:{spot:SpotContext;field:ResearchField;sources:ResearchSource[]}):unknown;
