import type { DecisionProductCandidate } from "@backyrd/product-decision-contract";
import { Platform } from "react-native";
import * as SecureStore from "expo-secure-store";
import * as Crypto from "expo-crypto";

export type RecentDecisionSearch = { query: string; spotIds: string[]; searchedAt: number };
export type RecentDecisionHistoryEntry = RecentDecisionSearch & { id: string; completed: boolean };
export const RECENT_SEARCH_LIMIT = 20;
const LEGACY_KEY = "backyrd.recent-decision-search.v1";
const KEY = "backyrd.recent-decision-search.v2";
const MAX_AGE_MS = 30 * 24 * 60 * 60_000;
const CHUNK_BYTES = 1800;
const MAX_PARTS = 256;
type Pointer = { version: 2; actorId: string; revision: string; parts: number };
let actor: string | null = null;
let generation = 0;
let current: RecentDecisionHistoryEntry[] | null = null;
let unsaved = false;
let pending: Promise<void> = Promise.resolve();

// Device-only history, never analytics or learning. Native values are encrypted;
// the browser preview remains tab-scoped. Commit a small pointer only after all
// bounded SecureStore chunks exist, so a failed write retains the prior snapshot.
// The legacy key is the commit pointer to preserve logout across OTA rollbacks.
const storage = {
  get: (key: string) => Platform.OS === "web" ? Promise.resolve(typeof window === "undefined" ? null : window.sessionStorage.getItem(key)) : SecureStore.getItemAsync(key),
  set: async (key: string, value: string) => { if (Platform.OS === "web") { if (typeof window !== "undefined") window.sessionStorage.setItem(key, value); } else await SecureStore.setItemAsync(key, value); },
  remove: async (key: string) => { if (Platform.OS === "web") { if (typeof window !== "undefined") window.sessionStorage.removeItem(key); } else await SecureStore.deleteItemAsync(key); },
};
function enqueue<T>(task: () => Promise<T>): Promise<T> {
  const result = pending.then(task);
  pending = result.then(() => undefined, () => undefined);
  return result;
}
const belongsTo = (id: string, version: number) => actor === id && generation === version;
const partKey = (pointer: Pointer, index: number) => `${KEY}.${pointer.revision}.${index}`;
function pointerFrom(raw: string | null): Pointer | null {
  try {
    const row: unknown = raw ? JSON.parse(raw) : null;
    if (!row || typeof row !== "object") return null;
    const value = row as Record<string, unknown>;
    return value.version === 2 && typeof value.actorId === "string" && typeof value.revision === "string" && /^[A-Za-z0-9-]{1,80}$/.test(value.revision)
      && Number.isInteger(value.parts) && Number(value.parts) > 0 && Number(value.parts) <= MAX_PARTS ? value as Pointer : null;
  } catch { return null; }
}
function prune(rows: RecentDecisionHistoryEntry[]) {
  const now = Date.now();
  return rows.filter(row => row.searchedAt <= now && now - row.searchedAt <= MAX_AGE_MS).slice(0, RECENT_SEARCH_LIMIT);
}
function validSearch(value: unknown): value is RecentDecisionSearch {
  if (!value || typeof value !== "object") return false;
  const row = value as Record<string, unknown>;
  return typeof row.query === "string" && Boolean(row.query.trim()) && row.query.length <= 2000 && Array.isArray(row.spotIds) && row.spotIds.length <= 50
    && row.spotIds.every(id => typeof id === "string" && /^[A-Za-z0-9][A-Za-z0-9._:-]{0,159}$/.test(id) && !id.startsWith("event:"))
    && typeof row.searchedAt === "number" && Number.isFinite(row.searchedAt) && row.searchedAt >= 0;
}
function validEntry(value: unknown): value is RecentDecisionHistoryEntry {
  return validSearch(value) && "completed" in value && typeof value.completed === "boolean" && "id" in value && typeof value.id === "string" && /^[A-Za-z0-9-]{1,80}$/.test(value.id);
}
function chunksOf(value: string) {
  const chunks: string[] = [];
  let chunk = "", bytes = 0;
  for (const character of value) {
    const point = character.codePointAt(0)!;
    const size = point <= 0x7f ? 1 : point <= 0x7ff ? 2 : point <= 0xffff ? 3 : 4;
    if (bytes + size > CHUNK_BYTES) { chunks.push(chunk); chunk = ""; bytes = 0; }
    chunk += character; bytes += size;
  }
  if (chunk) chunks.push(chunk);
  if (chunks.length > MAX_PARTS) throw new Error("recent_history_too_large");
  return chunks;
}
async function discardParts(pointer: Pointer | null) {
  if (pointer) await Promise.all(Array.from({ length: pointer.parts }, (_, i) => storage.remove(partKey(pointer, i)).catch(() => undefined)));
}
async function erase() {
  const old = pointerFrom(await storage.get(LEGACY_KEY));
  // Old and new app versions share this pointer; deleting it also prevents
  // a rolled-back client from leaving a readable newer history behind.
  await storage.remove(LEGACY_KEY);
  await storage.remove(KEY);
  await discardParts(old);
}
async function persist(actorId: string, version: number, rows: RecentDecisionHistoryEntry[]) {
  if (!belongsTo(actorId, version)) return false;
  if (!rows.length) { await erase(); return belongsTo(actorId, version); }
  const old = pointerFrom(await storage.get(LEGACY_KEY));
  const chunks = chunksOf(JSON.stringify(rows));
  const next: Pointer = { version: 2, actorId, revision: Crypto.randomUUID(), parts: chunks.length };
  try {
    for (let i = 0; i < chunks.length; i++) {
      if (!belongsTo(actorId, version)) { await discardParts(next); return false; }
      await storage.set(partKey(next, i), chunks[i]);
    }
    if (!belongsTo(actorId, version)) { await discardParts(next); return false; }
    // The existing v1 key remains the sole commit pointer. Older app versions
    // can read a bounded preview, and their logout deletes this pointer too.
    const latest = rows.find(row => row.completed) ?? rows[0];
    const characters = Array.from(latest.query);
    const compatible = { query: characters.length > 120 ? `${characters.slice(0, 119).join("")}…` : latest.query, spotIds: latest.spotIds.slice(0, 5), searchedAt: latest.searchedAt };
    const committed = JSON.stringify({ ...compatible, ...next });
    if (chunksOf(committed).length !== 1) throw new Error("recent_history_pointer_too_large");
    await storage.set(LEGACY_KEY, committed);
  } catch (error) { await discardParts(next); throw error; }
  await discardParts(old);
  return belongsTo(actorId, version);
}

