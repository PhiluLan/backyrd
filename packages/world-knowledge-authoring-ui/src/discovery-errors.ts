/** Only product error codes are shown. Provider bodies and credentials stay server-side. */
export function discoveryPreparationErrorMessage(error: unknown): string {
  const code = error instanceof Error ? error.message : "";
  switch (code) {
    case "authentication_required":
      return "Bitte melde dich erneut an. Dein eingegebener Text bleibt erhalten.";
    case "discovery_source_review_required":
      return "Der Text benötigt zuerst eine Moderationsprüfung. Er wurde noch nicht zur KI-Vorbereitung übermittelt.";
    case "discovery_publication_failed":
    case "discovery_publication_invalid":
      return "Die öffentliche Textquelle konnte nicht bestätigt gespeichert werden. Dein eingegebener Text bleibt erhalten.";
    case "discovery_source_rebuild_failed":
      return "Die Textquelle wurde gespeichert, konnte aber noch nicht für die KI-Vorbereitung bereitgestellt werden. Bitte versuche es erneut.";
    case "preparation_unavailable":
      return "Die Textquelle wurde gespeichert. Die KI-Ausfüllhilfe ist serverseitig noch nicht eingerichtet. Bitte informiere den Backyrd-Support; dein Text muss nicht neu eingegeben werden.";
    case "preparation_rate_limited":
      return "Die Textquelle wurde gespeichert. Es wurden zu viele KI-Vorbereitungen gestartet. Bitte warte kurz und versuche es erneut.";
    case "preparation_timeout":
      return "Die Textquelle wurde gespeichert. Die KI hat nicht rechtzeitig geantwortet. Bitte versuche es erneut.";
    case "public_source_scope_or_budget_denied":
      return "Die KI-Vorbereitung ist für diese Textquelle noch nicht freigegeben. Bitte lade das Profil neu und prüfe deine Berechtigung.";
    default:
      return "Die KI-Vorschläge konnten nicht erstellt werden. Dein Text bleibt erhalten. Bitte versuche es erneut; die Spotangaben kannst du weiterhin direkt im Formular pflegen.";
  }
}
