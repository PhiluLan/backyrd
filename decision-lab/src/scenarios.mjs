import { deterministicUuid } from "./random.mjs";

export function scenarioLibrary(world) {
  const byMaturity = (value) => world.users.find((user) => user.maturity === value) ?? world.users[0];
  const base = [
    ["cold-cozy-date", byMaturity("cold"), { city: "Synthetic Basel", query: "gemütlich Date nicht teuer, später Drinks", preferredPlaceTypes: ["cafe", "bar"], audience: ["date"], strictCategoryIntent: true }],
    ["mature-intent-conflict", byMaturity("mature"), { city: "Synthetic Basel", query: "lebhaft Drinks mit Freunden", preferredPlaceTypes: ["bar"], audience: ["friends"], strictCategoryIntent: true }],
    ["sparse-unusual", byMaturity("sparse"), { city: "Synthetic Basel", query: "etwas ungewöhnliches drinnen allein, kein Essen, Sonntag Nachmittag", preferredPlaceTypes: ["culture", "activity"], audience: ["solo"], strictCategoryIntent: true }],
    ["guided-family", byMaturity("developing"), { city: "Synthetic Basel", query: "Aktivität mit Kind", preferredPlaceTypes: ["activity"], audience: ["family"], strictCategoryIntent: true }],
    ["exact-pending", byMaturity("power"), { city: "Synthetic Basel", query: world.spots.find((spot) => spot.observed.status === "pending").observed.name, preferredPlaceTypes: [], strictCategoryIntent: false }]
  ];
  return base.map(([name, user, request], index) => ({ id: deterministicUuid(`${world.manifest.worldId}:scenario`, index), partition: index < 3 ? "DEVELOPMENT" : "REGRESSION", name, userId: user.id, request: { ...request, moodA: null, moodB: null, limit: 16, v12Limit: 16, semanticLimit: 24, excludeSpotIds: [] } }));
}

export function counterfactualPairs(scenarios) {
  const dimensions = [
    ["audience", ["date"], ["friends"]], ["mood", "ruhig", "lebhaft"], ["price", "günstig", "premium"],
    ["audience", ["solo"], ["family"]], ["time", "Freitag Abend", "Sonntag Morgen"]
  ];
  return dimensions.map(([dimension, from, to], index) => {
    const base = structuredClone(scenarios[index % scenarios.length]);
    const changed = structuredClone(base);
    changed.id = deterministicUuid(`${base.id}:counterfactual`, index);
    changed.name = `${base.name}-${dimension}-counterfactual`;
    if (dimension === "audience") { base.request.audience = from; changed.request.audience = to; }
    else { base.request.query = `${base.request.query} ${from}`; changed.request.query = `${base.request.query.replace(String(from), "")} ${to}`.trim(); }
    return { id: deterministicUuid(`${base.id}:pair`, index), dimension, base, counterfactual: changed };
  });
}
