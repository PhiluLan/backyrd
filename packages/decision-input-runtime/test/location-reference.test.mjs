import test from "node:test";
import assert from "node:assert/strict";
import { BASEL_REFERENCE_POINTS, interpretCanonicalCurrentIntent } from "../../canonical-semantics/src/index.mjs";
import { bindResolvedLocationIntent, configuredNearDistanceKm, locationReason, resolveLocationReference, verifiedLocationEvidence } from "../src/location-reference.mjs";

const googleResponse=(places)=>async(_url,options)=>{
  const body=JSON.parse(options.body);
  assert.equal(body.pageSize,5);
  assert.equal(body.locationBias.circle.radius,15000);
  assert.equal(options.headers["x-goog-fieldmask"],"places.id,places.displayName,places.formattedAddress,places.location");
  return{ok:true,status:200,json:async()=>({places})};
};
const place=(id,name,latitude=47.56,longitude=7.59)=>({id,displayName:{text:name},formattedAddress:`${name}, Basel, Schweiz`,location:{latitude,longitude}});

test("Basel Bahnhof disambiguates deterministically to the canonical main station",async()=>{
  let fetched=false;
  const result=await resolveLocationReference({reference:"Bahnhof",city:"Basel",maxDistanceKm:.8,googleApiKey:"unused",fetchImpl:async()=>{fetched=true;throw new Error("unexpected");}});
  assert.equal(fetched,false);
  assert.equal(result.status,"RESOLVED");
  assert.equal(result.location.key,"BASEL_SBB");
  assert.equal(result.location.label,"Basel SBB");
});

test("unique exact Theater Basel and Kunstmuseum references resolve through bounded server-side Google Places",async()=>{
  for(const [reference,name] of [["Theater Basel","Theater Basel"],["Kunstmuseum Basel","Kunstmuseum Basel"]]){
    const result=await resolveLocationReference({reference,city:"Basel",maxDistanceKm:.8,googleApiKey:"server-only",fetchImpl:googleResponse([place(`id-${reference}`,name)])});
    assert.equal(result.status,"RESOLVED",reference);
    assert.equal(result.location.label,name);
    assert.equal(result.location.resolutionSource,"GOOGLE_PLACES_TEXT_SEARCH");
    assert.equal(result.location.maxDistanceKm,.8);
  }
});

test("unknown and ambiguous reference locations fail closed",async()=>{
  const unknown=await resolveLocationReference({reference:"Glorpplatz 999",city:"Basel",maxDistanceKm:.8,googleApiKey:"server-only",fetchImpl:googleResponse([])});
  assert.deepEqual({status:unknown.status,reason:unknown.reason},{status:"UNRESOLVED",reason:"REFERENCE_NOT_FOUND"});
  const ambiguous=await resolveLocationReference({reference:"Kunstmuseum Basel",city:"Basel",maxDistanceKm:.8,googleApiKey:"server-only",fetchImpl:googleResponse([place("a","Kunstmuseum Basel | Hauptbau"),place("b","Kunstmuseum Basel | Neubau")])});
  assert.deepEqual({status:ambiguous.status,reason:ambiguous.reason},{status:"UNRESOLVED",reason:"REFERENCE_AMBIGUOUS"});
});

test("admin default Near radius is versioned, bounded and fail-closed",()=>{
  const reference={distanceSource:"ADMIN_CONFIG",maxDistanceKm:null};
  const config={version:"backyrd-decision-location-config-v1",cityKey:"basel",defaultNearRadiusM:800,status:"ACTIVE"};
  assert.equal(configuredNearDistanceKm({locationReference:reference,runtimeConfig:config}),.8);
  for(const invalid of [
    {...config,version:"unknown"},{...config,cityKey:"zurich"},{...config,status:"DISABLED"},
    {...config,defaultNearRadiusM:99},{...config,defaultNearRadiusM:2001},{...config,defaultNearRadiusM:800.5},null,
  ])assert.equal(configuredNearDistanceKm({locationReference:reference,runtimeConfig:invalid}),null);
  assert.equal(configuredNearDistanceKm({locationReference:{distanceSource:"REQUEST_EXPLICIT",maxDistanceKm:.5},runtimeConfig:null}),.5);
  assert.equal(configuredNearDistanceKm({locationReference:{distanceSource:"REQUEST_EXPLICIT",maxDistanceKm:20},runtimeConfig:null}),null);
});

