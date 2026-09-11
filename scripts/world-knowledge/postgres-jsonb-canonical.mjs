export function postgresJsonbText(value) {
  if (Array.isArray(value)) return `[${value.map(postgresJsonbText).join(", ")}]`;
  if (value && typeof value === "object") {
    const keys = Object.keys(value).sort((left, right) =>
      Buffer.byteLength(left, "utf8") - Buffer.byteLength(right, "utf8")
      || Buffer.compare(Buffer.from(left, "utf8"), Buffer.from(right, "utf8"))
    );
    return `{${keys.map((key) => `${JSON.stringify(key)}: ${postgresJsonbText(value[key])}`).join(", ")}}`;
  }
  return JSON.stringify(value);
}
