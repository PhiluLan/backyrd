import { CATEGORIES, MOODS } from "./model.mjs";
import { round } from "./random.mjs";

const clamp = (value, min = 0, max = 1) => Math.max(min, Math.min(max, value));
const cosine = (a, b) => {
  let dot = 0, aa = 0, bb = 0;
  for (let index = 0; index < a.length; index += 1) { dot += a[index] * b[index]; aa += a[index] ** 2; bb += b[index] ** 2; }
  return aa && bb ? dot / Math.sqrt(aa * bb) : 0;
};

// Independent latent evaluator: it has no dependency on V11/V12/V13 scores, ranks,
// semantic similarity, observed Taste or generated Product copy.
export function latentUtility(user, spot, context) {
  const categoryPreference = CATEGORIES.map((key) => user.latent.category[key]);
  const categoryIdentity = CATEGORIES.map((key) => key === spot.category ? 1 : 0);
  const moodPreference = MOODS.map((key) => user.latent.mood[key] * (context.moods[key] ?? 0.35));
  const moodReality = MOODS.map((key) => spot.latent.mood[key]);
  const categoryFit = cosine(categoryPreference, categoryIdentity);
  const moodFit = cosine(moodPreference, moodReality);
  const priceFit = 1 - Math.min(1, Math.abs(user.latent.priceTarget - spot.latent.price) / 4);
  const socialFit = 1 - Math.abs((user.latent.social[context.audience] ?? 0.5) - spot.latent.social);
  const indoorFit = context.indoorRequired ? spot.latent.indoor : 0.75 + 0.25 * (1 - spot.latent.indoor);
  const distanceFit = Math.exp(-spot.latent.distanceKm / Math.max(0.8, user.latent.distanceToleranceKm));
  const noveltyFit = 1 - Math.abs(user.latent.novelty - spot.latent.novelty);
  const openConstraint = context.requiresOpen && !spot.latent.openByContext[context.timeBucket] ? 0 : 1;
  const productConstraint = spot.observed.status === "approved" ? 1 : 0;
  const components = { categoryFit, moodFit, priceFit, socialFit, indoorFit, distanceFit, noveltyFit, intrinsic: spot.latent.quality };
  const soft = 0.2 * categoryFit + 0.24 * moodFit + 0.12 * priceFit + 0.1 * socialFit + 0.08 * indoorFit + 0.08 * distanceFit + 0.06 * noveltyFit + 0.12 * spot.latent.quality;
  return { utility: round(clamp(soft) * openConstraint * productConstraint), components: Object.fromEntries(Object.entries(components).map(([k, v]) => [k, round(v)])), constraints: { open: Boolean(openConstraint), productEligible: Boolean(productConstraint) } };
}
