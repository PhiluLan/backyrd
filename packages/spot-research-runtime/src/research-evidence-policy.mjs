// Research judgements remain AI judgements. This policy independently checks the
// fetched evidence and schema bindings; it does not pretend to prove all meaning.
import { createHash } from "node:crypto";
import { isDeepStrictEqual } from "node:util";
import {
  publicSourceUrl,
  visibleSourceHtml,
  readSourceText,
  sourceText,
  discoverResearchLinks,
  discoverMenuDocuments,
  discoverPracticalDocuments,
  researchLegalPage,
} from "./nuknuk-sources.mjs";
import {
  SPOT_GROUPS,
  SPOT_TYPE_CATALOG,
  OFFER_CATALOG,
  AREA_CATALOG,
} from "../../world-knowledge-core/dist/index.js";
export const RESEARCH_EVIDENCE_POLICY = "backyrd.research-evidence@2.2";
/** PDF extractors disagree about discretionary hyphens, not about words. */
function pdfEvidenceText(text) {
  return String(text ?? "")
    .replace(
      /([\p{L}]+)[-\u00ad][ \t]*\r?\n[ \t]*(?=\p{Ll})/gu,
      (match, left) =>
        /^(?:nicht|kein\w*|ohne|no|not|without)$/iu.test(left) ? match : left,
    )
    .replace(/([\p{L}]+)\u0002(?=\p{Ll})/gu, (_match, left) =>
      /^(?:nicht|kein\w*|ohne|no|not|without)$/iu.test(left)
        ? left + " "
        : left,
    );
}
const hash = (s) => createHash("sha256").update(s).digest("hex");
export const evidenceText = (s, format) =>
  (format === "PDF" ? pdfEvidenceText(s) : String(s ?? ""))
    .normalize("NFKC")
    .replace(/&nbsp;|\u00a0/gu, " ")
    .replace(/\u00ad/gu, "")
    .replace(/\s+/gu, " ")
    .trim()
    .toLowerCase();
const words = (s) =>
  evidenceText(s)
    .replace(/ä/gu, "a")
    .replace(/ö/gu, "o")
    .replace(/ü/gu, "u")
    .replace(/ß/gu, "ss")
    .replace(/[^\p{L}\p{N}]+/gu, " ")
    .trim();
