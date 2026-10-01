export type SearchableSpot = {
  name: string;
  address?: string | null;
  city?: string | null;
  categories?: { name?: string | null } | null;
};

export function normalizeSpotSearch(value: string | null | undefined): string {
  return (value ?? "")
    .toLocaleLowerCase("de-CH")
    .replace(/ß/g, "ss")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^\p{L}\p{N}]+/gu, " ")
    .trim();
}

function oneEditAway(left: string, right: string): boolean {
  if (Math.abs(left.length - right.length) > 1) return false;
  let leftIndex = 0;
  let rightIndex = 0;
  let edits = 0;
  while (leftIndex < left.length && rightIndex < right.length) {
    if (left[leftIndex] === right[rightIndex]) {
      leftIndex += 1;
      rightIndex += 1;
      continue;
    }
    edits += 1;
    if (edits > 1) return false;
    if (left.length >= right.length) leftIndex += 1;
    if (right.length >= left.length) rightIndex += 1;
  }
  return edits + Number(leftIndex < left.length || rightIndex < right.length) <= 1;
}

export function spotMatchesSearch(spot: SearchableSpot, query: string, moods: string[] = []): boolean {
  const normalized = normalizeSpotSearch(query);
  if (!normalized) return true;
  const terms = normalized.split(/\s+/);
  const searchable = normalizeSpotSearch([
    spot.name,
    spot.address,
    spot.city,
    spot.categories?.name,
    ...moods,
  ].filter(Boolean).join(" "));
  const words = searchable.split(/\s+/);
  return terms.every((term) => searchable.includes(term) || (
    /ae|oe|ue/.test(term) && searchable.includes(term.replace(/ae/g, "a").replace(/oe/g, "o").replace(/ue/g, "u"))
  ) || (
    term.length >= 5 && words.some((word) => word.length >= 5 && oneEditAway(term, word))
  ));
}
