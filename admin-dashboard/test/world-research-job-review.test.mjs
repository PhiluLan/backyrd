import assert from "node:assert/strict";
import { mkdtemp, readFile, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { test } from "node:test";
import ts from "typescript";

const source = await readFile(new URL("../lib/server/worldResearchJobReview.ts", import.meta.url), "utf8");
const output = ts.transpileModule(source, { compilerOptions: { module: ts.ModuleKind.ES2022, target: ts.ScriptTarget.ES2022 } }).outputText;
const directory = await mkdtemp(join(tmpdir(), "backyrd-research-job-review-test-"));
const modulePath = join(directory, "module.mjs");
await writeFile(modulePath, output, { mode: 0o600 });
const { matchesAutomatedReviewJob, reviewCanFinish, visibleResearchJobs, researchDeclinedKeys, researchPipelineSummary } = await import(modulePath);

const job = {
  id: "job-1", spot_id: "spot-1", actor_id: "admin-1", status: "READY_FOR_REVIEW",
  created_at: "2026-09-29T20:00:00Z", reviewed_at: null,
  export_document: { batch: { batchId: "original-batch" } },
  result_document: { batch: { batchId: "original-batch" }, research: { spots: [{ spotId: "spot-1", claims: [{ attributeKey: "contact.website", value: "https://example.org" }] }] } },
};
const document = {
  batch: { spots: [{ spotId: "spot-1" }] },
  research: { spots: [{ spotId: "spot-1", claims: [{ value: "https://example.org", attributeKey: "contact.website" }] }] },
};

test("only the owning Admin can close the exact reviewed proposal after a refreshed export", () => {
  assert.equal(matchesAutomatedReviewJob(job, document, "admin-1"), true);
  assert.equal(matchesAutomatedReviewJob(job, document, "another-admin"), false);
  assert.equal(matchesAutomatedReviewJob(job, { ...document, research: { spots: [{ spotId: "spot-1", claims: [] }] } }, "admin-1"), false);
  assert.equal(matchesAutomatedReviewJob({ ...job, status: "RUNNING" }, document, "admin-1"), false);
  assert.equal(matchesAutomatedReviewJob({ ...job, result_document: { ...job.result_document, batch: { batchId: "other" } } }, document, "admin-1"), false);
});

test("review closes only after all writes, dependencies and rebuild verification are finished", () => {
  const settled = { ready: [], conflicts: [], blocked: [], invalid: [], imported: [] };
  assert.equal(reviewCanFinish(settled), true);
  assert.equal(reviewCanFinish({ ...settled, imported: ["contact.website"], manifestHash: "verified" }), true);
  assert.equal(reviewCanFinish({ ...settled, imported: ["contact.website"] }), false);
  for (const key of ["ready", "conflicts", "blocked", "invalid"]) {
    assert.equal(reviewCanFinish({ ...settled, [key]: ["pending"] }), false);
  }
});

test("imported jobs and older proposals for the same Spot leave the actionable list", () => {
  const jobs = [
    { spot_id: "spot-1", created_at: "2026-09-29T21:00:00Z", reviewed_at: "2026-09-30T06:00:00Z" },
    { spot_id: "spot-1", created_at: "2026-09-29T20:00:00Z", reviewed_at: null },
    { spot_id: "spot-2", created_at: "2026-09-29T22:00:00Z", reviewed_at: null },
    { spot_id: "spot-1", created_at: "2026-09-30T07:00:00Z", reviewed_at: null },
  ];
  assert.deepEqual(visibleResearchJobs(jobs), [jobs[2], jobs[3]]);
});

 test("KEEP resolves a review while unanswered and foreign choices never silently discard a claim",()=>{
  assert.deepEqual(researchDeclinedKeys(['identity.name','hours.regular'],[],{'identity.name':''}),['identity.name']);
  assert.deepEqual(researchDeclinedKeys(['identity.name'],[],{}),[]);
  assert.deepEqual(researchDeclinedKeys(['identity.name'],[],{'identity.name':'expected-current-claim'}),[]);
  assert.deepEqual(researchDeclinedKeys(['identity.name'],[],{'foreign':''}),[]);
  assert.throws(()=>researchDeclinedKeys(['identity.name'],['foreign']),/declined_invalid/);
 });

test('completed automatic jobs leave the open list without fabricating a human review',()=>{
  const complete={...job,pipeline:{phase:'FINISHED',report:{state:'COMPLETE',errors:[]}}};
  const pending={...job,pipeline:{phase:'FINISHED',report:{state:'REVIEW_REQUIRED',errors:[]}}};
  const interrupted={...job,pipeline:{phase:'PROVED'}};
  assert.deepEqual(visibleResearchJobs([complete,pending,interrupted]),[pending,interrupted]);
  assert.equal(complete.reviewed_at,null);
});

test('manual review cannot race a pipeline before its automatic processing finishes',()=>{
  for(const phase of ['RECEIVED','PROVED'])assert.equal(matchesAutomatedReviewJob({...job,export_document:{...job.export_document,pipeline:{phase}}},document,'admin-1'),false);
  assert.equal(matchesAutomatedReviewJob({...job,export_document:{...job.export_document,pipeline:{phase:'FINISHED'}}},document,'admin-1'),true);
});

test('an active pipeline lease is processing, an expired one is recoverable, and completed counts are authoritative',()=>{
 const now=Date.parse('2026-10-26T20:00:00Z');
 assert.deepEqual(researchPipelineSummary({phase:'PROVED'},'2026-10-26T20:01:00Z',now),{state:'PROCESSING',stored:0,review:0,errors:[]});
 assert.deepEqual(researchPipelineSummary({phase:'PROVED'},'2026-10-26T19:59:00Z',now),{state:'INCOMPLETE',stored:0,review:0,errors:['research_pipeline_processing_interrupted']});
 assert.deepEqual(researchPipelineSummary({phase:'FINISHED',report:{state:'REVIEW_REQUIRED',stored:['a','b'],review:[1,2,3,4,5],unresolved:[1,2],errors:[]}},null,now),{state:'REVIEW_REQUIRED',stored:2,review:7,errors:[]});
 assert.equal(researchPipelineSummary(undefined,null,now),undefined);
});

test('v2 missing optional information is not counted as a mandatory review',()=>{
 const summary=researchPipelineSummary({policy:'backyrd.research-evidence@2',phase:'FINISHED',report:{state:'REVIEW_REQUIRED',stored:[],review:[{reason:'CONTENT_SAFETY_HELD'}],unresolved:Array(33).fill({reason:'not found'}),errors:[]}},null);
 assert.equal(summary.review,1);assert.equal(summary.state,'REVIEW_REQUIRED');
});

test('policy 2.1 keeps unresolved gaps separate from actionable review',()=>{
 const summary=researchPipelineSummary({policy:'backyrd.research-evidence@2.1',phase:'FINISHED',report:{state:'REVIEW_REQUIRED',stored:['hours.kitchen'],review:[{reason:'MAJOR_UNCERTAINTY'}],unresolved:Array(32).fill({reason:'not found'}),errors:[]}},null);
 assert.equal(summary.review,1);
 assert.equal(summary.stored,1);
});
test('policy 2.2 keeps uncertainty reviews distinct from unfilled catalogue fields',()=>{
 const summary=researchPipelineSummary({policy:'backyrd.research-evidence@2.2',phase:'FINISHED',report:{state:'REVIEW_REQUIRED',stored:['experience.profile'],review:[{reason:'MAJOR_UNCERTAINTY'}],unresolved:Array(32).fill({reason:'not found'}),errors:[]}},null);
 assert.equal(summary.review,1);
 assert.equal(summary.stored,1);
});


test('policy 2.3 keeps gaps separate from actionable review',()=>{
 const summary=researchPipelineSummary({policy:'backyrd.research-evidence@2.3',phase:'FINISHED',report:{state:'REVIEW_REQUIRED',stored:[],review:[{}],unresolved:Array(30).fill({}),errors:[]}},null);
 assert.equal(summary.review,1);
});
