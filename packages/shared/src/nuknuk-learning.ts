/** Admin authoring contract. This is not a consumer Decision contract. */
export const LEARNING_VERSION = "backyrd.nuknuk-learning@1" as const;
export const learningTopics = {
  everyday: "Alltag",
  family: "Familie & Personen",
  food: "Essen & Ernährung",
  budget: "Budget",
  time: "Zeit & Wege",
  access: "Barrierefreiheit",
  logic: "Alternativen & Ausschlüsse",
  dialogue: "Offene Wünsche & Dialog",
} as const;
export const learningStates = {
  draft: "Entwurf",
  review: "Bitte prüfen",
  approved: "Freigegeben",
  blocked: "Unklar",
  rejected: "Verworfen",
} as const;
export const learningSplits = {
  TRAIN: "Lernbestand",
  DEV: "Entwicklungsprüfung",
  TEST: "Unabhängige Abschlussprüfung",
} as const;
export type LearningTopic = keyof typeof learningTopics;
export type LearningState = keyof typeof learningStates;
export type LearningSplit = keyof typeof learningSplits;
export type LearningDocument = {
  query: string;
  notes: string;
  obligations: string[];
  forbidden: string[];
  tags: string[];
  locale: "de" | "de-CH";
  reference: { now: string; timezone: "Europe/Zurich" };
  source: "authored" | "synthetic" | "feedback_redacted";
  dataPolicy: "SYNTHETIC_OR_REDACTED";
};
export type LearningCase = {
  id: string;
  family_id: string;
  parent_id: string | null;
  revision: number;
  state: LearningState;
  document: LearningDocument;
  target: Record<string, unknown> | null;
  target_policy: string | null;
  approval_hash: string | null;
  approved_by: string | null;
  updated_at: string;
  family_title: string;
  topic: LearningTopic;
  split: LearningSplit;
};
export type LearningEvent = {
  id: number;
  case_id: string;
  actor_id: string | null;
  event: string;
  revision: number;
  note: string;
  created_at: string;
};
export type LearningRun = {
  id: string;
  title: string;
  kind: "TRAIN_DEV" | "TEST";
  state: "prepared" | "exported" | "reported";
  manifest_hash: string;
  created_at: string;
  report: Record<string, unknown> | null;
  case_count: number;
  adapter_hash: string | null;
};
export const isRecord = (v: unknown): v is Record<string, unknown> =>
  !!v && typeof v === "object" && !Array.isArray(v);
const text = (v: unknown, max: number, min = 0): v is string =>
  typeof v === "string" && v.trim().length >= min && v.length <= max;
const lines = (v: unknown, max = 30): v is string[] =>
  Array.isArray(v) && v.length <= max && v.every((x) => text(x, 500, 1));
