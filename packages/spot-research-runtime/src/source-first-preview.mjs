import { readOfficialSpotBasics } from "./official-spot-basics.mjs";
import { discoverResearchLinks, fetchPublicSource, matchesExistingWebsite, publicSourceUrl, sourceText } from "./nuknuk-sources.mjs";

const fields = ["contact.public_email", "contact.phone", "hours.regular", "operation.price_options"];
const words = value => " " + value.normalize("NFKC").toLowerCase().replace(/[^\p{L}\p{N}]+/gu, " ").trim() + " ";
const has = (text, value) => !!value?.trim() && text.includes(words(value));
const priceLabel = /(?:eintritt|preise?|admission|tickets?|tarifs?|tariffe)/iu;
const fixedAdmission = /^(?:eintritt(?:spreis)?|admission)[\s:–-]+(?:CHF\s*\d+(?:[.,]\d{1,2})?|\d+(?:[.,]\d{1,2})?\s*CHF)\s+(?:pro person|per person)[.!]?$/iu;
const priceAmount = /(?:\bCHF\s*\d|\d\s*CHF\b)/iu;
const observedPriceLabel = /^(?:.{1,110}\s)?(?:CHF\s*\d+(?:[.,]\d{1,2})?|\d+(?:[.,]\d{1,2})?\s*CHF)(?:[.–-])?(?:\s+(?:pro Person|per person))?$/iu;
const excludedPriceContent = /@|https?:|[<>]|(?:schreib|ignoriere|instruction|ignore|prompt|passwort|password)/iu;

