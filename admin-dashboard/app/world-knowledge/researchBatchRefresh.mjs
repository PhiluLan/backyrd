/**
 * Carry only researched suggestions onto a new, server-issued export. The old
 * manifest, current values and export hash must never be reused after drift.
 */
export function refreshResearchDocument(previous, current) {
  const previousSpots = previous?.batch?.spots;
  const currentSpots = current?.batch?.spots;
  const researchSpots = previous?.research?.spots;
  if (!Array.isArray(previousSpots) || !Array.isArray(currentSpots) || !Array.isArray(researchSpots)
    || previousSpots.length !== currentSpots.length || previousSpots.length !== researchSpots.length
    || previous?.batch?.authoringCatalogVersion !== current?.batch?.authoringCatalogVersion
    || previous?.batch?.authoringCatalogHash !== current?.batch?.authoringCatalogHash) {
    throw new Error("Der Feldkatalog oder die Spot-Auswahl hat sich geändert. Bitte neu exportieren und die Recherche manuell prüfen.");
  }
  const original = new Map(previousSpots.map((spot) => [spot.spotId, spot]));
  const researched = new Map(researchSpots.map((spot) => [spot.spotId, spot]));
  if (original.size !== previousSpots.length || researched.size !== researchSpots.length
    || new Set(currentSpots.map((spot) => spot.spotId)).size !== currentSpots.length) {
    throw new Error("Die Spot-Auswahl ist nicht eindeutig. Bitte neu exportieren.");
  }
  const spots = currentSpots.map((spot) => {
    const before = original.get(spot.spotId);
    const research = researched.get(spot.spotId);
    if (!before || !research || before.name !== spot.name
      || !Array.isArray(research.claims) || !Array.isArray(research.unresolved)) {
      throw new Error("Ein Spot wurde umbenannt oder die Recherche passt nicht mehr zur Auswahl. Bitte neu exportieren und die Angaben manuell prüfen.");
    }
    return { spotId: spot.spotId, claims: research.claims, unresolved: research.unresolved };
  });
  return { ...current, research: { ...current.research, spots } };
}