export function parseLearningDocument(v: unknown): LearningDocument {
  if (
    !isRecord(v) ||
    !text(v.query, 2000, 3) ||
    !text(v.notes, 2000) ||
    !lines(v.obligations) ||
    !lines(v.forbidden) ||
    !lines(v.tags, 12) ||
    !["de", "de-CH"].includes(String(v.locale)) ||
    !isRecord(v.reference) ||
    v.reference.timezone !== "Europe/Zurich" ||
    !text(v.reference.now, 40) ||
    !/^\d{4}-\d{2}-\d{2}T/.test(v.reference.now) ||
    !Number.isFinite(Date.parse(v.reference.now)) ||
    !["authored", "synthetic", "feedback_redacted"].includes(
      String(v.source),
    ) ||
    v.dataPolicy !== "SYNTHETIC_OR_REDACTED"
  )
    throw Error("learning_document_invalid");
  const allowed = [
    "query",
    "notes",
    "obligations",
    "forbidden",
    "tags",
    "locale",
    "reference",
    "source",
    "dataPolicy",
  ];
  if (
    Object.keys(v).some((k) => !allowed.includes(k)) ||
    Object.keys(v.reference).some((k) => !["now", "timezone"].includes(k))
  )
    throw Error("learning_document_invalid");
  return v as LearningDocument;
}
export function parseLearningCase(v: unknown): LearningCase {
  if (
    !isRecord(v) ||
    !text(v.id, 36, 36) ||
    !text(v.family_id, 36, 36) ||
    !Number.isSafeInteger(v.revision) ||
    Number(v.revision) < 1 ||
    !Object.hasOwn(learningStates, String(v.state)) ||
    !Object.hasOwn(learningTopics, String(v.topic)) ||
    !Object.hasOwn(learningSplits, String(v.split)) ||
    !text(v.family_title, 160, 1) ||
    !text(v.updated_at, 50) ||
    !Number.isFinite(Date.parse(v.updated_at)) ||
    (v.target !== null && !isRecord(v.target)) ||
    (v.approval_hash !== null && !text(v.approval_hash, 64, 64))
  )
    throw Error("learning_case_invalid");
  parseLearningDocument(v.document);
  return v as LearningCase;
}
export function learningError(e: unknown): string {
  const code = isRecord(e) ? e.code : undefined;
  if (code === "40001")
    return "Zwischenzeitlich geändert. Deine Eingaben bleiben erhalten. Lade den aktuellen Stand, bevor du sie erneut speicherst.";
  if (code === "42501") return "Dafür brauchst du eine gültige Admin-Sitzung.";
  const message = isRecord(e) && typeof e.message === "string" ? e.message : "";
  const known: Record<string, string> = {
    learning_run_approval_withdrawn:
      "Eine Freigabe in diesem Paket wurde geändert oder zurückgezogen. Prüfe die betroffenen Situationen und bereite ein neues Paket vor.",
    learning_train_and_dev_required:
      "Für ein Lernpaket brauchst du mindestens eine freigegebene Lernfamilie und eine getrennte Entwicklungsfamilie.",
    learning_translation_required:
      "Vor der Freigabe muss die erwartete Bedeutung vorbereitet und geprüft werden.",
    learning_test_candidate_required:
      "Die Abschlussprüfung braucht einen bereits eingefrorenen Modellkandidaten.",
    learning_test_already_opened_for_candidate:
      "Dieser Kandidat wurde bereits an eine Abschlussprüfung gebunden. Nutze keine wiederholten Tests zur Optimierung.",
    learning_run_empty_or_too_large:
      "Es gibt keinen geeigneten freigegebenen Bestand oder das Paket überschreitet die Grenze von 2’000 Fassungen. Bereits geöffnete Abschlussfamilien gelten nicht mehr als frisch.",
    learning_document_invalid:
      "Bitte prüfe den Wunsch, die einzelnen Aussagen und die Bezugszeit. Eine Aussage darf höchstens 500 Zeichen enthalten.",
  };
  if (code === "22023" && Object.hasOwn(known, message)) return known[message];
  if (code === "54000")
    return "Das KI-Limit ist erreicht. Bitte später erneut versuchen.";
  if (code === "23505")
    return "Diese Formulierung existiert bereits. Nutze die bestehende Situation und ihre Familie.";
  if (code === "PGRST202" || code === "42P01")
    return "Die Lernwerkstatt ist auf diesem Backend noch nicht eingerichtet. Es wurde nichts als gespeichert bestätigt.";
  return "Das hat nicht geklappt. Deine Eingaben bleiben erhalten. Prüfe die Angaben und versuche es erneut.";
}
const familyLabels: Record<string, string> = {
  "people.role": "Rolle",
  "people.relationship": "Beziehung",
  "people.participation": "Teilnahme",
  "people.count": "Personenzahl",
  "people.age": "Alter",
  "experience.activity": "Vorhaben",
  "experience.occasion": "Anlass",
  "food.meal": "Essen",
  "food.diet": "Ernährung",
  "food.dish": "Gericht",
  "food.drink": "Getränk",
  "offer.area": "Bereich",
  "offer.kind": "Angebotsart",
  "time.date": "Datum",
  "time.day_phase": "Tageszeit",
  "time.clock_start": "Beginn",
  "time.duration": "Zeitbudget",
  "budget.maximum": "Preisgrenze",
  "budget.scope": "Preis gilt für",
  "location.destination": "Zielort",
  "participation.accessibility": "Zugang",
};
const values: Record<string, string> = {
  REQUIRED: "Pflicht",
  PREFERRED: "Wunsch",
  CONTEXT: "Kontext",
  EXCLUDED: "Ausgeschlossen",
  NOT_REQUIRED: "Nicht nötig",
  self: "anfragende Person",
  recipient: "Geschenkempfänger/in",
  daughter: "Tochter",
  father: "Vater",
  brother: "Bruder",
  sister: "Schwester",
  other: "andere Person",
  adult_accompanied: "mit erwachsener Begleitung",
  PER_PERSON: "pro Person",
  GROUP_TOTAL: "ganze Gruppe",
  EVENING: "abends",
  AFTERNOON: "nachmittags",
  indoor: "drinnen",
  outdoor: "draussen",
  coffee: "Kaffee",
  swimming: "Schwimmen",
  vegetarian: "vegetarisch",
  vegan: "vegan",
  lactose_free: "laktosefrei",
  meal: "essen",
  dinner: "Abendessen",
  YEARS: "Jahre",
  PEOPLE: "Personen",
  MINUTES: "Minuten",
  TRAVEL: "Fahrt",
  AVAILABLE_TOTAL: "insgesamt verfügbare Zeit",
  RAIN: "Regen",
  DRY: "trocken",
  EQ: "genau",
  LTE: "höchstens",
  GTE: "mindestens",
  SAME_PLACE: "am selben Ort",
  SEQUENCE: "in dieser Reihenfolge",
  ALL: "alles zusammen",
  ANY: "eine dieser Möglichkeiten",
  IF: "wenn/dann",
  FACT: "Anforderung",
  CONDITIONAL: "Wenn-Bedingung",
};
export const learningLabel = (v: string): string => values[v] ?? v;
export function learningLocalTime(instant: string): string {
  const parts = new Intl.DateTimeFormat("en-GB", {
    timeZone: "Europe/Zurich",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    hourCycle: "h23",
  }).formatToParts(new Date(instant));
  const part = (key: string) => parts.find((p) => p.type === key)?.value;
  return `${part("year")}-${part("month")}-${part("day")}T${part("hour")}:${part("minute")}`;
}
/** At the autumn overlap select the first occurrence; invalid spring times fail. */
export function learningReferenceTime(local: string): string {
  if (!/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}$/.test(local))
    throw Error("learning_reference_invalid");
  const nominal = Date.parse(local + "Z");
  const matches = [nominal - 7200000, nominal - 3600000].filter(
    (t) =>
      Number.isFinite(t) &&
      learningLocalTime(new Date(t).toISOString()) === local,
  );
  if (!matches.length) throw Error("learning_reference_invalid");
  return new Date(matches[0]).toISOString();
}
/** Derived from the actual executable target; never an independently generated explanation. */
export function targetCards(
  target: Record<string, unknown> | null,
): { title: string; facts: string[] }[] {
  if (!target || !isRecord(target.meaning)) return [];
  const factNames = new Map<string, string>();
  const m = target.meaning,
    entities = Array.isArray(m.entities) ? m.entities.filter(isRecord) : [];
  const label = (id: string): string => {
    const index = entities.findIndex((x) => x.id === id),
      e = entities[index];
    if (!e) return id;
    const prefix =
      e.kind === "PERSON"
        ? "Person"
        : e.kind === "GROUP"
          ? "Gruppe"
          : "Aktivität";
    return typeof e.label === "string" && !/^[apg]\d+$/.test(e.label)
      ? e.label
      : `${prefix} ${index + 1}`;
  };
  const result = entities.map((e) => ({
    title: label(String(e.id)),
    facts:
      Array.isArray(e.members) && e.members.length
        ? [`Mitglieder: ${e.members.map(String).map(label).join(", ")}`]
        : ([] as string[]),
  }));
  const keyNames: Record<string, string> = {
    text: "Bedeutung",
    amount: "Wert",
    operator: "Grenze",
    unit: "Einheit",
    currency: "Währung",
    scope: "Gilt für",
    date: "Datum",
    time: "Zeit",
    phase: "Tageszeit",
    timezone: "Zeitzone",
    measurementScope: "Zeitbezug",
    includes: "Enthält",
    kind: "Verknüpfung",
    factIds: "Anforderungen",
    subjectIds: "Bezug",
    relatedIds: "Bezug",
    description: "Hinweis",
    conditionFactId: "Bedingung",
    factId: "Anforderung",
    then: "Dann",
    else: "Sonst",
    children: "Zusammen",
    options: "Möglichkeiten",
    state: "Wetter",
    role: "Rolle",
  };
  const display = (v: unknown): string =>
    Array.isArray(v)
      ? v.map(display).join(", ")
      : isRecord(v)
        ? Object.entries(v)
            .map(([k, x]) => `${keyNames[k] ?? k}: ${display(x)}`)
            .join(" · ")
        : entities.some((e) => e.id === v)
          ? label(String(v))
          : (factNames.get(String(v)) ?? learningLabel(String(v)));
  for (const fact of Array.isArray(m.facts) ? m.facts : [])
    if (isRecord(fact)) {
      const ids = Array.isArray(fact.subjectIds)
        ? fact.subjectIds.map(String)
        : [];
      result.push({
        title: `${learningLabel(String(fact.modality))} · ${familyLabels[String(fact.key)] ?? String(fact.key)}`,
        facts: [
          `${ids.length ? ids.map(label).join(", ") : "Kein spezifischer Bezug angegeben"}: ${display(fact.value)}`,
          fact.basis === "INFERRED"
            ? "Vom Modell abgeleitet; bitte besonders prüfen."
            : "Als ausdrücklich genannt eingeordnet.",
        ],
      });
    }
  if (Array.isArray(m.facts))
    for (const f of m.facts)
      if (isRecord(f) && typeof f.id === "string")
        factNames.set(
          f.id,
          `${familyLabels[String(f.key)] ?? f.key}: ${display(f.value)} · ${Array.isArray(f.subjectIds) && f.subjectIds.length ? f.subjectIds.map(String).map(label).join(", ") : "Bezug nicht angegeben"}`,
        );
  if (Array.isArray(m.weatherConditions))
    for (const w of m.weatherConditions)
      if (isRecord(w) && typeof w.id === "string")
        factNames.set(w.id, learningLabel(String(w.state)));
  for (const key of [
    "logic",
    "bindings",
    "extensions",
    "uncertainties",
    "weatherConditions",
  ]) {
    const v = m[key];
    if (v && (!Array.isArray(v) || v.length))
      result.push({
        title:
          {
            logic: "Bedingungen & Alternativen",
            bindings: "Reihenfolge & Zusammengehörigkeit",
            extensions: "Weitere Anforderungen",
            uncertainties: "Offen",
            weatherConditions: "Wetterbedingungen",
          }[key] ?? key,
        facts: [display(v)],
      });
  }
  if (target.clarification)
    result.push({ title: "Rückfrage", facts: [display(target.clarification)] });
  return result;
}
