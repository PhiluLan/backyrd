import "server-only";
import { boundedJson } from "./booking-guest-security";
import { record } from "./booking-guest-contract";

export type BookingRpc = (name: string, args: Record<string, string | number | null>) => Promise<unknown>;
export class BookingRpcRejection extends Error {
  constructor(readonly databaseCode: string, readonly databaseMessage: string) { super("booking_rpc_rejected"); }
}
/** Fresh service-only transport. Never inherits a browser's cookies or Authorization. */
export function createBookingServiceRpc(config: { url: string; key: string; development: boolean }, allowed: ReadonlySet<string>, transport: typeof fetch = fetch): BookingRpc {
  const url = new URL(config.url);
  const local = config.development && (url.hostname === "localhost" || url.hostname === "127.0.0.1");
  if ((!local && url.protocol !== "https:") || url.username || url.password || url.search || url.hash || url.pathname !== "/" || !config.key) throw new Error("booking_backend_unavailable");
  return async (name, args) => {
    if (!allowed.has(name)) throw new Error("booking_rpc_not_allowed");
    const response = await transport(new URL(`/rest/v1/rpc/${name}`, url), {
      method: "POST", cache: "no-store", redirect: "error", signal: AbortSignal.timeout(8000),
      headers: { apikey: config.key, Authorization: `Bearer ${config.key}`, "Content-Type": "application/json" }, body: JSON.stringify(args),
    });
    const result = await boundedJson(response, 1_500_000);
    if (!response.ok) {
      const error = record(result);
      if (typeof error.code === "string" && /^[0-9A-Z]{5}$/.test(error.code) && typeof error.message === "string") throw new BookingRpcRejection(error.code, error.message);
      throw new Error("booking_backend_unavailable");
    }
    return result;
  };
}
