import type { DecisionProductCandidate } from "@backyrd/product-decision-contract";
import { Platform } from "react-native";
import * as SecureStore from "expo-secure-store";

export type RecentDecisionSearch = { query: string; spotIds: string[]; searchedAt: number };
const KEY = "backyrd.recent-decision-search.v1";
const MAX_AGE_MS = 30 * 24 * 60 * 60_000;
let actor: string | null = null;
let generation = 0;
let current: RecentDecisionSearch | null = null;
let pending: Promise<void> = Promise.resolve();

// Only one search on this device; no query, GPS or recommendation reasons in analytics.
// Native storage is encrypted; the browser preview uses tab-scoped session storage.
const storage = {
  get: () => Platform.OS === "web" ? Promise.resolve(typeof window === "undefined" ? null : window.sessionStorage.getItem(KEY)) : SecureStore.getItemAsync(KEY),
  set: async (value: string) => { if (Platform.OS === "web") { if (typeof window !== "undefined") window.sessionStorage.setItem(KEY, value); } else await SecureStore.setItemAsync(KEY, value); },
  remove: async () => { if (Platform.OS === "web") { if (typeof window !== "undefined") window.sessionStorage.removeItem(KEY); } else await SecureStore.deleteItemAsync(KEY); },
};
function enqueue(task: () => Promise<void>) { pending = pending.then(task).catch(() => undefined); return pending; }

/** Call synchronously when Auth adopts a session, before rendering its account. */
export function setRecentDecisionActor(actorId: string | null) {
  if (actor === actorId) return;
  const previous = actor;
  actor = actorId;
  ++generation;
  current = null;
  if (previous) void enqueue(() => storage.remove());
}

export async function rememberRecentDecisionSearch(actorId: string, query: string, candidates: readonly DecisionProductCandidate[]) {
  if (!actorId || actorId !== actor || !query.trim() || query.trim().length > 2000) return;
  const value: RecentDecisionSearch = {
    query: query.trim(),
    spotIds: [...new Set(candidates.filter(candidate => !candidate.presentation.event && candidate.rank !== null && !candidate.contextualReject).map(candidate => candidate.spotId))].slice(0, 50),
    searchedAt: Date.now(),
  };
  current = value;
  const version = generation;
  await enqueue(async () => {
    if (actor !== actorId || version !== generation) return;
    // SecureStore can reject large payloads: keep the current in-memory search usable.
    await storage.set(JSON.stringify({ actorId, ...value }));
  });
}

export async function readRecentDecisionSearch(actorId: string): Promise<RecentDecisionSearch | null> {
  if (!actorId || actor !== actorId) return null;
  if (current) return Date.now() - current.searchedAt <= MAX_AGE_MS ? current : null;
  const version = generation;
  await pending;
  try {
    const raw = await storage.get();
    if (actor !== actorId || version !== generation) return null;
    if (current) return current;
    const value: unknown = raw ? JSON.parse(raw) : null;
    if (!value || typeof value !== "object") return null;
    const row = value as Record<string, unknown>;
    if (row.actorId !== actorId || typeof row.query !== "string" || !row.query.trim() || row.query.length > 2000 || !Array.isArray(row.spotIds) || row.spotIds.length > 50 || !row.spotIds.every(id => typeof id === "string" && /^[A-Za-z0-9][A-Za-z0-9._:-]{0,159}$/.test(id) && !id.startsWith("event:")) || typeof row.searchedAt !== "number" || !Number.isFinite(row.searchedAt) || Date.now() - row.searchedAt < 0 || Date.now() - row.searchedAt > MAX_AGE_MS) return null;
    current = { query: row.query, spotIds: [...new Set(row.spotIds as string[])], searchedAt: row.searchedAt };
    return current;
  } catch { return null; }
}
