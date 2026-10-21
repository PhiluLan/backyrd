/** Development clients never fall back to the production Booking endpoint. */
export function resolveBookingOrigin(variant: unknown, configured: unknown): string | null {
  const production = "https://www.backyrd.ch";
  if (variant !== "prod" && variant !== "dev") return null;
  if (variant === "prod") return configured === undefined || configured === "" || configured === production ? production : null;
  if (typeof configured !== "string" || configured.length > 300) return null;
  try {
    const url = new URL(configured);
    if (url.origin !== configured || url.username || url.password || url.search || url.hash || url.pathname !== "/") return null;
    if (url.hostname === "backyrd.ch" || url.hostname.endsWith(".backyrd.ch")) return null;
    const loopback = ["127.0.0.1", "localhost", "[::1]"].includes(url.hostname);
    return url.protocol === "https:" || (loopback && url.protocol === "http:") ? url.origin : null;
  } catch { return null; }
}