/** Call synchronously when Auth adopts a session, before rendering its account. */
export function setRecentDecisionActor(actorId: string | null) {
  if (actor === actorId) return;
  const previous = actor;
  actor = actorId;
  ++generation;
  current = null;
  unsaved = false;
  if (previous) void enqueue(erase).catch(() => undefined);
}

export async function readRecentDecisionSearches(actorId: string): Promise<RecentDecisionHistoryEntry[]> {
  if (!actorId || actor !== actorId) return [];
  const version = generation;
  if (current !== null) return expireEntries(actorId, version, current);
  await pending;
  try {
    const rawPointer = await storage.get(LEGACY_KEY);
    const pointer = pointerFrom(rawPointer);
    let rows: RecentDecisionHistoryEntry[] = [];
    if (pointer && pointer.actorId === actorId) {
      const parts = await Promise.all(Array.from({ length: pointer.parts }, (_, i) => storage.get(partKey(pointer, i))));
      if (!parts.every(part => typeof part === "string" && part.length <= CHUNK_BYTES)) throw new Error("recent_history_invalid_parts");
      const value: unknown = JSON.parse(parts.join(""));
      if (!Array.isArray(value) || value.length > RECENT_SEARCH_LIMIT || !value.every(validEntry) || new Set(value.map(row => row.id)).size !== value.length) throw new Error("recent_history_invalid_entries");
      rows = value;
    } else if (!pointer) {
      const legacy: unknown = rawPointer ? JSON.parse(rawPointer) : null;
      if (legacy && typeof legacy === "object" && "version" in legacy && legacy.version === 2) throw new Error("recent_history_invalid_pointer");
      if (validSearch(legacy) && "actorId" in legacy && legacy.actorId === actorId) rows = [{ query: legacy.query, spotIds: legacy.spotIds, searchedAt: legacy.searchedAt, completed: true, id: `legacy-${legacy.searchedAt.toString(36)}` }];
    }
    if (!belongsTo(actorId, version)) return [];
    if (current !== null) return expireEntries(actorId, version, current);
    current = rows;
    return expireEntries(actorId, version, rows);
  } catch { if (!belongsTo(actorId, version)) return []; throw new Error("recent_history_unavailable"); }
}

