export const DECISION_TEST_PLAN_VERSION = "backyrd-decision-ci-test-plan-v1";

export const PHASE2_TEST_SHARDS = Object.freeze({
  "phase2-1": Object.freeze([
    "canonical envelope binds server authority, accepted world policy, minimized user projection and one neutral pool",
    "client cannot provide authority and location mismatch or missing authority fail closed",
    "unaccepted source policy and missing or corrupt world snapshots stop fail closed",
    "eligibility is central, all rankings contain only eligible candidates, and high fixture fit cannot rescue exclusions",
    "no consent, missing projection, cold user, and kill switch deterministically neutralize personalization",
    "active projection keeps taste, aversion, practical behavior, and direct affinity semantically separate",
  ]),
  "phase2-2": Object.freeze([
    "context changes identity without writing user intelligence",
    "same user with another server time or authorized location produces a distinct Context while retrieval stays neutral",
    "same explicit Context with another bound user preserves retrieval and binds the new subject",
    "oracles remain NOT_CONFIGURED while deterministic safety metrics are explicit",
    "every explanation is evidence-authorized and confidence remains uncalibrated",
  ]),
  "phase2-3": Object.freeze([
    "replay is byte-identical and non-semantic runtime metadata does not change semantic identity",
    "scenario id and seed are authoritative envelope facts even after report rehash",
    "scenario config and generated World must match the trusted authority",
    "source identity is one externally trusted run identity and cannot self-authorize",
    "every redundant User projection field is derived from projection and actor authority",
  ]),
  "phase2-4": Object.freeze([
    "result manifest set, top ranks and fixture-only labels remain recursively bound",
    "recursive validation rejects rehashed inner ranking and evidence manipulation",
    "unknown engine versions and duplicate bindings fail closed",
    "commercial counterfactuals have no contract channel and no result influence",
    "empty pool is a controlled limitation and never an uncontrolled failure",
  ]),
});

export const REQUIRED_DECISION_SHARDS = Object.freeze([
  "core-consumers",
  "phase2",
  "large-sandbox",
  "decision-lab",
]);

export function phase2Pattern(shard) {
  const titles = PHASE2_TEST_SHARDS[shard];
  if (!titles) throw new Error(`unknown_decision_test_shard:${shard}`);
  return `^(?:${titles.map((title) => title.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")).join("|")})$`;
}
