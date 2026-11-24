/** Human reading view generated from the same executable targets. */
const names = {
  "experience.activity": "Aktivität",
  "offer.kind": "Ortstyp",
  "food.drink": "Getränk",
  "food.meal": "Essen",
  "food.dish": "Speise",
  "food.diet": "Ernährung",
  "food.cuisine": "Küche",
  "offer.area": "Bereich",
  "people.role": "Personenrolle",
  "people.relationship": "Beziehung und Begleitung",
  "people.age": "Alter",
  "people.count": "Personenzahl",
  "people.participation": "Teilnahme",
  "people.mobility_aid": "Hilfsmittel",
  "people.experience": "Erfahrung",
  "people.pet": "Mitgebrachtes Tier",
  "budget.maximum": "Preisgrenze",
  "budget.scope": "Preisbasis",
  "budget.coverage": "Kostenumfang",
  "budget.qualitative": "Preiswunsch",
  "time.date": "Besuchstag",
  "time.date_start": "Frühester Tag",
  "time.date_end": "Spätester Tag",
  "time.day_phase": "Tageszeit",
  "time.clock_start": "Startzeit",
  "time.clock_end": "Endzeit",
  "time.duration": "Zeitbudget",
  "time.reference": "Zeitlicher Kontext",
  "time.relation": "Zeitlicher Bezug",
  "time.special": "Besonderer Besuchstag",
  "time.duration_quality": "Dauerhinweis",
  "location.destination": "Zielort",
  "location.proximity": "Nähe zu",
  "location.distance": "Entfernung",
  "location.return": "Rückkehrziel",
  "travel.mode": "Anreise",
  "atmosphere.character": "Atmosphäre",
  "atmosphere.noise": "Lautstärke",
  "atmosphere.conversation": "Gesprächsmöglichkeit",
  "atmosphere.music": "Musik",
  "atmosphere.privacy": "Privatsphäre",
  "experience.character": "Erlebnischarakter",
  "experience.occasion": "Anlass",
  "experience.purpose": "Zweck",
  "participation.accessibility": "Zugang",
  "participation.booking": "Buchung",
  "participation.permission": "Erlaubnis",
  "participation.subscription": "Mitgliedschaft",
  "participation.format": "Format",
  "participation.group_access": "Einzel- oder Gruppenzugang",
  "condition.children": "Kindererlebnis",
  "condition.weather_protection": "Wetterschutz",
  "offer.weather_suitability": "Wettertauglichkeit",
  "offer.facility": "Einrichtung",
  "offer.feature": "Ausstattung",
  "offer.service": "Service",
  "offer.shade": "Schatten",
  "offer.equipment_source": "Ausrüstung",
};
const values = {
  self: "anfragende Person",
  recipient: "Empfängerperson",
  daughter: "Tochter",
  son: "Sohn",
  child: "Kind",
  children: "Kinder",
  mother: "Mutter",
  father: "Vater",
  sister: "Schwester",
  brother: "Bruder",
  wife: "Ehefrau",
  partner: "Partnerperson",
  "female friend": "Freundin",
  "male friend": "Freund",
  friends: "Freunde",
  aunt: "Tante",
  uncle: "Onkel",
  grandmother: "Grossmutter",
  grandfather: "Grossvater",
  adult_accompanied: "mit Erwachsenenbegleitung",
  unaccompanied: "ohne Begleitung",
  alone: "allein",
  indoor: "drinnen",
  outdoor: "draussen",
  terrace: "Terrasse",
  cozy: "gemütlich",
  quiet: "ruhig",
  lively: "lebhaft",
  romantic: "romantisch",
  coffee: "Kaffee",
  tea: "Tee",
  meal: "Essen",
  breakfast: "Frühstück",
  snacks: "Snack",
  drinks: "etwas trinken",
  BEER: "Bier",
  WINE: "Wein",
  COFFEE: "Kaffee",
  cinema: "Kinobesuch",
  bowling: "Bowling",
  bouldering: "Bouldern",
  swimming: "Schwimmen",
  walking: "Spazierengehen",
  ceramics_course: "Töpferkurs",
  exhibition: "Ausstellung",
  children_activity: "passendes Kindererlebnis",
  vegan: "vegan",
  vegetarian: "vegetarisch",
  gluten_free: "glutenfrei",
  peanut_free: "erdnussfrei",
  conversation_possible: "Unterhaltung gut möglich",
  wheelchair_accessible: "rollstuhlgängig",
  step_free: "stufenlos",
  spontaneous: "spontaner Zugang ohne Voranmeldung",
  public_day_access: "Tageszugang ohne Übernachtung",
  own_food: "eigenes Essen mitbringen dürfen",
  dogs_allowed: "Hund mitnehmen dürfen",
  GROUP_TOTAL: "für die ganze Gruppe",
  PER_PERSON: "pro Person",
  PER_CHILD: "pro Kind",
  UNSPECIFIED: "nicht angegeben",
  VISIT: "Besuch vor Ort",
  AVAILABLE_TOTAL: "gesamte verfügbare Zeit",
  ACTIVITY: "Aktivität",
  TRAVEL: "Anreise",
  RETURN: "Rückkehr",
  MORNING: "Morgen",
  MIDDAY: "Mittag",
  AFTERNOON: "Nachmittag",
  EVENING: "Abend",
  NIGHT: "Nacht",
  RAIN: "Regen",
  SNOW: "Schnee",
  SUN: "Sonne",
  HEAT: "Hitze",
  UNSUITABLE: "ungeeignetes Wetter",
  on_foot: "zu Fuss",
  public_transport: "mit dem ÖV",
  bicycle: "mit dem Velo",
  entry_only: "nur Eintritt",
  activity_only: "nur die Aktivität",
  on_site_only: "nur Kosten vor Ort",
};
const t = (v) => values[v] ?? String(v);
const mode = {
  REQUIRED: "Pflicht",
  PREFERRED: "Wunsch",
  EXCLUDED: "Ausgeschlossen",
  NOT_REQUIRED: "Nicht erforderlich",
  CONTEXT: "Kontext",
};
const op = {
  EQ: "genau",
  LTE: "höchstens",
  LT: "weniger als",
  GTE: "mindestens",
  GT: "mehr als",
  NEQ: "nicht",
  APPROX: "ungefähr",
};
function value(v) {
  if ("text" in v) return t(v.text);
  if ("scope" in v) return t(v.scope);
  if ("date" in v) return `${op[v.operator]} ${v.date}`;
  if ("time" in v) return `${op[v.operator]} ${v.time} Uhr`;
  if ("phase" in v) return t(v.phase);
  if ("amount" in v)
    return `${op[v.operator]} ${v.amount} ${v.currency ? t(v.currency) : v.unit === "YEARS" ? "Jahre" : v.unit === "PEOPLE" ? "Personen" : v.unit === "METERS" ? "Meter" : v.unit === "MINUTES" ? "Minuten" : t(v.unit)}${v.measurementScope ? " · Bezug: " + t(v.measurementScope) : ""}${v.includes?.length ? " · einschliesslich " + v.includes.map(t).join(", ") : ""}`;
  return JSON.stringify(v);
}
export function meaningReading(m) {
  const entityNames = new Map(
    (m.entities ?? []).map((e) => {
      const role = m.facts.find(
        (f) =>
          ["people.role", "people.relationship"].includes(f.key) &&
          f.subjectIds.includes(e.id),
      );
      const a = m.facts.find(
        (f) =>
          [
            "experience.activity",
            "offer.kind",
            "food.meal",
            "food.drink",
            "food.dish",
          ].includes(f.key) && f.subjectIds.includes(e.id),
      );
      return [
        e.id,
        role
          ? t(role.value.text)
          : a
            ? t(a.value.text)
            : e.kind === "GROUP"
              ? "genannte Gruppe"
              : e.kind === "PERSON"
                ? "genannte Person"
                : `Aktivität ${e.id}`,
      ];
    }),
  );
  const factNames = new Map(
    m.facts.map((f) => [f.id, `${names[f.key] ?? f.key}: ${value(f.value)}`]),
  );
  const lines = m.facts.map(
    (f) =>
      `- **${mode[f.modality]}:** ${names[f.key] ?? f.key} – ${value(f.value)}${f.subjectIds.length ? " · für " + f.subjectIds.map((id) => entityNames.get(id) ?? id).join(", ") : ""}${f.basis === "INFERRED" ? " (abgeleitet nach Produktregel)" : ""}`,
  );
  const logic = (n) =>
    !n
      ? ""
      : n.kind === "FACT"
        ? (factNames.get(n.factId) ?? n.factId)
        : n.kind === "IF"
          ? `Wenn ${t(m.weatherConditions.find((w) => w.id === n.conditionFactId)?.state ?? "Bedingung")}: ${logic(n.then)}; sonst: ${logic(n.else)}`
          : n.kind === "FALLBACK"
            ? n.options.map(logic).join(" → nur falls nicht möglich: ")
            : n.children.map(logic).join(n.kind === "ANY" ? " ODER " : " UND ");
  if (m.logic) lines.push("- **Verknüpfung:** " + logic(m.logic));
  for (const b of m.bindings ?? [])
    lines.push(
      `- **${b.kind === "SAME_PLACE" ? "Am selben Ort" : b.kind === "SEQUENCE" ? "In dieser Reihenfolge" : "Gleichzeitig"}:** ${b.factIds.map((id) => factNames.get(id) ?? id).join(" → ")}`,
    );
  for (const w of m.weatherConditions ?? [])
    lines.push(
      `- **Wetter ${w.role === "CONDITIONAL" ? "als Bedingung" : "als Nutzerkontext"}:** ${t(w.state)}${w.detail ? " · " + w.detail : ""}`,
    );
  for (const e of m.extensions ?? [])
    lines.push(
      `- **${mode[e.modality]} · zusätzliche Anforderung:** ${e.description}`,
    );
  for (const u of m.uncertainties ?? [])
    lines.push("- **Offen:** " + u.description);
  return lines.join("\n");
}
export function wholeReading(rows) {
  const labels = {
    TRAIN: "Lernbestand",
    DEV: "Entwicklungsprüfung",
    TEST: "Abschlussprüfung",
  };
  const ordered = [...rows].sort(
    (a, b) =>
      a.split.localeCompare(b.split) ||
      a.theme.localeCompare(b.theme) ||
      a.family.localeCompare(b.family) ||
      a.id.localeCompare(b.id),
  );
  return (
    "# NukNuk – Gesamtkatalog\n\nAlle synthetischen Formulierungen und ihre tatsächlichen Lernziele. Sprach- und Zahlenvarianten gehören zu ihren gekennzeichneten Familien. Diese Lesefassung ist kein Nachweis von Modellleistung.\n\n" +
    ordered
      .map(
        (r, i) =>
          `## ${i + 1}. ${r.themeLabel}\n\n**Kennung:** ${r.id} · **Bestand:** ${labels[r.split]} · **Sprache:** ${r.locale}\n\n**Situation:** ${r.query}${dialogueReading(r.turns)}\n\n**Prüffokus:** ${r.rubric}\n\n**Erwartetes Verständnis${r.turns ? " nach der Ergänzung" : ""}:**\n\n${meaningReading(r.finalMeaning)}${r.expected.clarification ? "\n\n**Sinnvolle Rückfrage:** " + r.expected.clarification.question : ""}\n\n**Feste Zeitreferenz:** ${r.reference.now} (${r.reference.timezone})\n`,
      )
      .join("\n")
  );
}

/** Complete recorded synthetic conversation; never hide later corrections. */
export function dialogueReading(turns) {
  return (turns ?? []).map((turn, i) => `\n\n${turn.question ? "**Rückfrage " + (i + 1) + ":** " + turn.question + "\n\n" : ""}**Antwort/Ergänzung ${i + 1}:** ${turn.answer}`).join("");
}
