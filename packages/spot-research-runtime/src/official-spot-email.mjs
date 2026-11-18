import { discoverResearchLinks, fetchPublicSource, matchesExistingWebsite, publicSourceUrl, sourceText, visibleSourceHtml } from "./nuknuk-sources.mjs";

export function officialContactLinks(page) {
  return discoverResearchLinks(page)
    .filter(({ url, topics }) => topics.includes("contact") && !new URL(url).search)
    .filter(({ url, label }) => /\b(?:kontakt|contact|contatti|impressum)\b/iu.test(new URL(url).pathname + " " + label));
}

export async function readOfficialSpotEmail(spot, fetchPage = fetchPublicSource) {
  let website;
  try { website = publicSourceUrl(spot.website); } catch { return null; }
  if (!spot.locality) return null;

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
  if (!home) return null;
  const contactLinks = officialContactLinks(home).slice(0, 2);
  const pages = [...(await Promise.all(contactLinks.map(({ url }) => read(url)))).filter(Boolean), home];
  const words = (value) => " " + value.normalize("NFKC").toLowerCase().replace(/[^\p{L}\p{N}]+/gu, " ").trim() + " ";
  const host = new URL(website).hostname.replace(/^www\./, "");
  const candidates = new Map();
  for (const page of pages) {
    const text = words(sourceText(page, "official-contact").text);
    if (!text.includes(words(spot.name)) || !text.includes(words(spot.locality))) continue;
    const html = visibleSourceHtml(page.body)
      .replace(/<!--[\s\S]*?-->|<(script|style|template|noscript)\b[^>]*>[\s\S]*?<\/\1>/giu, "");
    for (const link of html.matchAll(/<a\b[^>]*\shref\s*=\s*(?:"mailto:([^"]+)"|'mailto:([^']+)')/giu)) {
      let email;
      try { email = decodeURIComponent((link[1] ?? link[2]).split("?")[0]).trim(); } catch { continue; }
      const [mailbox, domain] = email.toLowerCase().split("@");
      if (!/^(?:info|kontakt|contact|hello|hallo|bonjour)@[a-z0-9.-]+$/iu.test(email)
        || domain !== host || candidates.has(mailbox)) continue;
      candidates.set(mailbox, {
        attributeKey: "contact.public_email", knowledgeState: "KNOWN_VALUE", value: email,
        source: { url: page.url, evidence: email, observedAt: page.observedAt, trust: "OFFICIAL_PRIMARY" },
      });
    }
  }
  return candidates.size === 1 ? candidates.values().next().value : null;
}
