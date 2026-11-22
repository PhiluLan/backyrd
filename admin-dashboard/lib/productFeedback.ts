export const feedbackStatuses = { new: "Neu", reviewing: "In Prüfung", done: "Erledigt" } as const;
export const feedbackSentiments = { helpful: "Ja", almost: "Fast", not_helpful: "Nein" } as const;
export const feedbackKinds = {
  understanding: "Wunschverständnis", spot_data: "Ortsinformationen", recommendation: "Vorschläge passen nicht",
  usability: "Bedienung", other: "Sonstiges",
} as const;
export type FeedbackStatus = keyof typeof feedbackStatuses;
export type FeedbackSentiment = keyof typeof feedbackSentiments;
export type FeedbackKind = keyof typeof feedbackKinds;
export function feedbackAvailabilityLabel(value: string | null): string {
  const labels: Record<string, string> = { open: "Öffnungszeit bestätigt", closed: "Zur Wunschzeit geschlossen",
    unknown: "Öffnungszeit nicht bestätigt", not_requested: "Keine Besuchszeit angefragt",
    not_authorized: "Keine freigegebenen Zeitangaben", expired: "Zeitangaben veraltet", disputed: "Zeitangaben widersprüchlich" };
  return value ? labels[value] ?? "Zeitangaben nicht eingeordnet" : "Zeitangaben fehlen";
}
export function feedbackContextLabel(value: string | null, kind: "intent" | "day_phase"): string {
  if (!value) return kind === "intent" ? "Nicht bekannt" : "Nicht angegeben";
  const labels: Record<string, string> = kind === "intent" ? {
    COFFEE: "Kaffee trinken", EAT: "Essen gehen", FOOD: "Essen gehen", DRINK: "Etwas trinken", DRINKS: "Etwas trinken",
    STAY: "Übernachten", CULTURE: "Kultur erleben", ACTIVITY: "Etwas unternehmen", SPORT: "Sport und Bewegung",
    NIGHTLIFE: "Ausgehen", WELLNESS: "Entspannen",
  } : { MORNING: "Morgens", MIDDAY: "Mittags", NOON: "Mittags", AFTERNOON: "Nachmittags", EVENING: "Abends", NIGHT: "Nachts" };
  return labels[value.toUpperCase()] ?? "Nicht näher eingeordnet";
}
export type FeedbackRow = {
  id: string; surface: string; sentiment: FeedbackSentiment; message: string | null; created_at: string;
  review_status: FeedbackStatus; issue_kind: FeedbackKind | null; issue_ref: string;
};
export type FeedbackSummary = Record<"total" | FeedbackStatus | FeedbackSentiment, number>;
export type FeedbackPage = { rows: FeedbackRow[]; summary: FeedbackSummary; page_size: number };
type Review = { status: FeedbackStatus; kind: FeedbackKind | null; note: string; issue_ref: string };
export type FeedbackDetail = {
  feedback: FeedbackRow & {
    internal_note: string; review_revision: number; reviewed_at: string | null; decision_id: string | null;
    client_context: { platform: string | null; app_version: string | null; update_id: string | null };
    decision_context: null | {
      city: string | null; intent: string | null; day_phase: string | null; candidate_count: number;
      ranking_version: string | null; ranked_candidates: { name: string | null; tier: string | null; availability: string | null }[];
    };
  };
  history: { revision: number; actor_id: string | null; before_review: Review; after_review: Review; created_at: string }[];
};

