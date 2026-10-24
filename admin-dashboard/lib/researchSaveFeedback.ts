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
