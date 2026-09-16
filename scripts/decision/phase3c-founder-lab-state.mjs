import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { contentHash } from "../../packages/decision-vnext-core/dist/index.js";
import { parseFounderWorldCohortHandoff } from "../../packages/world-knowledge-core/dist/index.js";

const STATE_VERSION = "backyrd.decision-vnext.founder-lab-local-state@3c-1";
const defaultDirectory = path.join(os.tmpdir(), `backyrd-decision-vnext-founder-lab-${process.getuid?.() ?? "local"}`);

export function createFounderLabStateStore(directory = process.env.BACKYRD_FOUNDER_LAB_STATE_DIR || defaultDirectory) {
  const file = path.join(directory, "active-cohort.json");
  const ensure = () => { fs.mkdirSync(directory, { recursive: true, mode: 0o700 }); fs.chmodSync(directory, 0o700); };
  const load = () => {
    if (!fs.existsSync(file)) return null;
    const stored = JSON.parse(fs.readFileSync(file, "utf8"));
    if (!stored || stored.contractVersion !== STATE_VERSION || typeof stored.stateHash !== "string") throw new Error("founder_lab_local_state_invalid");
    const { stateHash, ...body } = stored; if (contentHash(body) !== stateHash) throw new Error("founder_lab_local_state_hash_mismatch");
    return { ...stored, artifact: parseFounderWorldCohortHandoff(stored.artifact) };
  };
  const save = (value) => {
    const artifact = parseFounderWorldCohortHandoff(value); ensure(); const existing = load();
    if (existing?.artifact.handoffHash === artifact.handoffHash) return existing;
    const body = { contractVersion: STATE_VERSION, activatedAt: new Date().toISOString(), artifact };
    const stored = { ...body, stateHash: contentHash(body) }; const temporary = path.join(directory, `.active-cohort-${process.pid}.tmp`);
    fs.writeFileSync(temporary, `${JSON.stringify(stored)}\n`, { mode: 0o600, flag: "wx" }); fs.renameSync(temporary, file); fs.chmodSync(file, 0o600); return stored;
  };
  const reset = () => { ensure(); try { fs.unlinkSync(file); } catch (error) { if (error?.code !== "ENOENT") throw error; } return { reset: true, worldWrites: false, userWrites: false }; };
  return Object.freeze({ directory, file, load, save, reset });
}
