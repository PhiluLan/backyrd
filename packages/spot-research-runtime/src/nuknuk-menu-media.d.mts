import type {PublicPage} from './nuknuk-sources.mjs';
export interface MenuOcrLine {text:string;confidence:number;x:number;y:number;width:number;height:number}
export interface MenuVisionResult {modelRows:number;corroborated:{name:string;price:string}[];held:{name:string;price:string;reason:string}[];raw?:string;promptHash?:string;latencyMs?:number;catalogWrites:number;certifiedComplete:boolean}
export interface MenuMediaImage {
  url:string;discoveredOn?:string;index:number;assetHash?:string;bytes?:number;
  visionLines?:MenuOcrLine[];tesseractLines?:string[];tesseractLayoutLines?:string[];
  pricedRows?:{name:string;price:string}[];error?:string;visionError?:string;localVision?:MenuVisionResult;
}
export interface MenuMediaAudit {
  officialMenuUrl:string;observedAt?:string;images:MenuMediaImage[];candidateRows:number;
  fetchFailures?:MenuMediaImage[];discoveredImages?:number;visionPages?:number;visionErrors?:number;
  catalogWrites:number;certifiedComplete:boolean;truncated?:boolean;error?:string;
}
export function normalizeOcrText(text:unknown):string;
export function agreeingPricedRows(visionLines:MenuOcrLine[],tesseractText:string):{name:string;price:string}[];
export function auditMenuImages(officialMenuUrl:string,options?:{
  page?:PublicPage|null;maxImages?:number;maxDurationMs?:number;maxVisionImages?:number;
  visionModel?:(bytes:Buffer,mime:'image/jpeg'|'image/png',audit:MenuMediaImage,timeoutMs:number)=>Promise<MenuVisionResult>;
  tessdataDir?:string|null;ocrLanguages?:string;fetchPage?:typeof import('./nuknuk-sources.mjs').fetchPublicSource;
}):Promise<MenuMediaAudit>;
