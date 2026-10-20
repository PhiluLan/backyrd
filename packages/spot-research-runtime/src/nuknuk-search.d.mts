export interface SearchLead {url:string;title:string;snippet:string;identityMatched?:boolean}
export function localSearchEndpoint(value:string):string;
export function planSpotSearches(spot:{name:string;locality?:string|null},fields:{attributeKey:string}[],website:string,options?:{maxQueries?:number}):{key:string;query:string}[];
export function searchLocalWeb(endpoint:string,query:string,options?:{fetchImpl?:typeof fetch;timeoutMs?:number}):Promise<SearchLead[]>;
export function classifySearchResults(results:SearchLead[],spot:{name:string;locality?:string|null},website:string,options?:{maxOfficial?:number;maxExternal?:number}):{official:SearchLead[];external:SearchLead[]};
export function permanentSpotSearchLead(url:string):boolean;