test("resolver never invents a default radius when runtime configuration is absent",async()=>{
  const result=await resolveLocationReference({reference:"Bahnhof",city:"Basel",googleApiKey:"unused"});
  assert.deepEqual({status:result.status,reason:result.reason},{status:"UNRESOLVED",reason:"NEAR_RADIUS_INVALID"});
});

test("resolved location binding and reason require measured in-radius coordinate evidence",()=>{
  const intent={currentRequestFacts:{},hardConstraints:{locationReference:{normalizedReference:"messeplatz"}}};
  const resolution={status:"RESOLVED",version:"v",location:{label:"Messeplatz",latitude:47.56,longitude:7.59,maxDistanceKm:.8,sourceIdentity:"google-place:abc",resolutionSource:"GOOGLE_PLACES_TEXT_SEARCH"}};
  const bound=bindResolvedLocationIntent(intent,resolution);
  assert.equal(bound.hardConstraints.location.label,"Messeplatz");
  const evidence=verifiedLocationEvidence({location:resolution.location,distanceKm:.4124});
  assert.ok(evidence);
  assert.equal(locationReason(evidence,"Eine passende Bar."),"Messeplatz ist 412 m entfernt – innerhalb deiner angefragten Nähe. Eine passende Bar.");
  assert.equal(verifiedLocationEvidence({location:resolution.location,distanceKm:.81}),null);
  assert.equal(locationReason(null,"Mood"),null);
});

test("Basel landmarks and local names resolve without a provider lookup", async () => {
  for (const [reference, label] of [
    ["Mittelrheinbrücke", "Mittlere Rheinbrücke"],
    ["Drei-Rosen-Brücke", "Dreirosenbrücke"],
    ["Spalentor", "Spalentor"],
    ["St Alban Tor", "St. Alban-Tor"],
    ["Barfi", "Barfüsserplatz"],
    ["Messeplatz", "Messeplatz"],
    ["Kannenfeldpark", "Kannenfeldpark"],
    ["SBB", "Basel SBB"],
  ]) {
    const result = await resolveLocationReference({ reference, city: "Basel", maxDistanceKm: 0.6 });
    assert.equal(result.status, "RESOLVED", reference);
    assert.equal(result.location.label, label);
    assert.equal(result.location.resolutionSource, "CANONICAL_BASEL_REFERENCE");
    assert.equal(result.location.maxDistanceKm, 0.6);
    assert.ok(result.location.latitude > 47.5 && result.location.latitude < 47.62);
    assert.ok(result.location.longitude > 7.53 && result.location.longitude < 7.65);
  }
  const wrongCity = await resolveLocationReference({ reference: "Barfi", city: "Zürich", maxDistanceKm: 0.6 });
  assert.equal(wrongCity.status, "UNRESOLVED");
});

test("every Basel reference point is sourced and resolves by its official name", async () => {
  for (const [key, point] of Object.entries(BASEL_REFERENCE_POINTS)) {
    assert.equal(point.municipality, "Basel");
    assert.match(point.source.url, /^https:\/\//);
    assert.ok(point.source.reference);
    const result = await resolveLocationReference({ reference: point.label, city: "Basel", maxDistanceKm: 0.6 });
    assert.equal(result.status, "RESOLVED", point.label);
    assert.equal(result.location.key, key);
  }
});

test("an explicit near request keeps the full name of St. Alban-Tor", async () => {
  const intent = interpretCanonicalCurrentIntent({ query: "Ein Café nahe beim St. Alban-Tor" });
  const { normalizedReference } = intent.hardConstraints.locationReference;
  const result = await resolveLocationReference({ reference: normalizedReference, city: "Basel", maxDistanceKm: 0.6 });
  assert.equal(result.status, "RESOLVED");
  assert.equal(result.location.label, "St. Alban-Tor");
});
