export interface SeoReport {
  checkedAt: string;
  robots: { status: number | null; listsSitemap: boolean | null };
  sitemap: { status: number | null; total: number | null; spots: number | null };
  sample: { path: string; status: number | null; title: string | null; descriptionPresent: boolean | null; canonical: "self" | "other" | "missing" | null; noindex: boolean | null }[];
}

const origin = "https://www.backyrd.ch";
const maxBytes = 2 * 1024 * 1024;

async function readDocument(path: string, signal: AbortSignal) {
  try {
    const response = await fetch(new URL(path, origin), {
      redirect: "manual", signal: AbortSignal.any([signal, AbortSignal.timeout(5_000)]),
      next: { revalidate: 300 },
    });
    const reader = response.body?.getReader();
    if (!response.ok || !reader) {
      await reader?.cancel();
      return { status: response.status, body: null, headers: response.headers };
    }
    const decoder = new TextDecoder();
    let size = 0;
    let body = "";
    while (true) {
      const chunk = await reader.read();
      if (chunk.done) return { status: response.status, body: body + decoder.decode(), headers: response.headers };
      size += chunk.value.byteLength;
      if (size > maxBytes) {
        await reader.cancel();
        return { status: response.status, body: null, headers: response.headers };
      }
      body += decoder.decode(chunk.value, { stream: true });
    }
  } catch {
    return { status: null, body: null, headers: null };
  }
}

function tags(html: string, tag: "meta" | "link") {
  return Array.from(html.matchAll(new RegExp(`<${tag}\\b(?:[^>"']|"[^"]*"|'[^']*')*>`, "gi")), ([found]) =>
    Object.fromEntries(Array.from(found.matchAll(/([^\s=<>]+)\s*=\s*(?:"([^"]*)"|'([^']*)'|([^\s"'=<>]+))/g),
      ([, key, double, single, bare]) => [key.toLowerCase(), double ?? single ?? bare])));
}

function decodeText(value: string) {
  return value.replace(/&(amp|lt|gt|quot|apos|#39);/g, (_, key: string) =>
    ({ amp: "&", lt: "<", gt: ">", quot: '"', apos: "'", "#39": "'" })[key] ?? "");
}

export async function buildSeoReport(signal: AbortSignal): Promise<SeoReport> {
  const [robots, sitemap] = await Promise.all([readDocument("/robots.txt", signal), readDocument("/sitemap.xml", signal)]);
  const validSitemap = sitemap.body !== null && /<urlset\b/i.test(sitemap.body);
  const urls = validSitemap
    ? Array.from(sitemap.body!.matchAll(/<loc>\s*([^<]+?)\s*<\/loc>/gi), ([, url]) => decodeText(url))
    : null;
  const internalSpots = urls?.filter(url => /^https:\/\/www\.backyrd\.ch\/spots\/[a-f0-9-]{36}$/i.test(url));
  const firstSpot = internalSpots?.[0]?.slice(origin.length);
  const sample = await Promise.all(["/", "/places", "/decision", ...(firstSpot ? [firstSpot] : [])].map(async path => {
    const { status, body, headers } = await readDocument(path, signal);
    if (body === null) return { path, status, title: null, descriptionPresent: null, canonical: null, noindex: null };
    // Limit parsing to the document head. Text from the page body never enters the dashboard.
    const head = body.split(/<\/head\s*>/i, 1)[0];
    const meta = tags(head, "meta");
    const title = /<title\b[^>]*>([^<]*)<\/title>/i.exec(head)?.[1]?.trim();
    const canonicalUrl = tags(head, "link").find(row => row.rel?.toLowerCase() === "canonical")?.href;
    const canonical = canonicalUrl ? (canonicalUrl === new URL(path, origin).href || canonicalUrl === path ? "self" : "other") : "missing";
    const directives = [headers?.get("x-robots-tag") ?? "", ...meta.filter(row => ["robots", "googlebot"].includes(row.name?.toLowerCase())).map(row => row.content ?? "")];
    return {
      path, status, title: title ? decodeText(title).slice(0, 180) : null,
      descriptionPresent: meta.some(row => row.name?.toLowerCase() === "description" && Boolean(row.content?.trim())),
      canonical: canonical as "self" | "other" | "missing",
      noindex: directives.some(value => /\b(?:noindex|none)\b/i.test(value)),
    };
  }));

  return {
    checkedAt: new Date().toISOString(),
    robots: { status: robots.status, listsSitemap: robots.body === null ? null : robots.body.split("\n").some(line => line.trim().toLowerCase() === `sitemap: ${origin}/sitemap.xml`) },
    sitemap: { status: sitemap.status, total: urls?.length ?? null, spots: internalSpots?.length ?? null },
    sample,
  };
}
