export type ResearchFeedback = { kind:"success"|"error"|"warning"|"pending"; title:string; message:string };
export class ResearchSaveError extends Error {
  constructor(message:string, readonly saveState:"SAVED_UNVERIFIED") { super(message); }
}

export function researchFailureFeedback(cause:unknown):ResearchFeedback {
  const saved = cause instanceof ResearchSaveError && cause.saveState === "SAVED_UNVERIFIED";
  const raw = cause instanceof Error ? cause.message : "";
  const session = ["invalid_session","authentication_required"].includes(raw);
  const technical = !raw || /^[a-zA-Z0-9_]+$/.test(raw) || /fetch|network|load failed|timeout|unexpected token/i.test(raw);
  return {
    kind:saved ? "warning" : "error",
    title:saved ? "Gespeichert · Profilansicht noch nicht bestätigt" : "Speichern konnte nicht bestätigt werden",
    message:session ? "Deine Anmeldung ist abgelaufen. Deine Eingabe bleibt hier erhalten. Bitte melde dich erneut an und versuche es noch einmal."
      : technical ? "Wir haben keine vollständige Rückmeldung vom Server erhalten. Deine Eingabe bleibt hier erhalten. Bitte prüfe die Verbindung und versuche es erneut."
      : `${raw} Deine Eingabe bleibt hier erhalten.`,
  };
}

const record = (value:unknown):value is Record<string,unknown> => value !== null && typeof value === "object" && !Array.isArray(value);
const stable = (value:unknown) => JSON.stringify(value,(_key,item:unknown)=>record(item)?Object.fromEntries(Object.entries(item).sort(([a],[b])=>a.localeCompare(b))):item);
/** A successful HTTP status alone does not prove a saved, reread field. */
export function isResearchSaveConfirmation(response:unknown,knowledgeState:string,value:unknown):boolean {
  if(!record(response) || !record(response.answer))return false;
  const answer=response.answer;
  return typeof answer.claimId === "string" && !!answer.claimId && answer.visibility === "PUBLIC"
    && answer.knowledgeState === knowledgeState && stable(answer.value) === stable(value);
}

/** Distinguish a source conflict from a software binding or extraction failure. */
export function researchEvidenceReason(reason: string): string {
  const messages: Record<string, string> = {
    SUPPORTED_EVIDENCE: "Belegt und fachlich zugeordnet.",
    SUPPORTED_WITH_MINOR_UNCERTAINTY: "Belegt; die geringe Restunsicherheit verhindert die Übernahme nicht.",
    CURRENT_VALUE_IDENTICAL: "Bereits identisch im Profil vorhanden.",
    OBSERVED_WEBSITE_REDIRECT_EQUIVALENT: "Dieselbe Website mit beobachteter Weiterleitung; die bisherige Adresse bleibt erhalten.",
    CONTENT_SAFETY_HELD: "Vom Sicherheitsfilter zur Prüfung zurückgehalten. Die bisherige öffentliche Angabe bleibt erhalten.",
    MAJOR_UNCERTAINTY: "Erhebliche fachliche Unsicherheit: bitte die Zuordnung entscheiden.",
    ASSESSMENT_REQUIRED: "Die fachliche Einordnung zur Restunsicherheit fehlt in der Recherchedatei.",
    QUOTE_NOT_IN_SOURCE: "Der angegebene Beleg konnte im neu gelesenen Quellentext nicht wiedergefunden werden.",
    SOURCE_NOT_IN_OFFICIAL_GRAPH: "Die Quelle konnte nicht über die offizielle Website oder deren beobachtete Verlinkung bestätigt werden.",
    SOURCE_OBSERVATION_EXPIRED: "Der Quellenabruf ist zu alt. Bitte die Recherche mit frischen Abrufzeiten wiederholen.",
    OFFICIAL_SOURCE_UNAVAILABLE: "Die offizielle Quelle konnte nicht gelesen werden.",
    OFFICIAL_SOURCE_NOT_VERIFIED: "Die offizielle Quelle ist noch nicht bestätigt.",
    EXPLICIT_UNKNOWN_OR_PRIVATE_PROTECTED: "Eine private oder bewusst unbekannt gesetzte Angabe bleibt geschützt.",
    EXISTING_PROFILE_CONTENT_PROTECTED: "Der Vorschlag würde bislang gespeicherte Angebote, Bereiche oder Details entfernen. Bitte den Unterschied prüfen.",
    EXISTING_VALUE_PROTECTED: "Die bestehende Angabe bleibt erhalten; bitte den Unterschied prüfen.",
    SCOPE_OR_AGGREGATION_REQUIRES_REVIEW: "Die Angabe lässt sich noch nicht eindeutig auf den gesamten Ort beziehen.",
    STRUCTURED_VALUE_REQUIRES_SCOPED_EVIDENCE: "Der Beleg ist vorhanden, aber die Zuordnung zu den strukturierten Auswahlfeldern ist noch nicht vollständig bestätigt.",
    ATTRIBUTE_NOT_AUTHORIZED: "Für dieses Feld fehlt die Schreibberechtigung.",
    CONSUMPTION_SCOPE_NOT_SUPPORTED: "Die Erlaubnis für eigene Speisen oder Getränke ist noch nicht gemeinsam mit ihren Einschränkungen belegt.",
    SOURCE_TEXT_UNREADABLE: "Die Quelle ist erreichbar, ihr Text konnte aber nicht zuverlässig ausgelesen werden.",
    SOURCE_CONTACT_ONLY: "Diese Quelle darf nur zum Ergänzen fehlender Kontaktdaten dienen.",
  };
  if (messages[reason]) return messages[reason];
  if (reason.startsWith("PROFILE_")) return "Ein Angebots- oder Bereichsdetail ist noch nicht vollständig an seinen Beleg gebunden. Bitte die konkrete Zuordnung prüfen.";
  if (/SCHEDULE|KITCHEN_SCOPE|CLOSED_DAY/u.test(reason)) return "Wochentag, Uhrzeit oder Küchenbezug sind noch nicht gemeinsam belegt.";
  if (/PRICE|VALIDITY/u.test(reason)) return "Preis, Preisbasis oder Gültigkeit sind noch nicht gemeinsam belegt.";
  return "Die Übernahmeregel konnte diese Angabe noch nicht bestätigen. Bitte Beleg und Zuordnung prüfen.";
}
