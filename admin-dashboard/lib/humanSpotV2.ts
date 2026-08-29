export type AuthoringSectionId = "IDENTITY" | "PURPOSE" | "FIT" | "EXPERIENCE" | "PRACTICAL";
export type AuthoringControlType = "SINGLE_CHOICE" | "MULTI_CHOICE" | "TRI_STATE_MAP" | "AVAILABILITY_MAP" | "PURPOSE_MAP" | "AGE_RANGE" | "DURATION_RANGE" | "ACCESSIBILITY_MAP";

export type AuthoringOption = {
  id: string;
  label: string;
  value: unknown;
  archetypes?: string[];
  scopeGuard?: boolean;
};

export type AuthoringQuestion = {
  question_id: string;
  section_id: AuthoringSectionId;
  label_de: string;
  help_de?: string | null;
  control_type: AuthoringControlType;
  canonical_field_key: string;
  mapping_class: "CANONICAL_WRITE" | "DISPLAY_METADATA" | "PROPOSAL_ONLY" | "NON_CANONICAL_NOTE";
  priority: "ESSENTIAL" | "HIGH_VALUE" | "OPTIONAL";
  options: AuthoringOption[];
  relevance: { showWhen?: { questionId: string; values: unknown[] } };
  relevant: boolean;
  engine_use: string[];
};

export type AuthoringArchetype = {
  archetype_id: string;
  label_de: string;
  group_de: string;
  description_de: string;
};

export type AcceptedFact = {
  id: string;
  field_key: string;
  value: unknown;
  status: string;
  source_id: string;
  accepted_at?: string;
  last_checked_at?: string | null;
  evidence_scope?: string | null;
};

export type AuthoringProfile = {
  actor: { role: "FOUNDER" | "ADMIN" | "OWNER"; capability: "BASIC" | "DEEP" };
  acceptedFacts: AcceptedFact[];
  sources: Array<{ id: string; source_type: string; source_url?: string | null; title?: string | null; last_checked_at?: string | null }>;
  proposals: Array<{
    id: string;
    source_id: string;
    field_key: string;
    proposed_value: unknown;
    status: string;
    evidence_excerpt?: string | null;
    evidence_scope?: string | null;
    research_evidence_scope?: string | null;
    research_entity_scope?: string | null;
    research_durability?: string | null;
    research_scope_resolution?: string | null;
  }>;
  reviewIssues?: Array<{ code: string; factId?: string | null; fieldKey: string; label: string; detail: string; canConfirm?: boolean; canMarkUnknown?: boolean }>;
  canonicalN4: { snapshotHash?: string | null } | null;
  authoring: { primaryArchetype: string; secondaryArchetypes: string[]; explicit: boolean };
  archetypes: AuthoringArchetype[];
  questions: AuthoringQuestion[];
  humanSummary: { text: string; deterministic: true; archetype: string };
  humanReadiness: {
    answered: number;
    relevant: number;
    coverage: number;
    status: "KAUM_BESCHRIEBEN" | "GRUNDLAGEN" | "GUT_BESCHRIEBEN" | "SEHR_GUT_BESCHRIEBEN";
    missing: Array<{ questionId: string; sectionId: AuthoringSectionId; label: string; priority: string }>;
  };
};

export const AUTHORING_SECTIONS: Array<{ id: AuthoringSectionId; label: string; description: string }> = [
  { id: "IDENTITY", label: "Über den Ort", description: "Was beschreibt diesen Ort am besten?" },
  { id: "PURPOSE", label: "Wofür kommen Menschen?", description: "Aktivitäten und Hauptgründe – passend zur Art des Orts." },
  { id: "FIT", label: "Für wen und wann?", description: "Kontexte, in denen der Ort wirklich passt." },
  { id: "EXPERIENCE", label: "So fühlt es sich an", description: "Atmosphäre, Umgebung, Wetter, Gespräche und Dauer." },
  { id: "PRACTICAL", label: "Praktische Bedingungen", description: "Planung, Familie, Alter und Zugänglichkeit." },
];

export const READINESS_LABELS: Record<AuthoringProfile["humanReadiness"]["status"], string> = {
  KAUM_BESCHRIEBEN: "Kaum beschrieben",
  GRUNDLAGEN: "Grundlagen vorhanden",
  GUT_BESCHRIEBEN: "Gut beschrieben",
  SEHR_GUT_BESCHRIEBEN: "Sehr gut beschrieben",
};

export function currentFact(profile: AuthoringProfile, fieldKey: string): AcceptedFact | undefined {
  return profile.acceptedFacts.find((fact) => fact.field_key === fieldKey && ["ACTIVE", "UNKNOWN", "STALE"].includes(fact.status));
}

export function relevantOptions(question: AuthoringQuestion, archetypes: string[]): AuthoringOption[] {
  return question.options.filter((option) => !option.archetypes?.length || option.archetypes.some((value) => archetypes.includes(value)));
}

const OFFERING_HIERARCHY = [
  { parent: "DRINKS", children: ["BEER", "CRAFT_BEER", "OWN_BREWED_BEER", "WINE", "COCKTAILS", "COFFEE", "NON_ALCOHOLIC"] },
  { parent: "BEER", children: ["CRAFT_BEER", "OWN_BREWED_BEER"] },
  { parent: "FOOD", children: ["SNACKS", "SMALL_PLATES", "FULL_MEALS", "BREAKFAST", "BRUNCH", "LUNCH", "DINNER"] },
] as const;

export type OfferingHierarchyConflict = {
  parent: "DRINKS" | "BEER" | "FOOD";
  children: string[];
};

export function offeringHierarchyConflicts(value: unknown): OfferingHierarchyConflict[] {
  if (!value || typeof value !== "object" || Array.isArray(value)) return [];
  const offerings = value as Record<string, unknown>;
  return OFFERING_HIERARCHY.flatMap(({ parent, children }) => {
    if (offerings[parent] !== "NOT_AVAILABLE") return [];
    const available = children.filter((child) => offerings[child] === "AVAILABLE");
    return available.length ? [{ parent, children: available }] : [];
  });
}

export function normalizeOfferingHierarchy(value: unknown): Record<string, unknown> {
  const normalized = value && typeof value === "object" && !Array.isArray(value) ? { ...(value as Record<string, unknown>) } : {};
  let changed = true;
  while (changed) {
    changed = false;
    for (const { parent, children } of OFFERING_HIERARCHY) {
      if (children.some((child) => normalized[child] === "AVAILABLE") && normalized[parent] !== "AVAILABLE") {
        normalized[parent] = "AVAILABLE";
        changed = true;
      }
    }
  }
  return normalized;
}

export function humanError(error: unknown): string {
  const value = error instanceof Error ? error.message : String(error);
  if (value.includes("authoring_state_changed")) return "Der Ort wurde inzwischen geändert. Bitte neu laden und deine Angaben nochmals prüfen.";
  if (value.includes("offering_hierarchy_conflict")) return "Eine Detailangabe widerspricht noch der allgemeinen Verfügbarkeit. Bitte löse den markierten Widerspruch und speichere erneut.";
  if (value.includes("access") || value.includes("required") || value.includes("denied")) return "Du darfst diese Angaben nicht speichern.";
  return "Die Änderungen konnten nicht gespeichert werden. Deine Eingaben bleiben erhalten.";
}
