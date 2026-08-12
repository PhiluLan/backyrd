import { createHash } from "node:crypto";

export function canonicalize(value) {
  if (Array.isArray(value)) return value.map(canonicalize);
  if (value && typeof value === "object") return Object.fromEntries(Object.keys(value).sort().map((key) => [key, canonicalize(value[key])]));
  if (typeof value === "number" && !Number.isFinite(value)) throw new Error("Non-finite number in canonical result");
  return value;
}

export const canonicalJson = (value) => `${JSON.stringify(canonicalize(value))}\n`;
export const contentHash = (value) => createHash("sha256").update(canonicalJson(value)).digest("hex");
