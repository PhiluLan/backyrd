import test from "node:test";
import assert from "node:assert/strict";
import {assertRegistryIntegrity,canonicalizeProductMood,categoryToPlaceType,reviewOriginPair,interpretCanonicalCurrentIntent,ATMOSPHERE_CONCEPT_MAP,FACT_KEYS,HUMAN_SPOT_FIELDS,HUMAN_CONTEXT_LABELS,HUMAN_ACCESSIBILITY_LABELS,FROZEN_N4_DIMENSIONS,FROZEN_TASTE_CONCEPTS,N4_USER_EVIDENCE_AUTHORITY,classifyN4DimensionForUserEvidence,isUserTasteConcept} from "../src/index.mjs";

test("frozen registries and all 14 live categories are complete",()=>{assert.equal(assertRegistryIntegrity(),true);for(const value of ["Aktivität","Aussichtspunkt","Bar","Besonderes Erlebnis","Café","Event","Kino","Museum","Nachtleben","Restaurant","Spaziergang","Unterkunft / Hotel","Weinbar","Wellness & Spa"])assert.equal(categoryToPlaceType(value).status,"KNOWN");assert.deepEqual(categoryToPlaceType("future category"),{status:"UNKNOWN",category:"future category",placeType:null,contractVersion:"backyrd-canonical-semantics-v1"});});
test("mood aliases canonicalize while test and unsupported values do not qualify",()=>{assert.equal(canonicalizeProductMood("gemütlich").concept,"vibe.cozy");assert.equal(canonicalizeProductMood("quiet").concept,"vibe.quiet");assert.equal(canonicalizeProductMood("a").status,"INVALID");assert.equal(canonicalizeProductMood("invented").status,"UNMAPPED");assert.equal(canonicalizeProductMood("urban").status,"DISPLAY_ONLY");});
test("review origin adapter is explicit and conflict-safe",()=>{assert.deepEqual(reviewOriginPair({productEvidenceOrigin:"smart_review_v1"}),{reviewOrigin:"SMART_REVIEW",productEvidenceOrigin:"smart_review_v1"});assert.deepEqual(reviewOriginPair({reviewOrigin:"STANDARD_REVIEW"}),{reviewOrigin:"STANDARD_REVIEW",productEvidenceOrigin:null});assert.throws(()=>reviewOriginPair({reviewOrigin:"STANDARD_REVIEW",productEvidenceOrigin:"smart_review_v1"}),/conflict/);});
test("human authoring registry covers engine-critical fields without exposing a second taxonomy",()=>{for(const key of ["activity.types","suitability.environment","suitability.rain","suitability.family_kids","suitability.age","social.suitability","atmosphere.descriptors","character.noise","suitability.conversation","reservation.character","duration.character","accessibility.capabilities","time.dayparts","signature.characteristics"])assert.ok(HUMAN_SPOT_FIELDS[key]?.question);assert.deepEqual(Object.keys(HUMAN_CONTEXT_LABELS),["solo","date","friends","family","groups","work"]);assert.ok(Object.keys(HUMAN_ACCESSIBILITY_LABELS).length>=3);});
test("V1.1 uses one audience truth and only existing atmosphere concepts",()=>{assert.equal(HUMAN_SPOT_FIELDS["social.suitability"].question,"Für wen eignet sich der Ort?");assert.match(HUMAN_SPOT_FIELDS["audience.basic"].question,/Historische/);assert.equal(ATMOSPHERE_CONCEPT_MAP.COZY,"vibe.cozy");assert.equal(ATMOSPHERE_CONCEPT_MAP.RELAXED,"vibe.relaxed");assert.equal(FACT_KEYS.NOISE,"character.noise");assert.equal(FACT_KEYS.RESERVATION_RECOMMENDED,"reservation.recommended");assert.equal(FACT_KEYS.DURATION_APPROXIMATE,"duration.approximate");});

test("German family variants normalize to the existing family-with-kids context",()=>{
  for(const [query,age] of [
    ["mit meiner Tochter",null],
    ["mit meiner 4-jährigen Tochter",4],
    ["mit meinem Sohn",null],
    ["mit meinem 6-jährigen Sohn",6],
    ["mit meinen Kindern",null],
    ["mit der Familie",null],
    ["Familienausflug",null],
  ]){
    const intent=interpretCanonicalCurrentIntent({query});
    assert.equal(intent.socialContext,"family_with_kids",query);
    assert.equal(intent.currentRequestFacts.familyContext.value,"FAMILY_WITH_CHILD",query);
    assert.equal(intent.currentRequestFacts.childAge.value,age,query);
  }
});
test("one canonical current-intent authority preserves Regentag, family and child age for N3 and retrieval",()=>{
 const intent=interpretCanonicalCurrentIntent({query:"Regentag mit meiner 4-jährigen Tochter"});
 assert.equal(intent.currentRequestFacts.rain.value,"PREFERRED");assert.equal(intent.currentRequestFacts.familyContext.value,"FAMILY_WITH_CHILD");assert.equal(intent.currentRequestFacts.childAge.value,4);
 assert.equal(intent.legacyHints.wantsRainyDay,true);assert.equal(intent.legacyHints.wantsKids,true);
 assert.deepEqual(intent.preferredPlaceTypes,["activity","culture","outing","experience"]);
 assert.ok(intent.hardConstraints.excludedPlaceTypes.includes("bar"));
});
test("all 60 N4 dimensions have one explicit User-evidence authority",()=>{
 assert.equal(FROZEN_N4_DIMENSIONS.length,60);assert.equal(FROZEN_TASTE_CONCEPTS.length,45);
 assert.deepEqual(Object.keys(N4_USER_EVIDENCE_AUTHORITY).sort(),[...FROZEN_N4_DIMENSIONS].sort());
 assert.equal(FROZEN_N4_DIMENSIONS.filter(isUserTasteConcept).length,45);
 assert.equal(classifyN4DimensionForUserEvidence("occasion.kids_friendly"),"OCCASION_ONLY");
 assert.equal(classifyN4DimensionForUserEvidence("place_type"),"PLACE_TYPE_ONLY");
 assert.equal(classifyN4DimensionForUserEvidence("invented.dimension"),"NOT_USER_LEARNABLE");
});

