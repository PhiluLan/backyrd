import { createHash } from "node:crypto";

// FAST_SIMULATION only. Token-feature hashing preserves lexical similarity and
// produces a valid 1536-dimensional cosine vector; it is never labelled as V13 quality.
export function fastEmbedding(text, dimensions = 1536) {
  const vector = new Float64Array(dimensions);
  const tokens = String(text).toLowerCase().normalize("NFKD").replace(/[^a-z0-9äöüß]+/gi, " ").trim().split(/\s+/).filter(Boolean);
  for (const token of tokens) {
    const digest = createHash("sha256").update(token).digest();
    for (let index = 0; index < 8; index += 1) {
      const target = digest.readUInt16BE(index * 2) % dimensions;
      vector[target] += digest[index + 16] % 2 ? 1 : -1;
    }
  }
  const norm = Math.sqrt(vector.reduce((sum, value) => sum + value * value, 0)) || 1;
  return Array.from(vector, (value) => Number((value / norm).toFixed(8)));
}
