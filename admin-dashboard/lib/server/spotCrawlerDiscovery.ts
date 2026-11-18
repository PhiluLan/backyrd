import { createHash } from "node:crypto";
import {
  discoverResearchLinks, fetchPublicSource, publicSourceUrl, researchLegalPage, visibleSourceHtml,
  type PublicPage,
} from "../../../packages/spot-research-runtime/src/nuknuk-sources.mjs";
import type { CrawlerCategory, CrawlerFacts, CrawlerSettings } from "../spotCrawler";

type JsonRecord = Record<string, unknown>;
type Address = { street: string; postalCode: string };
type VisibleAddress = Address & { alternatePostalCodes: string[] };
type Coordinates = { lat: number; lng: number; coordinates_source?: string };
type Evidence = Omit<CrawlerFacts, "external_id" | "lat" | "lng" | "website"> & { website: string; postalCode: string; alternatePostalCodes?: string[]; coordinates?: Coordinates };
const record = (value: unknown): JsonRecord | null =>
  value !== null && typeof value === "object" && !Array.isArray(value) ? value as JsonRecord : null;
const values = (value: unknown): unknown[] => Array.isArray(value) ? value : [value];
const clean = (value: unknown, limit: number): string => typeof value === "string" && value.trim().length <= limit
  ? value.replace(/\s+/gu, " ").trim() : "";
const normalize = (value: string): string => value.toLocaleLowerCase("de-CH").normalize("NFKD")
  .replace(/\p{M}/gu, "").replace(/ß/gu, "ss").replace(/[^\p{L}\d]+/gu, " ").trim();
const host = (url: string) => new URL(url).hostname.replace(/^www\./u, "");
const typeCategories = new Map<string, CrawlerCategory>([
  ["Restaurant", "RESTAURANT"], ["FastFoodRestaurant", "RESTAURANT"], ["CafeOrCoffeeShop", "CAFE"],
  ["BarOrPub", "BAR"], ["NightClub", "NIGHTCLUB"],
  ["Museum", "MUSEUM"], ["AmusementPark", "AMUSEMENT_PARK"], ["Playground", "PLAYGROUND"],
]);
const restrictedHosts = /(?:^|\.)(?:google(?:\.[a-z]+)+|tripadvisor(?:\.[a-z]+)+|facebook\.com|instagram\.com|booking\.com|guidle\.com|ch-rest\.com|yelp(?:\.[a-z]+)+|basel\.com|local\.ch|search\.ch|thefork(?:\.[a-z]+)+)$/iu;
const deadlineExceeded = () => new Error("RUN_TIME_LIMIT");

export function crawlerOperatorUrl(input: string): string | null {
  try {
    const url = publicSourceUrl(input);
    if (url.length > 1100 || restrictedHosts.test(host(url)) || researchLegalPage(url) === "PROHIBITED") return null;
    return url;
  } catch { return null; }
}

