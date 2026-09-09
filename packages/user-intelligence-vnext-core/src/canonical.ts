import { createHash } from "node:crypto";

function normalize(value: unknown, path: string): unknown {
  if (value === undefined) throw new Error(`canonical_undefined:${path}`);
  if (value === null || typeof value === "boolean") return value;
  if (typeof value === "string") return value.normalize("NFC");
  if (typeof value === "number") {
    if (!Number.isFinite(value)) throw new Error(`canonical_non_finite_number:${path}`);
    return Object.is(value, -0) ? 0 : value;
  }
  if (Array.isArray(value)) return value.map((entry, index) => normalize(entry, `${path}[${index}]`));
  if (typeof value === "object") {
    const input = value as Record<string, unknown>;
    return Object.fromEntries(Object.keys(input).sort().map((key) => [key, normalize(input[key], `${path}.${key}`)]));
  }
  throw new Error(`canonical_unsupported_type:${path}`);
}

export function canonicalJson(value: unknown): string {
  return JSON.stringify(normalize(value, "$"));
}

export function canonicalBytes(value: unknown): number {
  return Buffer.byteLength(canonicalJson(value), "utf8");
}

export function contentHash(value: unknown): string {
  return createHash("sha256").update(canonicalJson(value), "utf8").digest("hex");
}

export function hashBody<T extends Record<string, unknown>>(value: T, excludedKeys: readonly string[]): string {
  const body = Object.fromEntries(Object.entries(value).filter(([key]) => !excludedKeys.includes(key)));
  return contentHash(body);
}
