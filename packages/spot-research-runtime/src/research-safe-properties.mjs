// Independent, deterministic proof for the first Codex research import lane.
// Never treats a model's confidence, supplied HTML or trust label as authority.
import { createHash } from "node:crypto";
import {
  publicSourceUrl,
  visibleSourceHtml,
  researchLegalPage,
} from "./nuknuk-sources.mjs";
export const SAFE_RESEARCH_POLICY = "backyrd.research-safe-properties@1";
export const SAFE_RESEARCH_KEYS = [
  "contact.public_email",
  "contact.phone",
  "contact.instagram",
  "contact.facebook",
  "contact.linkedin",
  "contact.tiktok",
];
const platforms = {
  "contact.instagram": "instagram.com",
  "contact.facebook": "facebook.com",
  "contact.linkedin": "linkedin.com",
  "contact.tiktok": "tiktok.com",
};
const decode = (s) =>
  s
    .replace(/&#(x[0-9a-f]+|\d+);/giu, (_, n) =>
      String.fromCodePoint(
        n[0].toLowerCase() === "x" ? parseInt(n.slice(1), 16) : Number(n),
      ),
    )
    .replace(/&amp;/giu, "&")
    .replace(/&nbsp;/giu, " ")
    .replace(/&quot;/giu, '"')
    .replace(/&#39;/gu, "'");
const plain = (s) =>
  decode(
    s
      .replace(/<!--[\s\S]*?-->/gu, " ")
      .replace(/<(script|style|template)\b[\s\S]*?<\/\1>/giu, " ")
      .replace(/<[^>]*>/gu, " "),
  )
    .replace(/\s+/gu, " ")
    .trim();
const normalized = (s) =>
  s
    .normalize("NFKC")
    .toLocaleLowerCase()
    .replace(/[^\p{L}\p{N}]+/gu, " ")
    .trim();
const phone = (s) => s.replace(/[\s()./-]/gu, "").replace(/^00/u, "+");
function canonical(value) {
  const u = new URL(publicSourceUrl(value));
  u.hash = "";
  u.search = "";
  return u.href.replace(/\/$/u, "");
}
export function proveSafeResearchProperty({
  page,
  officialWebsite,
  name,
  locality,
  address,
  claim,
  now = Date.now(),
}) {
  const hold = (reason) => ({
    eligible: false,
    reason,
    policy: SAFE_RESEARCH_POLICY,
  });
  if (
    !SAFE_RESEARCH_KEYS.includes(claim.attributeKey) ||
    claim.knowledgeState !== "KNOWN_VALUE" ||
    typeof claim.value !== "string"
  )
    return hold("FIELD_REQUIRES_REVIEW");
  if (claim.source.trust !== "OFFICIAL_PRIMARY")
    return hold("OFFICIAL_SOURCE_REQUIRED");
  if (!officialWebsite || !name || !locality)
    return hold("CANONICAL_IDENTITY_INCOMPLETE");
  try {
    const official = new URL(publicSourceUrl(officialWebsite)),
      actual = new URL(publicSourceUrl(page.url)),
      quoted = new URL(publicSourceUrl(claim.source.url));
    const host = (u) => u.hostname.replace(/^www\./u, "");
    if (host(actual) !== host(official) || host(quoted) !== host(official))
      return hold("SOURCE_IDENTITY_MISMATCH");
    // Verify only the registered canonical entry page, including its observed
    // redirect. A claim cannot pick an arbitrary same-brand branch/subpage.
    const observed = [
      officialWebsite,
      ...(page.redirectedFrom ?? []),
      page.url,
    ].map(canonical);
    if (!observed.includes(canonical(quoted.href)))
      return hold("SOURCE_NOT_CANONICAL_ENTRY");
    if (
      typeof page.body !== "string" ||
      !/^text\/html\b|^application\/xhtml\+xml\b/iu.test(page.contentType) ||
      page.body.length > 2000000
    )
      return hold("HTML_SOURCE_REQUIRED");
    const at = Date.parse(page.observedAt),
      claimedAt = Date.parse(claim.source.observedAt);
    if (
      !Number.isFinite(at) ||
      !Number.isFinite(claimedAt) ||
      at > now + 60000 ||
      now - at > 300000 ||
      claimedAt > now + 60000 ||
      now - claimedAt > 86400000
    )
      return hold("SOURCE_OBSERVATION_EXPIRED");
    if (researchLegalPage(page.url) !== "VISITOR")
      return hold("LEGAL_SOURCE_NOT_ELIGIBLE");
    const visible = visibleSourceHtml(page.body),
      text = plain(visible),
      identity = normalized(text);
    if (
      !identity.includes(normalized(name)) ||
      !identity.includes(normalized(locality)) ||
      (address && !identity.includes(normalized(address)))
    )
      return hold("VENUE_IDENTITY_NOT_CONFIRMED");
    const candidates = [];
    for (const a of visible
      .replace(/<(script|style|template)\b[\s\S]*?<\/\1>/giu, "")
      .replace(/<!--[\s\S]*?-->/gu, "")
      .matchAll(
        /<a\b[^>]*\bhref\s*=\s*["']([^"']+)["'][^>]*>([\s\S]*?)<\/a>/giu,
      )) {
      const href = decode(a[1]),
        label = plain(a[2]);
      let value;
      if (
        claim.attributeKey === "contact.public_email" &&
        /^mailto:/iu.test(href)
      ) {
        try {
          value = decodeURIComponent(href.slice(7).split("?")[0])
            .trim()
            .toLocaleLowerCase();
        } catch {
          continue;
        }
        if (
          !/^[\w.+%-]+@[\w.-]+\.[a-z]{2,}$/iu.test(value) ||
          label.toLocaleLowerCase() !== value
        )
          continue;
      } else if (
        claim.attributeKey === "contact.phone" &&
        /^tel:/iu.test(href)
      ) {
        if (
          /\bfax\s*[:.]?\s*$/iu.test(
            plain(visible.slice(Math.max(0, a.index - 100), a.index)),
          )
        )
          continue;
        value = phone(href.slice(4));
        if (!/^\+[1-9]\d{6,14}$/u.test(value) || phone(label) !== value)
          continue;
      } else if (platforms[claim.attributeKey]) {
        let u;
        try {
          u = new URL(publicSourceUrl(href));
        } catch {
          continue;
        }
        if (
          u.hostname.replace(/^(?:www\.|m\.)/u, "") !==
            platforms[claim.attributeKey] ||
          u.search ||
          u.hash ||
          !u.pathname.replace(/\//gu, "") ||
          /\/(?:share|sharer(?:\.php)?|intent|login|signup|privacy|accounts|p|reel|posts|video)(?:\/|$)/iu.test(
            u.pathname,
          )
        )
          continue;
        const brand = normalized(name)
          .split(" ")
          .filter(
            (word) =>
              ![
                "restaurant",
                "cafe",
                "café",
                "bar",
                "pub",
                "hotel",
                "hostel",
                "bistro",
              ].includes(word),
          )
          .join("");
        const profile = normalized(decodeURIComponent(u.pathname)).replace(
          / /gu,
          "",
        );
        if (brand.length < 3 || !profile.includes(brand)) continue;
        value = canonical(u.href);
      }
      if (value && !candidates.includes(value)) candidates.push(value);
    }
    let proposed = claim.value.trim();
    if (claim.attributeKey === "contact.public_email")
      proposed = proposed.toLocaleLowerCase();
    else if (claim.attributeKey === "contact.phone") proposed = phone(proposed);
    else proposed = canonical(proposed);
    if (candidates.length !== 1 || candidates[0] !== proposed)
      return hold(
        candidates.length > 1
          ? "MULTIPLE_CONTACTS_REQUIRE_REVIEW"
          : "VALUE_NOT_IN_OFFICIAL_LINK",
      );
    // Preserve the reviewed result in canonical schema; do not silently rewrite
    // case, URL path or phone representation after validation.
    return {
      eligible: true,
      reason: "EXACT_OFFICIAL_CONTACT_LINK",
      policy: SAFE_RESEARCH_POLICY,
      url: page.url,
      observedAt: page.observedAt,
      sourceHash: createHash("sha256").update(page.body).digest("hex"),
      evidence: `Automatische Quellenprüfung ${SAFE_RESEARCH_POLICY}; keine manuelle Einzelprüfung. Öffentlich verlinkter Kontakt: ${claim.value}`,
    };
  } catch {
    return hold("PUBLIC_SOURCE_VALIDATION_FAILED");
  }
}
