import test from "node:test";
import assert from "node:assert/strict";
import { bindResolvedLocationIntent, locationReason, resolveLocationReference, verifiedLocationEvidence } from "../src/location-reference.mjs";

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

test("unique exact Messeplatz and Kunstmuseum references resolve through bounded server-side Google Places",async()=>{
  for(const [reference,name] of [["Messeplatz","Messeplatz"],["Kunstmuseum Basel","Kunstmuseum Basel"]]){
    const result=await resolveLocationReference({reference,city:"Basel",googleApiKey:"server-only",fetchImpl:googleResponse([place(`id-${reference}`,name)])});
    assert.equal(result.status,"RESOLVED",reference);
    assert.equal(result.location.label,name);
    assert.equal(result.location.resolutionSource,"GOOGLE_PLACES_TEXT_SEARCH");
    assert.equal(result.location.maxDistanceKm,.8);
  }
});

test("unknown and ambiguous reference locations fail closed",async()=>{
  const unknown=await resolveLocationReference({reference:"Glorpplatz 999",city:"Basel",googleApiKey:"server-only",fetchImpl:googleResponse([])});
  assert.deepEqual({status:unknown.status,reason:unknown.reason},{status:"UNRESOLVED",reason:"REFERENCE_NOT_FOUND"});
  const ambiguous=await resolveLocationReference({reference:"Kunstmuseum Basel",city:"Basel",googleApiKey:"server-only",fetchImpl:googleResponse([place("a","Kunstmuseum Basel | Hauptbau"),place("b","Kunstmuseum Basel | Neubau")])});
  assert.deepEqual({status:ambiguous.status,reason:ambiguous.reason},{status:"UNRESOLVED",reason:"REFERENCE_AMBIGUOUS"});
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
