import { createHash } from "node:crypto";
import { canonicalJson } from "./canonical-serialization.js";
export { canonicalJson, canonicalSort } from "./canonical-serialization.js";

export function sha256(value: unknown): string {
  return createHash("sha256").update(canonicalJson(value), "utf8").digest("hex");
}

export function hashBody<T extends Record<string, unknown>>(value: T, excludedKeys: readonly string[]): string {
  return sha256(Object.fromEntries(Object.entries(value).filter(([key]) => !excludedKeys.includes(key))));
}
