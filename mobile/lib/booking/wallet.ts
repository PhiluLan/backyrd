import { guestKey, guestUuid, record } from "../../../packages/shared/src/contracts/booking-guest";

export type CancellationIntent = { requestId: string; revision: number };
export type BookingCredential = { reservationId: string; key: string; cancellation: CancellationIntent | null };
export type WalletSlot = { reservationId: string; credential: BookingCredential | null };
export type WalletStorage = { get(key: string): Promise<string | null>; set(key: string, value: string): Promise<void>; remove(key: string): Promise<void> };
export class BookingWalletError extends Error {
  constructor(readonly code: "storage" | "full" | "changed" | "pending" | "invalid_link") { super(code); }
}

const queues = new Map<string, Promise<unknown>>();
async function serial<T>(key: string, operation: () => Promise<T>): Promise<T> {
  const previous = queues.get(key) ?? Promise.resolve();
  const next = previous.catch(() => undefined).then(operation);
  queues.set(key, next);
  try { return await next; } finally { if (queues.get(key) === next) queues.delete(key); }
}

export function parseBookingCredential(value: unknown): BookingCredential {
  const r = record(value);
  let cancellation: CancellationIntent | null = null;
  if (r.cancellation !== null) {
    const c = record(r.cancellation);
    if (typeof c.revision !== "number" || !Number.isSafeInteger(c.revision) || c.revision < 0) throw new BookingWalletError("storage");
    cancellation = { requestId: guestUuid(c.requestId), revision: c.revision };
  }
  return { reservationId: guestUuid(r.reservationId), key: guestKey(r.key), cancellation };
}

/** Import only an explicitly supplied canonical guest link; never navigate its URL. */
export function parseBookingLink(value: string): BookingCredential {
  try {
    if (value.length > 1000) throw new Error();
    const url = new URL(value.trim());
    if (!["https://www.backyrd.ch", "https://backyrd.ch"].includes(url.origin) || url.username || url.password || url.pathname !== "/booking/manage" || url.search) throw new Error();
    const params = new URLSearchParams(url.hash.slice(1));
    if (Array.from(params).length !== 2 || params.getAll("id").length !== 1 || params.getAll("key").length !== 1) throw new Error();
    return { reservationId: guestUuid(params.get("id")), key: guestKey(params.get("key")), cancellation: null };
  } catch { throw new BookingWalletError("invalid_link"); }
}

/** Device/actor/origin isolation is bound by the caller's SHA256 namespace. No receipts or names are persisted. */
export function createBookingWallet(storage: WalletStorage, namespace: string) {
  if (!/^[a-f0-9]{64}$/.test(namespace)) throw new BookingWalletError("storage");
  const indexKey = `backyrd.booking.v1.${namespace}.index`;
  const entryKey = (id: string) => `backyrd.booking.v1.${namespace}.${guestUuid(id)}`;
  async function index(): Promise<string[]> {
    const raw = await storage.get(indexKey);
    if (raw === null) return [];
    if (raw.length > 1200) throw new BookingWalletError("storage");
    const r: unknown = JSON.parse(raw);
    if (!Array.isArray(r) || r.length > 20) throw new BookingWalletError("storage");
    const ids = r.map(guestUuid);
    if (new Set(ids).size !== ids.length) throw new BookingWalletError("storage");
    return ids;
  }
  async function read(id: string): Promise<BookingCredential | null> {
    const raw = await storage.get(entryKey(id));
    if (raw === null) return null;
    if (raw.length > 600) throw new BookingWalletError("storage");
    const value = parseBookingCredential(JSON.parse(raw));
    if (value.reservationId !== id) throw new BookingWalletError("storage");
    return value;
  }
  async function verifiedSet(key: string, value: unknown) {
    const raw = JSON.stringify(value);
    await storage.set(key, raw);
    if (await storage.get(key) !== raw) throw new BookingWalletError("storage");
  }
  async function saved(value: BookingCredential) { await verifiedSet(entryKey(value.reservationId), parseBookingCredential(value)); }
  async function guard<T>(operation: () => Promise<T>): Promise<T> {
    try { return await serial(indexKey, operation); }
    catch (error) { if (error instanceof BookingWalletError) throw error; throw new BookingWalletError("storage"); }
  }
  return {
    list: () => guard(async (): Promise<WalletSlot[]> => {
      const ids = await index();
      return Promise.all(ids.map(async reservationId => {
        try { return { reservationId, credential: await read(reservationId) }; }
        catch { return { reservationId, credential: null }; }
      }));
    }),
    get: (id: string) => guard(async () => (await index()).includes(guestUuid(id)) ? read(id) : null),
    add: (credential: BookingCredential) => guard(async () => {
      const incoming = parseBookingCredential(credential), ids = await index();
      const existing = ids.includes(incoming.reservationId) ? await read(incoming.reservationId) : null;
      if (existing?.cancellation && existing.key !== incoming.key) throw new BookingWalletError("pending");
      if (!ids.includes(incoming.reservationId)) {
        if (ids.length >= 20) throw new BookingWalletError("full");
        // Index first: a partial save stays visible as an unreadable slot, not an untracked secret.
        await verifiedSet(indexKey, [...ids, incoming.reservationId]);
      }
      const value = { ...incoming, cancellation: existing?.key === incoming.key ? existing.cancellation : null };
      await saved(value); return value;
    }),
    prepareCancellation: (id: string, key: string, revision: number, requestId: string) => guard(async () => {
      if (!(await index()).includes(guestUuid(id))) throw new BookingWalletError("changed");
      const value = await read(id);
      if (!value || value.key !== key) throw new BookingWalletError("changed");
      const next = parseBookingCredential({ ...value, cancellation: value.cancellation ?? { requestId, revision } });
      await saved(next); return next;
    }),
    settleCancellation: (id: string, key: string, requestId: string) => guard(async () => {
      if (!(await index()).includes(guestUuid(id))) return;
      const value = await read(id);
      if (!value || value.key !== key || value.cancellation?.requestId !== requestId) return;
      await saved({ ...value, cancellation: null });
    }),
    remove: (id: string) => guard(async () => {
      const ids = await index();
      await storage.remove(entryKey(id));
      if (await storage.get(entryKey(id)) !== null) throw new BookingWalletError("storage");
      await verifiedSet(indexKey, ids.filter(value => value !== id));
    }),
  };
}
export type BookingWallet = ReturnType<typeof createBookingWallet>;
