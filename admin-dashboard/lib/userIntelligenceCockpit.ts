export type JsonObject = Record<string, unknown>;

export type IntelligenceUser = {
  user_id: string;
  email: string | null;
  display_name: string | null;
  username: string | null;
  avatar_url: string | null;
  city: string | null;
  registered_at: string;
  consent_status: string | null;
  consent_updated_at: string | null;
  snapshot_id: string | null;
  source_watermark: string | null;
  snapshot_updated_at: string | null;
  runtime_version: string | null;
  node_count: number | null;
  knowledge_level: string;
  memory_event_count: number;
  product_learning_count: number;
  decision_count: number;
  profile_change_count: number;
  last_intelligence_activity: string | null;
  profile_state: "NO_CONSENT" | "EMPTY" | "BUILDING" | "LEARNING" | "ESTABLISHED";
  coverage_score: number;
};

export type CockpitList = {
  contractVersion: string;
  generatedAt: string;
  summary: { users: number; consented: number; withProfile: number; established: number; memoryEvents: number; profileChanges: number };
  users: IntelligenceUser[];
};

export type ProfileNode = { nodeKey: string; node: JsonObject };
export type CockpitDetail = {
  contractVersion: string;
  generatedAt: string;
  user: { user_id: string; email: string | null; display_name: string | null; username: string | null; avatar_url: string | null; city: string | null; country: string | null; registered_at: string };
  consent: JsonObject;
  profile: { state: IntelligenceUser["profile_state"]; snapshot: JsonObject | null; metrics: { node_count: number; established_count: number; hypothesis_count: number; high_confidence_count: number; contradiction_count: number }; nodes: ProfileNode[] };
  gaps: Record<string, string>;
  totals: { memory_visible: number; memory_total: number; learning_visible: number; learning_total: number; decisions_total: number; changes_total: number };
  decisions: Array<{ id: string; city: string; created_at: string; current_intent: JsonObject; retrieval_funnel: JsonObject; final_disposition: JsonObject; completed_at: string | null; memory_event_count: number; learning_event_count: number; directly_attributed_changes: number }>;
  memory: Array<{ id: string; event_type: string; event_class: string; evidence_family: string; occurred_at: string; ingested_at: string; session_id: string | null; decision_id: string | null; spot_id: string | null; spot_name: string | null; exposure_rank: number | null; retention_class: string; expires_at: string; supersedes_event_id: string | null }>;
  learning: Array<{ id: string; event_type: string; event_id: string; occurred_at: string; created_at: string; decision_id: string | null; session_id: string | null; spot_id: string | null; spot_name: string | null; semantic_disposition: string | null; generation: number }>;
  changes: Array<{ id: string; node_key: string; reason_code: string; engine_version: string; occurred_at: string; triggering_chain_ids: string[]; previous_node: JsonObject | null; next_node: JsonObject }>;
  work: Array<{ state: string; count: number; oldest: string | null; latest: string | null; failure_codes: JsonObject }>;
  privacy: JsonObject;
};

export function record(value: unknown): JsonObject {
  return value !== null && typeof value === "object" && !Array.isArray(value) ? value as JsonObject : {};
}

export function textAt(value: unknown, ...paths: string[][]): string | null {
  for (const path of paths) {
    let current: unknown = value;
    for (const key of path) current = record(current)[key];
    if (typeof current === "string" && current.trim()) return current;
  }
  return null;
}

export function numberAt(value: unknown, ...paths: string[][]): number | null {
  for (const path of paths) {
    let current: unknown = value;
    for (const key of path) current = record(current)[key];
    if (typeof current === "number" && Number.isFinite(current)) return current;
  }
  return null;
}

export function nodeView(entry: ProfileNode) {
  const node = record(entry.node);
  const concept = textAt(node,["concept","conceptId"],["conceptId"],["concept_key"]) ?? entry.nodeKey.split(":").at(-1) ?? entry.nodeKey;
  const state = textAt(node,["knowledgeState"],["knowledge_state"],["state"]) ?? "UNKNOWN";
  const confidence = numberAt(node,["confidence"]) ?? 0;
  const affinity = numberAt(node,["affinity"]) ?? 0;
  const positive = numberAt(node,["positiveEvidence","count"],["evidenceComposition","positive"]) ?? 0;
  const negative = numberAt(node,["negativeEvidence","count"],["evidenceComposition","negative"]) ?? 0;
  const journeys = Math.max(numberAt(node,["positiveEvidence","independentJourneys"]) ?? 0,numberAt(node,["negativeEvidence","independentJourneys"]) ?? 0);
  return { concept,state,confidence,affinity,positive,negative,journeys };
}

export function label(value: string): string {
  return value.replaceAll("_"," ").replaceAll("."," · ").replace(/\b\w/g,(letter)=>letter.toUpperCase());
}

export function profileLabel(state: IntelligenceUser["profile_state"]): string {
  return ({ NO_CONSENT:"Kein Consent",EMPTY:"Noch leer",BUILDING:"Im Aufbau",LEARNING:"Lernt",ESTABLISHED:"Belastbar" })[state];
}
