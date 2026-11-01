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
