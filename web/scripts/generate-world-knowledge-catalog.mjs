import { createHash } from "node:crypto";
import { readFile, writeFile } from "node:fs/promises";
import { resolve } from "node:path";

const input = process.argv[2];
const output = process.argv[3];
if (!input || !output) throw new Error("Usage: node generate-world-knowledge-catalog.mjs <source.opml> <output.json>");

const xml = await readFile(resolve(input), "utf8");
const decode = (value) => value
  .replaceAll("&amp;", "&")
  .replaceAll("&quot;", '"')
  .replaceAll("&apos;", "'")
  .replaceAll("&lt;", "<")
  .replaceAll("&gt;", ">");

const root = { text: "ROOT", children: [] };
const stack = [root];
for (const token of xml.matchAll(/<outline text="([^"]*)"[^>]*>|<\/outline>/g)) {
  if (token[1] !== undefined) {
    const node = { text: decode(token[1]).trim(), children: [] };
    stack.at(-1).children.push(node);
    if (!token[0].endsWith("/>")) stack.push(node);
  } else if (stack.length > 1) {
    stack.pop();
  }
}

const categoryKeys = [
  "EAT", "DRINKS", "COFFEE_DAYTIME", "NIGHTLIFE", "CULTURE_ARTS", "ENTERTAINMENT",
  "ACTIVITIES_PLAY", "SPORT_MOVEMENT", "OUTDOOR_NATURE", "WELLNESS_RELAXATION",
  "SHOPPING_MARKETS", "STAY", "COMMUNITY_SOCIAL", "ATTRACTIONS_LANDMARKS",
  "TEMPORARY_PLACES", "SERVICES_SPECIAL_EXPERIENCES",
];
const categoryLabels = [
  "Eat", "Drinks", "Coffee & Daytime", "Nightlife", "Culture & Arts", "Entertainment",
  "Activities & Play", "Sport & Movement", "Outdoor & Nature", "Wellness & Relaxation",
  "Shopping & Markets", "Stay", "Community & Social Spaces", "Attractions & Landmarks",
  "Temporary Places", "Services & Special Experiences",
];
const groupMap = {
  "Subcategories": "CLASSIFICATION",
  "Decision Intents": "INTENTS",
  "Capabilities": "CAPABILITIES",
  "Situation Fit": "SITUATION_FIT",
  "Amenities & Constraints": "AMENITIES_CONSTRAINTS",
  "Temporal / Current State": "TEMPORAL_STATE",
  "Evidence & Confidence": "EVIDENCE_CONFIDENCE",
};
const cuisine = new Set([
  "Seafood", "Steakhouse", "Burger", "Pizza", "Pasta", "Asian", "Japanese", "Sushi", "Korean",
  "Chinese", "Thai", "Vietnamese", "Indian", "Middle Eastern", "Mediterranean", "Italian", "French",
  "Swiss", "Mexican", "Latin American", "African", "Fusion",
]);
const slug = (value) => value.toLowerCase().normalize("NFKD").replace(/[\u0300-\u036f]/g, "").replace(/&/g, " and ").replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "").slice(0, 56);
const idFor = (...parts) => `${slug(parts.at(-1))}-${createHash("sha1").update(parts.join("|")).digest("hex").slice(0, 8)}`;
const world = root.children.find((node) => node.text === "World Knowledge");
if (!world) throw new Error("World Knowledge root not found");

const occurrences = [];
for (const [categoryIndex, category] of world.children.entries()) {
  const categoryKey = categoryKeys[categoryIndex];
  if (!categoryKey) continue;
  for (const group of category.children) {
    const groupKey = groupMap[group.text];
    if (!groupKey) continue;
    const walk = (node, parents = []) => {
      if (node.children.length === 0) {
        const family = parents.join(" / ") || group.text;
        const semanticClass = groupKey === "CLASSIFICATION"
          ? (cuisine.has(node.text) ? "CUISINE" : /restaurant|bistro|brasserie|bar|club|hotel|museum|gallery|market|park|shop|studio|center|centre|theatre|theater|cinema|café|cafe|bakery|venue|space|place|spot|hall|court|landmark|attraction/i.test(node.text) ? "SUBCATEGORY" : "OFFERING")
          : groupKey === "INTENTS" ? "DECISION_INTENT"
          : groupKey === "CAPABILITIES" ? "CAPABILITY"
          : groupKey === "SITUATION_FIT" ? "DIRECT_FIT"
          : groupKey === "TEMPORAL_STATE" ? "TEMPORAL_STATE"
          : groupKey === "EVIDENCE_CONFIDENCE" ? "EVIDENCE_DIMENSION"
          : /constraint|not allowed|prohibited|minimum|maximum|restriction/i.test(`${family} ${node.text}`) ? "CONSTRAINT" : "AMENITY";
        occurrences.push({ categoryKey, groupKey, family, label: node.text, semanticClass });
        return;
      }
      for (const child of node.children) walk(child, [...parents, node.text]);
    };
    for (const child of group.children) walk(child);
  }
}

const definitions = new Map();
for (const item of occurrences) {
  const identity = `${item.groupKey}|${item.family}|${item.label}`;
  const existing = definitions.get(identity);
  if (existing) {
    existing.occurrences += 1;
    if (!existing.applicableCategories.includes(item.categoryKey)) existing.applicableCategories.push(item.categoryKey);
    continue;
  }
  definitions.set(identity, {
    id: idFor(item.groupKey, item.family, item.label),
    label: item.label,
    group: item.groupKey,
    family: item.family,
    semanticClass: item.semanticClass,
    valueType: "BOOLEAN",
    unit: null,
    applicableCategories: [item.categoryKey],
    importance: item.groupKey === "TEMPORAL_STATE" ? "IMPORTANT" : "STANDARD",
    ownerAccess: item.groupKey === "EVIDENCE_CONFIDENCE" ? "ADMIN" : item.groupKey === "TEMPORAL_STATE" || item.groupKey === "AMENITIES_CONSTRAINTS" ? "PRO" : "BASIC",
    reviewState: /\//.test(item.label) || /\boder\b/i.test(item.label) ? "REVIEW_NEEDED" : "DRAFT",
    occurrences: 1,
    source: "Backyrd World Knowledge Zielbild.opml",
  });
}

const categories = categoryKeys.map((key, index) => ({ key, label: categoryLabels[index], sourceLabel: world.children[index]?.text ?? categoryLabels[index] }));
const registry = {
  catalogVersion: "wk-catalog-prototype-2026-09-09.1",
  generatedAt: "2026-09-09T00:00:00.000Z",
  source: { file: "Backyrd World Knowledge Zielbild.opml", sha256: createHash("sha256").update(xml).digest("hex"), occurrenceCount: occurrences.length },
  categories,
  definitions: [...definitions.values()].sort((a, b) => a.group.localeCompare(b.group) || a.family.localeCompare(b.family) || a.label.localeCompare(b.label)),
};
await writeFile(resolve(output), `${JSON.stringify(registry, null, 2)}\n`);
console.log(`Generated ${registry.definitions.length} definitions from ${occurrences.length} leaf occurrences.`);
