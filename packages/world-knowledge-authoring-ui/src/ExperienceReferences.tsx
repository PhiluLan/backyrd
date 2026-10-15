import { AUTHORING_FIELDS, EXPERIENCE_QUESTIONS, type ExperienceProfile, type ExperienceProperty } from "@backyrd/world-knowledge-core";

const displayValue = (property: ExperienceProperty) => property.state === "UNKNOWN" ? "Unbekannt" : property.state === "NOT_APPLICABLE" ? "Nicht relevant" : property.value === true ? "Ja" : property.value === false ? "Nein" : String(property.value ?? "");
const hasConditions = (property: ExperienceProperty) => property.conditions.weekdays.length > 0 || property.conditions.dayparts.length > 0 || property.conditions.event !== null || property.conditions.validFrom !== null || property.conditions.validUntil !== null;
const weekdays=["Montag","Dienstag","Mittwoch","Donnerstag","Freitag","Samstag","Sonntag"];
const dayparts:Readonly<Record<string,string>>={MORNING:"Vormittag",MIDDAY:"Mittag",AFTERNOON:"Nachmittag",EVENING:"Abend",NIGHT:"Nacht"};
const physicalKeys = new Set(["participation.accessibility", "location.setting", "location.view", "location.waterbody", "atmosphere.character", "atmosphere.noise", "atmosphere.music", "offer.feature", "amenity.step_free", "amenity.stroller", "amenity.toilet", "amenity.changing_table", "amenity.parking", "amenity.shower"]);

/** Read-only provenance. Never merges, copies or re-scopes an answer. */
export function ExperienceReferences({profile, areaIds, existingAnswers}: {profile: ExperienceProfile; areaIds: readonly string[]; existingAnswers: Readonly<Record<string,unknown>>}) {
  const spotClaims = ["amenity.features", "accessibility.step_free_entrance", "accessibility.accessible_toilet", "rule.pet_access", "rule.age_access_conditions"].flatMap(key => {
    const answer = existingAnswers[key];
    if (!answer || typeof answer !== "object" || !("knowledgeState" in answer) || !("value" in answer)) return [];
    if (!["KNOWN_VALUE", "KNOWN_TRUE", "KNOWN_FALSE", "UNKNOWN"].includes(String(answer.knowledgeState))) return [];
    const field=AUTHORING_FIELDS.find(field=>field.attributeKey===key);
    const featureLabels=key==="amenity.features" && Array.isArray(answer.value) ? answer.value.filter((value): value is string=>typeof value==="string").map(value=>field?.allowedValues.find(option=>option.value===value)?.label??value).join(", ") : null;
    const value = answer.knowledgeState === "UNKNOWN" ? "Unbekannt" : featureLabels !== null ? featureLabels || "Keine Ausstattung ausgewählt" : typeof answer.value === "boolean" ? answer.value ? "Ja" : "Nein" : typeof answer.value === "string" || typeof answer.value === "number" ? String(answer.value) : null;
    // Complex rules need their original editor; do not turn JSON into a claim.
    const validity=["validFrom" in answer && typeof answer.validFrom==="string" ? `ab ${answer.validFrom.slice(0,10)}` : null,"validUntil" in answer && typeof answer.validUntil==="string" ? `bis ${answer.validUntil.slice(0,10)}` : null].filter(Boolean).join(" · ");
    return value === null ? [] : [{validity,label: AUTHORING_FIELDS.find(field => field.attributeKey === key)?.label ?? key, value}];
  });
  const sources = [
    {name: "Gesamter Spot", scope: "SPOT", properties: profile.properties.filter(property => physicalKeys.has(property.key))},
    ...profile.areas.filter(area => areaIds.includes(area.id)).map(area => ({name: area.name, scope: "AREA", properties: area.properties.filter(property => physicalKeys.has(property.key))})),
  ];
  const count = spotClaims.length + sources.reduce((sum, source) => sum + source.properties.length, 0);
  if (!count) return null;
  return <details className="wk-linked-knowledge">
    <summary>Bereits erfasste Angaben ansehen ({count})</summary>
    <p>Diese Angaben stammen vom Spot oder aus den zugeordneten Räumen. Du musst sie hier nicht nochmals eintragen. Eine Angabe zum Haupteingang bestätigt keinen stufenlosen Weg in jeden Raum.</p>
    {spotClaims.length > 0 && <section data-evidence-scope="SPOT"><h4>Spotprofil · ursprüngliche Angabe</h4><dl>{spotClaims.map(claim => <div key={claim.label}><dt>{claim.label}</dt><dd>{claim.value}{claim.validity&&<span> · Gültigkeit: {claim.validity}</span>}</dd></div>)}</dl></section>}
    {sources.filter(source => source.properties.length > 0).map((source,sourceIndex) => <section key={sourceIndex} data-evidence-scope={source.scope}>
      <h4>{source.scope === "AREA" ? "Zugeordneter Bereich" : "Gemeinsame Angaben"}: {source.name}</h4>
      <dl>{source.properties.map((property,index) => <div key={index}><dt>{EXPERIENCE_QUESTIONS.find(question => question.key === property.key)?.label ?? property.label ?? "Vorhandene Angabe"}</dt><dd>{displayValue(property)}{hasConditions(property) && <span> · eingeschränkt gültig: {[
        property.conditions.weekdays.length ? property.conditions.weekdays.map(day=>weekdays[day-1]??String(day)).join(", ") : null,
        property.conditions.dayparts.length ? property.conditions.dayparts.map(part=>dayparts[part]??part).join(", ") : null,
        property.conditions.event,
        property.conditions.validFrom ? `ab ${property.conditions.validFrom}` : null,
        property.conditions.validUntil ? `bis ${property.conditions.validUntil}` : null,
      ].filter(Boolean).join(" · ")}</span>}</dd></div>)}</dl>
    </section>)}
  </details>;
}