export async function previewSpotSources(spot, { fetchPage = fetchPublicSource, search, selectPrice } = {}) {
  const started = Date.now();
  const missing = fields.filter(key => !Object.hasOwn(spot.existingValues, key));
  const proposals = [];
  const usage = { brave: { state: "NOT_NEEDED", calls: 0 }, ai: { state: "NOT_NEEDED", calls: 0 }, estimatedUsd: 0 };
  const pages = new Map();
  const result = (status) => ({
    spotId: spot.spotId, name: spot.name, status, proposals, usage, elapsedMs: Date.now() - started,
    sourcesRead: new Set([...pages.values()].filter(Boolean).map(page => page.url)).size,
    stillMissing: missing.filter(key => !proposals.some(item => item.attributeKey === key)),
  });
  if (!missing.length) return result("COMPLETE_PROFILE");
  const read = async (url, options = {}) => {
    if (!pages.has(url)) {
      let page = null;
      try {
        const response = await fetchPage(url, { timeoutMs: 3500, maxRedirects: 2, maxBytes: 1_500_000, ...options });
        if (/^(?:text\/html|application\/xhtml\+xml)\b/iu.test(response.contentType) && typeof response.body === "string") page = response;
      } catch { /* A failed page does not invalidate the sources that did respond. */ }
      pages.set(url, page);
    }
    return pages.get(url);
  };
  const street = spot.address?.split(",")[0]?.trim();
  const matches = (page, requireAddress) => {
    const text = words(sourceText(page, "identity").text);
    return has(text, spot.name) && has(text, spot.locality) && (!requireAddress || has(text, street));
  };
  let website;
  try { website = publicSourceUrl(spot.website); } catch { /* No usable approved website. */ }
  let home = website ? await read(website) : null;
  if (!home && !website) {
    if (!spot.locality || !spot.address) return result("INSUFFICIENT_IDENTITY");
    if (!search) {
      usage.brave.state = "NEEDED_NOT_CONFIGURED";
      return result("SOURCE_MISSING");
    }
    usage.brave.calls++;
    let candidates;
    try {
      candidates = await search([spot.name, spot.address, spot.locality, "offizielle Webseite"].join(" "));
      usage.brave.state = "USED";
      usage.estimatedUsd += 0.005;
    } catch {
      usage.brave.state = "FAILED";
      usage.estimatedUsd = null;
      return result("SOURCE_MISSING");
    }
    // Search hits are leads. The exact approved address and a first-party
    // identity on the target page are required to establish the site.
    for (const raw of candidates.slice(0, 3)) {
      let url;
      try { url = publicSourceUrl(raw); } catch { continue; }
      const candidate = await read(url);
      if (!candidate || !matches(candidate, true) || !declaresVenue(candidate, spot.name, street)) continue;
      home = candidate;
      website = candidate.url;
      proposals.push({ attributeKey: "contact.website", value: candidate.url, url: candidate.url,
        evidence: [spot.name, street, spot.locality].join(" · "), observedAt: candidate.observedAt,
        method: "DIRECT", review: true });
      break;
    }
  }
  if (!home || !website) return result(website ? "SOURCE_UNAVAILABLE" : "SOURCE_MISSING");

  const links = discoverResearchLinks(home).filter(({ url, label, topics }) =>
    matchesExistingWebsite(url, website) && !new URL(url).search && url !== home.url &&
    (missing.includes("hours.regular") && topics.includes("hours") ||
      missing.includes("operation.price_options") && (topics.includes("menu") || priceLabel.test(new URL(url).pathname + " " + label))));
  const extra = await Promise.all([...new Set(links.map(link => link.url))].slice(0, 2)
    .map(url => read(url, { allowedWebsite: website })));
  const additionalPages = extra.filter(Boolean);
  if (missing.some(key => key !== "operation.price_options")) {
    const basics = await readOfficialSpotBasics({ ...spot, address: street, website }, async (url, options) => {
      const page = await read(url, options);
      if (!page) throw new Error("source_unavailable");
      return page;
    }, { additionalPages });
    for (const { attributeKey, value, source } of basics) {
      if (missing.includes(attributeKey)) proposals.push({ attributeKey, value, ...source, method: "DIRECT", review: attributeKey === "hours.regular" });
    }
  }
  if (missing.includes("operation.price_options")) {
    const pricePages = [home, ...additionalPages].filter(page => matches(page, Boolean(spot.address)));
    const evidence = [];
    for (const page of pricePages) {
      const lines = sourceText(page, "prices").text.split("\n").map(line => line.trim());
      const pricePage = links.some(link => link.url === page.url) || priceLabel.test(new URL(page.url).pathname);
      for (const line of lines) {
        if (line.length <= 180 && !excludedPriceContent.test(line) && priceAmount.test(line) &&
          (priceLabel.test(line) || (pricePage && observedPriceLabel.test(line))) && !evidence.some(entry => entry.evidence === line)) {
          evidence.push({ evidence: line, url: page.url, observedAt: page.observedAt });
        }
        if (evidence.length === 8) break;
      }
      if (evidence.length === 8) break;
    }
    const simple = evidence.filter(candidate => fixedAdmission.test(candidate.evidence));
    if (simple.length === 1 && evidence.length === 1) {
      proposals.push({ attributeKey: "operation.price_options", value: simple[0].evidence, ...simple[0], method: "DIRECT", review: true });
    } else if (evidence.length) {
      // The model may select an existing quotation, never create a price.
      let index = null;
      if (selectPrice) {
        usage.ai.calls++;
        try {
          const picked = await selectPrice(evidence.map(item => item.evidence));
          index = picked.index;
          usage.ai.state = "USED";
          usage.ai.tokens = picked.tokens;
          usage.estimatedUsd = picked.estimatedUsd === null ? null : usage.estimatedUsd + picked.estimatedUsd;
        } catch {
          usage.ai.state = "FAILED";
          usage.estimatedUsd = null;
        }
      } else usage.ai.state = "NEEDED_NOT_CONFIGURED";
      if (Number.isInteger(index) && evidence[index]) {
        const pick = evidence[index];
        proposals.push({ attributeKey: "operation.price_options", value: pick.evidence, ...pick, method: "AI", review: true });
      }
    }
  }
  return result("CHECKED");
}

function declaresVenue(page, name, street) {
  const originsMatch = (url) => typeof url === "string" && matchesExistingWebsite(url, page.url);
  const declares = (value, depth = 0) => {
    if (!value || typeof value !== "object" || depth > 4) return false;
    if (Array.isArray(value)) return value.slice(0, 30).some(entry => declares(entry, depth + 1));
    return (typeof value.name === "string" && words(value.name) === words(name) &&
      originsMatch(value.url) && typeof value.address?.streetAddress === "string" &&
      words(value.address.streetAddress) === words(street)) || declares(value["@graph"], depth + 1);
  };
  for (const match of page.body.matchAll(/<script\b[^>]*\btype=["']application\/ld\+json["'][^>]*>([\s\S]*?)<\/script>/giu)) {
    try { if (declares(JSON.parse(match[1]))) return true; } catch { /* Malformed source markup. */ }
  }
  const title = page.body.match(/<title\b[^>]*>([^<]+)<\/title>/iu)?.[1];
  const host = new URL(page.url).hostname.replace(/^www\./iu, "");
  return has(title ? words(title) : "", name) && [...page.body.matchAll(/href\s*=\s*["']mailto:([^"'?]+)[^"']*["']/giu)]
    .some(match => match[1].toLowerCase().endsWith("@" + host));
}
