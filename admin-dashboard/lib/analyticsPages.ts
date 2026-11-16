export interface AnalyticsPageRow {
  route: string;
  label: string;
  surface: "App" | "Web";
  views: number;
  users: number;
}

export interface AnalyticsPageViews {
  views: number;
  viewers: number;
  daily: { day: string; views: number }[];
  pages: AnalyticsPageRow[];
}

const labels: Record<string, string> = {
  home: "Startseite", feed: "Entdecken", map: "Karte", wohin: "Wohin?", decision: "Wohin?",
  places: "Orte", moments: "Momente", "moments/:id": "Moment", "moment/:id": "Moment",
  "spots/:id": "Spotdetail", "spot/:id": "Spotdetail", search: "Suche", discover: "Entdecken",
  events: "Veranstaltungen", "events/:id": "Veranstaltungsdetail", booking: "Reservieren",
  profile: "Profil", settings: "Einstellungen", favorites: "Merkliste", "spot/new": "Spot hinzufügen",
  "review/new": "Bewertung schreiben", "new-spot": "Spot hinzufügen", journey: "Momente",
};

const isRecord = (value: unknown): value is Record<string, unknown> => !!value && typeof value === "object" && !Array.isArray(value);
const isCount = (value: unknown): value is number => typeof value === "number" && Number.isSafeInteger(value) && value >= 0;

export function parsePageViews(value: unknown): AnalyticsPageViews | null {
  if (!isRecord(value) || !isRecord(value.kpis) || !isCount(value.kpis.screen_views) || !isCount(value.kpis.viewers)
    || !Array.isArray(value.daily) || !Array.isArray(value.pages)) return null;
  const daily: AnalyticsPageViews["daily"] = [];
  for (const row of value.daily) {
    if (!isRecord(row) || typeof row.day !== "string" || !/^\d{4}-\d{2}-\d{2}(?:T.*)?$/.test(row.day)
      || !Number.isFinite(Date.parse(row.day)) || !isCount(row.screen_views)) return null;
    daily.push({ day: row.day.slice(0, 10), views: row.screen_views });
  }

  const pages: AnalyticsPageRow[] = [];
  for (const row of value.pages) {
    if (!isRecord(row) || typeof row.screen_name !== "string" || !isCount(row.views) || !isCount(row.users)) return null;
    const isWeb = row.screen_name.startsWith("web:/");
    const key = isWeb ? row.screen_name.slice(5) || "home" : row.screen_name;
    if (!Object.hasOwn(labels, key)) continue;
    pages.push({ route: key, label: labels[key], surface: isWeb ? "Web" : "App", views: row.views, users: row.users });
  }
  return { views: value.kpis.screen_views, viewers: value.kpis.viewers, daily, pages };
}
