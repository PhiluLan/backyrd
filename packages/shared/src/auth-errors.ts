/** Public error copy only. Never include password, provider response or identifiers. */
export function compromisedPasswordMessage(error: unknown): string | null {
  if (typeof error !== "object" || error === null) return null;
  const record = error as Record<string, unknown>;
  const reasons = Array.isArray(record.reasons) ? record.reasons : [];
  if (record.code === "weak_password" && reasons.includes("pwned")) {
    return "Dieses Passwort ist aus einem Datenleck bekannt. Bitte wähle ein anderes Passwort.";
  }
  return null;
}

/** Actionable account messages without exposing provider details or account existence. */
export function accountAuthError(error: unknown, fallback: string): string {
  const compromised = compromisedPasswordMessage(error);
  if (compromised) return compromised;
  if (typeof error !== "object" || error === null) return fallback;
  const record = error as Record<string, unknown>;
  switch (record.code) {
    case "email_address_invalid": return "Bitte gib eine gültige E-Mail-Adresse ein.";
    case "invalid_credentials": return "E-Mail oder Passwort stimmen nicht. Bitte prüfe beide Angaben.";
    case "email_not_confirmed": return "Bitte bestätige zuerst deine E-Mail-Adresse mit dem Code aus deiner E-Mail.";
    case "otp_expired": return "Der Code oder Link ist ungültig oder abgelaufen. Fordere bitte eine neue Bestätigung an.";
    case "over_email_send_rate_limit":
    case "over_request_rate_limit": return "Zu viele Versuche. Bitte warte einen Moment und versuche es erneut.";
    case "session_not_found":
    case "refresh_token_not_found":
    case "refresh_token_already_used": return "Deine Anmeldung ist abgelaufen. Melde dich bitte erneut an.";
    case "weak_password": return "Bitte wähle ein stärkeres Passwort mit mindestens acht Zeichen.";
    default: return fallback;
  }
}

/** No stored session is an ordinary signed-out state, not a connection failure. */
export function isMissingAuthSession(error: unknown): boolean {
  if (typeof error !== "object" || error === null) return false;
  const record = error as Record<string, unknown>;
  return record.name === "AuthSessionMissingError" || record.status === 401 || record.status === 403 ||
    record.code === "session_not_found" || record.code === "refresh_token_not_found" || record.code === "refresh_token_already_used";
}