test("Gate-3 German compounds and inflections become explicit verified constraints",()=>{
  const cocktail=interpretCanonicalCurrentIntent({query:"Eine Cocktailbar in Basel"});
  assert.deepEqual(cocktail.hardConstraints.requiredPlaceTypes,["bar"]);
  assert.deepEqual(cocktail.currentRequestFacts.offerings.value,["COCKTAILS"]);
  assert.deepEqual(interpretCanonicalCurrentIntent({query:"Etwas Kulturelles"}).hardConstraints.requiredPlaceTypes,["culture"]);
  assert.equal(interpretCanonicalCurrentIntent({query:"Ein preiswerter Kaffee"}).currentRequestFacts.priceMaximum.value,2);
});

test("Gate-3 unambiguous negations are hard exclusions and contradictions fail closed",()=>{
  const cafe=interpretCanonicalCurrentIntent({query:"Café, aber bitte kein Café"});
  assert.deepEqual(cafe.hardConstraints.excludedPlaceTypes,["cafe"]);
  assert.equal(cafe.hardConstraints.unsatisfiable,true);
  const noParty=interpretCanonicalCurrentIntent({query:"Lebendig, aber nicht Party"});
  assert.ok(noParty.hardConstraints.excludedPlaceTypes.includes("nightlife"));
  assert.equal(noParty.hardConstraints.unsatisfiable,false);
  const alcoholFree=interpretCanonicalCurrentIntent({query:"Bar ohne Alkohol"});
  assert.deepEqual(alcoholFree.hardConstraints.requiredPlaceTypes,["bar"]);
  assert.equal(alcoholFree.hardConstraints.excludedPlaceTypes.includes("bar"),false);
  assert.deepEqual(alcoholFree.currentRequestFacts.offerings.value,["NON_ALCOHOLIC"]);
  const ambiguous=interpretCanonicalCurrentIntent({query:"Vielleicht nicht ganz laut, irgendein Ort"});
  assert.deepEqual(ambiguous.hardConstraints.excludedPlaceTypes,[]);
});

test("Gate-3 location, temporal and bidirectional price intents are typed without synthetic Spot facts",()=>{
  const location=interpretCanonicalCurrentIntent({query:"Ein Café nahe Basel SBB, maximal 10 Minuten zu Fuss"});
  assert.equal(location.currentRequestFacts.location.value.key,"BASEL_SBB");
  assert.equal(location.currentRequestFacts.location.value.maxDistanceKm,.8);
  const time=interpretCanonicalCurrentIntent({query:"Sonntagmorgen frühstücken"});
  assert.deepEqual(time.currentRequestFacts.temporalEligibility.value,{weekday:"SUNDAY",start:"05:00",end:"12:00"});
  const premium=interpretCanonicalCurrentIntent({query:"Premium Dinner"});
  assert.equal(premium.currentRequestFacts.priceMinimum.value,3);
  assert.equal(premium.currentRequestFacts.priceMaximum.value,null);
  const range=interpretCanonicalCurrentIntent({query:"Preisniveau 2 bis 3"});
  assert.equal(range.currentRequestFacts.priceMinimum.value,2);
  assert.equal(range.currentRequestFacts.priceMaximum.value,3);
  const budget=interpretCanonicalCurrentIntent({query:"Maximal 30 CHF pro Person"});
  assert.deepEqual(budget.currentRequestFacts.priceBudgetChf.value,{minimum:null,maximum:30});
  const monetaryRange=interpretCanonicalCurrentIntent({query:"Zwischen 20 Franken bis 45 Franken"});
  assert.deepEqual(monetaryRange.currentRequestFacts.priceBudgetChf.value,{minimum:20,maximum:45});
  const missingOrigin=interpretCanonicalCurrentIntent({query:"Maximal 2 km entfernt"});
  assert.equal(missingOrigin.hardConstraints.unsatisfiable,true);
  assert.deepEqual(missingOrigin.hardConstraints.contradictions,["DISTANCE_ORIGIN_MISSING"]);
});

test("Founder near-reference language is explicit and landmark names do not become place-type intent",()=>{
  const station=interpretCanonicalCurrentIntent({query:"gemütliches Café in der Nähe vom Bahnhof"});
  assert.deepEqual(station.hardConstraints.requiredPlaceTypes,["cafe"]);
  assert.equal(station.hardConstraints.locationReference.normalizedReference,"bahnhof");
  assert.equal(station.hardConstraints.locationReference.maxDistanceKm,.8);
  assert.equal(station.hardConstraints.unsatisfiable,false);
  const museum=interpretCanonicalCurrentIntent({query:"Restaurant nahe Kunstmuseum Basel"});
  assert.deepEqual(museum.hardConstraints.requiredPlaceTypes,["restaurant"]);
  assert.equal(museum.hardConstraints.locationReference.normalizedReference,"kunstmuseum basel");
  const fair=interpretCanonicalCurrentIntent({query:"Bar in der Nähe vom Messeplatz"});
  assert.deepEqual(fair.hardConstraints.requiredPlaceTypes,["bar"]);
  assert.equal(fair.hardConstraints.locationReference.normalizedReference,"messeplatz");
});
