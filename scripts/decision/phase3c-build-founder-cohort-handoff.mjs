import fs from "node:fs";
import path from "node:path";
import { createFounderWorldCohortHandoff } from "../../packages/world-knowledge-core/dist/index.js";

const [, , inputPath, outputPath] = process.argv;
if (!inputPath || !outputPath) throw new Error("usage: phase3c-build-founder-cohort-handoff <input.json> <output.json>");

const input = JSON.parse(fs.readFileSync(path.resolve(inputPath), "utf8"));
const handoff = createFounderWorldCohortHandoff(input);
const target = path.resolve(outputPath);
fs.writeFileSync(target, `${JSON.stringify(handoff, null, 2)}\n`, { encoding: "utf8", mode: 0o600 });
fs.chmodSync(target, 0o600);
process.stdout.write(`${JSON.stringify({ spotCount: handoff.spots.length, cohortHash: handoff.manifest.cohortHash, handoffHash: handoff.handoffHash })}\n`);
