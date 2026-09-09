import { contentHash, deepFreeze } from "./canonical.js";
import { schema, type Infer } from "./schema.js";

export const SyntheticWorldConfigSchema = schema.object({
  configVersion: schema.literal("backyrd-vnext-sandbox-config-v1"),
  worldVersion: schema.string({ pattern: /^backyrd-vnext-synthetic-world-[a-z0-9-]+$/ }),
  seed: schema.number({ integer: true, min: 1 }),
  observedAt: schema.string({ pattern: /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/ }),
  spotCount: schema.number({ integer: true, min: 8, max: 2_000 }),
  userCount: schema.number({ integer: true, min: 1, max: 1_000 }),
  cities: schema.array(schema.string({ min: 1, max: 80 }), { max: 20 }),
  candidatePoolSize: schema.number({ integer: true, min: 4, max: 500 }),
});
export type SyntheticWorldConfig = Infer<typeof SyntheticWorldConfigSchema>;

export interface SyntheticCommercialProbe {
  readonly paymentStatus: "none" | "paid";
  readonly ownerTier: "standard" | "fixture-premium";
  readonly sponsored: boolean;
}

export interface SyntheticSpot {
  readonly id: string;
  readonly sourceId: string;
  readonly city: string;
  readonly distanceMeters: number;
  readonly distributionAllowed: boolean;
  readonly openStatus: "open" | "closed" | "unknown";
  readonly placeType: string;
  readonly intentKeys: readonly string[];
  readonly moodKeys: readonly string[];
  readonly popularity: number;
  readonly dataQuality: number;
  readonly commercialProbe: SyntheticCommercialProbe;
}

export interface SyntheticUser {
  readonly id: string;
  readonly fixtureTasteKeys: readonly string[];
  readonly fixtureAversionKeys: readonly string[];
}

export interface SyntheticWorld {
  readonly version: string;
  readonly observedAt: string;
  readonly seed: number;
  readonly spots: readonly SyntheticSpot[];
  readonly users: readonly SyntheticUser[];
  readonly worldHash: string;
}

function seeded(seed: number): () => number {
  let state = seed >>> 0;
  return () => {
    state = (Math.imul(state, 1664525) + 1013904223) >>> 0;
    return state / 0x1_0000_0000;
  };
}

const pick = <T>(values: readonly T[], index: number): T => {
  const value = values[index % values.length];
  if (value === undefined) throw new Error("synthetic_fixture_empty_choice");
  return value;
};
const rounded = (value: number) => Number(value.toFixed(6));

export function generateSyntheticWorld(raw: unknown): SyntheticWorld {
  const config = SyntheticWorldConfigSchema.parse(raw);
  if (config.cities.length < 2) throw new Error("synthetic_world_requires_multiple_cities");
  const random = seeded(config.seed);
  const placeTypes = ["fixture.cafe", "fixture.restaurant", "fixture.bar", "fixture.activity"] as const;
  const intents = ["fixture.eat", "fixture.drink", "fixture.talk", "fixture.explore"] as const;
  const moods = ["fixture.calm", "fixture.lively", "fixture.cozy", "fixture.outdoors"] as const;
  const spots: SyntheticSpot[] = Array.from({ length: config.spotCount }, (_, index) => ({
    id: `syn-spot-${String(index + 1).padStart(4, "0")}`,
    sourceId: `synthetic-source-${String(index + 1).padStart(4, "0")}`,
    city: pick(config.cities, index),
    distanceMeters: Math.round(100 + random() * 19_900),
    distributionAllowed: index % 17 !== 0,
    openStatus: pick(["open", "closed", "unknown"] as const, index + config.seed),
    placeType: pick(placeTypes, index + config.seed),
    intentKeys: [pick(intents, index), pick(intents, index + 1)].sort(),
    moodKeys: [pick(moods, index + config.seed), pick(moods, index + config.seed + 1)].sort(),
    popularity: rounded(random()),
    dataQuality: rounded(0.2 + random() * 0.8),
    commercialProbe: {
      paymentStatus: index % 2 ? "paid" : "none",
      ownerTier: index % 3 ? "standard" : "fixture-premium",
      sponsored: index % 5 === 0,
    },
  }));
  const users: SyntheticUser[] = Array.from({ length: config.userCount }, (_, index) => ({
    id: `syn-user-${String(index + 1).padStart(4, "0")}`,
    fixtureTasteKeys: [pick(moods, index), pick(intents, index + 2)].sort(),
    fixtureAversionKeys: [pick(moods, index + 2)],
  }));
  const body = { version: config.worldVersion, observedAt: config.observedAt, seed: config.seed, spots, users };
  return deepFreeze({ ...body, worldHash: contentHash(body) }) as SyntheticWorld;
}

export function mutateCommercialProbe(world: SyntheticWorld): SyntheticWorld {
  const spots = world.spots.map((spot) => ({
    ...spot,
    commercialProbe: {
      paymentStatus: spot.commercialProbe.paymentStatus === "paid" ? "none" as const : "paid" as const,
      ownerTier: spot.commercialProbe.ownerTier === "standard" ? "fixture-premium" as const : "standard" as const,
      sponsored: !spot.commercialProbe.sponsored,
    },
  }));
  const body = { version: world.version, observedAt: world.observedAt, seed: world.seed, spots, users: world.users };
  return deepFreeze({ ...body, worldHash: contentHash(body) }) as SyntheticWorld;
}
