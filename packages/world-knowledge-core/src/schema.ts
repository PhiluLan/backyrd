export class ContractValidationError extends Error {
  constructor(readonly path: string, message: string) {
    super(`${path}: ${message}`);
    this.name = "ContractValidationError";
  }
}

export function object(value: unknown, path = "$", allowed?: readonly string[]): Record<string, unknown> {
  if (!value || typeof value !== "object" || Array.isArray(value)) throw new ContractValidationError(path, "expected object");
  const result = value as Record<string, unknown>;
  if (allowed) {
    const keys = new Set(allowed);
    for (const key of Object.keys(result)) if (!keys.has(key)) throw new ContractValidationError(`${path}.${key}`, "unknown field");
  }
  return result;
}

export function required(record: Record<string, unknown>, key: string, path = "$"): unknown {
  if (!(key in record) || record[key] === undefined) throw new ContractValidationError(`${path}.${key}`, "required field missing");
  return record[key];
}

export function string(value: unknown, path: string, options: { min?: number; max?: number; pattern?: RegExp } = {}): string {
  if (typeof value !== "string") throw new ContractValidationError(path, "expected string");
  if (options.min !== undefined && value.length < options.min) throw new ContractValidationError(path, `minimum length ${options.min}`);
  if (options.max !== undefined && value.length > options.max) throw new ContractValidationError(path, `maximum length ${options.max}`);
  if (options.pattern && !options.pattern.test(value)) throw new ContractValidationError(path, "invalid format");
  return value.normalize("NFC");
}

export function enumValue<T extends readonly string[]>(value: unknown, values: T, path: string): T[number] {
  if (typeof value !== "string" || !values.includes(value)) throw new ContractValidationError(path, `expected one of ${values.join(", ")}`);
  return value as T[number];
}

export function number(value: unknown, path: string, options: { min?: number; max?: number; integer?: boolean } = {}): number {
  if (typeof value !== "number" || !Number.isFinite(value)) throw new ContractValidationError(path, "expected finite number");
  if (options.integer && !Number.isInteger(value)) throw new ContractValidationError(path, "expected integer");
  if (options.min !== undefined && value < options.min) throw new ContractValidationError(path, `minimum ${options.min}`);
  if (options.max !== undefined && value > options.max) throw new ContractValidationError(path, `maximum ${options.max}`);
  return Object.is(value, -0) ? 0 : value;
}

export function boolean(value: unknown, path: string): boolean {
  if (typeof value !== "boolean") throw new ContractValidationError(path, "expected boolean");
  return value;
}

export function array(value: unknown, path: string, options: { min?: number; max?: number } = {}): readonly unknown[] {
  if (!Array.isArray(value)) throw new ContractValidationError(path, "expected array");
  if (options.min !== undefined && value.length < options.min) throw new ContractValidationError(path, `minimum items ${options.min}`);
  if (options.max !== undefined && value.length > options.max) throw new ContractValidationError(path, `maximum items ${options.max}`);
  return value;
}

export function timestamp(value: unknown, path: string): string {
  const parsed = string(value, path, { pattern: /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/ });
  if (Number.isNaN(Date.parse(parsed)) || new Date(parsed).toISOString() !== parsed) throw new ContractValidationError(path, "expected canonical UTC timestamp");
  return parsed;
}

export function date(value: unknown, path: string): string {
  const parsed = string(value, path, { pattern: /^\d{4}-\d{2}-\d{2}$/ });
  if (Number.isNaN(Date.parse(`${parsed}T00:00:00.000Z`))) throw new ContractValidationError(path, "expected calendar date");
  return parsed;
}

export function identifier(value: unknown, path: string): string {
  return string(value, path, { min: 1, max: 180, pattern: /^[a-zA-Z0-9][a-zA-Z0-9._:@/-]*$/ });
}

export function hash(value: unknown, path: string): string {
  return string(value, path, { pattern: /^[a-f0-9]{64}$/ });
}

export function nullable<T>(value: unknown, parser: (input: unknown) => T): T | null {
  return value === null ? null : parser(value);
}