function record(value: unknown): Record<string, unknown> {
  if (!value || typeof value !== "object" || Array.isArray(value)) throw new Error("feedback_response_invalid");
  return value as Record<string, unknown>;
}
function text(value: unknown): string { if (typeof value !== "string") throw new Error("feedback_response_invalid"); return value; }
function nullableText(value: unknown): string | null { return value === null ? null : text(value); }
function integer(value: unknown): number {
  if (typeof value !== "number" || !Number.isSafeInteger(value) || value < 0) throw new Error("feedback_response_invalid");
  return value;
}
function choice<T extends string>(value: unknown, choices: Record<T, string>): T {
  if (typeof value !== "string" || !Object.hasOwn(choices, value)) throw new Error("feedback_response_invalid");
  return value as T;
}
function array(value: unknown): unknown[] { if (!Array.isArray(value)) throw new Error("feedback_response_invalid"); return value; }
function row(value: unknown): FeedbackRow {
  const v = record(value);
  return { id: text(v.id), surface: text(v.surface), sentiment: choice(v.sentiment, feedbackSentiments),
    message: nullableText(v.message), created_at: text(v.created_at), review_status: choice(v.review_status, feedbackStatuses),
    issue_kind: v.issue_kind === null ? null : choice(v.issue_kind, feedbackKinds), issue_ref: text(v.issue_ref) };
}
function review(value: unknown): Review {
  const v = record(value);
  return { status: choice(v.status, feedbackStatuses), kind: v.kind === null ? null : choice(v.kind, feedbackKinds), note: text(v.note), issue_ref: text(v.issue_ref) };
}
export function parseFeedbackPage(value: unknown): FeedbackPage {
  const v = record(value), s = record(v.summary);
  return { rows: array(v.rows).map(row), page_size: integer(v.page_size), summary: {
    total: integer(s.total), new: integer(s.new), reviewing: integer(s.reviewing), done: integer(s.done),
    helpful: integer(s.helpful), almost: integer(s.almost), not_helpful: integer(s.not_helpful),
  } };
}
export function parseFeedbackDetail(value: unknown): FeedbackDetail {
  const v = record(value), f = record(v.feedback), client = record(f.client_context);
  const context = f.decision_context === null ? null : record(f.decision_context);
  return {
    feedback: { ...row(f), internal_note: text(f.internal_note), review_revision: integer(f.review_revision),
      reviewed_at: nullableText(f.reviewed_at), decision_id: nullableText(f.decision_id),
      client_context: { platform: nullableText(client.platform), app_version: nullableText(client.app_version), update_id: nullableText(client.update_id) },
      decision_context: context === null ? null : {
        city: nullableText(context.city), intent: nullableText(context.intent), day_phase: nullableText(context.day_phase),
        candidate_count: integer(context.candidate_count), ranking_version: nullableText(context.ranking_version),
        ranked_candidates: array(context.ranked_candidates).map(item => { const c = record(item); return { name: nullableText(c.name), tier: nullableText(c.tier), availability: nullableText(c.availability) }; }),
      },
    },
    history: array(v.history).map(item => { const h = record(item); return {
      revision: integer(h.revision), actor_id: nullableText(h.actor_id), created_at: text(h.created_at),
      before_review: review(h.before_review), after_review: review(h.after_review),
    }; }),
  };
}
export function feedbackError(error: unknown): string {
  const e = error && typeof error === "object" ? error as Record<string, unknown> : {};
  const message = typeof e.message === "string" ? e.message : "";
  if (e.code === "40001" || message.includes("feedback_review_conflict")) return "Dieser Eintrag wurde inzwischen geändert. Deine Eingaben bleiben erhalten. Lade den aktuellen Stand, bevor du erneut speicherst.";
  if (e.code === "42501") return "Dafür brauchst du eine gültige Admin-Sitzung. Bitte melde dich erneut an.";
  if (e.code === "P0002") return "Diese Rückmeldung ist nicht mehr verfügbar.";
  if (e.code === "PGRST202" || e.code === "42883") return "Der Feedback-Eingang ist auf diesem Server noch nicht freigeschaltet. Die zugehörige Datenbankmigration fehlt.";
  if (message.includes("feedback_review_invalid")) return "Bitte prüfe die Eingaben. Zum Erledigen ist eine kurze Notiz erforderlich.";
  return "Das hat nicht geklappt. Bitte prüfe die Verbindung und versuche es erneut.";
}
export function reviewValidation(status: FeedbackStatus, note: string, issueRef: string): string | null {
  if (status === "done" && !note.trim()) return "Bitte halte kurz fest, warum die Rückmeldung erledigt ist.";
  if (note.trim().length > 2000 || issueRef.trim().length > 120) return "Die Notiz oder Ticket-Referenz ist zu lang.";
  return null;
}
