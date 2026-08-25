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
