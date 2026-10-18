import { PRODUCT_MOOD_MAX_SELECTIONS } from "../contracts/mood";

/** Presentation only. No taxonomy, aggregation or Decision policy lives here. */
export type MoodOption = { concept_key: string; label: string; matched_expression: string };
export const MOOD_SELECTION_LIMIT = PRODUCT_MOOD_MAX_SELECTIONS;
export const moodExpressionKey = (value: string): string => value.normalize("NFC").trim().replace(/\s+/g, " ").toLocaleLowerCase("de");

export function parseMoodOptions(value: unknown): MoodOption[] {
  if (!Array.isArray(value)) return [];
  const result = new Map<string, MoodOption>();
  for (const row of value) {
    if (typeof row !== "object" || row === null) continue;
    const item = row as Record<string, unknown>;
    if (typeof item.concept_key !== "string" || typeof item.label !== "string" || !item.label.trim() || typeof item.matched_expression !== "string") continue;
    result.set(item.concept_key, { concept_key: item.concept_key, label: item.label, matched_expression: item.matched_expression });
  }
  return [...result.values()].sort((a, b) => a.label.localeCompare(b.label, "de"));
}

export function toggleMoodExpression(values: readonly string[], expression: string): { values: string[]; full: boolean } {
  const cleaned = values.map(v => v.trim()).filter(Boolean);
  const key = moodExpressionKey(expression);
  if (!key) return { values: cleaned, full: false };
  if (cleaned.some(v => moodExpressionKey(v) === key)) return { values: cleaned.filter(v => moodExpressionKey(v) !== key), full: false };
  if (cleaned.length >= MOOD_SELECTION_LIMIT) return { values: cleaned, full: true };
  return { values: [...cleaned, expression.trim()], full: false };
}

type MoodEvidence = { evidence_state: "EARLY" | "ESTABLISHED"; concept_contributors: number | null; rank: number };
export function moodEvidenceCopy(mood: MoodEvidence): string {
  if (mood.evidence_state === "EARLY") return "Ein erster Eindruck von Gästen. Für ein breiteres Bild fehlen noch weitere Erfahrungen.";
  const count = mood.concept_contributors;
  if (typeof count !== "number" || !Number.isInteger(count) || count < 1) return "Dieser Eindruck stammt aus den Erfahrungen von Gästen. Je nach Besuch kann sich ein Ort unterschiedlich anfühlen.";
  return `${count === 1 ? "Eine Person hat" : `${count} Personen haben`} diesen Ort so beschrieben. Je nach Besuch kann sich die Atmosphäre unterscheiden.`;
}

export type BrowseMood = MoodSupport & { spot_id: string };
/** Fetch only this catalog's public profiles, without silently truncating at the API row cap. */
export async function loadBrowseMoods(spotIds: readonly string[], readPage: (ids: string[], from: number, to: number) => Promise<unknown>): Promise<BrowseMood[]> {
  const ids = [...new Set(spotIds)];
  const result: BrowseMood[] = [];
  for (let start = 0; start < ids.length; start += 50) {
    const batch = ids.slice(start, start + 50);
    for (let page = 0; ; page++) {
      if (page >= 100) throw new Error("mood_profile_page_limit");
      const raw = await readPage(batch, page * 1000, page * 1000 + 999);
      if (!Array.isArray(raw)) throw new Error("mood_profile_invalid");
      for (const row of raw) {
        if (typeof row !== "object" || row === null) throw new Error("mood_profile_invalid");
        const item = row as Record<string, unknown>;
        if (typeof item.spot_id !== "string" || !batch.includes(item.spot_id) || typeof item.concept_key !== "string" || typeof item.label !== "string" || typeof item.rank !== "number") throw new Error("mood_profile_invalid");
        if (item.concept_contributors != null && (typeof item.concept_contributors !== "number" || !Number.isSafeInteger(item.concept_contributors) || item.concept_contributors < 1)) throw new Error("mood_profile_invalid");
        if (item.evidence_state != null && item.evidence_state !== "EARLY" && item.evidence_state !== "ESTABLISHED") throw new Error("mood_profile_invalid");
        result.push({ spot_id: item.spot_id, concept_key: item.concept_key, label: item.label, rank: item.rank, concept_contributors: typeof item.concept_contributors === "number" ? item.concept_contributors : null, evidence_state: item.evidence_state === "EARLY" || item.evidence_state === "ESTABLISHED" ? item.evidence_state : undefined });
      }
      if (raw.length < 1000) break;
    }
  }
  return rankMoodSupport(result);
}


/** Community presentation order only; never changes stored scores or Decision ranking. */
export type MoodSupport = {
  concept_key: string; label: string; rank: number;
  concept_contributors?: number | null; eligible_contributors?: number | null;
  evidence_state?: "EARLY" | "ESTABLISHED";
};
export function publicMoodCount(mood: MoodSupport): number | null {
  const count = mood.concept_contributors;
  return mood.evidence_state === "ESTABLISHED" && typeof count === "number" && Number.isSafeInteger(count) && count > 0 ? count : null;
}
export function rankMoodSupport<T extends MoodSupport>(moods: readonly T[]): T[] {
  return [...moods].sort((a, b) => (publicMoodCount(b) ?? 0) - (publicMoodCount(a) ?? 0) || a.rank - b.rank || a.concept_key.localeCompare(b.concept_key));
}
export function moodCountCopy(count: number | null | undefined): string | null {
  return typeof count === "number" && Number.isSafeInteger(count) && count >= 0 ? `${count} ${count === 1 ? "Mood" : "Moods"}` : null;
}

/** Complete per-Spot counts, bounded requests; missing/failed data must never become zero. */
export async function loadMoodCounts(spotIds: readonly string[], read: (ids: string[]) => Promise<unknown>): Promise<Record<string, number>> {
  const result: Record<string, number> = {}, ids = [...new Set(spotIds)];
  for (let start = 0; start < ids.length; start += 200) {
    const batch = ids.slice(start, start + 200), rows = await read(batch);
    if (!Array.isArray(rows)) throw new Error("mood_counts_invalid");
    for (const row of rows) {
      if (!row || typeof row !== "object") throw new Error("mood_counts_invalid");
      const item = row as Record<string, unknown>;
      if (typeof item.spot_id !== "string" || !batch.includes(item.spot_id) || typeof item.mood_count !== "number" || !Number.isSafeInteger(item.mood_count) || item.mood_count < 0) throw new Error("mood_counts_invalid");
      result[item.spot_id] = item.mood_count;
    }
  }
  return result;
}
