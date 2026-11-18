export const spotCrawlerCategories = {
  RESTAURANT: "Restaurants", CAFE: "Cafés", BAR: "Bars", NIGHTCLUB: "Clubs",
} as const;

export const spotCrawlerDistricts = ["Basel", "Altstadt", "Kleinbasel", "Gundeldingen", "St. Johann", "Matthäus", "Clara", "St. Alban", "Breite", "Iselin", "Bachletten", "Bruderholz"] as const;
export type CrawlerCategory = keyof typeof spotCrawlerCategories;
export type CrawlerDistrict = typeof spotCrawlerDistricts[number];
export type CrawlerSettings = {
  categories: CrawlerCategory[];
  districts: CrawlerDistrict[];
  limit: number;
  searches: number;
  schedule: "MANUAL" | "DAILY" | "WEEKLY";
  time: string;
  monthBudgetCents: number;
};
export type SavedCrawlerSettings = CrawlerSettings & { revision: string };

export function parseCrawlerSettings(input: unknown): CrawlerSettings | null {
  if (!input || typeof input !== "object" || Array.isArray(input)) return null;
  const { categories, districts, limit, searches, schedule, time, monthBudgetCents } = input as Record<string, unknown>;
  if (!Array.isArray(categories) || !categories.length || categories.length > 4
    || categories.some(category => typeof category !== "string" || !Object.hasOwn(spotCrawlerCategories, category))
    || !Array.isArray(districts) || !districts.length || districts.length > spotCrawlerDistricts.length
    || districts.some(district => !spotCrawlerDistricts.includes(district))
    || typeof limit !== "number" || ![10, 20, 30, 40, 50].includes(limit)
    || typeof searches !== "number" || !Number.isInteger(searches) || searches < 2 || searches > 24
    || (schedule !== "MANUAL" && schedule !== "DAILY" && schedule !== "WEEKLY")
    || typeof time !== "string" || !/^(?:[01]\d|2[0-3]):(?:00|15|30|45)$/u.test(time)
    || typeof monthBudgetCents !== "number" || !Number.isInteger(monthBudgetCents)
    || monthBudgetCents < 0 || monthBudgetCents > 10000) return null;

  return { categories: [...new Set(categories)], districts: [...new Set(districts)], limit, searches, schedule, time, monthBudgetCents };
}

export function sameCrawlerSettings(first: CrawlerSettings, second: CrawlerSettings): boolean {
  return first.limit === second.limit && first.searches === second.searches
    && first.schedule === second.schedule && first.time === second.time
    && first.monthBudgetCents === second.monthBudgetCents
    && first.categories.length === second.categories.length
    && first.categories.every(category => second.categories.includes(category))
    && first.districts.length === second.districts.length
    && first.districts.every(district => second.districts.includes(district));
}

export type CrawlerFacts = {
  external_id: string; name: string; category: CrawlerCategory;
  address: string; lat: number; lng: number; website?: string;
  phone?: string; email?: string; hours?: string; price_hint?: string; source_url: string; observed_at: string; coordinates_source?: string;
  origin?: "OVERTURE";
  basics?: CrawlerBasics;
};

export type CrawlerBasics = {
  state: "CHECKED" | "SOURCE_MISSING" | "SOURCE_UNAVAILABLE" | "INSUFFICIENT_IDENTITY" | "TIME_LIMIT";
  website?: string;
  email?: string;
  phone?: string;
  fullHours?: ReadonlyArray<{ readonly day: string; readonly intervals: ReadonlyArray<{ readonly start: string; readonly end: string }> }>;
  fixedAdmission?: number;
  proposals: ReadonlyArray<{ attributeKey: string; url: string; evidence: string; review: boolean }>;
  braveCalls: number;
  aiCalls: number;
  estimatedUsd: number | null;
};
export type CrawlerRunUsage = { webSearches: number | null; enrichmentSearches: number; aiCalls: number; estimatedUsd: number | null; searchedWithWeb: boolean };

export type CrawlerCandidate = {
  source_id: number;
  facts: CrawlerFacts;
  state: "NEW" | "MATCHED" | "REVIEW" | "MISSING";
  review_state: "OPEN" | "REVIEWED" | "DISMISSED" | "EXISTING" | "IMPORTED";
  review_fingerprint: string;
  review_revision: string;
  category_id: string | null;
  imported_spot_id: string | null;
  can_confirm_distinct?: boolean;
  research_status?: "QUEUED" | "RUNNING" | "READY_FOR_REVIEW" | "FAILED" | null;
  spots: { id: string; name: string; address: string | null; distance_m: number }[];
};

export type CrawlerView = "open" | "hold" | "history";

export function isOpenCrawlerCandidate(row: CrawlerCandidate): boolean {
  return !row.imported_spot_id && (row.review_state === "OPEN" || row.review_state === "REVIEWED")
    && (row.state === "NEW" || (row.state === "REVIEW" && row.can_confirm_distinct === true));
}

export function isCrawlerCandidateVisible(row: CrawlerCandidate, view: CrawlerView): boolean {
  const open = isOpenCrawlerCandidate(row);
  if (view === "history") return !open;
  return open && (view === "hold" ? row.review_state === "REVIEWED" : row.review_state !== "REVIEWED");
}

export type CrawlerOverview = {
  rows: CrawlerCandidate[]; next_after: number | null;
  runs: {id: number; status: "FETCHING" | "COMPLETE" | "FAILED"; started_at: string;
    source_count: number | null; outcome: string | null; usage?: CrawlerRunUsage}[];
};
