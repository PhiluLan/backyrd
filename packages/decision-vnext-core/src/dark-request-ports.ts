import type { DecisionVNextUserProjectionPort } from "@backyrd/user-intelligence-vnext-core";
import type { WorldKnowledgeReaderPort } from "@backyrd/world-knowledge-core";

/** Compatibility point for the canonical World Week-2 dark reader. No World semantics are copied here. */
export interface DecisionDarkWorldReaderPort extends WorldKnowledgeReaderPort {}

/** Compatibility point for the canonical User Week-2 dark projection port. No User semantics are copied here. */
export interface DecisionDarkUserProjectionPort extends DecisionVNextUserProjectionPort {}
