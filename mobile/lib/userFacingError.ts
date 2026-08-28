type ErrorLike = {
  message?: unknown;
  details?: unknown;
  hint?: unknown;
  code?: unknown;
};

/**
 * Keeps technical provider/RPC errors out of user-facing copy while retaining
 * deterministic code inspection for existing safety and authorization flows.
 */
export function technicalErrorText(error: unknown): string {
  if (typeof error === "string") return error;
  if (!error || typeof error !== "object") return "";
  const value = error as ErrorLike;
  return [value.code, value.message, value.details, value.hint]
    .filter((part): part is string => typeof part === "string")
    .join(" ");
}

export function hasTechnicalError(error: unknown, marker: string): boolean {
  return technicalErrorText(error).includes(marker);
}

export function userFacingError(
  error: unknown,
  fallback = "Das hat gerade nicht geklappt. Bitte versuche es noch einmal.",
): string {
  const technical = technicalErrorText(error).toLowerCase();
  if (/network|fetch|offline|timeout|timed out|internet|connection/.test(technical)) {
    return "Backyrd konnte keine Verbindung herstellen. Prüfe dein Netz und versuche es noch einmal.";
  }
  return fallback;
}
