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

export function contentHash(value: unknown): string {
  return createHash("sha256").update(canonicalJson(value), "utf8").digest("hex");
}

export function withContentHash<T extends object>(value: T, field: string): T & Record<string, string> {
  return { ...value, [field]: contentHash(value) };
}

export function assertContentHash(value: Record<string, unknown>, field: string): void {
  const actual = value[field];
  const body = { ...value };
  delete body[field];
  if (actual !== contentHash(body)) throw new Error(`${field}_mismatch`);
}

export function deepFreeze<T>(value: T): Readonly<T> {
  if (value && typeof value === "object" && !Object.isFrozen(value)) {
    Object.freeze(value);
    for (const child of Object.values(value as Record<string, unknown>)) deepFreeze(child);
  }
  return value;
}
