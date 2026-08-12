import { createRandom } from "./random.mjs";
export function pairedBootstrap(pairs, { iterations = 2000, seed = "bootstrap", confidence = 0.95 } = {}) {
  if (!pairs.length) return { n: 0, meanDelta: null, medianDelta: null, interval: null, wins: 0, ties: 0, losses: 0 };
  const deltas = pairs.map(([a, b]) => b - a); const random = createRandom(seed); const samples = [];
  for (let i = 0; i < iterations; i += 1) { let total = 0; for (let j = 0; j < deltas.length; j += 1) total += deltas[random.int(0, deltas.length - 1)]; samples.push(total / deltas.length); }
  samples.sort((a, b) => a - b); const alpha = (1 - confidence) / 2; const sorted = [...deltas].sort((a, b) => a - b);
  return { n: deltas.length, meanDelta: deltas.reduce((a, b) => a + b, 0) / deltas.length, medianDelta: sorted[Math.floor(sorted.length / 2)], interval: [samples[Math.floor(alpha * samples.length)], samples[Math.min(samples.length - 1, Math.floor((1 - alpha) * samples.length))]], wins: deltas.filter((x) => x > 0).length, ties: deltas.filter((x) => x === 0).length, losses: deltas.filter((x) => x < 0).length };
}
