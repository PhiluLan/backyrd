import { mkdir, readFile, writeFile } from "node:fs/promises";
import { createHash } from "node:crypto";
import { execFileSync } from "node:child_process";
import { dirname, resolve } from "node:path";

export async function readJson(path) { return JSON.parse(await readFile(path, "utf8")); }
export async function writeJson(path, value) { await mkdir(dirname(path), { recursive: true }); await writeFile(path, `${JSON.stringify(value, null, 2)}\n`); }
export function gitSha(cwd) { try { return execFileSync("git", ["rev-parse", "HEAD"], { cwd, encoding: "utf8" }).trim(); } catch { return "UNKNOWN"; } }
export async function hashFiles(paths) { const hash = createHash("sha256"); for (const path of [...paths].sort()) hash.update(await readFile(path)); return hash.digest("hex"); }
export const repoRoot = resolve(new URL("../..", import.meta.url).pathname);
