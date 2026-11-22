import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";
import ts from "typescript";
const source = await readFile(new URL("../lib/productFeedback.ts", import.meta.url), "utf8");
const js = ts.transpileModule(source, { compilerOptions: { module: ts.ModuleKind.ESNext, target: ts.ScriptTarget.ES2022 } }).outputText;
const { feedbackAvailabilityLabel, feedbackContextLabel, parseFeedbackPage, parseFeedbackDetail, feedbackError, reviewValidation } = await import(`data:text/javascript;base64,${Buffer.from(js).toString("base64")}`);
const row = { id: "f1", surface: "decision", sentiment: "almost", message: "<script>as text</script>", created_at: "2026-11-22T12:00:00Z", review_status: "new", issue_kind: null, issue_ref: "" };
const page = { rows: [row], page_size: 30, summary: { total: 1, new: 1, reviewing: 0, done: 0, helpful: 0, almost: 1, not_helpful: 0 } };
test("read bounded rows without interpreting user text as markup", () => { assert.equal(parseFeedbackPage(page).rows[0].message, row.message); });
test("unknown statuses, missing totals and invalid response shapes fail honestly", () => {
  for (const bad of [null, {}, { ...page, summary: {} }, { ...page, rows: [{ ...row, review_status: "deleted" }] }, { ...page, summary: { ...page.summary, total: -1 } }]) assert.throws(() => parseFeedbackPage(bad));
});
test("old feedback does not invent historical search context", () => {
  const detail = parseFeedbackDetail({ feedback: { ...row, internal_note: "", review_revision: 0, reviewed_at: null, decision_id: "decision-123", decision_context: null, client_context: { platform: "ios", app_version: "1.1.1", update_id: null } }, history: [] });
  assert.equal(detail.feedback.decision_context, null);
});
test("display summaries use plain labels without inventing unknown interpretations", () => {
  assert.equal(feedbackContextLabel("COFFEE", "intent"), "Kaffee trinken");
  assert.equal(feedbackContextLabel("EVENING", "day_phase"), "Abends");
  assert.equal(feedbackContextLabel("unknown-new-value", "intent"), "Nicht näher eingeordnet");
  assert.equal(feedbackAvailabilityLabel("unknown"), "Öffnungszeit nicht bestätigt");
  assert.equal(feedbackAvailabilityLabel("closed"), "Zur Wunschzeit geschlossen");
});
test("resolving feedback requires an explanation and bounded input", () => {
  assert.ok(reviewValidation("done", "  ", "")); assert.ok(reviewValidation("reviewing", "a".repeat(2001), ""));
  assert.equal(reviewValidation("done", "Verified fix and regression", "BACK-42"), null);
});
test("conflicts preserve the unsaved work instead of pretending success", () => {
  assert.match(feedbackError({ code: "40001" }), /Eingaben bleiben erhalten/);
  assert.match(feedbackError({ code: "42501" }), /Admin-Sitzung/);
  assert.match(feedbackError({ code: "PGRST202" }), /Datenbankmigration/);
});
