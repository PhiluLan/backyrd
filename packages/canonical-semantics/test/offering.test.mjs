import test from "node:test";
import assert from "node:assert/strict";
import { CANONICAL_OFFERINGS,FROZEN_N4_DIMENSIONS,FROZEN_TASTE_CONCEPTS,expandOfferingHierarchy,interpretCanonicalCurrentIntent } from "../src/index.mjs";

test("German gastronomy requests produce typed Offering and Purpose facts without Taste mutation",()=>{
  const cases=[
    ["Craft Beer und etwas essen",["CRAFT_BEER","FOOD"],["DRINK","EAT"]],
    ["Essen und Trinken",["FOOD","DRINKS"],["DRINK","EAT"]],
    ["eigenes Bier",["OWN_BREWED_BEER"],["DRINK"]],
    ["Kaffee und etwas Kleines essen",["COFFEE","SMALL_PLATES"],["DRINK","EAT"]],
    ["Frühstück",["BREAKFAST"],["EAT"]],
    ["Brunch",["BRUNCH"],["EAT"]],
    ["Mittagessen",["LUNCH"],["EAT"]],
    ["Abendessen",["DINNER"],["EAT"]],
    ["Sonntagmorgen frühstücken",["BREAKFAST"],["EAT"]],
    ["Apéro",[],["APERO"]],
    ["Afterwork",[],["AFTERWORK"]],
  ];
  for(const [query,offerings,purposes] of cases){const facts=interpretCanonicalCurrentIntent({query}).currentRequestFacts;assert.deepEqual(facts.offerings.value,offerings,query);assert.deepEqual(facts.purposes.value,purposes,query);assert.equal(facts.boundaries.durablePreference,false);}
  assert.equal(FROZEN_TASTE_CONCEPTS.length,45);assert.equal(FROZEN_N4_DIMENSIONS.length,60);assert.equal(CANONICAL_OFFERINGS.every((key)=>!FROZEN_TASTE_CONCEPTS.includes(key)&&!FROZEN_N4_DIMENSIONS.includes(key)),true);
});

test("Offering hierarchy is one-way and never fabricates a leaf",()=>{
  assert.deepEqual(expandOfferingHierarchy(["CRAFT_BEER"]),["DRINKS","BEER","CRAFT_BEER"]);
  assert.deepEqual(expandOfferingHierarchy(["BEER"]),["DRINKS","BEER"]);
  assert.equal(expandOfferingHierarchy(["BEER"]).includes("CRAFT_BEER"),false);
  assert.deepEqual(expandOfferingHierarchy(["DINNER"]),["FOOD","DINNER"]);
});
