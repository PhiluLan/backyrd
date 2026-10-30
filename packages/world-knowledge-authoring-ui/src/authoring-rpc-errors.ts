type RpcError = { readonly code?: string; readonly message?: string } | null;
const messages = {
  missing: "Die Spot-Pflege ist noch nicht vollständig verfügbar. Deine Eingaben bleiben erhalten.",
  disabled: "Die Spot-Pflege ist derzeit ausgeschaltet. Deine Eingaben bleiben erhalten.",
  session: "Deine Sitzung ist abgelaufen. Bitte melde dich erneut an. Deine Eingaben bleiben erhalten.",
  forbidden: "Du bist für diesen Spot nicht berechtigt.",
  invalid: "Der Server hat diese Angabe abgelehnt. Sie wurde nicht gespeichert. Dein Entwurf bleibt erhalten. Bitte informiere den Backyrd-Support, wenn du eine angebotene Auswahl verwendet hast.",
  conflict: "Die Angabe hat sich zwischenzeitlich geändert. Bitte lade den Spot erneut und prüfe den Konflikt.",
  connection: "Die Verbindung zur Spot-Pflege ist unterbrochen. Deine Eingaben bleiben erhalten. Bitte versuche es erneut.",
  internal: "Beim Speichern ist ein interner Fehler aufgetreten. Die Speicherung wurde nicht bestätigt. Deine Eingaben bleiben erhalten. Bitte versuche es erneut.",
} as const;
const knownMessages = new Set<string>(Object.values(messages));
export const isAuthoringRpcMessage = (message: string): boolean => knownMessages.has(message);
/** Never expose provider messages, SQL, submitted values or credentials. */
export function authoringRpcErrorMessage(error: RpcError): string {
  const code = error?.code ?? "", message = error?.message ?? "";
  if (["PGRST202", "42883", "42P01"].includes(code)) return messages.missing;
  if (message.includes("world_product_authoring_authority_off") || message.includes("world_product_admin_authoring_off")) return messages.disabled;
  if (["PGRST301", "PGRST302", "PGRST303"].includes(code) || /authentication_required|invalid_session|JWT expired/i.test(message)) return messages.session;
  if (code === "42501") return messages.forbidden;
  if (["40001", "23505"].includes(code) || /conflict|invalid_supersedes_claim/.test(message)) return messages.conflict;
  if (["22023", "23514", "22P02", "22007", "22008"].includes(code) || message.includes("invalid_attribute_value")) return messages.invalid;
  if (!code && /failed to fetch|network|fetch failed|load failed/i.test(message) || code.startsWith("08") || code === "57014") return messages.connection;
  return messages.internal;
}
export function experienceSaveErrorMessage(error: unknown): string {
  const raw = error instanceof Error ? error.message : "";
  const message = isAuthoringRpcMessage(raw) || /^(Bitte |Die Angabe wurde gespeichert|Das Angebotsprofil ist gespeichert|Die öffentliche Speicherung|Die gespeicherten Angebote)/.test(raw)
    ? raw : "Die Speicherung konnte nicht bestätigt werden.";
  const retained = /(?:Eingaben bleiben|Entwurf bleibt|als Entwurf erhalten)/.test(message);
  return `Speichern fehlgeschlagen: ${message}${retained ? "" : " Dein Entwurf bleibt erhalten."}`;
}
