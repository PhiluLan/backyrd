type ErrorRecord = Record<string, unknown>;

const GENERIC_MESSAGE = "Das Event konnte nicht gespeichert werden. Bitte prüfe die Eingaben und versuche es erneut.";

function isRecord(value: unknown): value is ErrorRecord {
  return typeof value === "object" && value !== null;
}

function clean(value: unknown): string | null {
  if (typeof value !== "string") return null;
  const text = value.trim();
  return text && text !== "[object Object]" ? text : null;
}

function collectErrorFields(error: unknown): { message: string | null; details: string | null; hint: string | null; code: string | null } {
  if (typeof error === "string") return { message: clean(error), details: null, hint: null, code: null };
  if (error instanceof Error) {
    const extra = error as Error & ErrorRecord;
    return { message: clean(error.message), details: clean(extra.details), hint: clean(extra.hint), code: clean(extra.code) };
  }
  if (!isRecord(error)) return { message: null, details: null, hint: null, code: null };
  const nested = isRecord(error.error) ? error.error : null;
  return {
    message: clean(error.message) ?? clean(nested?.message),
    details: clean(error.details) ?? clean(nested?.details),
    hint: clean(error.hint) ?? clean(nested?.hint),
    code: clean(error.code) ?? clean(nested?.code),
  };
}

export function formatAdminError(error: unknown, fallback = GENERIC_MESSAGE): string {
  const fields = collectErrorFields(error);
  const diagnostic = [fields.message, fields.details, fields.hint, fields.code].filter(Boolean).join(" ").toLowerCase();
  if (diagnostic.includes("events_v1_title_check")) return "Bitte gib einen Eventtitel mit höchstens 300 Zeichen ein.";
  if (diagnostic.includes("events_v1_short_description_check")) return "Die Beschreibung darf höchstens 600 Zeichen lang sein.";
  if (diagnostic.includes("events_v1_categories_check") || diagnostic.includes("events_v1_category_check")) return "Bitte wähle mindestens eine gültige Kategorie aus.";
  if (diagnostic.includes("events_v1_minimum_age_check")) return "Das Mindestalter muss zwischen 0 und 99 liegen.";
  if (diagnostic.includes("events_v1_price_pair_check") || diagnostic.includes("price_currency")) return "Bitte gib einen gültigen Preis ein oder markiere das Event als gratis.";
  if (diagnostic.includes("manual_event_") || diagnostic.includes("recurrence")) return "Die Termine konnten aus der Wiederholung nicht erzeugt werden. Bitte prüfe Start, Ende und Wiederholung.";
  if (fields.code === "42501" || diagnostic.includes("row-level security") || diagnostic.includes("permission denied")) return "Du hast keine Berechtigung, dieses Event zu speichern. Bitte melde dich erneut mit einem Admin-Konto an.";
  if (fields.code === "23505") return "Dieses Event oder dieser Veranstaltungsort ist bereits vorhanden.";
  if (diagnostic.includes("jwt") || diagnostic.includes("session") || diagnostic.includes("not authenticated")) return "Deine Admin-Sitzung ist abgelaufen. Bitte melde dich erneut an.";
  if (diagnostic.includes("event-images") || diagnostic.includes("storage") || diagnostic.includes("mime")) return "Das Eventbild konnte nicht hochgeladen werden. Bitte verwende JPG, PNG oder WebP und versuche es erneut.";
  if (typeof error === "string" && fields.message) return fields.message;
  if (error instanceof Error && fields.message) return fields.message;
  return fallback;
}

export function safeSerializeError(error: unknown): unknown {
  if (error instanceof Error) {
    const record = error as Error & ErrorRecord;
    return { name: error.name, message: error.message, stack: error.stack, code: record.code, details: record.details, hint: record.hint };
  }
  if (!isRecord(error)) return error;
  const seen = new WeakSet<object>();
  try {
    return JSON.parse(JSON.stringify(error, (_key, value: unknown) => {
      if (typeof value === "bigint") return value.toString();
      if (typeof value === "object" && value !== null) {
        if (seen.has(value)) return "[Circular]";
        seen.add(value);
      }
      return value;
    })) as unknown;
  } catch {
    const fields = collectErrorFields(error);
    return { type: "Unserialisierbarer Fehler", ...fields };
  }
}

export function logAdminError(context: string, error: unknown, metadata?: Record<string, unknown>): void {
  console.error(`[Events Admin] ${context}`, { error: safeSerializeError(error), ...metadata });
}
