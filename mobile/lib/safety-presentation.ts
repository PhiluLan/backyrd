/** Consumer labels only; these functions never decide or change enforcement. */
export function safetyContentLabel(value: string | null) {
  const labels: Record<string, string> = { review: "Moment", moment: "Moment", social_post: "Beitrag", post: "Beitrag", comment: "Kommentar", profile: "Profil", message: "Nachricht", chat_message: "Nachricht", spot: "Ort", event: "Event" };
  return value ? labels[value] ?? "Inhalt" : "Inhalt";
}
export function safetyCaseLabel(value: string | null) {
  if (!value) return "Noch keinem Fall zugeordnet";
  const labels: Record<string, string> = { queued: "Wartet auf Prüfung", evaluating: "Wird geprüft", needs_review: "Manuelle Prüfung ausstehend", decided: "Entscheidung getroffen", appealed: "Einspruch eingereicht", closed: "Abgeschlossen", failed: "Prüfung nicht abgeschlossen" };
  return labels[value] ?? "Status nicht verfügbar";
}
