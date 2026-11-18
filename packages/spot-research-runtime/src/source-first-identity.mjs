/** Aggregators are discovery leads, never operator evidence, including branded subdomains. */
const directories = /(?:^|\.)(?:google(?:\.[a-z]+)+|tripadvisor(?:\.[a-z]+)+|facebook\.com|instagram\.com|booking\.com|guidle\.com|neueroeffnung\.info|ch-rest\.com|restaurants-info\.com|speisekarte\.menu|basel-restaurants\.ch|wheretobrunch\.ch|brunch-lunch-dinner\.ch|yelp(?:\.[a-z]+)+|basel\.com|local\.ch|search\.ch|thefork(?:\.[a-z]+)+)$/iu;
export function directorySource(url) {
  try { return directories.test(new URL(url).hostname); } catch { return true; }
}
export function identityWords(value) {
  return String(value ?? '').normalize('NFKD').replace(/\p{M}/gu,'').toLowerCase().replace(/ß/gu,'ss').replace(/[^\p{L}\p{N}]+/gu,' ').trim();
}
export function brandedOperatorHost(url, name) {
  if (directorySource(url)) return false;
  const labels = new URL(url).hostname.replace(/^www\./u,'').split('.');
  // Use the registered brand rather than a directory's venue-named subdomain.
  const label = labels.at(-2) === 'co' && labels.at(-1) === 'uk' ? labels.at(-3) : labels.at(-2);
  const brand = identityWords(name).replace(/\b(?:museum|restaurant|cafe|bar|freizeitpark|specialty|coffee|kaffeehaus|basel)\b/gu,'').replace(/\s+/gu,'');
  const hostBrand = identityWords(label).replace(/\s+/gu,'');
  return brand.length >= 4 && hostBrand.includes(brand);
}
