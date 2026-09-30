import assert from "node:assert/strict";
import { test } from "node:test";
import { matchesAutomatedReviewJob, reviewCanFinish, visibleResearchJobs } from "../lib/server/worldResearchJobReview.ts";

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
