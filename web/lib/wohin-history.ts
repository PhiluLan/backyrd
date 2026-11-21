/** Device-only requests, never analytics or learning. Purged on logout/account change. */
export type WohinHistoryEntry = {
  id: string;
  query: string;
  city: string;
  at: number;
  completed: boolean;
};
const PREFIX = "backyrd.wohin.requests.v1:";
const AGE = 30 * 24 * 60 * 60_000;
export const WOHIN_HISTORY_EVENT = "backyrd:wohin-history";
const validActor = (actor: string) => /^[a-zA-Z0-9-]{1,160}$/.test(actor);
export function parseWohinHistory(
  raw: string | null,
  now = Date.now(),
): WohinHistoryEntry[] {
  const value: unknown = raw ? JSON.parse(raw) : [];
  if (!Array.isArray(value)) throw new Error("history_invalid");
  return value
    .filter((row): row is WohinHistoryEntry =>
      Boolean(
        row &&
          typeof row === "object" &&
          typeof row.id === "string" &&
          /^[a-zA-Z0-9-]{1,160}$/.test(row.id) &&
          typeof row.query === "string" &&
          row.query.trim().length >= 3 &&
          row.query.length <= 2000 &&
          typeof row.city === "string" &&
          row.city.length > 1 &&
          row.city.length <= 160 &&
          typeof row.at === "number" &&
          Number.isFinite(row.at) &&
          row.at <= now &&
          row.at > now - AGE &&
          typeof row.completed === "boolean",
      ),
    )
    .sort((a, b) => b.at - a.at)
    .slice(0, 20);
}
export function readWohinHistory(actor: string) {
  if (!validActor(actor)) throw new Error("history_actor_invalid");
  return parseWohinHistory(window.localStorage.getItem(PREFIX + actor));
}
export function writeWohinHistory(actor: string, rows: WohinHistoryEntry[]) {
  if (!validActor(actor)) throw new Error("history_actor_invalid");
  const bounded = parseWohinHistory(JSON.stringify(rows));
  // Empty means removal, not an empty pointer that could conceal an old snapshot.
  if (bounded.length)
    window.localStorage.setItem(PREFIX + actor, JSON.stringify(bounded));
  else window.localStorage.removeItem(PREFIX + actor);
  window.dispatchEvent(new Event(WOHIN_HISTORY_EVENT));
  return bounded;
}
export function clearOtherWohinHistories(actor?: string) {
  if (typeof window === "undefined") return;
  for (let i = window.localStorage.length - 1; i >= 0; i--) {
    const key = window.localStorage.key(i);
    if (key?.startsWith(PREFIX) && key !== (actor ? PREFIX + actor : null))
      window.localStorage.removeItem(key);
  }
  window.dispatchEvent(new Event(WOHIN_HISTORY_EVENT));
}
