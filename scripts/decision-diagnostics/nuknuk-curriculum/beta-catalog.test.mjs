import test from "node:test";
import assert from "node:assert/strict";
import { mkdtemp, readFile, writeFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import {
  materializeBetaCases,
  isolateSplits,
  graphAuditHash,
  checkSourceInvariants,
  trainingAnswer,
  buildBetaCatalog,
  verifyBetaCatalog,
} from "./beta-catalog.mjs";
import { admitBetaBudget } from "./beta-plan.mjs";
import { mergeNuknukDialogueUpdate } from "../../../packages/decision-vnext-core/dist/nuknuk-dialogue.js";
import { validateCompactTurn } from "../../../packages/decision-vnext-core/dist/nuknuk-understanding.js";
const raw = materializeBetaCases(),
  isolated = isolateSplits(raw.rows),
  rows = isolated.rows;
const row = (family, profile = "coffee", locale = "de") => {
  const r = rows.find(
    (r) => r.family === family && r.profile === profile && r.locale === locale,
  );
  assert(r, family);
  return r;
};
const facts = (r) => r.finalMeaning.facts;
test("full catalog has no rejected source, bounded distinct ids, two locales and over 3000 formulations", () => {
  assert.deepEqual(raw.rejections, []);
  assert(rows.length > 3000);
  assert.equal(new Set(rows.map((r) => r.id)).size, rows.length);
  assert.deepEqual([...new Set(rows.map((r) => r.locale))].sort(), [
    "de",
    "de-CH",
  ]);
  assert(
    rows.filter((r) => r.task === "DIALOGAKTUALISIERUNG_V3").length >= 200,
  );
  for (const r of rows) {
    assert.equal(r.provenance.independentHumanGold, false);
    assert.equal(r.provenance.modelResponsesUsedForTargets, false);
    checkSourceInvariants(r);
  }
});
test("family, normalized graph and language variants cannot cross splits", () => {
  for (const key of [
    (r) => r.family,
    (r) => r.scenarioGroup,
    (r) =>
      r.task +
      ":" +
      graphAuditHash(r.finalMeaning) +
      ":" +
      (r.previousMeaning ? graphAuditHash(r.previousMeaning) : ""),
  ]) {
    const map = new Map();
    for (const r of rows) {
      const k = key(r);
      if (map.has(k)) assert.equal(map.get(k), r.split, k);
      map.set(k, r.split);
    }
  }
  for (const s of ["TRAIN", "DEV", "TEST"])
    assert(rows.filter((r) => r.split === s).length >= 100);
  for (const r of rows.filter((r) => r.theme === "lexicon"))
    assert.equal(r.split, "TRAIN");
});
test("age and companion duties preserve the correct person; adult son stays adult", () => {
  const child = row("roles-child-age");
  const a = facts(child).find((f) => f.key === "people.age");
  assert.deepEqual(a.subjectIds, ["p1"]);
  assert.equal(a.modality, "CONTEXT");
  const wrong = structuredClone(child);
  wrong.finalMeaning.facts.find((f) => f.key === "people.age").subjectIds = [
    "p0",
  ];
  assert.throws(() => checkSourceInvariants(wrong), /child_age/);
  const adult = row("everyday-grown-son");
  assert(
    facts(adult).some(
      (f) =>
        f.key === "people.age" &&
        f.value.amount === 24 &&
        f.subjectIds[0] === "p1",
    ),
  );
  assert(!facts(adult).some((f) => f.key === "condition.children"));
  const daughter = row("everyday-daughter-rain");
  assert(
    facts(daughter).some(
      (f) => f.key === "people.relationship" && f.value.text === "daughter",
    ),
  );
  assert.equal(
    facts(daughter).find((f) => f.key === "offer.area").modality,
    "PREFERRED",
  );
});
test("money distinctions and source grounding reject altered amounts", () => {
  const total = row("budget-total");
  assert(
    facts(total).some(
      (f) => f.key === "budget.scope" && f.value.scope === "GROUP_TOTAL",
    ),
  );
  const each = row("budget-each");
  assert(
    facts(each).some(
      (f) => f.key === "budget.scope" && f.value.scope === "PER_PERSON",
    ),
  );
  assert.equal(
    facts(row("prices-free")).find((f) => f.key === "budget.maximum").value
      .amount,
    0,
  );
  assert.equal(
    facts(row("budget-preferred")).find((f) => f.key === "budget.maximum")
      .modality,
    "PREFERRED",
  );
  assert.equal(
    facts(row("budget-unspecified-currency")).find(
      (f) => f.key === "budget.maximum",
    ).value.currency,
    "UNSPECIFIED",
  );
  const bad = structuredClone(total);
  bad.finalMeaning.facts.find((f) => f.key === "budget.maximum").value.amount =
    999999;
  assert.throws(() => checkSourceInvariants(bad), /number_not_grounded/);
});
test("weather context, conditional branches, optional food and no-invention remain distinct", () => {
  assert.equal(
    row("children-rain-context").finalMeaning.weatherConditions[0].role,
    "CONTEXT",
  );
  assert(
    !facts(row("children-rain-context")).some((f) => f.key === "offer.area"),
  );
  const conditional = row("conditional-rain-choice");
  assert.equal(conditional.finalMeaning.logic.kind, "IF");
  assert.equal(
    conditional.finalMeaning.weatherConditions[0].role,
    "CONDITIONAL",
  );
  const optional = row("coherence-drink-optional", "museum");
  assert.equal(
    facts(optional).find(
      (f) => f.key === "food.drink" && f.subjectIds.includes("a2"),
    ).modality,
    "PREFERRED",
  );
  const strict = row("areas-quiet-not-indoor");
  assert.equal(
    facts(strict).find((f) => f.key === "atmosphere.noise").modality,
    "REQUIRED",
  );
  assert(
    facts(strict)
      .filter((f) => f.key === "offer.area")
      .every((f) => f.modality === "NOT_REQUIRED"),
  );
  assert(row("clarification-contradictory-area").expected.clarification);
  assert.equal(
    row("clarification-contradictory-area").expectedInteraction,
    "CLARIFY",
  );
});
test("dialogue teaches atomic replacements, exact answer citations and retained timing", () => {
  const mixed = row("dialogue-retain-mixed");
  assert.equal(mixed.expected.changes.length, 2);
  assert(
    mixed.finalMeaning.facts.some(
      (f) =>
        f.key === "time.date" &&
        f.value.date ===
          mixed.reference.now.slice(0, 10).replace(/.*/, () => {
            const d = new Date(mixed.reference.now);
            d.setUTCDate(d.getUTCDate() + 1);
            return d.toISOString().slice(0, 10);
          }),
    ),
  );
  const bad = structuredClone(mixed.expected);
  bad.changes.push({
    id: "f2",
    quote: mixed.turns[0].answer,
    fact: {
      ...mixed.previousMeaning.facts.find((f) => f.id === "f2"),
      value: { date: "2099-01-01", operator: "EQ", timezone: "Europe/Zurich" },
    },
  });
  assert.throws(
    () => mergeNuknukDialogueUpdate(mixed.previousMeaning, bad, mixed.turns),
    /retained_timing/,
  );
  const m = row("dialogue-change-budget");
  const wrong = structuredClone(m.expected);
  wrong.changes[0].fact.value.amount = 999999;
  const merged = mergeNuknukDialogueUpdate(m.previousMeaning, wrong, m.turns);
  assert.throws(
    () =>
      validateCompactTurn(
        merged,
        {
          query: m.query + " Ergänzung: " + m.turns[0].answer,
          reference: m.reference,
        },
        m.turns[0].answer,
      ),
    /source_budget_contradicted/,
  );
  assert.deepEqual(row("dialogue-retain-thanks").expected.changes, []);
});
test("graph overlap audit tolerates renamed entities and permuted facts without ignoring bindings", () => {
  const a = row("coherence-on-site", "cinema").finalMeaning,
    b = structuredClone(a);
  const names = Object.fromEntries(
    b.entities.map((e, i) => [e.id, "renamed" + i]),
  );
  b.entities = b.entities.reverse().map((e) => ({
    ...e,
    id: names[e.id],
    members: e.members.map((id) => names[id]),
  }));
  b.facts.reverse();
  for (const f of b.facts) f.subjectIds = f.subjectIds.map((id) => names[id]);
  assert.equal(graphAuditHash(a), graphAuditHash(b));
  b.bindings = [];
  assert.notEqual(graphAuditHash(a), graphAuditHash(b));
});
test("50 USD budget admission refuses Auto-Pay, multiple Pods and over-budget projections", () => {
  const input = {
    rateUsdPerHour: 3,
    observedSpentUsd: 2,
    storageAllowanceUsd: 1,
    remainingBalanceUsd: 48,
    autoPay: false,
    ownedPods: 1,
    pilotSecondsPerUpdate: 10,
    remainingUpdates: 500,
  };
  assert.equal(admitBetaBudget(input).allowed, true);
  assert.equal(
    admitBetaBudget({ ...input, pilotSecondsPerUpdate: 200 }).allowed,
    false,
  );
  assert.equal(
    admitBetaBudget({ ...input, remainingBalanceUsd: 5 }).allowed,
    false,
  );
  for (const patch of [
    { autoPay: true },
    { ownedPods: 2 },
    { rateUsdPerHour: Infinity },
    { remainingUpdates: NaN },
  ])
    assert.throws(() => admitBetaBudget({ ...input, ...patch }));
  assert.equal(admitBetaBudget(input).resourceAllocationPerformed, false);
});
test("sealed export is reproducible, has no TEST training file and rejects modified bytes", async () => {
  const dir = await mkdtemp(join(tmpdir(), "nuknuk-beta-package-test-"));
  try {
    const manifest = await buildBetaCatalog(dir);
    assert.equal(
      (await verifyBetaCatalog(dir)).status,
      "ARTIFACT_AND_SOURCE_VERIFIED",
    );
    assert(!Object.keys(manifest.artifactByteHashes).includes("test.jsonl"));
    assert.equal(manifest.training.resourcesStarted, false);
    const packet = JSON.parse(
      await readFile(join(dir, "test-requests.json"), "utf8"),
    );
    assert.equal(packet.targetIncluded, false);
    assert(
      packet.cases.every(
        (r) =>
          !("expected" in r) &&
          !("finalMeaning" in r) &&
          !("expectedDisposition" in r),
      ),
    );
    const first = JSON.parse(
      (await readFile(join(dir, "train.jsonl"), "utf8")).split("\n")[0],
    );
    assert.equal(first.messages.length, 3);
    assert.equal(
      trainingAnswer(JSON.parse(first.messages[2].content)),
      first.messages[2].content,
    );
    await writeFile(join(dir, "train.jsonl"), "{}\n");
    await assert.rejects(() => verifyBetaCatalog(dir), /artifact_changed/);
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
});

test("persona review blocks unclarified child participation and preserves restaurant intent", () => {
  for (const r of rows.filter(r => r.family === "children-alone-child" || r.family === "everyday-supervision-unknown")) {
    assert.equal(r.expectedInteraction, "CLARIFY");
    assert(r.finalMeaning.uncertainties.length > 0);
    assert(r.expected.clarification.question.includes("Aufsicht") || r.expected.clarification.question.includes("Betreuung"));
    assert(!facts(r).some(f => f.value.text === "adult_accompanied"));
  }
  for (const r of rows.filter(r => r.family === "everyday-hotel-restaurant-external")) {
    assert(facts(r).some(f => f.key === "offer.kind" && f.value.text === "RESTAURANT"));
    assert(!facts(r).some(f => f.key === "offer.kind" && f.value.text === "HOTEL"));
    assert(r.finalMeaning.extensions.some(e => /Hotel/.test(e.description)));
  }
  const invalidVenue = structuredClone(row("everyday-rain-not-playpark"));
  facts(invalidVenue).find(f => f.key === "offer.kind").value.text = "INDOOR_PLAYGROUND";
  assert.throws(() => checkSourceInvariants(invalidVenue), /unauthored_venue_kind/);
  assert.equal(row("everyday-spa-tired").split, "DEV");
  assert.equal(row("everyday-both-participate").split, "TEST");
  const removed = [
    ["intent-cafe-no-drink", "bowling"], ["areas-terrace-required", "cinema"],
    ["weather-shade", "bowling"], ["booking-own-food", "pizza"],
    ["visit-time-today-evening", "breakfast"], ["access-beginner", "ceramics"],
    ["coherence-drink-optional", "coffee"], ["coherence-simultaneous", "cinema"],
  ];
  for (const [family, profile] of removed)
    assert(!rows.some(r => r.family === family && r.profile === profile), family + ":" + profile);
});

test("recorded questions and successive date corrections survive export and semantic merge", async () => {
  const {dialogueReading} = await import("./beta-reading.mjs");
  const dialogues = rows.filter(r => r.family.startsWith("everyday-conversation-"));
  assert.equal(new Set(dialogues.map(r => r.family)).size, 12);
  assert(dialogues.every(r => r.turns.every(t => t.question?.endsWith("?"))));
  for (const locale of ["de", "de-CH"]) {
    const r = row("everyday-conversation-two-date-corrections", "coffee", locale);
    assert.equal(r.turns.length, 2);
    assert.equal(facts(r).find(f => f.key === "time.date").value.date, "2026-11-27");
    assert.equal(facts(r).find(f => f.key === "time.clock").value.time, "18:00");
    assert.equal(facts(r).find(f => f.key === "budget.maximum").value.amount, 40);
    const reading = dialogueReading(r.turns);
    assert(reading.includes(r.turns[0].answer));
    assert(reading.includes(r.turns[1].question));
    assert(reading.includes(r.turns[1].answer));
    assert(JSON.parse(r.request.messages[1].content).turns[1].answer.includes("18 Uhr"));
  }
});
