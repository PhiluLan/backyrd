const isBlank = (value: unknown): boolean => {
  if (value == null) return true;
  if (typeof value === "string") return value.trim() === "";
  if (Array.isArray(value)) return value.length === 0;
  if (typeof value === "object") return Object.values(value).every(isBlank);
  return false;
};

/** Older canonical snapshots may represent an omitted condition as empty strings
 * or a nested empty range. They still mean an unconditional observation. */
export const isUnconditionalContextConditions = (value: unknown): boolean =>
  value == null || (typeof value === "object" && !Array.isArray(value) && isBlank(value));
