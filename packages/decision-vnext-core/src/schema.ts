export class ContractValidationError extends Error {
  constructor(readonly path: string, message: string) {
    super(`${path}: ${message}`);
    this.name = "ContractValidationError";
  }
}

export interface Schema<T> {
  readonly optional?: boolean;
  parse(value: unknown, path?: string): T;
}

export type Infer<S extends Schema<unknown>> = S extends Schema<infer T> ? T : never;
type Shape = Readonly<Record<string, Schema<unknown>>>;
type RequiredKeys<S extends Shape> = {
  [K in keyof S]: S[K] extends { readonly optional: true } ? never : K
}[keyof S];
type OptionalKeys<S extends Shape> = Exclude<keyof S, RequiredKeys<S>>;
type ObjectOutput<S extends Shape> = {
  readonly [K in RequiredKeys<S>]: Infer<S[K]>;
} & {
  readonly [K in OptionalKeys<S>]?: Infer<S[K]>;
};

const location = (path?: string) => path ?? "$";

export const schema = {
  string(options: { min?: number; max?: number; pattern?: RegExp } = {}): Schema<string> {
    return { parse(value, path) {
      if (typeof value !== "string") throw new ContractValidationError(location(path), "expected string");
      if (options.min !== undefined && value.length < options.min) throw new ContractValidationError(location(path), `minimum length ${options.min}`);
      if (options.max !== undefined && value.length > options.max) throw new ContractValidationError(location(path), `maximum length ${options.max}`);
      if (options.pattern && !options.pattern.test(value)) throw new ContractValidationError(location(path), "invalid format");
      return value;
    }};
  },
  number(options: { min?: number; max?: number; integer?: boolean } = {}): Schema<number> {
    return { parse(value, path) {
      if (typeof value !== "number" || !Number.isFinite(value)) throw new ContractValidationError(location(path), "expected finite number");
      if (options.integer && !Number.isInteger(value)) throw new ContractValidationError(location(path), "expected integer");
      if (options.min !== undefined && value < options.min) throw new ContractValidationError(location(path), `minimum ${options.min}`);
      if (options.max !== undefined && value > options.max) throw new ContractValidationError(location(path), `maximum ${options.max}`);
      return Object.is(value, -0) ? 0 : value;
    }};
  },
  boolean(): Schema<boolean> {
    return { parse(value, path) {
      if (typeof value !== "boolean") throw new ContractValidationError(location(path), "expected boolean");
      return value;
    }};
  },
  literal<const T extends string | number | boolean>(expected: T): Schema<T> {
    return { parse(value, path) {
      if (value !== expected) throw new ContractValidationError(location(path), `expected ${JSON.stringify(expected)}`);
      return expected;
    }};
  },
  enum<const T extends readonly [string, ...string[]]>(values: T): Schema<T[number]> {
    const allowed = new Set<string>(values);
    return { parse(value, path) {
      if (typeof value !== "string" || !allowed.has(value)) throw new ContractValidationError(location(path), `expected one of ${values.join(", ")}`);
      return value as T[number];
    }};
  },
  array<S extends Schema<unknown>>(item: S, options: { max?: number } = {}): Schema<readonly Infer<S>[]> {
    return { parse(value, path) {
      if (!Array.isArray(value)) throw new ContractValidationError(location(path), "expected array");
      if (options.max !== undefined && value.length > options.max) throw new ContractValidationError(location(path), `maximum items ${options.max}`);
      return value.map((entry, index) => item.parse(entry, `${location(path)}[${index}]`) as Infer<S>);
    }};
  },
  optional<S extends Schema<unknown>>(inner: S): Schema<Infer<S>> & { readonly optional: true } {
    return { optional: true, parse(value, path) {
      if (value === undefined) throw new ContractValidationError(location(path), "optional field parser received undefined");
      return inner.parse(value, path) as Infer<S>;
    }};
  },
  object<const S extends Shape>(shape: S): Schema<ObjectOutput<S>> {
    const allowed = new Set(Object.keys(shape));
    return { parse(value, path = "$") {
      if (!value || typeof value !== "object" || Array.isArray(value)) throw new ContractValidationError(path, "expected object");
      const input = value as Record<string, unknown>;
      for (const key of Object.keys(input)) if (!allowed.has(key)) throw new ContractValidationError(`${path}.${key}`, "unknown field");
      const output: Record<string, unknown> = {};
      for (const [key, member] of Object.entries(shape)) {
        if (!(key in input)) {
          if (!member.optional) throw new ContractValidationError(`${path}.${key}`, "required field missing");
          continue;
        }
        if (input[key] === undefined) throw new ContractValidationError(`${path}.${key}`, "undefined is not a contract value");
        output[key] = member.parse(input[key], `${path}.${key}`);
      }
      return output as ObjectOutput<S>;
    }};
  },
  union<const S extends readonly Schema<unknown>[]>(members: S): Schema<Infer<S[number]>> {
    return { parse(value, path) {
      const failures: string[] = [];
      for (const member of members) {
        try { return member.parse(value, path) as Infer<S[number]>; }
        catch (error) { failures.push(error instanceof Error ? error.message : String(error)); }
      }
      throw new ContractValidationError(location(path), `no union variant matched (${failures.join(" | ")})`);
    }};
  },
};

export const version = <const T extends string>(value: T) => schema.literal(value);
export const identifier = schema.string({ min: 1, max: 160, pattern: /^[a-zA-Z0-9][a-zA-Z0-9._:-]*$/ });
export const sha256 = schema.string({ pattern: /^[a-f0-9]{64}$/ });
export const timestamp: Schema<string> = {
  parse(value, path) {
    const parsed = schema.string({ pattern: /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/ }).parse(value, path);
    if (Number.isNaN(Date.parse(parsed)) || new Date(parsed).toISOString() !== parsed) {
      throw new ContractValidationError(location(path), "expected canonical UTC timestamp");
    }
    return parsed;
  },
};
