// Research judgements remain AI judgements. This policy independently checks the
// fetched evidence and schema bindings; it does not pretend to prove all meaning.
import { createHash } from "node:crypto";
import {
  publicSourceUrl,
  visibleSourceHtml,
  readSourceText,
  discoverResearchLinks,
  discoverMenuDocuments,
  discoverPracticalDocuments,
  researchLegalPage,
} from "./nuknuk-sources.mjs";
export const RESEARCH_EVIDENCE_POLICY = "backyrd.research-evidence@2";
const hash = (s) => createHash("sha256").update(s).digest("hex");
export const evidenceText = (s) =>
  String(s ?? "")
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
          } catch {
            if (wanted.has(url))
              failures.push({ url, reason: "OFFICIAL_SOURCE_UNAVAILABLE" });
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
    "hauptgang",
    "hauptgänge",
    "hauptgerichte",
    "mahlzeiten",
    "restaurant",
    "mittag",
    "abendessen",
  ],
  FULL_MEAL: ["hauptgänge", "hauptgerichte", "restaurant"],
  GASTRONOMY: ["restaurant", "gastronomie"],
  DRINKS: ["getränke", "getraenke", "weinkarte", "wine", "wein", "bier"],
  WINE: ["wein", "weine", "weinen", "weinkarte", "wine"],
  BEER: ["bier", "beer"],
  COFFEE: ["kaffee", "coffee", "espresso"],
  NON_ALCOHOLIC_DRINKS: ["alkoholfreie getränke", "alkoholfrei", "wasser"],
  SNACKS: ["barfood", "snacks", "kleinigkeiten"],
  BAKED_GOODS: ["gipfeli", "croissant", "backwaren"],
  APERITIF: ["apéro", "apero", "aperitif", "barfood", "snacks"],
  PRIVATE_CELEBRATION: [
    "hochzeit",
    "familienfeier",
    "feiern",
    "festessen",
    "bankett",
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
  EVENT_AREA: ["saal", "säle", "seminar", "bankett"],
  TERRACE: ["terrasse", "terrace"],
  OUTDOOR: ["aussenbereich", "außenbereich", "draussen", "draußen"],
  EAT: ["restaurant", "küche", "speisen", "essen"],
  RESTAURANT: ["restaurant"],
  EAT_DRINK: ["restaurant", "speisen", "essen"],
  SWISS: ["schweiz", "schweizer", "swiss"],
  INTERNATIONAL: ["international"],
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
export const matchesResearchMeaning = (value, text) =>
  (terms[value] ?? [value]).some((t) => has(text, t));
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
    return /\b(?:chf|preis|menu|menü|hauptg[aä]ng|hauptgericht|pro person|1\s*dl|espresso|portion)\b/iu.test(
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
  if (evidenceText(text).includes(evidenceText(value))) return has(text, value);
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
    content.filter((w) =>
      words(text).includes(w.slice(0, Math.max(4, w.length - 2))),
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
  const t = words(text);
  if (
    has(t, dayNames[index]) ||
    has(t, dayNames[index] + "s") ||
    (index === 6 && /sonntagen/u.test(t))
  )
    return true;
  for (let from = 0; from < 7; from++)
    for (let to = from; to < 7; to++)
      if (
        index >= from &&
        index <= to &&
        new RegExp(
          `\\b${dayNames[from]} (?:bis|to) ${dayNames[to]}\\b`,
          "u",
        ).test(t)
      )
        return true;
  return false;
}
const hasTime = (text, time) => {
  const h = time === "00:00" ? "(?:0?0|24)" : `0?${Number(time.slice(0, 2))}`,
    m = time.slice(3);
  return new RegExp(`\\b${h}[.:]${m}\\b`, "u").test(text);
};
function provesSchedule(rows, text, kitchen) {
  const lines = text
    .split(/\n+/u)
    .map((line) => line.trim())
    .filter(Boolean);
  // A bound source excerpt must isolate the intended schedule. Sharing all
  // opening and kitchen numbers in one paragraph is not a binding.
  if (!kitchen && /k[uü]che|kitchen/iu.test(text))
    return "SCHEDULE_SCOPE_AMBIGUOUS";
  if (kitchen && !/k[uü]che|kitchen/iu.test(text))
    return "KITCHEN_SCOPE_NOT_SUPPORTED";
  for (const row of rows) {
    const day = dayKeys.indexOf(row.day);
    if (day < 0) return "SCHEDULE_DAY_NOT_SUPPORTED";
    const relevant = lines.filter((line) => coversDay(line, day));
    if (!relevant.length) return "SCHEDULE_DAY_NOT_SUPPORTED";
    if (!row.intervals.length) {
      if (!relevant.some((line) => /geschlossen|closed/iu.test(line)))
        return "CLOSED_DAY_NOT_SUPPORTED";
    } else if (
      !relevant.some((line) =>
        row.intervals.every(
          (interval) =>
            hasTime(line, interval.start) && hasTime(line, interval.end),
        ),
      )
    )
      return "SCHEDULE_TIME_NOT_SUPPORTED";
  }
  return null;
}
function conditionsSupported(c, text) {
  if (c.weekdays.some((day) => !coversDay(text, day - 1))) return false;
  if (c.dayparts.some((daypart) => !matchesResearchMeaning(daypart, text)))
    return false;
  if (c.event && !scalarMeaning(c.event, text, "event")) return false;
  return [c.validFrom, c.validUntil].every(
    (date) => !date || scalarMeaning(date, text, "date"),
  );
}
function profileMeaning(value, sources, assessment) {
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
        text = bound(prefix);
      if (
        !text ||
        !scalarMeaning(item.name, text, "name") ||
        (item.kind !== "OTHER" && !matchesResearchMeaning(item.kind, text))
      )
        return `PROFILE_SCOPE_NOT_SUPPORTED:${prefix}`;
      for (let n = 0; n < item.properties.length; n++) {
        const property = item.properties[n],
          p = `${prefix}/properties/${n}`,
          quote = bound(p);
        if (
          !quote ||
          property.state !== "KNOWN" ||
          !scalarMeaning(property.value, quote, property.key) ||
          !conditionsSupported(property.conditions, quote)
        )
          return `PROFILE_PROPERTY_NOT_SUPPORTED:${p}`;
      }
      if (collection === "offers") {
        for (const areaId of item.areaIds) {
          const area = value.areas.find((a) => a.id === areaId);
          const quote = bound(`${prefix}/areaIds`);
          if (
            !area ||
            !quote ||
            !has(quote, area.name) ||
            !matchesResearchMeaning(item.kind, quote)
          )
            return `PROFILE_RELATION_NOT_SUPPORTED:${prefix}`;
        }
        if (item.schedule.length) {
          const quote = bound(`${prefix}/schedule`);
          if (
            !quote ||
            provesSchedule(
              item.schedule.map((s) => ({
                day: dayKeys[s.weekday - 1],
                intervals: [{ start: s.start, end: s.end }],
              })),
              quote,
              false,
            )
          )
            return "OFFER_SCHEDULE_NOT_SUPPORTED";
        }
        for (let n = 0; n < item.prices.length; n++) {
          const p = item.prices[n],
            quote = bound(`${prefix}/prices/${n}`);
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
            !sources
              .filter(
                (s) =>
                  s.url === sources[boundIndex(`${prefix}/prices/${n}`)]?.url,
              )
              .some((s) => scalarMeaning(p.currency, s.evidence, "currency")) ||
            !scalarMeaning(p.basis, quote, "basis") ||
            (p.mandatoryFeesIncluded === true &&
              !/keine weiteren|alle.*geb[uü]hren/iu.test(quote))
          )
            return `PROFILE_PRICE_NOT_SUPPORTED:${prefix}/prices/${n}`;
          for (const date of [p.conditions.validFrom, p.conditions.validUntil])
            if (date && !scalarMeaning(date, quote, "date"))
              return "PRICE_VALIDITY_NOT_SUPPORTED";
        }
        for (const date of [item.validFrom, item.validUntil])
          if (date && !scalarMeaning(date, text, "date"))
            return "OFFER_VALIDITY_NOT_SUPPORTED";
      }
    }
  for (let i = 0; i < value.properties.length; i++) {
    const p = value.properties[i],
      text = bound(`/properties/${i}`);
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
      !evidenceText(p.text).includes(evidenceText(source.evidence))
    )
      return hold("QUOTE_NOT_IN_SOURCE");
    verified.push({
      ...source,
      url: p.url,
      observedAt: p.observedAt,
      sourceHash: p.hash,
    });
  }
  const text = sources.map((s) => s.evidence).join("\n");
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
    if (!matchesResearchMeaning(claim.value.category, text))
      reason = "PROFILE_CATEGORY_NOT_SUPPORTED";
    else if (
      current?.value &&
      ["areas", "offers", "properties"].some((key) =>
        (current.value[key] ?? []).some(
          (old) =>
            !(claim.value[key] ?? []).some(
              (next) => JSON.stringify(old) === JSON.stringify(next),
            ),
        ),
      )
    )
      reason = "EXISTING_PROFILE_CONTENT_PROTECTED";
    else reason = profileMeaning(claim.value, sources, assessment);
  } else if (claim.attributeKey.startsWith("hours.")) {
    if (!["hours.regular", "hours.kitchen"].includes(claim.attributeKey))
      reason = "DATED_EXCEPTION_REQUIRES_SPECIFIC_RULE";
    else
      reason = provesSchedule(
        claim.value,
        text,
        claim.attributeKey === "hours.kitchen",
      );
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
        (v) =>
          !matchesResearchMeaning(
            v === "PRIVATE_ROOM" ? "PRIVATE_ROOM_FACILITY" : v,
            text,
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
        (v) => typeof v !== "string" || !matchesResearchMeaning(v, text),
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
