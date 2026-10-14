import { REGISTRY_VERSION } from "../src/index.js";
import type { CapabilityIntentRelationReaderPort, WorldKnowledgeReaderPort, WorldKnowledgeSnapshot } from "../src/index.js";

declare const reader: WorldKnowledgeReaderPort;
declare const relationReader: CapabilityIntentRelationReaderPort;
declare const snapshot: WorldKnowledgeSnapshot;

void reader.readSnapshot({ spotId: "synthetic", contractVersion: "backyrd.world-knowledge.port@1.0", registryVersion: REGISTRY_VERSION, registryHash: "a".repeat(64) });
void relationReader.readRelationRegistry({ relationRegistryVersion: "future-version" });
const noGlobalReadinessPercentage: readonly { readonly useCase: string; readonly state: string }[] = snapshot.readiness;
void noGlobalReadinessPercentage;
