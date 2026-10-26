import type {PublicPage} from './nuknuk-sources.mjs';
export function fetchBrowserSource(value:string,options?:{timeoutMs?:number;maxBytes?:number}):Promise<PublicPage>;
