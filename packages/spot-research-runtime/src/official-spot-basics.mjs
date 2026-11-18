import { fieldCandidates, normalizePhone, parseHoursRow } from "./nuknuk-research.mjs";
import { discoverResearchLinks, fetchPublicSource, matchesExistingWebsite, publicSourceUrl, sourceText, visibleSourceHtml } from "./nuknuk-sources.mjs";

export function officialContactLinks(page) {
  return discoverResearchLinks(page)
    .filter(({ url, topics }) => topics.includes("contact") && !new URL(url).search)
    .filter(({ url, label }) => /\b(?:kontakt|contact|contatti|impressum)\b/iu.test(new URL(url).pathname + " " + label));
}

export async function readOfficialSpotBasics(spot, fetchPage = fetchPublicSource) {
  let website;
  try { website = publicSourceUrl(spot.website); } catch { return []; }
  if (!spot.locality) return [];

  const read = async (url) => {
    try {
      const page = await fetchPage(url, { allowedWebsite: website, maxRedirects: 1, timeoutMs: 3000 });
      if (matchesExistingWebsite(page.url, website) && typeof page.body === "string"
        && /^(?:text\/html|application\/xhtml\+xml)\b/i.test(page.contentType)) return page;
    } catch {
      // Keep the web-search result if the official site is unavailable.
    }
    return null;
  };
  const home = await read(website);
  if (!home) return [];
  const contactLinks = officialContactLinks(home).slice(0, 2);
  const pages = [...(await Promise.all(contactLinks.map(({ url }) => read(url)))).filter(Boolean), home];
  const words = (value) => " " + value.normalize("NFKC").toLowerCase().replace(/[^\p{L}\p{N}]+/gu, " ").trim() + " ";
  const host = new URL(website).hostname.replace(/^www\./, "");
  const candidates = new Map();
  const remember = (attributeKey, value, evidence, page) => {
    const values = candidates.get(attributeKey) ?? new Map();
    const key = JSON.stringify(value);
    if (!values.has(key)) values.set(key, {
      attributeKey, knowledgeState: "KNOWN_VALUE", value,
      source: { url: page.url, evidence, observedAt: page.observedAt, trust: "OFFICIAL_PRIMARY" },
    });
    candidates.set(attributeKey, values);
  };
  for (const page of pages) {
    const source = sourceText(page, "official-contact");
    const text = words(source.text);
    if (!text.includes(words(spot.name)) || !text.includes(words(spot.locality)) ||
      (spot.address && !text.includes(words(spot.address)))) continue;
    const html = visibleSourceHtml(page.body)
      .replace(/<!--[\s\S]*?-->|<(script|style|template|noscript)\b[^>]*>[\s\S]*?<\/\1>/giu, "");
    for (const link of html.matchAll(/<a\b[^>]*\shref\s*=\s*(?:"mailto:([^"]+)"|'mailto:([^']+)')/giu)) {
      let email;
      try { email = decodeURIComponent((link[1] ?? link[2]).split("?")[0]).trim(); } catch { continue; }
      const domain = email.toLowerCase().split("@")[1];
      if (/^(?:info|kontakt|contact|hello|hallo|bonjour)@[a-z0-9.-]+$/iu.test(email) && domain === host) {
        remember("contact.public_email", email.toLowerCase(), email, page);
      }
    }
    // Require an explicitly labelled international number; never infer the country.
    for (const match of source.text.matchAll(/^\s*(?:T|Tel\.?|Telefon|Phone|Téléphone)\s*:?\s*(\+\d[\d ()/-]{6,24}\d)\s*$/gimu)) {
      try { remember("contact.phone", normalizePhone(match[1]), match[1], page); } catch { /* Invalid number. */ }
    }
    const heading = /^(?:Unsere\s+)?(?:Öffnungszeiten|Opening hours)\s*:?[^\S\n]*/iu;
    const weekday = /^(?:Mo\b|Di\b|Mi\b|Do\b|Fr\b|Sa\b|So\b|Montag|Dienstag|Mittwoch|Donnerstag|Freitag|Samstag|Sonntag|täglich)/iu;
    const lines = source.text.split("\n");
    for (const [index, line] of lines.entries()) {
      if (!heading.test(line)) continue;
      const block = [line];
      for (const next of lines.slice(index + 1, index + 16)) {
        if (!next.trim()) { block.push(next); continue; }
        if (!weekday.test(next.trim())) break;
        block.push(next);
      }
      const quote = block.join("\n").trim();
      if (quote.length > 800 || /\b(?:ferien|feiertag|nur|bis ende|ausnahme|k[uü]che|kitchen)\b/iu.test(quote)) continue;
      if ([...quote.matchAll(/\bab\s+(20\d{2})\b/giu)].some(year => Number(year[1]) > new Date(page.observedAt).getUTCFullYear())) continue;
      const rows = new Map();
      let conflict = false;
      for (const entry of fieldCandidates({ attributeKey: "hours.regular" }, [{ id: "schedule", text: quote }])) {
        for (const row of parseHoursRow(entry.quote)) {
          if (rows.has(row.day) && JSON.stringify(rows.get(row.day)) !== JSON.stringify(row)) conflict = true;
          rows.set(row.day, row);
        }
      }
      if (!conflict && rows.size) {
        const weekdays = ["MONDAY", "TUESDAY", "WEDNESDAY", "THURSDAY", "FRIDAY", "SATURDAY", "SUNDAY"];
        remember("hours.regular", weekdays.flatMap(day => rows.has(day) ? [rows.get(day)] : []), quote, page);
      }
    }
  }
  return [...candidates.values()].filter(values => values.size === 1).map(values => values.values().next().value);
}
