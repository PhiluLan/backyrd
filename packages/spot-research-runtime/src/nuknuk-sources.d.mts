export interface PublicPage { url:string; contentType:string; body:string|Buffer; observedAt:string;redirectedFrom?:string[] }
export interface ResearchSource { id:string; headings?:{level:number;text:string;offset:number}[]; identityOffset?:number; separatedScheduleColumns?:boolean; publishedTitle?:string; areaScope?:string; seasonalSchedule?:boolean; url:string; text:string; layoutText?:string; hash:string; assetHash?:string; observedAt:string; descriptionText?:string; truncated?:boolean; format?:string; layoutReviewRequired?:boolean; discoveredOn?:string; delegatedBy?:string; linkedMenus?:{label:string;url:string}[]; tableBookingLinks?:{label:string;url:string}[] }
export interface ResearchLink {url:string;label:string;depth?:number;discoveredOn?:string;delegatedBy?:string;topics?:string[]}
export function publicSourceUrl(value:string):string;
export function matchesExistingWebsite(sourceUrl:string,existingWebsite:unknown):boolean;
export function fetchPublicSource(value:string,options?:{timeoutMs?:number;maxRedirects?:number;maxBytes?:number;allowObservedPdfRedirect?:boolean;allowedWebsite?:string}):Promise<PublicPage>;
export function readSourceText(page:PublicPage,id:string,options?:{preferMain?:boolean}):Promise<ResearchSource>;
export function discoverResearchLinks(page:PublicPage,options?:{spotProfile?:boolean}):ResearchLink[];
export function discoverDelegatedExperienceLinks(page:PublicPage,spotName:string):ResearchLink[];
export function standingExperiencePath(url:string):boolean;
export function discoverPublicDataSources(page:PublicPage):ResearchLink[];
export function discoverMenuImages(page:PublicPage,options?:{maxImages?:number}):ResearchLink[];
export function discoverMenuDocuments(page:PublicPage):ResearchLink[];
export function discoverPracticalDocuments(page:PublicPage):ResearchLink[];

export function visibleSourceHtml(html:string):string;
export function researchLegalPage(url:string,label?:string):'PROHIBITED'|'CONTACT_ONLY'|'VISITOR';