function jsonLd(body: string) {
  const nodes: JsonRecord[] = [];
  function visit(value: unknown, depth: number) {
    if (depth > 6 || nodes.length >= 100) return;
    if (Array.isArray(value)) {
      value.slice(0, 100).forEach(entry => visit(entry, depth + 1));
      return;
    }
    const node = record(value);
    if (!node) return;
    nodes.push(node);
    visit(node["@graph"], depth + 1);
    visit(node.mainEntity, depth + 1);
  }
  for (const [, attrs, payload] of body.matchAll(/<script\b([^>]*?)>([\s\S]*?)<\/script>/giu)) {
    if (!/\btype\s*=\s*["']?application\/ld\+json(?:["'\s]|$)/iu.test(attrs) || payload.length > 150000) continue;
    try { visit(JSON.parse(payload), 0); } catch { /* Invalid markup provides no evidence. */ }
  }
  return nodes;
}

function point(lat: unknown, lng: unknown): Coordinates | undefined {
  const numeric = (value: unknown) => typeof value === "number" || typeof value === "string" && /^-?\d+(?:\.\d+)?$/u.test(value)
    ? Number(value) : NaN;
  const a = numeric(lat);
  const b = numeric(lng);
  return a >= 47.519 && a <= 47.599 && b >= 7.554 && b <= 7.635 ? { lat:a, lng:b } : undefined;
}

type VenueIdentity = Pick<Evidence, "name" | "category" | "website">;

function visibleText(html: string) {
  return html.replace(/<[^>]*>/gu, "").replace(/&(?:nbsp|#160);/giu, " ")
    .replace(/&(?:amp|#38);/giu, "&").replace(/&(?:eacute|#233);/giu, "é")
    .replace(/&#(?:x([\da-f]{1,6})|(\d{1,7}));/giu, (entity, hex: string | undefined, decimal: string | undefined) => {
      const code = hex ? Number.parseInt(hex, 16) : Number(decimal);
      return code >= 32 && code <= 0x10ffff && !(code >= 0xd800 && code <= 0xdfff) ? String.fromCodePoint(code) : entity;
    })
    .replace(/&([aou])uml;/giu, (_, vowel: string) => ({ a: "ä", o: "ö", u: "ü", A: "Ä", O: "Ö", U: "Ü" })[vowel] ?? vowel);
}

function venueCategory(text: string): CrawlerCategory | undefined {
  if (/museum|musée/iu.test(text)) return "MUSEUM";
  if (/freizeitpark|vergnügungspark|amusement park|spielpark/iu.test(text)) return "AMUSEMENT_PARK";
  if (/spielplatz|playground/iu.test(text)) return "PLAYGROUND";
  if (/(?:^|[^\p{L}])(?:caf[eé]|kaffeebar|kaffeehaus|coffee shop|specialty coffee)(?![\p{L}])|café(?:$|\s)/iu.test(text)) return "CAFE";
  if (/\b(?:restaurant|bistro|brasserie|ristorante|pizzeria)\b/iu.test(text)) return "RESTAURANT";
  if (/\b(?:bar|weinbar|cocktailbar)\b/iu.test(text)) return "BAR";
  if (/\b(?:nachtclub|nightclub)\b/iu.test(text)) return "NIGHTCLUB";
}

function visiblePlace(body: string, pageUrl: string) {
  const html = visibleSourceHtml(body)
    .replace(/<(script|style|svg|noscript)\b[^>]*>[\s\S]*?<\/\1>/giu, "");
  const textLines = (body: string) => visibleText(body.replace(/<title\b[^>]*>[\s\S]*?<\/title>/giu, "").replace(/<(?:br\b[^>]*|\/(?:p|div|address|li|section|footer|h[1-6]))>/giu, "\n"))
    .replace(/[^\S\r\n]+/gu, " ").replace(/\n +/gu, "\n");
  const visible = textLines(html);
  const main = html.match(/<main\b[^>]*>([\s\S]*?)<\/main>/iu)?.[1];
  function addressesFrom(text: string) {
    return [...text.matchAll(/(?:^|\n)[ \t]*([\p{L}][\p{L} .’'–-]{2,65} \d{1,4}[a-z]?(?:[-–]\d{1,4}[a-z]?)?)[, \t\n]+(?:CH[ \t]*[-–]?[ \t]*)?(40\d{2})[, \t]+Basel\b/gimu)]
      .map(match => ({ street: match[1], postalCode: match[2], preceding: text.slice(Math.max(0, match.index - 200), match.index).trim().split("\n").at(-1) ?? "" }));
  }
  const primaryAddresses = main ? addressesFrom(textLines(main)) : [];
  const pageAddresses = primaryAddresses.length ? primaryAddresses : addressesFrom(visible);
  const venueAddresses = pageAddresses.filter(item => !/\b(?:AG|GmbH|Sàrl|Ltd)\.?$/u.test(item.preceding));
  // Branch pages can repeat their operator's legal address in the footer.
  // Keep the venue address only when the residual evidence is unambiguous.
  const found = venueAddresses.length ? venueAddresses : pageAddresses;
  const streets = new Set(found.map(item => normalize(item.street)));
  const postalCodes = [...new Set(found.map(item => item.postalCode))];
  const address: VisibleAddress | undefined = streets.size === 1 && postalCodes.length <= 2
    ? { street: found[0].street, postalCode: postalCodes[0], alternatePostalCodes: postalCodes.slice(1) } : undefined;
  const title = clean(visibleText(html.match(/<title\b[^>]*>([^<]*)<\/title>/iu)?.[1] ?? ""), 180);

  // A descriptive heading may name one branch even if the site title starts
  // with generic words (e.g. "Kontakt") or only names the parent business.
  const headings = [...html.matchAll(/<h1\b[^>]*>([\s\S]*?)<\/h1>/giu)]
    .map(([, text]) => clean(visibleText(text), 140)).filter(Boolean);
  const displayName = (text: string) => text
    .replace(/^(?:kontakt|contact|impressum|anfahrt|öffnungszeiten|opening hours|eintrittspreise[^|:–—]*|admission prices[^|:–—]*)\s*(?:[|:–—-])\s*/iu, "")
    .split(/[|:–—,]| - /u)[0]?.trim().replace(/\s+(?:in\s+)?Basel$/iu, "") ?? "";
  function namedVenue(name: string, category: CrawlerCategory | undefined): VenueIdentity | undefined {
    if (!category || name.length < 3 || name.split(/\s+/u).length > 7
      || /^(?:best[esn]* |die |unser[e]?[nm]? |welche |willkommen|home$|startseite$|über uns$|kontakt$|kaffee$|restaurant$|bistro$|cafés?$|cafes?$|bar$|nachtclub$|nightclub$|museum$|freizeitpark$|spielplatz$|specialty coffee$)/iu.test(name)) return;
    return { name, category, website: pageUrl };
  }
  const headingIdentities = headings.flatMap(heading => namedVenue(displayName(heading), venueCategory(heading)) ?? []);
  const category = venueCategory(title);
  const primary = namedVenue(displayName(title), category);
  const namedAddress = address ? found.map(item => displayName(item.preceding)).find(name => {
    const brand = normalize(name).replace(/\b(cafe|kaffeehaus|restaurant|bar|bistro)\b/gu, "").trim();
    return brand.length >= 3 && normalize(title).includes(brand) && venueCategory(name) !== undefined;
  }) : undefined;
  const linkedIdentity = namedAddress ? namedVenue(namedAddress, venueCategory(namedAddress)) : undefined;
  const identity = primary ?? (headings.length === 1 ? headingIdentities[0] : undefined) ?? linkedIdentity;
  return { address, identity, visible, ambiguous: streets.size > 1 };
}

function cafeBranches(html: string, pageUrl: string) {
  if (!/caf[eé]s?/iu.test(new URL(pageUrl).pathname)) return [];
  const visible = visibleSourceHtml(html).replace(/<(script|style|template|noscript)\b[^>]*>[\s\S]*?<\/\1>/giu, "");
  return [...visible.matchAll(/<h2\b[^>]*>([\s\S]*?)<\/h2>([\s\S]*?)(?=<h2\b|<footer\b|$)/giu)].flatMap(([, heading, body]) => {
    const name = clean(visibleText(heading), 160).split(/\s+[-–—]\s+/u)[0]?.trim();
    if (!name || !/^caf[eé]\s+\p{L}/iu.test(name)) return [];
    const address = visiblePlace(body, pageUrl).address;
    if (!address) return [];
    return [{ name, category: "CAFE" as const, postalCode: address.postalCode, address: address.street, website: pageUrl }];
  });
}

export function readCrawlerEvidence(page: PublicPage, categories: readonly CrawlerCategory[], referringVenue?: VenueIdentity): Evidence[] {
  if (typeof page.body !== "string" || !/html/iu.test(page.contentType)) return [];
  const visible = visiblePlace(page.body, page.url);
  const structured = jsonLd(page.body);
  const venues = structured.filter(node => values(node["@type"]).some(value =>
    typeof value === "string" && typeCategories.has(value.split("/").at(-1) ?? "")));
  const extracted = venues.flatMap(node => {
    const types = values(node["@type"]).flatMap(value => typeof value === "string" ? [value.split("/").at(-1) ?? ""] : []);
    // A secondary restaurant declaration on the hotel itself is not an independent venue.
    if (types.some(type => ["Hotel", "LodgingBusiness", "Hostel", "Resort"].includes(type))) return [];
    const knownTypes = [...new Set(types.flatMap(type => typeCategories.get(type) ?? []))];
    const name = clean(node.name, 160);
    const namedType = venueCategory(name);
    const category = knownTypes.length === 1 ? knownTypes[0]
      : namedType && knownTypes.includes(namedType) ? namedType : undefined;
    const address = record(node.address);
    const postal = !address && venues.length === 1 ? visible.address : undefined;
    const street = clean(address?.streetAddress, 200) || postal?.street;
    const postalCode = clean(address?.postalCode, 10) || postal?.postalCode;
    const country = clean(record(address?.addressCountry)?.name ?? address?.addressCountry, 40);
    if (!category || !categories.includes(category) || !name || !street || !/\d/u.test(street)
      || !postalCode || !/^40\d{2}$/u.test(postalCode)
      || (address && normalize(clean(address.addressLocality, 80)) !== "basel")
      || (country && !["ch", "schweiz", "switzerland", "suisse"].includes(normalize(country)))) return [];
    const website = crawlerOperatorUrl(clean(node.url, 1100) || page.url);
    if (!website || host(website) !== host(page.url)) return [];
    const geo = record(node.geo);
    const coordinates = point(geo?.latitude, geo?.longitude);
    const phone = clean(node.telephone, 40);
    const email = clean(node.email, 160).replace(/^mailto:/iu,"");
    const hours = values(node.openingHours).map(item => clean(item, 120)).filter(Boolean).slice(0, 14).join("; ");
    return [{ name, category, postalCode, address:street, website, source_url:page.url, observed_at:page.observedAt,
      ...(coordinates ? {coordinates} : {}),
      ...(postal?.alternatePostalCodes.length ? { alternatePostalCodes: postal.alternatePostalCodes } : {}),
      ...(/^\+?[0-9][0-9 ()/.-]{5,38}$/u.test(phone) ? {phone} : {}),
      ...(/^[^\s@]+@[^\s@]+\.[a-z]{2,}$/iu.test(email) ? {email} : {}),
      ...(hours ? {hours} : {}),
      ...(clean(node.priceRange, 80) ? {price_hint:clean(node.priceRange, 80)} : {}),
    }];
  });
  if (!extracted.length && categories.includes("CAFE")) {
    const branches = cafeBranches(page.body, page.url);
    if (branches.length) return branches.map(branch => ({ ...branch, source_url: page.url, observed_at: page.observedAt }));
  }
  const sameVenue = referringVenue && host(referringVenue.website) === host(page.url)
    && normalize(visible.visible).includes(normalize(referringVenue.name));
  const fallback = visible.identity ?? (sameVenue ? referringVenue : undefined);
  const declaredAddress = record(venues[0]?.address);
  const declaredCity = normalize(clean(declaredAddress?.addressLocality, 80));
  const declaredWebsite = clean(venues[0]?.url, 1100);
  if (extracted.length || venues.length || (declaredCity && declaredCity !== "basel")
    || (declaredWebsite && (!crawlerOperatorUrl(declaredWebsite) || host(declaredWebsite) !== host(page.url)))
    || !fallback || !visible.address || !categories.includes(fallback.category)) return extracted;
  return [{ ...fallback, postalCode: visible.address.postalCode, alternatePostalCodes: visible.address.alternatePostalCodes,
    address: visible.address.street, source_url: page.url, observed_at: page.observedAt }];
}

/** Deterministic rotation across category, district and query wording. */
export function planCrawlerQueries(settings: CrawlerSettings, runId: number): string[] {
  const terms: Record<CrawlerCategory, string[]> = {
    RESTAURANT:["Restaurant", "Neueröffnung Restaurant", "Bistro"], CAFE:["Café", "neues Café", "Kaffeebar", "Specialty Coffee", "Kaffeehaus", "Café Brunch", "Espressobar", "Café Kontakt"],
    BAR:["Bar", "neue Cocktailbar", "Weinbar"], NIGHTCLUB:["Club", "Nachtclub", "Tanzen Club"],
    MUSEUM:["Museum", "Museum Eintrittspreise"], AMUSEMENT_PARK:["Freizeitpark", "Indoor Spielpark"],
    PLAYGROUND:["Spielplatz", "Abenteuerspielplatz"],
  };
  const hasCitywideCafe = settings.districts.includes("Basel") && settings.categories.includes("CAFE");
  const neighborhoods = ["Kleinbasel", "Gundeldingen", "Altstadt", "St. Johann", "Bachletten", "Clara", "Matthäus", "Iselin"];
  const queries = [...new Set([
    ...settings.districts.flatMap(district => settings.categories.flatMap(category =>
      terms[category].map(term => `${term} Basel${district === "Basel" ? "" : ` ${district}`} Öffnungszeiten`))),
    ...(hasCitywideCafe ? neighborhoods.flatMap(district => [`Café Basel ${district} Kontakt`, `Kaffeebar Basel ${district} Öffnungszeiten`]) : []),
  ])];
  const offset = queries.length ? (runId * 7) % queries.length : 0;
  return [...queries.slice(offset), ...queries.slice(0, offset)].slice(0, settings.searches);
}

export async function searchBrave(query: string, key: string): Promise<string[]> {
  const url = new URL("https://api.search.brave.com/res/v1/web/search");
  for (const [key, value] of Object.entries({q:query,country:"CH",search_lang:"de",count:"10",result_filter:"web"}))
    url.searchParams.set(key, value);
  const response = await fetch(url, {headers:{"X-Subscription-Token":key,Accept:"application/json"},signal:AbortSignal.timeout(8000),cache:"no-store"});
  if (!response.ok) throw new Error(response.status===429 ? "SEARCH_RATE_LIMIT" : "SEARCH_UNAVAILABLE");
  const data = await response.json() as {web?:{results?:{url?:string}[]}};
  return (data.web?.results ?? []).slice(0,10).flatMap(result=>typeof result.url==="string"?[result.url]:[]);
}

async function lookupAddress(address: Address): Promise<Coordinates | undefined> {
  const url = new URL("https://api3.geo.admin.ch/rest/services/ech/SearchServer");
  url.searchParams.set("searchText", `${address.street} ${address.postalCode} Basel`);
  url.searchParams.set("origins", "address");
  url.searchParams.set("type", "locations");
  url.searchParams.set("sr", "4326");
  url.searchParams.set("limit", "5");
  const response = await fetch(url, {cache:"no-store",signal:AbortSignal.timeout(4000)});
  if (!response.ok) return;
  const data = await response.json() as {results?:{attrs?:{origin?:string;label?:string;lat?:number;lon?:number}}[]};
  const wanted = normalize(`${address.street} ${address.postalCode} Basel`);
  const exact = (data.results ?? []).filter(({attrs})=>attrs?.origin==="address"
    && typeof attrs.label==="string" && normalize(attrs.label.replace(/<[^>]+>/gu," ")).replace(/ bs$/u,"")===wanted);
  if (exact.length!==1) return;
  const position = point(exact[0].attrs?.lat, exact[0].attrs?.lon);
  if (position) return {...position,coordinates_source:"Amtliches Gebäudeadressverzeichnis, geo.admin.ch"};
}

export function robotsPermits(body: string, pathname: string): boolean {
  const groups: {agents:string[];rules:{allow:boolean;path:string}[]}[] = [];
  let group: typeof groups[number] | undefined;
  for (const line of body.split(/\r?\n/u)) {
    const match=line.split("#",1)[0].match(/^\s*(user-agent|allow|disallow)\s*:\s*(.*?)\s*$/iu);
    if (!match) continue;
    const [, name, value] = match;
    if (name.toLowerCase()==="user-agent") {
      if (!group || group.rules.length) { group={agents:[],rules:[]};groups.push(group); }
      group.agents.push(value.toLowerCase());
    } else if (group && value.startsWith("/")) group.rules.push({allow:name.toLowerCase()==="allow",path:value});
  }
  const matching=groups.filter(g=>g.agents.some(agent=>agent==="backyrd-nuknuk-research" || agent==="backyrd"));
  const applicable=matching.length?matching:groups.filter(g=>g.agents.includes("*"));
  const rules=applicable.flatMap(g=>g.rules).filter(rule=>{
    const anchored = rule.path.endsWith("$");
    const body = anchored ? rule.path.slice(0,-1) : rule.path;
    const pattern=body.split("*").map(part=>part.replace(/[.*+?^${}()|[\]\\]/g,"\\$&")).join(".*");
    return new RegExp(`^${pattern}${anchored?"$":""}`,"u").test(pathname);
  });
  rules.sort((a,b)=>b.path.length-a.path.length || Number(b.allow)-Number(a.allow));
  return rules[0]?.allow ?? true;
}

/** Every redirect target must pass its own robots policy before an HTTP request. */
export function crawlerSourceLoader(load: typeof fetchPublicSource, deadline: number): typeof fetchPublicSource {
  const robots = new Map<string, Promise<string | null>>();
  const authorizeUrl = async (url: string) => {
    const target = new URL(url);
    if (Date.now() >= deadline || !crawlerOperatorUrl(url)) throw new Error("CRAWLER_SOURCE_UNAVAILABLE");
    if (!robots.has(target.origin)) robots.set(target.origin,
      load(`${target.origin}/robots.txt`, { timeoutMs: Math.min(4000, deadline - Date.now()), maxBytes: 240000, maxRedirects: 2 })
        .then(page => typeof page.body === "string" ? page.body : null)
        .catch(error => error instanceof Error && /^source_http_(404|410)$/u.test(error.message) ? "" : null));
    const policy = await robots.get(target.origin);
    if (Date.now() >= deadline || policy == null || !robotsPermits(policy, target.pathname + target.search)) {
      throw new Error("CRAWLER_SOURCE_UNAVAILABLE");
    }
  };
  return async (url, config) => {
    await authorizeUrl(url);
    return load(url, { ...config, maxRedirects: 2,
      timeoutMs: Math.max(1, Math.min(5000, deadline - Date.now())), authorizeUrl });
  };
}

export async function crawlSpotPages(urls: string[], settings: CrawlerSettings, options: {
  deadline: number; load?: typeof fetchPublicSource; locate?: typeof lookupAddress;
}): Promise<{candidates:CrawlerFacts[]; pagesChecked:number}> {
  const load = options.load ?? fetchPublicSource;
  const locate = options.locate ?? lookupAddress;
  const sourceLoader = crawlerSourceLoader(load, options.deadline);
  const pages = new Map<string, Promise<PublicPage | undefined>>();
  let pagesChecked = 0;
  const candidates = new Map<string, CrawlerFacts>();
  const located = new Map<string, Promise<Coordinates | undefined>>();

  function geocode(street: string, postalCode: string) {
    const key = `${normalize(street)}|${postalCode}`;
    const pending = located.get(key);
    if (pending) return pending;
    const result = locate({ street, postalCode }).catch(() => undefined);
    located.set(key, result);
    return result;
  }
  function read(url: string) {
    if (!pages.has(url) && pages.size < 48 && Date.now() < options.deadline) pages.set(url, fetchPage(url));
    return pages.get(url);
  }

  async function fetchPage(url: string) {
    const page = await sourceLoader(url, { maxBytes: 850000 });
    pagesChecked++;
    return page;
  }

  const links = [...new Set(urls.flatMap(url => crawlerOperatorUrl(url) ?? []))].slice(0,36);
  for (let offset=0; offset<links.length && Date.now()<options.deadline; offset+=6) {
    await Promise.all(links.slice(offset,offset+6).map(async (url) => {
      try {
        const page = await read(url);
        if (!page) return;
        let evidence = readCrawlerEvidence(page, settings.categories);
        if (!evidence.length) {
          const mainVenue = typeof page.body === "string" ? visiblePlace(page.body, page.url) : undefined;
          const contact = mainVenue?.ambiguous ? undefined : discoverResearchLinks(page).find(link =>
            /kontakt|contact|anfahrt|location/iu.test(link.label+" "+link.url) && host(link.url) === host(url)
            && !/^\/(?:policies|legal)(?:\/|$)/iu.test(new URL(link.url).pathname));
          const next = contact && crawlerOperatorUrl(contact.url);
          const contactPage = next ? await read(next) : undefined;
          if (contactPage) evidence = readCrawlerEvidence(contactPage, settings.categories, mainVenue?.identity);
        }
        for (const found of evidence.slice(0,3)) {
          if(Date.now()>=options.deadline)break;
          const { postalCode, alternatePostalCodes, coordinates, ...facts } = found;
          const positions = coordinates ? [{ postalCode, position: coordinates }] : (await Promise.all(
            [postalCode, ...(alternatePostalCodes ?? [])].map(async code =>
              ({ postalCode: code, position: await geocode(facts.address, code) })),
          )).filter(item => item.position);
          if (positions.length !== 1 || !positions[0].position) continue;
          const id = createHash("sha256").update(`${normalize(facts.name)}|${normalize(facts.address)}|${positions[0].postalCode}`).digest("hex");
          candidates.set(id, { ...facts, ...positions[0].position, external_id: id });
        }
      } catch { /* A single unavailable or disallowed site is not a failed run. */ }
    }));
  }
  return {candidates:[...candidates.values()],pagesChecked};
}

export async function discoverCrawlerSpots(settings: CrawlerSettings, runId: number, key: string, deadline = Date.now()+42000) {
  const queries=planCrawlerQueries(settings,runId);
  const urls: string[][]=[];
  let searchesAttempted = 0;
  let firstError: unknown;
  for (let offset=0; offset<queries.length && Date.now()<deadline-16000; offset+=6) {
    const batch = queries.slice(offset, offset+6);
    searchesAttempted += batch.length;
    const results=await Promise.allSettled(batch.map(query=>searchBrave(query,key)));
    for (const result of results) {
      if (result.status==="fulfilled") urls.push(result.value);
      else firstError ??= result.reason;
    }
  }
  if (!urls.length) throw firstError ?? deadlineExceeded();
  // Interleave ranks so a single category does not consume all page slots.
  const interleaved=Array.from({length:10},(_,rank)=>urls.flatMap(result=>result[rank]??[])).flat();
  const discovered=await crawlSpotPages(interleaved,settings,{deadline});
  if (!discovered.pagesChecked && interleaved.length) throw new Error("SOURCES_UNAVAILABLE");
  return { ...discovered, searchResponses: urls.length, distinctSearchLinks: new Set(interleaved).size, searchesAttempted };
}
