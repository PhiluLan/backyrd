/** Readable audit labels. Unknown events must not claim a grant or withdrawal. */
export function consentEventLabel(value: string): string {
  const labels: Record<string, string> = {
    consent_granted: "Einwilligung erteilt",
    consent_renewed: "Einwilligung erneuert",
    consent_withdrawn: "Einwilligung widerrufen",
    document_accepted: "Dokument bestätigt",
    consent_migrated: "Bestehende Entscheidung übernommen",
  };
  return labels[value] ?? "Datenschutzentscheidung gespeichert";
}

export function consentSourceLabel(value: string): string | null {
  return ({ mobile: "In der App", web: "Im Browser" } as Record<string, string>)[value] ?? null;
}

export type PendingLegalDocument = {
  document_id: string;
  title: string;
  version: string;
  summary: string | null;
  content_markdown: string;
};

/** A malformed response must never be displayed as “all documents confirmed”. */
export function parsePendingLegalDocuments(value: unknown): PendingLegalDocument[] {
  if (!Array.isArray(value) || !value.every((item: unknown) => {
    if (typeof item !== "object" || item === null) return false;
    const row = item as Record<string, unknown>;
    return typeof row.document_id === "string" && row.document_id.length > 0 &&
      typeof row.title === "string" && typeof row.version === "string" &&
      (row.summary === null || typeof row.summary === "string") && typeof row.content_markdown === "string";
  })) throw new Error("legal_documents_response_invalid");
  return value as PendingLegalDocument[];
}
