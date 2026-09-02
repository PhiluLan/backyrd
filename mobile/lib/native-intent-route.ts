const UUID_PATTERN =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

function productRoute(path: string): string | null {
  const normalized = path.replace(/^\/+/, "").replace(/\/+$/, "");
  const match = /^(spot|user)\/([^/]+)$/.exec(normalized);

  if (!match || !UUID_PATTERN.test(match[2])) return null;

  return `/${match[1]}/${match[2]}`;
}

/**
 * Accept only the two public product deep-link contracts. Unknown or malformed
 * paths return null so the caller can fail closed through the normal gate.
 */
export function resolveProductDeepLink(rawPath: string): string | null {
  if (rawPath.startsWith("backyrd://")) {
    try {
      const url = new URL(rawPath);
      return productRoute(`${url.hostname}${url.pathname}`);
    } catch {
      return null;
    }
  }

  return productRoute(rawPath);
}