async function expireEntries(actorId: string, version: number, rows: RecentDecisionHistoryEntry[]) {
  const visible = prune(rows);
  if (visible.length !== rows.length) {
    current = visible;
    await commit(actorId, version, visible);
  }
  return belongsTo(actorId, version) ? prune(current ?? visible) : [];
}

/** Compatibility for Home: its rail still uses only the most recent query/order. */
export async function readRecentDecisionSearch(actorId: string): Promise<RecentDecisionSearch | null> {
  const latest = (await readRecentDecisionSearches(actorId).catch(() => [])).find(row => row.completed);
  return latest ? { query: latest.query, spotIds: latest.spotIds, searchedAt: latest.searchedAt } : null;
}

async function saveSearch(actorId: string, query: string, candidates: readonly DecisionProductCandidate[], completed: boolean): Promise<boolean> {
  if (!actorId || actor !== actorId || !query.trim() || query.trim().length > 2000) return false;
  const version = generation;
  let loaded: RecentDecisionHistoryEntry[];
  try { loaded = await readRecentDecisionSearches(actorId); } catch { return false; }
  if (!belongsTo(actorId, version)) return false;
  const rows = prune(current ?? loaded);
  const normalized = query.trim().replace(/\s+/g, " ").toLowerCase();
  const duplicate = rows.find(row => row.query.replace(/\s+/g, " ").toLowerCase() === normalized);
  let id: string;
  try { id = duplicate?.id ?? Crypto.randomUUID(); } catch { return false; }
  const entry: RecentDecisionHistoryEntry = {
    id, query: query.trim(), searchedAt: Date.now(), completed: completed || Boolean(duplicate?.completed),
    spotIds: completed ? [...new Set(candidates.filter(candidate => !candidate.presentation.event && candidate.rank !== null && !candidate.contextualReject).map(candidate => candidate.spotId))].slice(0, 50) : duplicate?.spotIds ?? [],
  };
  current = [entry, ...rows.filter(row => row.id !== entry.id)].slice(0, RECENT_SEARCH_LIMIT);
  const snapshot = current;
  return commit(actorId, version, snapshot);
}

async function commit(actorId: string, version: number, snapshot: RecentDecisionHistoryEntry[], rollback?: { rows: RecentDecisionHistoryEntry[]; unsaved: boolean }) {
  unsaved = true;
  try {
    const saved = await enqueue(() => persist(actorId, version, snapshot));
    if (saved && belongsTo(actorId, version) && current === snapshot) unsaved = false;
    return saved;
  } catch {
    if (rollback && belongsTo(actorId, version) && current === snapshot) { current = rollback.rows; unsaved = rollback.unsaved; }
    return false;
  }
}

export function hasUnsavedRecentDecisionSearches(actorId: string) { return actor === actorId && unsaved; }
export async function retryRecentDecisionSearches(actorId: string): Promise<boolean> {
  const version = generation;
  await pending;
  if (!actorId || !belongsTo(actorId, version)) return false;
  return unsaved && current ? commit(actorId, version, current) : true;
}

/** Remember submitted requests even when they fail or need clarification. */
export function recordRecentDecisionRequest(actorId: string, query: string) {
  return saveSearch(actorId, query, [], false);
}
/** Enrich the same entry after a successful response; keep Home's existing rail. */
export function rememberRecentDecisionSearch(actorId: string, query: string, candidates: readonly DecisionProductCandidate[]) {
  return saveSearch(actorId, query, candidates, true);
}

export async function removeRecentDecisionSearch(actorId: string, id: string): Promise<boolean> {
  const version = generation;
  let loaded: RecentDecisionHistoryEntry[];
  try { loaded = await readRecentDecisionSearches(actorId); } catch { return false; }
  if (!belongsTo(actorId, version)) return false;
  const previous = prune(current ?? loaded);
  const next = previous.filter(row => row.id !== id);
  const wasUnsaved = unsaved;
  current = next;
  return commit(actorId, version, next, { rows: previous, unsaved: wasUnsaved });
}

export async function clearRecentDecisionSearches(actorId: string): Promise<boolean> {
  const version = generation;
  if (!actorId || !belongsTo(actorId, version)) return false;
  const previous = prune(current ?? []);
  const next: RecentDecisionHistoryEntry[] = [];
  const wasUnsaved = unsaved;
  current = next;
  return commit(actorId, version, next, { rows: previous, unsaved: wasUnsaved });
}
