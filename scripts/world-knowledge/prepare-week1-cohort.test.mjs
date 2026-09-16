import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { mkdtempSync, readFileSync, statSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import test from "node:test";

const script = resolve(import.meta.dirname,"prepare-week1-cohort.mjs");
const fixture = () => ({ schemaVersion:"backyrd.world-knowledge.week1-cohort-source@1",environment:"LOCAL_FOUNDER_EVALUATION",claimAuthority:"NONE",spots:Array.from({length:35},(_,index)=>({spotId:`00000000-0000-4000-8000-${String(index).padStart(12,"0")}`,name:`Local ${index}`,primaryCategory:["EAT","DRINKS","COFFEE_DAYTIME","CULTURE_ARTS","NOT_CONFIGURED"][index%5],mappedFields:index%8,claimedFields:index%4,ambiguousValues:index%3,mappedKeys:index%2?["hours.regular"]:[],claimedKeys:index<5?["purpose.primary_visit"]:[],reviewKeys:index%3?["operation.price_level"]:[],alreadyFounderSelected:index<5})) });

test("prepares a deterministic 20-40 candidate cohort without authority", () => {
  const dir=mkdtempSync(join(tmpdir(),"wk-cohort-"));
  const input=join(dir,"input.json"), first=join(dir,"first.json"), second=join(dir,"second.json"), summary=join(dir,"summary.json"), summary2=join(dir,"summary2.json");
  writeFileSync(input,JSON.stringify(fixture()));
  execFileSync(process.execPath,[script,"--input",input,"--output",first,"--summary",summary]);
  execFileSync(process.execPath,[script,"--input",input,"--output",second,"--summary",summary2]);
  const result=JSON.parse(readFileSync(first,"utf8"));
  assert.equal(result.candidates.length,30);
  assert.equal(result.claimAuthority,"NONE");
  assert.equal(result.automaticConfirmation,false);
  assert.equal(readFileSync(first,"utf8"),readFileSync(second,"utf8"));
  assert.equal(readFileSync(summary,"utf8"),readFileSync(summary2,"utf8"));
  assert.equal(statSync(first).mode & 0o777,0o600);
  const aggregate=JSON.parse(readFileSync(summary,"utf8"));
  assert.equal(aggregate.coverage.fields["purpose.primary_visit"].confirmedOrAssertedClaim,5);
  assert.equal(aggregate.coverage.fields["hours.regular"].safeLegacyPrefill,17);
});