const uri = (s) => {
  const u = new URL(publicSourceUrl(s));
  u.hash = "";
  u.searchParams.sort();
  return u.href.replace(/\/$/u, "");
};
const host = (s) => new URL(publicSourceUrl(s)).hostname.replace(/^www\./u, "");
export function parseResearchAssessments(input, claims) {
  if (input === undefined) return null;
  if (!Array.isArray(input) || input.length > 80)
    throw Error("research_assessments_invalid");
  const seen = new Set(),
    keys = new Set(claims.map((c) => c.attributeKey));
  return input.map((a) => {
    if (
      !a ||
      typeof a !== "object" ||
      Array.isArray(a) ||
      !keys.has(a.attributeKey) ||
      seen.has(a.attributeKey) ||
      !["NONE", "MINOR", "MAJOR"].includes(a.uncertainty) ||
      typeof a.reason !== "string" ||
      a.reason.trim().length < 12 ||
      a.reason.length > 1000
    )
      throw Error("research_assessment_invalid");
    seen.add(a.attributeKey);
    const bindings = a.bindings ?? {};
    if (
      !bindings ||
      typeof bindings !== "object" ||
      Array.isArray(bindings) ||
      Object.keys(bindings).length > 200 ||
      Object.entries(bindings).some(
        ([p, n]) =>
          p.length > 200 ||
          !/^\/(?:[\w-]+\/?)*$/u.test(p) ||
          !Number.isInteger(n) ||
          n < 0 ||
          n > 30,
      )
    )
      throw Error("research_evidence_binding_invalid");
    return {
      attributeKey: a.attributeKey,
      uncertainty: a.uncertainty,
      reason: a.reason.trim(),
      bindings,
    };
  });
}
// Grounding follows observed document anchors even when their label is not
// classified as menu/access content (for example a room documentation PDF).
function observedDocuments(page) {
  if (typeof page.body !== "string") return [];
  const html = visibleSourceHtml(page.body)
    .replace(/<(script|style|template)\b[\s\S]*?<\/\1>/giu, "")
    .replace(/<!--[\s\S]*?-->/gu, "");
  const links = [];
  for (const match of html.matchAll(
    /<a\b[^>]*\bhref\s*=\s*["']([^"']+)["'][^>]*>([\s\S]*?)<\/a>/giu,
  )) {
    try {
      const url = new URL(match[1].replace(/&amp;/gu, "&"), page.url).href;
      if (/\.pdf(?:$|[?#])|\/pdfdownload\//iu.test(url))
        links.push({ url, label: match[2].replace(/<[^>]*>/gu, " ") });
    } catch {
      /* Invalid external markup is not authority. */
    }
  }
  return links;
}
/** Preserve day/time column associations that plain HTML text flattens. */
function tableSchedules(page) {
  if (typeof page.body !== "string") return [];
  const result = [];
  const text = (html) => {
    try {
      return sourceText(
        { ...page, body: `<div>${html}</div>` },
        "table-cell",
      ).text.trim();
    } catch (error) {
      if (error.message === "source_empty") return "";
      throw error;
    }
  };
  const lines = (html) =>
    text(html)
      .split(/\n+/u)
      .map((s) => s.trim())
      .filter(Boolean);
  for (const table of visibleSourceHtml(page.body).matchAll(
    /<table\b[\s\S]*?<\/table>/giu,
  ))
    for (const row of table[0].matchAll(/<tr\b[^>]*>([\s\S]*?)<\/tr>/giu)) {
      const cells = [
        ...row[1].matchAll(/<t[dh]\b[^>]*>([\s\S]*?)<\/t[dh]>/giu),
      ].map((m) => m[1]);
      if (cells.length !== 3) continue;
      const days = lines(cells[1]),
        times = lines(cells[2]),
        scope = text(cells[0]);
      if (
        !scope ||
        !days.length ||
        days.length !== times.length ||
        days.length > 14
      )
        continue;
      for (let i = 0; i < days.length; i++)
        if (
          /\d{1,2}[.:]\d{2}/u.test(times[i]) &&
          !/letzte|jeden|jeweils|monat|ferien|feiertag|xxl/iu.test(
            days[i].replace(/\([^)]*\)/gu, ""),
          )
        )
          result.push({ scope, days: days[i], time: times[i] });
    }
  return result;
}
/** Read tariff cells with their duration, age and weekday headers intact. */
function tableTariffs(page) {
  if (typeof page.body !== "string") return [];
  const result = [];
  const plain = (html) => {
    try {
      return sourceText(
        { ...page, body: `<div>${html}</div>` },
        "tariff-cell",
      ).text.trim();
    } catch (error) {
      if (error.message === "source_empty") return "";
      throw error;
    }
  };
  for (const table of visibleSourceHtml(page.body).matchAll(
    /<table\b[\s\S]*?<\/table>/giu,
  )) {
    const rows = [...table[0].matchAll(/<tr\b[^>]*>([\s\S]*?)<\/tr>/giu)].map(
      (row) =>
        [...row[1].matchAll(/<t[dh]\b([^>]*)>([\s\S]*?)<\/t[dh]>/giu)].flatMap(
          (cell) =>
            Array(
              Math.min(
                20,
                Number(cell[1].match(/colspan=["']?(\d+)/iu)?.[1] ?? 1),
              ),
            ).fill(plain(cell[2])),
        ),
    );
    const header = rows[0];
    if (
      !header ||
      !/dauer|duration/iu.test(header[0]) ||
      header.length < 3 ||
      !header.some((cell) => /jahre|years/iu.test(cell))
    )
      continue;
    const days = rows[1];
    if (days?.length !== header.length) continue;
    const entries = [];
    for (const row of rows.slice(2)) {
      if (row.length !== header.length) continue;
      for (let i = 1; i < row.length; i++) {
        const amount = row[i].match(/CHF\s*(\d+(?:[.,]\d+)?)/u)?.[1];
        if (amount)
          entries.push({
            duration: row[0],
            audience: header[i],
            days: days[i],
            amount: Number(amount.replace(",", ".")),
          });
      }
    }
    if (entries.length) result.push({ text: plain(table[0]), entries });
  }
  return result;
}
export async function collectResearchEvidence({
  page,
  website,
  name,
  locality,
  address,
  claims,
  fetchPage,
  readPdf,
}) {
  const contactOnlyKeys = [
    "contact.public_email",
    "contact.phone",
    "location.address_line1",
  ];
  const pages = new Map(),
    failures = [],
    documentLinks = new Set();
  const rootIdentity = words(
    (await readSourceText(page, "identity", { preferMain: false })).text,
  );
  if (
    !rootIdentity.includes(words(name)) ||
    !rootIdentity.includes(words(locality)) ||
    (address && !rootIdentity.includes(words(address)))
  )
    return {
      pages,
      failures: [{ url: website, reason: "VENUE_IDENTITY_NOT_CONFIRMED" }],
    };
  const wanted = new Set(
    claims.flatMap((c) =>
      [c.source, ...(c.supportingSources ?? [])].map((s) => uri(s.url)),
    ),
  );
  if (wanted.size > 18) throw Error("research_source_count_exceeded");
  const allowed = new Set([
    uri(website),
    uri(page.url),
    ...(page.redirectedFrom ?? []).map(uri),
  ]);
  const register = async (p, requestUrl) => {
    let text;
    if (/application\/pdf/iu.test(p.contentType)) {
      if (!readPdf) throw Error("PDF_READER_UNAVAILABLE");
      text = await readPdf(new Uint8Array(p.body));
    } else {
      if (typeof p.body !== "string") throw Error("HTML_SOURCE_REQUIRED");
      text = (await readSourceText(p, "evidence", { preferMain: false })).text;
      for (const link of [
        ...discoverResearchLinks(p),
        ...discoverMenuDocuments(p),
        ...discoverPracticalDocuments(p),
        ...observedDocuments(p),
      ]) {
        try {
          if (
            host(link.url) === host(website) &&
            (researchLegalPage(link.url, link.label) === "VISITOR" ||
              (researchLegalPage(link.url, link.label) === "CONTACT_ONLY" &&
                claims.some((c) => contactOnlyKeys.includes(c.attributeKey))))
          ) {
            allowed.add(uri(link.url));
            if (/pdfdownload|\.pdf(?:$|[?#])/iu.test(link.url))
              documentLinks.add(uri(link.url));
          }
        } catch {
          /* untrusted link */
        }
      }
    }
    if (!text?.trim() || text.length > 300000)
      throw Error("SOURCE_TEXT_UNREADABLE");
    const entry = {
      url: p.url,
      requestUrl,
      text,
      observedAt: p.observedAt,
      hash: hash(p.body),
      format: /application\/pdf/iu.test(p.contentType) ? "PDF" : "HTML",
      schedules: tableSchedules(p),
      tariffs: tableTariffs(p),
    };
    for (const u of [requestUrl, p.url, ...(p.redirectedFrom ?? [])])
      pages.set(uri(u), entry);
  };
  await register(page, website);
  const attempted = new Set(pages.keys());
  for (let wave = 0; wave < 3; wave++) {
    const candidates = [...wanted].filter(
      (u) => !attempted.has(u) && allowed.has(u),
    );
    if ([...wanted].some((u) => /\.pdf(?:$|[?#])/iu.test(u) && !pages.has(u)))
      candidates.push(...[...documentLinks].filter((u) => !attempted.has(u)));
    const next = [...new Set(candidates)].slice(0, 18 - attempted.size);
    if (!next.length) break;
    for (let offset = 0; offset < next.length; offset += 3)
      await Promise.all(
        next.slice(offset, offset + 3).map(async (url) => {
          attempted.add(url);
          try {
            const p = await fetchPage(url, {
              allowedWebsite: website,
              allowObservedPdfRedirect: true,
              maxBytes: 10000000,
              maxRedirects: 3,
              timeoutMs: 12000,
            });
            if (host(p.url) !== host(website))
              throw Error("SOURCE_IDENTITY_MISMATCH");
            await register(p, url);
          } catch (error) {
            if (wanted.has(url))
              failures.push({
                url,
                reason: [
                  "SOURCE_TEXT_UNREADABLE",
                  "PDF_READER_UNAVAILABLE",
                  "research_pdf_unreadable",
                  "research_pdf_too_large",
                  "research_pdf_too_many_pages",
                ].includes(error?.message)
                  ? "SOURCE_TEXT_UNREADABLE"
                  : "OFFICIAL_SOURCE_UNAVAILABLE",
              });
          }
        }),
      );
  }
  // Fixed public Swiss address service, never an arbitrary URL supplied by a model.
  if (
    claims.some((c) =>
      ["location.latitude", "location.longitude"].includes(c.attributeKey),
    ) &&
    address &&
    locality
  ) {
    const url = new URL(
      "https://api3.geo.admin.ch/rest/services/api/SearchServer",
    );
    Object.entries({
      searchText: `${address} ${locality}`,
      type: "locations",
      origins: "address",
      limit: "5",
      sr: "4326",
    }).forEach(([k, v]) => url.searchParams.set(k, v));
    try {
      const p = await fetchPage(url.href, {
        timeoutMs: 10000,
        maxBytes: 100000,
        maxRedirects: 0,
      });
      const results = JSON.parse(String(p.body)).results;
      const matches = Array.isArray(results)
        ? results.filter(
            (r) =>
              words(r.attrs?.detail).includes(words(address)) &&
              words(r.attrs?.detail).includes(words(locality)) &&
              Number.isFinite(r.attrs?.lat) &&
              Number.isFinite(r.attrs?.lon),
          )
        : [];
      if (matches.length === 1) {
        const entry = {
          url: p.url,
          requestUrl: url.href,
          text: String(p.body),
          observedAt: p.observedAt,
          hash: hash(p.body),
          format: "ADDRESS",
          coordinates: {
            latitude: matches[0].attrs.lat,
            longitude: matches[0].attrs.lon,
          },
        };
        for (const wantedUrl of wanted) {
          const u = new URL(wantedUrl);
          if (
            u.origin === url.origin &&
            u.pathname === url.pathname &&
            words(u.searchParams.get("searchText")) ===
              words(`${address} ${locality}`)
          )
            pages.set(wantedUrl, entry);
        }
      }
    } catch {
      failures.push({ url: url.href, reason: "ADDRESS_LOOKUP_UNAVAILABLE" });
    }
  }
  return { pages, failures };
}
const terms = {
  LUNCH: [
    "mittagsangebote",
    "mittagsangebot",
    "mittag",
    "mittagessen",
    "mittagsmenu",
    "mittagsmenü",
    "mittagskarte",
    "business lunch",
    "businesslunch",
    "lunch",
    "mittagsverpflegung",
  ],
  DINNER: [
    "abendangebote",
    "abendangebot",
    "abend",
    "abendessen",
    "abendkarte",
    "dinner",
  ],
  BREAKFAST: ["frühstück", "fruehstueck", "breakfast"],
  BRUNCH: ["brunch"],
  FULL_MEALS: [
    "mittagsmenü",
    "mittagsmenu",
    "lunch",
    "hauptgang",
    "hauptgänge",
    "hauptgerichte",
    "mahlzeiten",
    "restaurant",
    "mittag",
    "abendessen",
  ],
  FULL_MEAL: [
    "hauptgänge",
    "hauptgerichte",
    "restaurant",
    "trattoria",
    "speisekarte",
  ],
  DINING_AREA: [
    "restaurant",
    "trattoria",
    "gastraum",
    "speisesaal",
    "gastronomie",
    "saunarestaurant",
    "poolbar",
  ],
  WELLNESS_RELAXATION: [
    "wellness",
    "wellnesswelt",
    "wellness welt",
    "entspannung",
    "saunawelt",
    "spa",
    "hamam",
    "hammam",
  ],
  HAMMAM: ["hamam", "hammam"],
  SAUNA: ["sauna", "saunawelt", "saunalandschaft"],
  SPA: ["spa", "wellness spa"],
  SWIMMING_POOL: [
    "schwimmbad",
    "erlebnisbad",
    "badewelt",
    "badewelten",
    "wellenbad",
  ],
  BATHING: [
    "baden",
    "schwimmen",
    "schwimmbad",
    "erlebnisbad",
    "badewelt",
    "badewelten",
    "hamam",
    "hammam",
  ],
  POOL_AREA: [
    "pool",
    "becken",
    "badewelt",
    "badewelten",
    "actionwelt",
    "vitalbad",
    "wellenbad",
  ],
  SAUNA_AREA: ["sauna", "saunawelt", "saunalandschaft"],
  TREATMENT_ROOM: [
    "spa",
    "behandlungsraum",
    "behandlungsräume",
    "behandlungsräumen",
  ],
  SPA_TREATMENT: [
    "spa",
    "massage",
    "massagen",
    "kosmetik",
    "behandlung",
    "behandlungen",
  ],
  PLAY: ["spielen", "spiel", "spielbereich", "actionwelt", "kinderland"],
  GASTRONOMY: ["restaurant", "gastronomie", "saunarestaurant", "poolbar"],
  DRINKS: [
    "getränke",
    "getraenke",
    "drinks",
    "cocktails",
    "poolbar",
    "weinkarte",
    "wine",
    "wein",
    "bier",
  ],
  WINE: ["wein", "weine", "weinen", "weinkarte", "wine"],
  BEER: ["bier", "beer"],
  COFFEE: ["kaffee", "coffee", "espresso"],
  NON_ALCOHOLIC_DRINKS: ["alkoholfreie getränke", "alkoholfrei", "wasser"],
  SNACKS: ["barfood", "snacks", "kleinigkeiten"],
  BAKED_GOODS: ["gipfeli", "croissant", "backwaren"],
  APERITIF: ["apéro", "apero", "aperitif", "barfood", "snacks"],
  PRIVATE_CELEBRATION: [
    "hochzeit",
    "hochzeiten",
    "familienfeier",
    "familienfeiern",
    "feiern",
    "festessen",
    "bankett",
    "bankette",
  ],
  EVENT: [
    "seminar",
    "seminare",
    "konferenz",
    "konferenzen",
    "veranstaltung",
    "veranstaltungen",
    "event",
    "events",
  ],
  INDOOR: [
    "zunftstube",
    "restaurant",
    "innenbereich",
    "gastraum",
    "stube",
    "saal",
    "säle",
  ],
  PRIVATE_ROOM: [
    "vorgesetztenstube",
    "gilgenstube",
    "zunftsaal",
    "ryff-stube",
    "stube",
    "separater raum",
    "sääli",
    "saal",
  ],
  EVENT_AREA: [
    "saal",
    "säle",
    "seminar",
    "seminare",
    "bankett",
    "bankette",
    "veranstaltungen",
  ],
  TERRACE: ["terrasse", "terrace", "boulevardfläche"],
  GARDEN: ["garten", "garden"],
  OUTDOOR_SEATING: [
    "sitzplätze draussen",
    "sitzplätze draußen",
    "outdoor seating",
    "garten",
    "terrasse",
    "boulevardfläche",
  ],
  OUTDOOR: [
    "aussenbereich",
    "außenbereich",
    "draussen",
    "draußen",
    "garten",
    "garden",
    "terrasse",
    "boulevardfläche",
  ],
  EAT: ["restaurant", "trattoria", "küche", "speisen", "essen"],
  RESTAURANT: ["restaurant"],
  EAT_DRINK: ["restaurant", "speisen", "essen"],
  SWISS: ["schweiz", "schweizer", "swiss"],
  INTERNATIONAL: ["international"],
  ITALIAN: [
    "italienisch",
    "italienische",
    "italienisches",
    "italienischen",
    "italian",
    "römische",
    "römischen",
  ],
  PASTA: ["pasta", "spaghetti", "ravioli", "rigatoni", "pappardelle"],
  STEAK: ["steak", "rindsentrecôte", "entrecôte", "rindsfilet", "beef fillet"],
  SEAFOOD: [
    "fisch",
    "meeresfrüchte",
    "seafood",
    "calamari",
    "gamberi",
    "riesenkrevetten",
    "eglifilets",
  ],
  DESSERTS: ["dessert", "desserts", "nachspeisen", "dolci"],
  ICE_CREAM: ["glacé", "glace", "glacés", "sorbet", "sorbets", "ice cream"],
  VEGETARIAN_DISHES: [
    "vegetarische gerichte",
    "vegetarisch",
    "vegetarian",
    "überbackene auberginen mit tomatensauce und parmesan",
  ],
  VEGAN: ["vegan"],
  VEGETARIAN: ["vegetarisch", "vegetarian"],
  GLUTEN_FREE: ["glutenfrei", "gluten frei", "gluten-free"],
  LACTOSE_FREE: ["laktosefrei", "laktose frei", "lactose-free"],
  RECOMMENDED: [
    "tisch reservieren",
    "reservieren",
    "reservation",
    "reservierung",
    "book a table",
  ],
  REQUIRED: ["erforderlich", "obligatorisch", "pflicht", "required"],
  NOT_REQUIRED: [
    "nicht erforderlich",
    "ohne reservation",
    "keine reservierung",
  ],
  PUBLIC_TRANSPORT_NEARBY: [
    "tramhaltestelle",
    "ö v",
    "öv",
    "öffentliche verkehrsmittel",
  ],
  PRIVATE_ROOM_FACILITY: [
    "vorgesetztenstube",
    "gilgenstube",
    "zunftsaal",
    "stube",
    "saal",
    "säle",
    "separater raum",
  ],
  FAMILY: ["familien", "familie"],
  BUSINESS: ["firmen", "business", "seminar", "konferenz"],
  DATE_PAIR: ["romantisch", "zu zweit"],
  FRIENDS_GROUP: ["freunde", "gruppen"],
  MIDDAY: ["mittag", "lunch"],
  EVENING: ["abend", "dinner"],
  NORMAL_OPERATION: ["restaurant", "öffnungszeiten"],
  CHF: ["chf", "schweizerfranken"],
  CH: ["schweiz", "basel", "4001 basel"],
};
// Check each occurrence separately and respect punctuation between clauses.
const has = (text, term) => {
  const normalized = words(text),
    needle = words(term);
  for (const match of normalized.matchAll(
    new RegExp(
      `(?:^| )(${needle.replace(/[.*+?^${}()|[\]\\]/gu, "\\$&")})(?= |$)`,
      "gu",
    ),
  )) {
    const index = match.index + match[0].length - match[1].length;
    const before = normalized.slice(Math.max(0, index - 45), index);
    if (
      !/\b(?:kein\w*|nicht|ohne|no|not|without)\s+(?:\w+\s+){0,1}$/u.test(
        before,
      )
    )
      return true;
  }
  return false;
};
const catalogueTerms = new Map();
for (const item of [
  ...SPOT_GROUPS,
  ...SPOT_TYPE_CATALOG,
  ...OFFER_CATALOG,
  ...AREA_CATALOG,
]) {
  const key = item.id ?? item.kind;
  catalogueTerms.set(key, [
    ...(catalogueTerms.get(key) ?? []),
    item.label,
    ...(item.aliases ?? []),
  ]);
}
export const matchesResearchMeaning = (value, text) =>
  [...(terms[value] ?? []), ...(catalogueTerms.get(value) ?? []), value].some(
    (t) => has(text, t),
  );
function scalarMeaning(value, text, key) {
  if (value === null) return true;
  if (typeof value === "number")
    return [...String(text).matchAll(/\d+(?:[.,]\d+)?/gu)].some(
      (m) => Math.abs(Number(m[0].replace(",", ".")) - value) < 0.000001,
    );
  if (typeof value === "boolean")
    return value
      ? /\b(?:ja|yes|erlaubt|vorhanden|verfügbar|accessible|allowed)\b/iu.test(
          text,
        )
      : /\b(?:nein|no|nicht erlaubt|nicht vorhanden|verboten|not allowed)\b/iu.test(
          text,
        );
  if (typeof value !== "string") return false;
  if (key === "mandatoryFeesIncluded") return false;
  if (["PER_ITEM", "PER_PERSON"].includes(value))
    return /\b(?:chf|preis|speisekarte|menu|menü|hauptg[aä]ng|hauptgericht|pro person|1\s*dl|espresso|portion)\b/iu.test(
      text,
    );
  if (/^\d{4}-\d{2}-\d{2}$/u.test(value)) {
    const [year, month, day] = value.split("-").map(Number),
      months = [
        "januar",
        "februar",
        "märz",
        "april",
        "mai",
        "juni",
        "juli",
        "august",
        "september",
        "oktober",
        "november",
        "dezember",
      ];
    return (
      text.includes(value) ||
      (text.includes(String(year)) &&
        new RegExp(`\\b${day}\\.?\\s*${months[month - 1]}`, "iu").test(text))
    );
  }
  const numberTokens = value.match(/\d+(?:[.,]\d+)?/gu) ?? [];
  const sourceNumbers = (String(text).match(/\d+(?:[.,]\d+)?/gu) ?? []).map(
    (n) => Number(n.replace(",", ".")),
  );
  if (
    numberTokens.some(
      (n) => !sourceNumbers.includes(Number(n.replace(",", "."))),
    )
  )
    return false;
  if (/^[A-Z_]+$/u.test(value)) return matchesResearchMeaning(value, text);
  if (evidenceText(text).includes(evidenceText(value))) {
    if (has(text, value)) return true;
    const phrase = words(value).replace(/[.*+?^${}()|[\]\\]/gu, "\\$&");
    // A negated complete phrase cannot become a positive paraphrase. A mere
    // substring (Badewelt/Badewelten) still reaches grammatical comparison.
    if (new RegExp(`(?:^| )${phrase}(?= |$)`, "u").test(words(text)))
      return false;
  }
  // A factual paraphrase is a recorded researcher judgement, not a lexical
  // identity test. Every content word must be traceable; stylistic words vary.
  const ignored = new Set([
    "der",
    "die",
    "das",
    "den",
    "dem",
    "des",
    "ein",
    "eine",
    "einer",
    "einem",
    "einen",
    "mit",
    "im",
    "in",
    "am",
    "an",
    "und",
    "oder",
    "für",
    "von",
    "zur",
    "zum",
    "auf",
    "als",
    "bei",
    "sowie",
    "pro",
  ]);
  const content = words(value)
    .split(" ")
    .filter((w) => w.length > 3 && !ignored.has(w));
  return (
    content.length > 0 &&
    content.filter(
      (w) =>
        words(text).includes(w.slice(0, Math.max(4, w.length - 2))) ||
        (w === "kuche" && /spezialitat|gerichte/u.test(words(text))) ||
        (w === "ohne" && /\bkeine?\b/u.test(words(text))),
    ).length /
      content.length >=
      0.8
  );
}
const dayNames = [
  "montag",
  "dienstag",
  "mittwoch",
  "donnerstag",
  "freitag",
  "samstag",
  "sonntag",
];
const dayKeys = [
  "MONDAY",
  "TUESDAY",
  "WEDNESDAY",
  "THURSDAY",
  "FRIDAY",
  "SATURDAY",
  "SUNDAY",
];
function coversDay(text, index) {
  const abbreviated = evidenceText(text).replace(
    /\b(mo|di|mi|do|fr|sa|so)\b\.?/giu,
    (_word, day) =>
      dayNames[
        ["mo", "di", "mi", "do", "fr", "sa", "so"].indexOf(day.toLowerCase())
      ],
  );
  const t = words(abbreviated);
  if (/\bt[aä]glich\b|\bevery day\b|\bdaily\b/iu.test(abbreviated)) return true;
  const rangeText = abbreviated.replace(/\s*[-–—]\s*/gu, " bis ");
  for (let from = 0; from < 7; from++)
    for (let to = 0; to < 7; to++)
      if (
        (from <= to
          ? index >= from && index <= to
          : index >= from || index <= to) &&
        new RegExp(
          `\\b${dayNames[from]} (?:bis|to) ${dayNames[to]}\\b`,
          "u",
        ).test(rangeText)
      )
        return true;
  return (
    has(t, dayNames[index]) ||
    has(t, dayNames[index] + "s") ||
    (index === 6 && /sonntagen/u.test(t))
  );
}
const timePattern = (time) => {
  const h = time === "00:00" ? "(?:0?0|24)" : `0?${Number(time.slice(0, 2))}`;
  return `\\b${h}[.:]${time.slice(3)}(?:\\s*Uhr)?`;
};
function scheduleBlocks(text) {
  const blocks = [];
  let active = null;
  for (const line of text
    .split(/\n+/u)
    .map((s) => s.trim())
    .filter(Boolean)) {
    const days = dayNames.map((_, i) => i).filter((i) => coversDay(line, i));
    if (days.length) {
      active = { days, text: line };
      blocks.push(active);
    } else if (
      active &&
      /\d{1,2}[.:]\d{2}|geschlossen|closed|ruhetag/iu.test(line)
    ) {
      active.text += " " + line;
    } else {
      active = null;
    }
  }
  return blocks;
}
function hasKitchenSchedule(text) {
  return /k[uü]chenzeiten|warme\s+k[uü]che|k[uü]che(?:\s|[^\p{L}]).{0,100}\d{1,2}[.:]\d{2}|\d{1,2}[.:]\d{2}.{0,30}k[uü]che/isu.test(
    text,
  );
}
function provesSchedule(rows, text, kitchen, allowKitchenFallback = false) {
  if (!kitchen && hasKitchenSchedule(text)) return "SCHEDULE_SCOPE_AMBIGUOUS";
  if (kitchen && !hasKitchenSchedule(text) && !allowKitchenFallback)
    return "KITCHEN_SCOPE_NOT_SUPPORTED";
  const blocks = scheduleBlocks(text);
  for (const row of rows) {
    const day = dayKeys.indexOf(row.day);
    if (day < 0) return "SCHEDULE_DAY_NOT_SUPPORTED";
    const relevant = blocks.filter((block) => block.days.includes(day));
    if (!relevant.length) return "SCHEDULE_DAY_NOT_SUPPORTED";
    if (!row.intervals.length) {
      if (
        !relevant.some((block) =>
          /geschlossen|closed|ruhetag/iu.test(block.text),
        )
      )
        return "CLOSED_DAY_NOT_SUPPORTED";
      if (relevant.some((block) => /\d{1,2}[.:]\d{2}/u.test(block.text)))
        return "SCHEDULE_SCOPE_AMBIGUOUS";
    } else {
      if (
        relevant.some((block) =>
          /geschlossen|closed|ruhetag/iu.test(block.text),
        )
      )
        return "SCHEDULE_SCOPE_AMBIGUOUS";
      for (const interval of row.intervals)
        if (
          !relevant.some((block) =>
            new RegExp(
              `${timePattern(interval.start)}\\s*(?:bis|to|[-–—])\\s*${timePattern(interval.end)}\\b`,
              "iu",
            ).test(block.text),
          )
        )
          return "SCHEDULE_TIME_NOT_SUPPORTED";
    }
  }
  return null;
}
function tariffExceptionSupported(value, text) {
  const match = value.match(/^(Mo[–—-]Fr)\s+(?:ausser|außer)\s+(.+)$/iu);
  const footnote = text.match(/\*\s*(?:und|auch|sowie)\s+[^\n]+/iu)?.[0];
  return !!(
    match &&
    footnote &&
    /Sa\s*&\s*So\*/iu.test(text) &&
    words(text).includes(words(match[1])) &&
    scalarMeaning(match[2], footnote, "event") &&
    [...match[2].matchAll(/\b[A-Z]{2}\b/gu)].every(([code]) =>
      new RegExp(`\\b${code}\\b`, "u").test(footnote),
    )
  );
}
function tariffCellSupported(price, quote, page, offer) {
  const tables = page?.tariffs?.filter((table) =>
    evidenceText(quote).includes(evidenceText(table.text)),
  );
  const duration = price.label?.split("·")[0].trim();
  const referencedMatrix = page?.tariffs?.some((table) =>
    table.entries.some(
      (row) =>
        scalarMeaning(duration, row.duration, "duration") &&
        scalarMeaning(duration, quote, "duration"),
    ),
  );
  if (!tables?.length) return !referencedMatrix;
  if (price.min !== price.max) return false;

  const rows = tables
    .flatMap((table) => table.entries)
    .filter((row) => scalarMeaning(duration, row.duration, "duration"));
  // Non-table supplements (for example a child flat fee) have their own quotes.
  if (!rows.length) return true;
  const combined = words(`${offer.name} ${price.label}`);
  const wantsHamam = /hamam|hammam/u.test(combined),
    wantsSauna = /sauna/u.test(combined);
  const event = price.conditions.event ?? "";
  const weekend = /^sa\s*[/&]\s*so/iu.test(event),
    workday = /^mo[–—-]fr/iu.test(event);
  return rows.some((row) => {
    const age = row.audience.match(/(\d+)\s*[–—-]\s*(\d+)\s*(?:jahre|years)/iu);
    const minimum = age
      ? Number(age[1])
      : Number(row.audience.match(/ab\s+(\d+)/iu)?.[1]);
    const maximum = age ? Number(age[2]) : null;
    return (
      row.amount === price.min &&
      minimum === price.minimumAge &&
      maximum === price.maximumAge &&
      /hamam|hammam/iu.test(row.audience) === wantsHamam &&
      (wantsHamam || /sauna/iu.test(row.audience) === wantsSauna) &&
      (!weekend || /sa.*so/iu.test(row.days)) &&
      (!workday || /mo.*fr/iu.test(row.days))
    );
  });
}
function conditionsSupported(c, text) {
  if (c.weekdays.some((day) => !coversDay(text, day - 1))) return false;
  if (c.dayparts.some((daypart) => !matchesResearchMeaning(daypart, text)))
    return false;
  if (
    c.event &&
    !scalarMeaning(c.event, text, "event") &&
    !tariffExceptionSupported(c.event, text)
  )
    return false;
  return [c.validFrom, c.validUntil].every(
    (date) => !date || scalarMeaning(date, text, "date"),
  );
}
// A profile is a complete document. Preserve existing subjects and detail slots,
// while allowing a freshly grounded correction or enrichment within a slot.
function preservesSlots(previous, next, identity) {
  const available = new Map();
  for (const item of next) {
    const id = identity(item);
    available.set(id, (available.get(id) ?? 0) + 1);
  }
  for (const item of previous) {
    const id = identity(item),
      count = available.get(id) ?? 0;
    if (!count) return false;
    available.set(id, count - 1);
  }
  return true;
}
const propertySlot = (property) =>
  JSON.stringify([property.key, property.label]);
function preservesProfile(previous, next) {
  if (
    previous.category !== next.category ||
    !preservesSlots(previous.properties ?? [], next.properties, propertySlot)
  )
    return false;
  for (const collection of ["areas", "offers"])
    for (const old of previous[collection] ?? []) {
      const item = next[collection].find(
        (item) => item.id === old.id && item.kind === old.kind,
      );
      if (
        !item ||
        !preservesSlots(old.properties, item.properties, propertySlot)
      )
        return false;
      if (collection === "offers") {
        if (old.areaIds.some((id) => !item.areaIds.includes(id))) return false;
        if (
          !preservesSlots(old.prices, item.prices, (price) =>
            JSON.stringify([price.label, price.currency, price.basis]),
          )
        )
          return false;
        if (
          !preservesSlots(
            old.schedule,
            item.schedule,
            (interval) => interval.weekday,
          )
        )
          return false;
      }
    }
  return true;
}
// A restaurant may publish the currency once for several menu sections.
// Only verified sources of this same official publisher enter this function.
function priceCurrencySupported(currency, quote, sources) {
  if (scalarMeaning(currency, quote, "currency")) return true;
  if (currency !== "CHF" || /\b(?:EUR|USD|GBP)\b|[€$£]/u.test(quote))
    return false;
  return sources.some((s) => scalarMeaning(currency, s.evidence, "currency"));
}
function profileMeaning(value, sources, assessment, previous, evidence) {
  const bindings = assessment.bindings;
  const boundIndex = (path) => {
    let match = "",
      index = null;
    for (const [p, n] of Object.entries(bindings))
      if ((path === p || path.startsWith(p + "/")) && p.length > match.length) {
        match = p;
        index = n;
      }
    return index;
  };
  const bound = (path) => sources[boundIndex(path)]?.evidence ?? null;
  for (const [collection, items] of [
    ["areas", value.areas],
    ["offers", value.offers],
  ])
    for (let i = 0; i < items.length; i++) {
      const item = items[i],
        prefix = `/${collection}/${i}`,
        text = bound(prefix),
        old = previous?.[collection]?.find(
          (candidate) => candidate.id === item.id,
        );
      if (old && isDeepStrictEqual(old, item)) continue;
      if (
        (!old || old.name !== item.name || old.kind !== item.kind) &&
        (!text ||
          !scalarMeaning(item.name, text, "name") ||
          (item.kind !== "OTHER" && !matchesResearchMeaning(item.kind, text)))
      )
        return `PROFILE_SCOPE_NOT_SUPPORTED:${prefix}`;
      for (let n = 0; n < item.properties.length; n++) {
        const property = item.properties[n],
          p = `${prefix}/properties/${n}`,
          quote = bound(p);
        if (
          old?.properties.some((candidate) =>
            isDeepStrictEqual(candidate, property),
          )
        )
          continue;
        if (
          !quote ||
          property.state !== "KNOWN" ||
          !scalarMeaning(property.value, quote, property.key) ||
          !conditionsSupported(property.conditions, quote)
        )
          return `PROFILE_PROPERTY_NOT_SUPPORTED:${p}`;
      }
      if (collection === "offers") {
        for (const [areaIndex, areaId] of item.areaIds.entries()) {
          if (old?.areaIds.includes(areaId)) continue;
          const area = value.areas.find((a) => a.id === areaId);
          const quote = bound(`${prefix}/areaIds/${areaIndex}`);
          if (
            !area ||
            !quote ||
            !scalarMeaning(area.name, quote, "name") ||
            !matchesResearchMeaning(item.kind, quote)
          )
            return `PROFILE_RELATION_NOT_SUPPORTED:${prefix}`;
        }
        if (
          item.schedule.length &&
          !isDeepStrictEqual(item.schedule, old?.schedule)
        ) {
          const quote = bound(`${prefix}/schedule`);
          const scheduleSource = sources[boundIndex(`${prefix}/schedule`)];
          const page =
            scheduleSource && evidence?.pages.get(uri(scheduleSource.url));
          const scope = item.name.replace(/\s*\(.*$/u, "");
          const scoped = page?.schedules?.filter((row) =>
            scalarMeaning(scope, row.scope, "name"),
          );
          const quotedRows =
            page?.schedules?.filter(
              (row) =>
                evidenceText(quote).includes(evidenceText(row.scope)) &&
                evidenceText(quote).includes(evidenceText(row.days)) &&
                evidenceText(quote).includes(evidenceText(row.time)),
            ) ?? [];
          const scheduleQuote = scoped?.length
            ? quotedRows
                .filter((row) => scoped.includes(row))
                .map((row) => `${row.days} ${row.time}`)
                .join("\n")
            : quotedRows.length
              ? null
              : quote;
          if (
            !scheduleQuote ||
            provesSchedule(
              item.schedule.map((s) => ({
                day: dayKeys[s.weekday - 1],
                intervals: [{ start: s.start, end: s.end }],
              })),
              scheduleQuote,
              false,
            )
          )
            return "OFFER_SCHEDULE_NOT_SUPPORTED";
        }
        for (let n = 0; n < item.prices.length; n++) {
          const p = item.prices[n],
            quote = bound(`${prefix}/prices/${n}`);
          if (old?.prices.some((candidate) => isDeepStrictEqual(candidate, p)))
            continue;
          if (
            !quote ||
            !conditionsSupported(p.conditions, quote) ||
            (p.minimumAge !== null &&
              !scalarMeaning(p.minimumAge, quote, "age")) ||
            (p.maximumAge !== null &&
              !scalarMeaning(p.maximumAge, quote, "age")) ||
            (p.includes && !scalarMeaning(p.includes, quote, "includes")) ||
            !scalarMeaning(p.min, quote, "min") ||
            (p.max !== null && !scalarMeaning(p.max, quote, "max")) ||
            !priceCurrencySupported(p.currency, quote, sources) ||
            !tariffCellSupported(
              p,
              quote,
              evidence?.pages.get(
                uri(sources[boundIndex(`${prefix}/prices/${n}`)].url),
              ),
              item,
            ) ||
            !sources
              .filter(
                (s) =>
                  s.url === sources[boundIndex(`${prefix}/prices/${n}`)]?.url,
              )
              .some((s) => scalarMeaning(p.basis, s.evidence, "basis")) ||
            (p.mandatoryFeesIncluded === true &&
              !/keine weiteren|alle.*geb[uü]hren/iu.test(quote))
          )
            return `PROFILE_PRICE_NOT_SUPPORTED:${prefix}/prices/${n}`;
          for (const date of [p.conditions.validFrom, p.conditions.validUntil])
            if (date && !scalarMeaning(date, quote, "date"))
              return "PRICE_VALIDITY_NOT_SUPPORTED";
        }
        for (const date of [item.validFrom, item.validUntil])
          if (
            date &&
            ![old?.validFrom, old?.validUntil].includes(date) &&
            (!text || !scalarMeaning(date, text, "date"))
          )
            return "OFFER_VALIDITY_NOT_SUPPORTED";
      }
    }
  for (let i = 0; i < value.properties.length; i++) {
    const p = value.properties[i],
      text = bound(`/properties/${i}`);
    if (
      previous?.properties?.some((candidate) => isDeepStrictEqual(candidate, p))
    )
      continue;
    if (
      !text ||
      p.state !== "KNOWN" ||
      !scalarMeaning(p.value, text, p.key) ||
      !conditionsSupported(p.conditions, text)
    )
      return `PROFILE_PROPERTY_NOT_SUPPORTED:/properties/${i}`;
  }
  return null;
}
export function proveResearchEvidence({
  claim,
  assessment,
  evidence,
  current,
  website,
  page,
  claims,
  now = Date.now(),
}) {
  const hold = (reason) => ({
    eligible: false,
    url: claim.source.url,
    reason,
    uncertainty: assessment?.uncertainty ?? "UNASSESSED",
    explanation:
      assessment?.reason ?? "Für diese Angabe fehlt die fachliche Einordnung.",
  });
  if (!assessment) return hold("ASSESSMENT_REQUIRED");
  if (assessment.uncertainty === "MAJOR") return hold("MAJOR_UNCERTAINTY");
  if (
    current &&
    (current.visibility !== "PUBLIC" || current.knowledgeState === "UNKNOWN")
  )
    return hold("EXPLICIT_UNKNOWN_OR_PRIVATE_PROTECTED");
  const sources = [claim.source, ...(claim.supportingSources ?? [])],
    verified = [];
  for (const source of sources) {
    let p;
    try {
      p = evidence.pages.get(uri(source.url));
    } catch {
      return hold("SOURCE_URL_INVALID");
    }
    if (!p) return hold("SOURCE_NOT_IN_OFFICIAL_GRAPH");
    if (
      researchLegalPage(p.url) === "CONTACT_ONLY" &&
      ![
        "contact.public_email",
        "contact.phone",
        "location.address_line1",
      ].includes(claim.attributeKey)
    )
      return hold("SOURCE_CONTACT_ONLY");
    if (
      !Number.isFinite(Date.parse(source.observedAt)) ||
      now - Date.parse(source.observedAt) > 86400000 ||
      Date.parse(source.observedAt) > now + 60000 ||
      now - Date.parse(p.observedAt) > 300000
    )
      return hold("SOURCE_OBSERVATION_EXPIRED");
    if (
      p.format !== "ADDRESS" &&
      !["OFFICIAL_PRIMARY", "AUTHORITATIVE_PRIMARY"].includes(source.trust)
    )
      return hold("PRIMARY_SOURCE_REQUIRED");
    if (
      p.format !== "ADDRESS" &&
      !evidenceText(p.text, p.format).includes(
        evidenceText(source.evidence, p.format),
      )
    )
      return hold("QUOTE_NOT_IN_SOURCE");
    verified.push({
      ...source,
      url: p.url,
      observedAt: p.observedAt,
      sourceHash: p.hash,
    });
  }
  const meaningSources = sources.map((source) => ({
    ...source,
    evidence:
      evidence.pages.get(uri(source.url))?.format === "PDF"
        ? pdfEvidenceText(source.evidence)
        : source.evidence,
  }));
  const text = meaningSources.map((s) => s.evidence).join("\n");
  let reason = null;
  if (
    ["location.latitude", "location.longitude"].includes(claim.attributeKey)
  ) {
    const coordinate = evidence.pages.get(uri(claim.source.url))?.coordinates;
    const pair = claims.find(
      (c) =>
        c.attributeKey ===
        (claim.attributeKey === "location.latitude"
          ? "location.longitude"
          : "location.latitude"),
    );
    if (
      !coordinate ||
      !pair ||
      Math.abs(claim.value - coordinate[claim.attributeKey.split(".")[1]]) >
        0.00001
    )
      reason = "ADDRESS_COORDINATE_PAIR_NOT_CONFIRMED";
  } else if (claim.attributeKey === "contact.website") {
    const observed = [website, page.url, ...(page.redirectedFrom ?? [])].map(
      uri,
    );
    if (!observed.includes(uri(claim.value))) reason = "WEBSITE_NOT_OBSERVED";
  } else if (claim.attributeKey === "experience.profile") {
    if (
      (!current?.value || current.value.category !== claim.value.category) &&
      !matchesResearchMeaning(claim.value.category, text)
    )
      reason = "PROFILE_CATEGORY_NOT_SUPPORTED";
    else if (current?.value && !preservesProfile(current.value, claim.value))
      reason = "EXISTING_PROFILE_CONTENT_PROTECTED";
    else
      reason = profileMeaning(
        claim.value,
        meaningSources,
        assessment,
        current?.value,
        evidence,
      );
  } else if (claim.attributeKey.startsWith("hours.")) {
    if (!["hours.regular", "hours.kitchen"].includes(claim.attributeKey))
      reason = "DATED_EXCEPTION_REQUIRES_SPECIFIC_RULE";
    else
      reason = provesSchedule(
        claim.value,
        text,
        claim.attributeKey === "hours.kitchen",
        claim.attributeKey === "hours.kitchen" &&
          ![...evidence.pages.values()].some((p) => hasKitchenSchedule(p.text)),
      );
  } else if (
    ["rule.external_food", "rule.external_drink"].includes(claim.attributeKey)
  ) {
    const subject =
      claim.attributeKey === "rule.external_food"
        ? /esswaren|speisen|essen|food/iu
        : /getr[aä]nke|drinks|beverages/iu;
    const permitted =
      /gestattet|erlaubt|allowed|permitted/iu.test(text) &&
      !/nicht\s+(?:gestattet|erlaubt)|not\s+(?:allowed|permitted)/iu.test(
        text.split(/\n|\./u).find((line) => subject.test(line)) ?? "",
      );
    if (
      !subject.test(text) ||
      claim.value.policy !== "CONDITIONAL" ||
      !permitted ||
      !/\bnur\b|ausschliesslich|ausschließlich|only|except/iu.test(text) ||
      !claim.value.exceptions.length ||
      claim.value.exceptions.some(
        (value) => !scalarMeaning(value, text, "exception"),
      )
    )
      reason = "CONSUMPTION_SCOPE_NOT_SUPPORTED";
  } else if (claim.attributeKey === "rule.reservation") {
    if (!matchesResearchMeaning(claim.value.mode, text))
      reason = "RESERVATION_MODE_NOT_SUPPORTED";
    if (
      claim.value.minimumPartySize !== null ||
      claim.value.days.length ||
      claim.value.fromTime !== null ||
      claim.value.toTime !== null
    )
      reason = "CONDITIONAL_RESERVATION_REQUIRES_SPECIFIC_RULE";
  } else if (claim.attributeKey === "amenity.features") {
    if (
      claim.value.some(
        (v, i) =>
          !matchesResearchMeaning(
            v === "PRIVATE_ROOM" ? "PRIVATE_ROOM_FACILITY" : v,
            Object.hasOwn(assessment.bindings, `/${i}`)
              ? (sources[assessment.bindings[`/${i}`]]?.evidence ?? "")
              : text,
          ),
      )
    )
      reason = "FACILITY_NOT_SUPPORTED";
  } else if (claim.attributeKey === "location.timezone") {
    if (
      claim.value !== "Europe/Zurich" ||
      !claims.some(
        (c) => c.attributeKey === "location.country_code" && c.value === "CH",
      )
    )
      reason = "TIMEZONE_DERIVATION_NOT_SUPPORTED";
  } else if (
    [
      "operation.price_level",
      "discovery.profile",
      "capacity.seats_total",
      "capacity.seats_indoor",
      "capacity.seats_outdoor",
      "capacity.group_size_supported",
    ].includes(claim.attributeKey)
  )
    reason = "SCOPE_OR_AGGREGATION_REQUIRES_REVIEW";
  else if (Array.isArray(claim.value)) {
    if (
      claim.value.some(
        (v, i) =>
          typeof v !== "string" ||
          !matchesResearchMeaning(
            v,
            Object.hasOwn(assessment.bindings, `/${i}`)
              ? (sources[assessment.bindings[`/${i}`]]?.evidence ?? "")
              : text,
          ),
      )
    )
      reason = "STRUCTURED_VALUE_REQUIRES_SCOPED_EVIDENCE";
  } else if (claim.attributeKey === "contact.phone") {
    if (
      !text
        .replace(/[^+0-9]/gu, "")
        .includes(claim.value.replace(/[^+0-9]/gu, ""))
    )
      reason = "PHONE_NOT_SUPPORTED";
  } else if (typeof claim.value === "object")
    reason = "STRUCTURED_VALUE_REQUIRES_SCOPED_EVIDENCE";
  else if (!scalarMeaning(claim.value, text, claim.attributeKey))
    reason = "VALUE_MEANING_NOT_SUPPORTED";
  if (reason) return hold(reason);
  return {
    eligible: true,
    reason:
      assessment.uncertainty === "MINOR"
        ? "SUPPORTED_WITH_MINOR_UNCERTAINTY"
        : "SUPPORTED_EVIDENCE",
    uncertainty: assessment.uncertainty,
    explanation: assessment.reason,
    sourceProofs: verified.map((s) => ({
      url: s.url,
      hash: s.sourceHash,
      observedAt: s.observedAt,
    })),
    sourceHash: verified[0].sourceHash,
    url: verified[0].url,
    observedAt: verified[0].observedAt,
    source: {
      url: verified[0].url,
      observedAt: verified[0].observedAt,
      trust: claim.source.trust,
      evidence: claim.source.evidence,
    },
    supportingSources: verified
      .slice(1)
      .map(({ sourceHash, ...source }) => source),
  };
}
