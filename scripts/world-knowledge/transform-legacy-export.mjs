import { chmodSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { transformLegacyExport } from "../../packages/world-knowledge-core/dist/index.js";
const sourcePath = resolve(process.argv[2] ?? ".local/world-knowledge-import/production-export.json");
const outputPath = resolve(process.argv[3] ?? ".local/world-knowledge-import/transform.json");
const result = transformLegacyExport(JSON.parse(readFileSync(sourcePath, "utf8")));
mkdirSync(dirname(outputPath), { recursive: true, mode: 0o700 }); writeFileSync(outputPath, `${JSON.stringify(result, null, 2)}\n`, { mode: 0o600 }); chmodSync(outputPath, 0o600);
process.stdout.write(`${JSON.stringify({ output: outputPath, manifestHash: result.manifestHash, results: result.results.length })}\n`);
