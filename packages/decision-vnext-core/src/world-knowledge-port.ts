import { assertContentHash } from "./canonical.js";
import { schema, sha256, timestamp, version, type Infer } from "./schema.js";
import { CONTRACT_VERSIONS, WorldCandidateSchema } from "./contracts.js";
import { validateWorldKnowledge } from "./world-knowledge.js";

export const WorldKnowledgeQuerySchema = schema.object({
  contractVersion: version(CONTRACT_VERSIONS.worldKnowledgePort),
  requestId: schema.string({ min: 1, max: 160 }),
  asOf: timestamp,
  registryVersion: schema.string({ min: 1, max: 160 }),
  candidateIds: schema.array(schema.string({ min: 1, max: 160 }), { max: 500 }),
});
export type WorldKnowledgeQuery = Infer<typeof WorldKnowledgeQuerySchema>;

export const WorldKnowledgePortResultSchema = schema.object({
  contractVersion: version(CONTRACT_VERSIONS.worldKnowledgePort),
  portVersion: schema.string({ min: 1, max: 160 }),
  registryVersion: schema.string({ min: 1, max: 160 }),
  candidates: schema.array(WorldCandidateSchema, { max: 500 }),
  resultHash: sha256,
});
export type WorldKnowledgePortResult = Infer<typeof WorldKnowledgePortResultSchema>;

/**
 * The only authorized future boundary for real World Knowledge. Phase 1 ships no
 * database, Supabase, HTTP or production implementation of this port.
 */
export interface WorldKnowledgePort {
  readonly portVersion: string;
  readCandidates(query: WorldKnowledgeQuery): Promise<WorldKnowledgePortResult>;
}

export function validateWorldKnowledgePortResult(result: WorldKnowledgePortResult): void {
  WorldKnowledgePortResultSchema.parse(result);
  assertContentHash(result as unknown as Record<string, unknown>, "resultHash");
  for (const candidate of result.candidates) {
    if (candidate.worldKnowledge.registryVersion !== result.registryVersion) throw new Error("world_port_registry_mismatch");
    validateWorldKnowledge(candidate.worldKnowledge);
  }
}
