import test from "node:test";
import assert from "node:assert/strict";
import { assertEmbeddingMode, assertSafeEnvironment, KNOWN_PRODUCTION_REF } from "../src/safety.mjs";

const local = { DECISION_LAB_ALLOW_LOCAL: "1", DECISION_LAB_DB_URL: "postgresql://postgres:postgres@127.0.0.1:54322/postgres" };

test("accepts explicit localhost lab database", () => assert.equal(assertSafeEnvironment(local, "/tmp/nonexistent-lab").safe, true));
test("rejects missing acknowledgement and ambiguous environment", () => assert.throws(() => assertSafeEnvironment({}, "/tmp/nonexistent-lab"), /safety refusal/));
test("rejects known Production reference", () => assert.throws(() => assertSafeEnvironment({ ...local, SUPABASE_PROJECT_REF: KNOWN_PRODUCTION_REF }, "/tmp/nonexistent-lab"), /Production/));
test("rejects hosted Supabase and non-local database", () => assert.throws(() => assertSafeEnvironment({ ...local, DECISION_LAB_DB_URL: "postgresql://user:pass@example.supabase.co/postgres" }, "/tmp/nonexistent-lab"), /hosted|non-local/));
test("full fidelity never falls back without its dedicated key", () => assert.throws(() => assertEmbeddingMode("FULL_FIDELITY", {}), /requires/));
test("fast simulation is explicitly accepted", () => assert.doesNotThrow(() => assertEmbeddingMode("FAST_SIMULATION", {})));
