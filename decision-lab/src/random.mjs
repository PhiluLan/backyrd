import { createHash } from "node:crypto";

export function seedToUint32(seed) {
  return Number.parseInt(createHash("sha256").update(String(seed)).digest("hex").slice(0, 8), 16) >>> 0;
}

export function createRandom(seed) {
  let state = seedToUint32(seed) || 0x9e3779b9;
  const random = () => {
    state += 0x6d2b79f5;
    let value = state;
    value = Math.imul(value ^ (value >>> 15), value | 1);
    value ^= value + Math.imul(value ^ (value >>> 7), value | 61);
    return ((value ^ (value >>> 14)) >>> 0) / 4294967296;
  };
  random.int = (min, max) => Math.floor(random() * (max - min + 1)) + min;
  random.pick = (values) => values[Math.floor(random() * values.length)];
  random.bool = (probability = 0.5) => random() < probability;
  random.normal = (mean = 0, deviation = 1) => {
    const u = Math.max(random(), Number.EPSILON);
    const v = Math.max(random(), Number.EPSILON);
    return mean + deviation * Math.sqrt(-2 * Math.log(u)) * Math.cos(2 * Math.PI * v);
  };
  random.weighted = (entries) => {
    const total = entries.reduce((sum, entry) => sum + entry[1], 0);
    let cursor = random() * total;
    for (const [value, weight] of entries) {
      cursor -= weight;
      if (cursor <= 0) return value;
    }
    return entries.at(-1)[0];
  };
  return random;
}

export function deterministicUuid(namespace, index) {
  const hex = createHash("sha256").update(`${namespace}:${index}`).digest("hex").slice(0, 32).split("");
  hex[12] = "4";
  hex[16] = ["8", "9", "a", "b"][Number.parseInt(hex[16], 16) % 4];
  const value = hex.join("");
  return `${value.slice(0, 8)}-${value.slice(8, 12)}-${value.slice(12, 16)}-${value.slice(16, 20)}-${value.slice(20)}`;
}

export function round(value, digits = 4) {
  return Number(value.toFixed(digits));
}
