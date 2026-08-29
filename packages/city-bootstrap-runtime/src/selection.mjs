const CATEGORY_TARGET = Object.freeze({ Restaurant: 0.34, Bar: 0.16, "Café": 0.14, Museum: 0.08, "Aktivität": 0.12, "Besonderes Erlebnis": 0.07, Spaziergang: 0.04, "Unterkunft / Hotel": 0.03, Aussichtspunkt: 0.01, "Wellness / Spa": 0.01 });

function cell(candidate, config) {
  const rows = 4, cols = 4;
  const y = Math.min(rows - 1, Math.max(0, Math.floor(((candidate.lat - config.bounds.south) / (config.bounds.north - config.bounds.south)) * rows)));
  const x = Math.min(cols - 1, Math.max(0, Math.floor(((candidate.lng - config.bounds.west) / (config.bounds.east - config.bounds.west)) * cols)));
  return `${y}:${x}`;
}
export function selectLaunchCohort(candidates, existingSpots, config, targetNewCount) {
  const selected = [], remaining = candidates.filter((row) => row.relevance?.state === "RELEVANT" && row.identity?.state === "NEW_IDENTITY" && ["EXACT", "STRONG"].includes(row.identity.confidence));
  const categoryCounts = new Map(), cellCounts = new Map();
  for (const spot of existingSpots ?? []) categoryCounts.set(spot.category_name, (categoryCounts.get(spot.category_name) ?? 0) + 1);
  while (selected.length < targetNewCount && remaining.length) {
    remaining.sort((a, b) => {
      const total = (existingSpots?.length ?? 0) + selected.length + 1;
      const categoryNeedA = (CATEGORY_TARGET[a.relevance.categoryName] ?? 0.02) * total - (categoryCounts.get(a.relevance.categoryName) ?? 0);
      const categoryNeedB = (CATEGORY_TARGET[b.relevance.categoryName] ?? 0.02) * total - (categoryCounts.get(b.relevance.categoryName) ?? 0);
      const geoA = cellCounts.get(cell(a, config)) ?? 0, geoB = cellCounts.get(cell(b, config)) ?? 0;
      return categoryNeedB - categoryNeedA || geoA - geoB || (b.sourceQuality ?? 0) - (a.sourceQuality ?? 0) || a.identityKey.localeCompare(b.identityKey);
    });
    const next = remaining.shift(); selected.push(next);
    categoryCounts.set(next.relevance.categoryName, (categoryCounts.get(next.relevance.categoryName) ?? 0) + 1);
    cellCounts.set(cell(next, config), (cellCounts.get(cell(next, config)) ?? 0) + 1);
  }
  return Object.freeze({ selected: Object.freeze(selected), remaining: Object.freeze(remaining), categoryCounts: Object.fromEntries(categoryCounts), geographicCells: Object.fromEntries(cellCounts) });
}

export function selectRepresentativePilot(candidates, size = 30) {
  const eligible = candidates.filter((row) => row.relevance?.state === "RELEVANT" && row.identity?.state === "NEW_IDENTITY" && ["EXACT", "STRONG"].includes(row.identity?.confidence) && row.lifecycleState === "EVIDENCE_PENDING");
  const pools = new Map(); for (const row of eligible) { const key = row.relevance.categoryName; if (!pools.has(key)) pools.set(key, []); pools.get(key).push(row); }
  for (const rows of pools.values()) rows.sort((a, b) => a.identityKey.localeCompare(b.identityKey));
  const result = []; while (result.length < size && [...pools.values()].some((rows) => rows.length)) for (const key of [...pools.keys()].sort()) { const row = pools.get(key).shift(); if (row && result.length < size) result.push(row); }
  return Object.freeze(result);
}
