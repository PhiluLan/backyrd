#!/usr/bin/env node
/** Offline synthetic catalog. No provider calls, resource allocation or live state. */
import { readFile, writeFile, mkdir } from "node:fs/promises";
import { resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { createHash } from "node:crypto";
import { execFileSync } from "node:child_process";
import { contentHash } from "../../../packages/decision-vnext-core/dist/canonical.js";
import {
  buildNuknukCompactSearchRequest,
  validateNuknukCompactSearch,
  validateCompactTurn,
} from "../../../packages/decision-vnext-core/dist/nuknuk-understanding.js";
import {
  buildNuknukDialogueUpdate,
  mergeNuknukDialogueUpdate,
} from "../../../packages/decision-vnext-core/dist/nuknuk-dialogue.js";
import { inspectNuknukTrainingVocabulary } from "../../../packages/decision-vnext-core/dist/nuknuk-training-vocabulary.js";
import { SPOT_TYPE_CATALOG } from "../../../packages/world-knowledge-core/dist/index.js";
const venueKinds = new Set(SPOT_TYPE_CATALOG.map(item => item.kind));
import {
  CATALOG_VERSION,
  blueprintFamilies as generatedFamilies,
  profiles,
  authorMeaning,
} from "./beta-cases.mjs";
import { everydayCompositions } from "./beta-transfer.mjs";
import { lexiconFamilies } from "./beta-lexicon.mjs";
const blueprintFamilies = [
  ...generatedFamilies,
  ...everydayCompositions,
  ...lexiconFamilies,
];
import { wholeReading, dialogueReading } from "./beta-reading.mjs";
import { betaTrainingPlan, betaStartHere } from "./beta-plan.mjs";
const root = resolve(dirname(fileURLToPath(import.meta.url)), "../../..");
const hash = (bytes) => createHash("sha256").update(bytes).digest("hex");
const stable = (v) =>
  Array.isArray(v)
    ? v.map(stable)
    : v && typeof v === "object"
      ? Object.fromEntries(
          Object.keys(v)
            .sort()
            .map((k) => [k, stable(v[k])]),
        )
      : v;
export const trainingAnswer = (v) =>
  Array.isArray(v)
    ? "[" + v.map(trainingAnswer).join(", ") + "]"
    : v && typeof v === "object"
      ? "{" +
        Object.entries(v)
          .map(([k, x]) => JSON.stringify(k) + ": " + trainingAnswer(x))
          .join(", ") +
        "}"
      : JSON.stringify(v);
/** Match the serving grammar's object-key order without changing any meaning. */
export function orderForSchema(value, schema, rootSchema = schema) {
  const resolveSchema = (s) =>
    s?.$ref
      ? resolveSchema(
          s.$ref
            .split("/")
            .slice(1)
            .reduce(
              (v, k) => v[k.replace(/~1/g, "/").replace(/~0/g, "~")],
              rootSchema,
            ),
        )
      : s;
  const matches = (v, s) => {
    s = resolveSchema(s);
    if (!s || typeof s !== "object") return true;
    if (s.enum && !s.enum.includes(v)) return false;
    if ("const" in s && s.const !== v) return false;
    if (s.anyOf) return s.anyOf.some((b) => matches(v, b));
    if (s.type === "null") return v === null;
    if (
      s.type === "object" &&
      (v === null || Array.isArray(v) || typeof v !== "object")
    )
      return false;
    if (s.type === "array" && !Array.isArray(v)) return false;
    if (s.type === "string" && typeof v !== "string") return false;
    if (s.type === "number" && typeof v !== "number") return false;
    if (s.type === "integer" && !Number.isInteger(v)) return false;
    if (v && typeof v === "object" && !Array.isArray(v) && s.properties) {
      if ((s.required ?? []).some((k) => !(k in v))) return false;
      for (const [k, p] of Object.entries(s.properties))
        if (k in v && !matches(v[k], p)) return false;
    }
    return true;
  };
  const visit = (v, s) => {
    s = resolveSchema(s);
    if (s?.anyOf) {
      const branch = s.anyOf.find((b) => matches(v, b));
      if (!branch) throw Error("beta_no_schema_branch");
      return visit(v, branch);
    }
    if (Array.isArray(v)) return v.map((x) => visit(x, s?.items ?? {}));
    if (v && typeof v === "object") {
      const props = s?.properties ?? {},
        keys = [
          ...Object.keys(props).filter((k) => k in v),
          ...Object.keys(v).filter((k) => !(k in props)),
        ];
      return Object.fromEntries(
        keys.map((k) => [k, visit(v[k], props[k] ?? {})]),
      );
    }
    return v;
  };
  const result = visit(value, schema);
  if (contentHash(result) !== contentHash(value))
    throw Error("beta_serialization_changed_meaning");
  return result;
}

export const normalText = (s) =>
  s
    .normalize("NFKC")
    .toLowerCase()
    .replace(/[\p{P}\p{Z}\s]+/gu, " ")
    .trim();
/** Conservative overlap detector, not a model quality judge. IDs fixed by authoring. */
/** Alpha/order invariant formal-graph audit. It does not adjudicate semantic equivalence. */
export function graphAuditHash(meaning, { maskNumbers = true } = {}) {
  const slots = {};
  for (const e of meaning.entities ?? [])
    slots[e.kind] = (slots[e.kind] ?? 0) + 1;
  let count = 0,
    best = null;
  const sorted = (x) =>
    [...x].sort((a, b) => contentHash(a).localeCompare(contentHash(b)));
  function candidate(map) {
    const ref = (v) =>
      Array.isArray(v)
        ? v.map(ref)
        : v && typeof v === "object"
          ? Object.fromEntries(
              Object.entries(v)
                .filter(([k]) => !["id", "label"].includes(k))
                .map(([k, x]) => [
                  k,
                  maskNumbers && ["amount", "date", "time"].includes(k)
                    ? `<${k}>`
                    : k === "subjectIds" || k === "relatedIds"
                      ? sorted(x.map((id) => map[id] ?? id))
                      : k === "referenceEntityId"
                        ? (map[x] ?? x)
                        : ref(x),
                ]),
            )
          : v;
    const fs = new Map(
      [...(meaning.facts ?? []), ...(meaning.extensions ?? [])].map((f) => [
        f.id,
        contentHash(ref(f)),
      ]),
    );
    const ws = new Map(
      (meaning.weatherConditions ?? []).map((w) => [w.id, contentHash(ref(w))]),
    );
    const logic = (n) =>
      !n
        ? null
        : n.kind === "FACT"
          ? { kind: n.kind, fact: fs.get(n.factId) }
          : n.kind === "IF"
            ? {
                kind: n.kind,
                condition: ws.get(n.conditionFactId),
                then: logic(n.then),
                else: logic(n.else),
              }
            : n.kind === "FALLBACK"
              ? { kind: n.kind, options: n.options.map(logic) }
              : {
                  kind: n.kind,
                  strength: n.strength ?? null,
                  children: sorted(n.children.map(logic)),
                };
    return contentHash({
      entities: sorted(
        (meaning.entities ?? []).map((e) => ({
          id: map[e.id],
          kind: e.kind,
          members: sorted((e.members ?? []).map((id) => map[id])),
        })),
      ),
      facts: sorted((meaning.facts ?? []).map(ref)),
      extensions: sorted((meaning.extensions ?? []).map(ref)),
      logic: logic(meaning.logic),
      bindings: sorted(
        (meaning.bindings ?? []).map((b) => ({
          kind: b.kind,
          facts:
            b.kind === "SEQUENCE"
              ? b.factIds.map((id) => fs.get(id))
              : sorted(b.factIds.map((id) => fs.get(id))),
        })),
      ),
      weather: sorted((meaning.weatherConditions ?? []).map(ref)),
      uncertainties: sorted((meaning.uncertainties ?? []).map(ref)),
    });
  }
  function visit(index, map, used) {
    if (index === (meaning.entities ?? []).length) {
      if (++count > 4096) throw Error("beta_graph_complexity_bound");
      const h = candidate(map);
      if (best === null || h < best) best = h;
      return;
    }
    const e = meaning.entities[index];
    for (let n = 0; n < slots[e.kind]; n++) {
      const id = `${e.kind}:${n}`;
      if (!used.has(id))
        visit(index + 1, { ...map, [e.id]: id }, new Set([...used, id]));
    }
  }
  visit(0, {}, new Set());
  return best;
}

export function structuralSignature(row) {
  return contentHash({
    task: row.task,
    final: graphAuditHash(row.finalMeaning ?? row.expected.meaning),
    previous: row.previousMeaning ? graphAuditHash(row.previousMeaning) : null,
    changes:
      row.task === "DIALOGAKTUALISIERUNG_V3"
        ? (row.expected.changes ?? [])
            .map((c) => (c.fact ? "REPLACE" : "REMOVE"))
            .sort()
        : null,
  });
}

export function checkSourceInvariants(row) {
  const m = row.finalMeaning ?? row.expected.meaning;
  const clarification = row.expected.clarification;
  if (clarification && (!Array.isArray(clarification.options) || clarification.options.length < 2 || clarification.options.length > 3))
    throw Error("beta_clarification_options_contract");
  if (!m) throw Error("beta_expected_meaning_missing");
  if (!/^[a-z0-9][a-z0-9_.-]{0,200}$/.test(row.id))
    throw Error("beta_case_id_invalid");
  const source = (
    row.query +
    " " +
    (row.turns ?? []).map((t) => t.answer).join(" ")
  )
    .normalize("NFKC")
    .toLowerCase();
  const words = {
    0: ["null", "gratis", "kostenlos", "nüt"],
    1: ["eins", "ein", "eine"],
    2: ["zwei", "zweit"],
    3: ["drei", "dritt"],
    4: ["vier"],
    5: ["fünf", "füf"],
    6: ["sechs", "sechst"],
    7: ["sieben"],
    8: ["acht"],
    9: ["neun"],
    10: ["zehn"],
    11: ["elf"],
    12: ["zwölf"],
    16: ["sechzehn"],
    20: ["zwanzig"],
    30: ["dreissig", "dreißig"],
    35: ["fünfunddreissig"],
    45: ["fünfundvierzig"],
    80: ["achtzig"],
    120: ["zwei stunden", "zwei stunde"],
  };
  const hasNumber = (n) =>
    new RegExp("(?<![0-9])" + n + "(?![0-9])", "u").test(source) ||
    (words[n] ?? []).some((w) => source.includes(w));
  for (const fact of m.facts)
    if ("amount" in fact.value) {
      const n = fact.value.amount;
      if (
        !hasNumber(n) &&
        !(fact.value.unit === "METERS" && hasNumber(n / 1000)) &&
        !(
          fact.value.unit === "MINUTES" &&
          n % 60 === 0 &&
          hasNumber(n / 60) &&
          /stund|hour/u.test(source)
        )
      )
        throw Error("beta_number_not_grounded:" + fact.key + ":" + n);
    }

  const ids = new Set(m.entities.map((e) => e.id));
  for (const f of m.facts) {
    if (f.key === "offer.kind" && !venueKinds.has(f.value.text))
      throw Error("beta_unauthored_venue_kind:" + f.value.text);
    if (!f.subjectIds.every((id) => ids.has(id)))
      throw Error("beta_dangling_subject");
    if (
      f.key === "people.age" &&
      (f.modality !== "CONTEXT" ||
        f.subjectIds.length !== 1 ||
        m.entities.find((e) => e.id === f.subjectIds[0])?.kind !== "PERSON")
    )
      throw Error("beta_age_scope_invalid");
    if (f.key === "people.relationship" && f.modality !== "CONTEXT")
      throw Error("beta_relationship_modality_invalid");
    if (f.value.amount !== undefined && !Number.isFinite(f.value.amount))
      throw Error("beta_number_invalid");
  }
  const selfIds = m.facts
    .filter((f) => f.key === "people.role" && f.value.text === "self")
    .flatMap((f) => f.subjectIds);
  if (
    m.facts.some(
      (f) =>
        f.key === "people.age" &&
        f.subjectIds.some((id) => selfIds.includes(id)),
    ) &&
    row.family !== "roles-own-age"
  )
    throw Error("beta_child_age_on_self");
  if (inspectNuknukTrainingVocabulary({ meaning: m }).length)
    throw Error("beta_vocabulary_role_invalid");
  if (row.task === "DIALOGAKTUALISIERUNG_V3") {
    for (const change of row.expected.changes ?? [])
      if (!row.turns.some((t) => t.answer.includes(change.quote)))
        throw Error("beta_unfounded_change");
    for (const old of row.previousMeaning.facts) {
      if (
        !(row.expected.changes ?? []).some((c) => c.id === old.id) &&
        !m.facts.some((f) => contentHash(f) === contentHash(old))
      )
        throw Error("beta_lost_unchanged_fact");
    }
  }
  return true;
}
export function materializeBetaCases() {
  const rows = [],
    rejections = [],
    excluded = [],
    schemaCache = new Map(),
    promptCache = new Map();
  for (const family of blueprintFamilies)
    for (const profile of family.custom ? profiles.slice(0, 1) : profiles) {
      // Avoid self-contradictory slot combinations. These are exclusions, not hidden training rows.
      const forbidden = {
        "intent-activity-no-meal": ["breakfast", "meal", "pizza"],
        "alternatives-either": ["cinema"],
        "alternatives-meal-or-activity": ["meal"],
        "sequence-first-then": ["walking"],
        "sequence-reverse": ["tea"],
        "sequence-independent-order": ["museum"],
        "sequence-same-place": ["meal"],
        "sequence-travel-between": ["museum"],
        "coherence-on-site": ["coffee"],
        "coherence-different-areas": ["tea"],
        "coherence-separate-budget": ["meal"],
        "conditional-rain-choice": ["walking"],
        "conditional-fallback": ["museum"],
        "atmosphere-conversation": ["cinema"],
        "other-time-later-appointment": ["breakfast"],
        "visit-time-today-evening": ["breakfast"],
        "coherence-drink-optional": ["coffee", "tea"],
        "coherence-drink-optional": ["coffee", "tea"],
        "visit-time-evening": ["breakfast"],
        "other-time-later-appointment": ["breakfast"],
      };
      if (forbidden[family.id]?.includes(profile.id)) {
        excluded.push({
          family: family.id,
          profile: profile.id,
          reason:
            "Would duplicate or contradict the other explicitly named activity.",
        });
        continue;
      }
      const suited = {
        "atmosphere-privacy": ["coffee", "tea", "breakfast", "meal", "pizza"],
        "booking-no-membership": ["bowling", "climbing", "swimming", "ceramics"],
        "children-alone-child": ["cinema", "bowling", "museum", "climbing", "swimming", "ceramics"],
        "prices-activity-only": ["cinema", "bowling", "museum", "climbing", "swimming", "ceramics"],
        "intent-cafe-no-drink": ["coffee", "tea", "breakfast", "meal", "pizza"],
        "clarification-missing-name": ["coffee", "tea", "breakfast", "meal", "pizza"],
        "areas-terrace-required": ["coffee", "tea", "breakfast", "meal", "pizza"],
        "weather-shade": ["coffee", "tea", "breakfast", "meal", "pizza", "swimming", "walking"],
        "weather-covered": ["coffee", "tea", "breakfast", "meal", "pizza", "walking"],
        "weather-rain-indoor": ["coffee", "tea", "breakfast", "meal", "pizza", "cinema", "bowling", "museum", "climbing", "swimming", "ceramics"],
        "areas-indoor-hard": ["coffee", "tea", "breakfast", "meal", "pizza", "cinema", "bowling", "museum", "climbing", "swimming", "ceramics"],
        "booking-own-food": ["cinema", "bowling", "museum", "climbing", "swimming", "ceramics", "walking"],
        "coherence-simultaneous": ["coffee", "tea", "breakfast", "meal", "pizza"],
        "conditional-snow-choice": ["walking", "swimming", "coffee", "tea", "meal"],
        "diet-one-vegan": ["breakfast", "meal", "pizza"],
        "diet-preference": ["breakfast", "meal", "pizza"],
        "diet-allergy": ["breakfast", "meal", "pizza"],
        "diet-gluten-person": ["breakfast", "meal", "pizza"],
        "diet-not-required": ["breakfast", "meal", "pizza"],
        "equipment-own-equipment": [
          "bowling",
          "swimming",
          "ceramics",
          "walking",
        ],
        "equipment-hire-required": ["bowling", "swimming", "ceramics"],
        "access-beginner": ["bowling", "swimming", "climbing"],
        "booking-without-stay": [
          "coffee",
          "tea",
          "breakfast",
          "meal",
          "pizza",
          "swimming",
        ],
        "intent-specific-venue": ["coffee", "tea", "meal"],
      };
      if (suited[family.id] && !suited[family.id].includes(profile.id)) {
        excluded.push({
          family: family.id,
          profile: profile.id,
          reason: "Outside the authored natural-use domain for this blueprint.",
        });
        continue;
      }
      const text = family.render(profile),
        target = family.target(profile);
      for (const locale of ["de", "de-CH"]) {
        const id = `beta2-${family.id}-${profile.id}-${locale}`.toLowerCase();
        try {
          const query = text[locale],
            reference = family.reference ?? profile.reference;
          let expected,
            previousMeaning = null,
            turns = null,
            request,
            finalMeaning,
            validation;
          if (target.previous) {
            previousMeaning = authorMeaning(target.previous);
            turns = target.turns
              ? target.turns(locale)
              : [{ question: null, answer: target.answers[locale] }];
            const changes = target.change(locale);
            expected = Array.isArray(changes) ? { changes } : changes;
            request = buildNuknukDialogueUpdate(
              buildNuknukCompactSearchRequest({ query, reference }),
              previousMeaning,
              turns,
            );
            const merged = mergeNuknukDialogueUpdate(
              previousMeaning,
              expected,
              turns,
            );
            validation = validateCompactTurn(
              merged,
              { query: query + " Ergänzung: " + turns.map((turn) => turn.answer).join(" "), reference },
              turns.map((turn) => turn.answer).join(" "),
            );
            finalMeaning = merged.meaning;
          } else {
            expected = {
              meaning: authorMeaning(target),
              ...(target.clarification
                ? { clarification: target.clarification }
                : {}),
            };
            request = buildNuknukCompactSearchRequest({ query, reference });
            validation = validateNuknukCompactSearch(expected, {
              query,
              reference,
            });
            finalMeaning = expected.meaning;
          }
          expected = orderForSchema(expected, request.outputSchema);
          const schemaHash = contentHash(request.outputSchema),
            promptHash = contentHash(request.instructions);
          if (!schemaCache.has(schemaHash))
            schemaCache.set(schemaHash, request.outputSchema);
          if (!promptCache.has(promptHash))
            promptCache.set(promptHash, request.instructions);
          request = {
            ...request,
            outputSchema: schemaCache.get(schemaHash),
            instructions: promptCache.get(promptHash),
          };
          const row = {
            id,
            family: family.id,
            theme: family.theme,
            themeLabel: family.label,
            split: family.split,
            locale,
            profile: profile.id,
            query,
            reference,
            task: target.previous
              ? "DIALOGAKTUALISIERUNG_V3"
              : "COMPACT_SEARCH_V7",
            expected,
            previousMeaning,
            turns,
            finalMeaning,
            expectedDisposition: validation.requestState,
            expectedInteraction: expected.clarification
              ? "CLARIFY"
              : validation.requestState === "UNSUPPORTED_CAPABILITY"
                ? "HOST_UNSUPPORTED"
                : "SEARCH",
            boundary: validation.boundary ?? null,
            rubric: family.rubric,
            phenomena: family.tags,
            provenance: {
              kind:
                family.theme === "lexicon"
                  ? "CONTROLLED_VOCABULARY_EXERCISE"
                  : family.custom
                    ? "INDIVIDUALLY_AUTHORED_SYNTHETIC_COMPOSITION"
                    : "AUTHORED_SYNTHETIC_BLUEPRINT_WITH_CONTROLLED_SLOTS",
              independentHumanGold: false,
              modelResponsesUsedForTargets: false,
            },
            request: {
              messages: [
                { role: "system", content: request.instructions },
                { role: "user", content: request.input },
              ],
              outputSchema: request.outputSchema,
              promptHash: contentHash(request.instructions),
              inputHash: contentHash(request.input),
              schemaHash: contentHash(request.outputSchema),
            },
          };
          checkSourceInvariants(row);
          row.contentHash = contentHash({
            query,
            reference,
            task: row.task,
            expected,
            previousMeaning,
            turns,
            rubric: row.rubric,
          });
          rows.push(row);
        } catch (e) {
          rejections.push({
            id,
            family: family.id,
            locale,
            profile: profile.id,
            error: e.message,
          });
        }
      }
    }
  return { rows, rejections, excluded };
}
/** Related blueprints are indivisible even when the author initially chose different splits. */
export function isolateSplits(input) {
  const rows = structuredClone(input),
    parent = new Map(blueprintFamilies.map((f) => [f.id, f.id]));
  const find = (id) => (parent.get(id) === id ? id : find(parent.get(id)));
  const union = (a, b) => {
    a = find(a);
    b = find(b);
    if (a !== b) parent.set(b, a);
  };
  const texts = new Map(),
    graphs = new Map(),
    protectedGroups = new Map();
  for (const f of blueprintFamilies)
    if (f.protectionGroup) {
      if (protectedGroups.has(f.protectionGroup))
        union(f.id, protectedGroups.get(f.protectionGroup));
      else protectedGroups.set(f.protectionGroup, f.id);
    }
  for (const row of rows) {
    for (const [map, key] of [
      [
        texts,
        normalText(row.query) +
          (row.turns ? normalText(JSON.stringify(row.turns)) : ""),
      ],
      [graphs, structuralSignature(row)],
    ]) {
      if (map.has(key)) union(row.family, map.get(key));
      else map.set(key, row.family);
    }
  }
  const components = new Map();
  for (const f of blueprintFamilies) {
    const k = find(f.id);
    components.set(k, [...(components.get(k) ?? []), f]);
  }
  const splitByFamily = new Map();
  const adjustments = [];
  for (const group of components.values()) {
    const requested = new Set(group.map((f) => f.split));
    const split = requested.size > 1 ? "TRAIN" : group[0].split;
    for (const f of group) {
      splitByFamily.set(f.id, {
        split,
        groupId: contentHash(group.map((x) => x.id).sort()).slice(0, 20),
      });
      if (f.split !== split)
        adjustments.push({
          family: f.id,
          from: f.split,
          to: split,
          reason:
            "Connected by exact source or masked semantic graph to a different split.",
        });
    }
  }
  for (const row of rows) {
    const s = splitByFamily.get(row.family);
    row.split = s.split;
    row.scenarioGroup = s.groupId;
  }
  return { rows, adjustments, groups: components.size };
}
export async function buildBetaCatalog(out) {
  const raw = materializeBetaCases();
  await mkdir(out, { recursive: true, mode: 0o700 });
  const allFileHashes = {};
  const save = async (name, value) => {
    const bytes =
      typeof value === "string" ? value : JSON.stringify(value, null, 2) + "\n";
    await writeFile(resolve(out, name), bytes, { flag: "wx", mode: 0o600 });
    allFileHashes[name] = hash(bytes);
  };
  await save("source-validation.json", {
    version: CATALOG_VERSION,
    accepted: raw.rows.length,
    rejected: raw.rejections,
    excludedCombinations: raw.excluded,
    modelExecuted: false,
  });
  if (raw.rejections.length)
    throw Error(`beta_source_rejected_${raw.rejections.length}`);
  const { rows, adjustments, groups } = isolateSplits(raw.rows);
  rows.sort((a, b) =>
    contentHash({ seed: 42, id: a.id }).localeCompare(
      contentHash({ seed: 42, id: b.id }),
    ),
  );
  const counts = Object.fromEntries(
    ["TRAIN", "DEV", "TEST"].map((s) => [
      s,
      rows.filter((r) => r.split === s).length,
    ]),
  );
  if (counts.TRAIN < 1000 || counts.DEV < 100 || counts.TEST < 100)
    throw Error("beta_inadequate_split_coverage");
  const sources = [
    "packages/world-knowledge-core/src/spot-catalog.ts",
    "scripts/decision-diagnostics/nuknuk-curriculum/beta-cases.mjs",
    "scripts/decision-diagnostics/nuknuk-curriculum/beta-transfer.mjs",
    "scripts/decision-diagnostics/nuknuk-curriculum/beta-lexicon.mjs",
    "scripts/decision-diagnostics/nuknuk-curriculum/beta-reading.mjs",
    "scripts/decision-diagnostics/nuknuk-curriculum/beta-plan.mjs",
    "scripts/decision-diagnostics/nuknuk-curriculum/preflight.py",
    "scripts/decision-diagnostics/nuknuk-curriculum/beta-package.py",
    "scripts/decision-diagnostics/nuknuk-curriculum/beta-catalog.test.mjs",
    "scripts/decision-diagnostics/nuknuk-curriculum/beta-catalog.mjs",
    "packages/decision-vnext-core/src/nuknuk-understanding.ts",
    "packages/decision-vnext-core/src/nuknuk-dialogue.ts",
    "packages/decision-vnext-core/src/product-luna-librarian.ts",
    "packages/decision-vnext-core/src/product-luna-librarian-assets.ts",
    "packages/decision-vnext-core/src/nuknuk-training-vocabulary.ts",
  ];
  const sourceHashes = Object.fromEntries(
    await Promise.all(
      sources.map(async (p) => [p, hash(await readFile(resolve(root, p)))]),
    ),
  );
  const files = {};
  for (const [split, name] of [
    ["TRAIN", "train"],
    ["DEV", "valid"],
  ]) {
    const bytes =
      rows
        .filter((r) => r.split === split)
        .map((r) =>
          JSON.stringify({
            messages: [
              ...r.request.messages,
              { role: "assistant", content: trainingAnswer(r.expected) },
            ],
          }),
        )
        .join("\n") + "\n";
    files[name + ".jsonl"] = hash(bytes);
    await save(name + ".jsonl", bytes);
  }
  const prompts = Object.fromEntries(
    rows.map((r) => [r.request.promptHash, r.request.messages[0].content]),
  );
  const schemas = Object.fromEntries(
    rows.map((r) => [r.request.schemaHash, r.request.outputSchema]),
  );
  const pack = (r) => ({
    ...r,
    request: {
      promptHash: r.request.promptHash,
      inputHash: r.request.inputHash,
      schemaHash: r.request.schemaHash,
      input: r.request.messages[1].content,
    },
  });
  const packed = rows.map(pack);
  const requests = (split) => ({
    version: "backyrd.nuknuk-beta-evaluation@2",
    split,
    modelExecuted: false,
    targetIncluded: false,
    prompts,
    schemas,
    cases: packed
      .filter((r) => r.split === split)
      .map(
        ({
          expected,
          finalMeaning,
          rubric,
          provenance,
          expectedDisposition,
          expectedInteraction,
          boundary,
          contentHash,
          ...r
        }) => r,
      ),
  });
  for (const split of ["DEV", "TEST"])
    await save(split.toLowerCase() + "-requests.json", requests(split));
  // TEST labels are local-only; no TEST training JSONL is emitted.
  await save("catalog.json", {
    version: CATALOG_VERSION,
    prompts,
    schemas,
    cases: packed,
  });
  const coverage = blueprintFamilies.map((f) => ({
    family: f.id,
    theme: f.theme,
    label: f.label,
    split: rows.find((r) => r.family === f.id)?.split,
    formulations: rows.filter((r) => r.family === f.id).length,
    rubric: f.rubric,
    phenomena: f.tags,
  }));
  await save("coverage.json", {
    families: coverage,
    splitAdjustments: adjustments,
    protectedScenarioGroups: groups,
    taskCounts: Object.fromEntries(
      [...new Set(rows.map((r) => r.task))].map((t) => [
        t,
        rows.filter((r) => r.task === t).length,
      ]),
    ),
  });
  await save("GESAMTKATALOG.md", wholeReading(rows));
  const manifest = {
    version: CATALOG_VERSION,
    status: "SYNTHETIC_CATALOG_TECHNICALLY_CHECKED_REQUIRES_MODEL_EVALUATION",
    sourceSha: execFileSync("git", ["rev-parse", "HEAD"], {
      cwd: root,
      encoding: "utf8",
    }).trim(),
    sourceHashes,
    counts,
    sourceFamilies: blueprintFamilies.length,
    controlledBlueprints: generatedFamilies.length,
    individuallyAuthoredSituations: everydayCompositions.length,
    lexiconEntries: lexiconFamilies.length,
    protectedScenarioGroups: groups,
    themes: new Set(rows.map((r) => r.theme)).size,
    sourceInstantiations: rows.length / 2,
    formulations: rows.length,
    locales: ["de", "de-CH"],
    catalogHash: contentHash(packed),
    files,
    artifactByteHashes: allFileHashes,
    review: {
      author: "ASSISTANT",
      method:
        "Explicit authored meanings, canonical boundary validation, independent source invariants and split-overlap checks.",
      independentHumanGold: false,
      independentModelAdjudication: false,
      semanticCorrectnessGuaranteed: false,
    },
    training: {
      resourcesStarted: false,
      executionAuthorizedByThisArtifact: false,
      paidSpendUsd: 0,
      proposedTotalBudgetCeilingUsd: 50,
      noAutoPay: true,
      noTestGradients: true,
      trainOnInputs: false,
      recipeRequiresMeasuredPreflight: true,
    },
    evaluation: {
      status: "NOT_EXECUTED",
      selectionSplit: "DEV",
      finalAcceptanceSplit: "TEST",
      testReusePolicy:
        "After viewing candidate TEST outcomes, use as development evidence and author a new final test.",
      requirePairedParent: true,
      requireMacNativeInference: true,
      understandingDoesNotProveLiveRecommendationQuality: true,
    },
  };

  const sample = coverage.map((f) => rows.find((r) => r.family === f.family));
  await save(
    "reading-catalog.md",
    "# NukNuk – Alltagssituationen\n\nSynthetischer Entwurf; technische Prüfung ist keine Modellbewertung.\n\n" +
      sample
        .map(
          (r) =>
            `## ${r.themeLabel} · ${r.family}\n\n**${r.query}**${dialogueReading(r.turns)}\n\nPrüffokus: ${r.rubric}\n\nBestand: ${r.split} · ${r.locale}\n`,
        )
        .join("\n"),
  );
  await save("training-plan.json", betaTrainingPlan(manifest));
  await save("START_HIER.md", betaStartHere(manifest));
  await save(
    "FRAGENKATALOG.md",
    "# NukNuk – Fragenkatalog\n\nSynthetische Anfragen, nach Bestand gekennzeichnet.\n\n" +
      rows
        .map(
          (r, i) =>
            `## ${i + 1}. ${r.id} · ${r.split}\n\n${r.query}${dialogueReading(r.turns)}\n`,
        )
        .join("\n"),
  );
  await save(
    "BEGRIFFE.json",
    lexiconFamilies.map((f) => ({
      id: f.id,
      source: f.render().de,
      target: f.target().facts,
      sourceKind: "CONTROLLED_BACKYRD_VOCABULARY_NOT_SPOT_FACTS",
    })),
  );
  await save("result-template.json", {
    version: "backyrd.nuknuk-beta-evaluation-report@2",
    status: "NOT_EXECUTED",
    catalogHash: manifest.catalogHash,
    parentAdapterHash: null,
    candidateAdapterHash: null,
    trainingCostUsd: null,
    development: null,
    finalTest: null,
    nativeMac: null,
    liveRecommendationChain: null,
    modelActivated: false,
  });
  manifest.artifactByteHashes = { ...allFileHashes };
  await save("manifest.json", manifest);
  return manifest;
}
export async function verifyBetaCatalog(folder) {
  const manifest = JSON.parse(
    await readFile(resolve(folder, "manifest.json"), "utf8"),
  );
  if (manifest.version !== CATALOG_VERSION)
    throw Error("beta_manifest_version_invalid");
  for (const [name, expected] of Object.entries(
    manifest.artifactByteHashes ?? {},
  )) {
    if (
      name !== name.split("/").pop() ||
      name.includes("..") ||
      hash(await readFile(resolve(folder, name))) !== expected
    )
      throw Error("beta_artifact_changed:" + name);
  }
  for (const [p, h] of Object.entries(manifest.sourceHashes)) {
    if (hash(await readFile(resolve(root, p))) !== h)
      throw Error("beta_source_changed:" + p);
  }
  const d = JSON.parse(await readFile(resolve(folder, "catalog.json"), "utf8"));
  if (contentHash(d.cases) !== manifest.catalogHash)
    throw Error("beta_catalog_changed");
  const freshRaw = materializeBetaCases();
  if (freshRaw.rejections.length) throw Error("beta_source_invalid");
  const fresh = isolateSplits(freshRaw.rows).rows;
  const expectedRows = new Map(fresh.map((r) => [r.id, r]));
  if (fresh.length !== d.cases.length) throw Error("beta_roster_changed");
  for (const [k, v] of Object.entries(d.prompts))
    if (contentHash(v) !== k) throw Error("beta_prompt_changed");
  for (const [k, v] of Object.entries(d.schemas))
    if (contentHash(v) !== k) throw Error("beta_schema_changed");
  const required = [
    "catalog.json",
    "train.jsonl",
    "valid.jsonl",
    "dev-requests.json",
    "test-requests.json",
    "GESAMTKATALOG.md",
  ];
  if (required.some((p) => !manifest.artifactByteHashes[p]))
    throw Error("beta_manifest_files_missing");
  const texts = new Map(),
    graphs = new Map(),
    ids = new Set(),
    groups = new Map();
  for (const r of d.cases) {
    const original = expectedRows.get(r.id);
    if (
      !original ||
      r.contentHash !== original.contentHash ||
      r.split !== original.split ||
      r.scenarioGroup !== original.scenarioGroup ||
      trainingAnswer(r.expected) !== trainingAnswer(original.expected) ||
      contentHash(r.reference) !== contentHash(original.reference) ||
      r.query !== original.query ||
      r.request.promptHash !== original.request.promptHash ||
      r.request.inputHash !== original.request.inputHash ||
      r.request.schemaHash !== original.request.schemaHash ||
      contentHash(r.request.input) !== r.request.inputHash
    )
      throw Error("beta_row_not_from_source");
    if (ids.has(r.id)) throw Error("beta_duplicate_id");
    ids.add(r.id);
    checkSourceInvariants(r);
    if (!["TRAIN", "DEV", "TEST"].includes(r.split))
      throw Error("beta_split_invalid");
    if (groups.has(r.scenarioGroup) && groups.get(r.scenarioGroup) !== r.split)
      throw Error("beta_family_leak");
    groups.set(r.scenarioGroup, r.split);
    for (const [map, k] of [
      [
        texts,
        normalText(r.query) +
          (r.turns ? normalText(JSON.stringify(r.turns)) : ""),
      ],
      [graphs, structuralSignature(r)],
    ]) {
      if (map.has(k) && map.get(k) !== r.split)
        throw Error("beta_cross_split_overlap");
      map.set(k, r.split);
    }
    const source = { query: r.query, reference: r.reference };
    if (r.task === "DIALOGAKTUALISIERUNG_V3") {
      const final = mergeNuknukDialogueUpdate(
        r.previousMeaning,
        r.expected,
        r.turns,
      );
      validateCompactTurn(
        final,
        { ...source, query: r.query + " Ergänzung: " + r.turns.map((turn) => turn.answer).join(" ") },
        r.turns.map((turn) => turn.answer).join(" "),
      );
      if (contentHash(final.meaning) !== contentHash(r.finalMeaning))
        throw Error("beta_dialogue_changed");
    } else validateNuknukCompactSearch(r.expected, source);
  }
  for (const [split, file] of [
    ["TRAIN", "train.jsonl"],
    ["DEV", "valid.jsonl"],
  ]) {
    const rows = d.cases.filter((r) => r.split === split),
      lines = (await readFile(resolve(folder, file), "utf8"))
        .trimEnd()
        .split("\n");
    if (lines.length !== rows.length || rows.length !== manifest.counts[split])
      throw Error("beta_training_count_changed");
    for (let i = 0; i < rows.length; i++) {
      const r = rows[i],
        expected = {
          messages: [
            { role: "system", content: d.prompts[r.request.promptHash] },
            { role: "user", content: r.request.input },
            { role: "assistant", content: trainingAnswer(r.expected) },
          ],
        };
      if (contentHash(JSON.parse(lines[i])) !== contentHash(expected))
        throw Error("beta_training_row_changed");
    }
  }
  if (d.cases.filter((r) => r.split === "TEST").length !== manifest.counts.TEST)
    throw Error("beta_test_count_changed");
  return {
    status: "ARTIFACT_AND_SOURCE_VERIFIED",
    counts: manifest.counts,
    catalogHash: manifest.catalogHash,
    modelEvaluated: false,
  };
}

export async function auditBetaHistory(folder, historyFile, output) {
  const data = JSON.parse(
    await readFile(resolve(folder, "catalog.json"), "utf8"),
  );
  const oldBytes = await readFile(historyFile),
    old = JSON.parse(oldBytes);
  if (!Array.isArray(old.cases)) throw Error("beta_history_invalid");
  const known = new Map();
  let ignored = 0;
  for (const r of old.cases) {
    const c = r.content ?? r;
    if (typeof c.query !== "string") {
      ignored++;
      continue;
    }
    const turns = c.context?.turns ?? r.turns ?? null;
    const key =
      normalText(c.query) + (turns ? normalText(JSON.stringify(turns)) : "");
    known.set(key, [...(known.get(key) ?? []), r.id]);
  }
  const matches = [];
  for (const r of data.cases) {
    const key =
      normalText(r.query) +
      (r.turns ? normalText(JSON.stringify(r.turns)) : "");
    if (known.has(key))
      matches.push({ id: r.id, split: r.split, previousIds: known.get(key) });
  }
  const report = {
    version: "backyrd.nuknuk-history-audit@2",
    historicalArtifactSha256: hash(oldBytes),
    historicalCases: old.cases.length,
    unreadableHistoryCases: ignored,
    currentCases: data.cases.length,
    exactSourceMatches: matches,
    heldoutExactSourceMatches: matches.filter((r) => r.split !== "TRAIN"),
    method:
      "NFKC, case, punctuation and whitespace normalized source plus available dialogue turns. Does not establish historical semantic novelty or independent human gold.",
    modelExecuted: false,
  };
  await writeFile(output, JSON.stringify(report, null, 2) + "\n", {
    flag: "wx",
    mode: 0o600,
  });
  return {
    matches: matches.length,
    heldoutMatches: report.heldoutExactSourceMatches.length,
  };
}

if (
  process.argv[1] &&
  resolve(process.argv[1]) === fileURLToPath(import.meta.url)
) {
  try {
    const [command, out, history, reportOut] = process.argv.slice(2);
    if (command === "audit-history") {
      if (!out || !history || !reportOut) throw Error("beta_history_usage");
      console.log(
        JSON.stringify(
          await auditBetaHistory(
            resolve(out),
            resolve(history),
            resolve(reportOut),
          ),
        ),
      );
      process.exit(0);
    }
    if (!out || !["build", "verify"].includes(command))
      throw Error("beta_usage_build_or_verify_OUTPUT");
    if (command === "verify")
      console.log(JSON.stringify(await verifyBetaCatalog(resolve(out))));
    else {
      const m = await buildBetaCatalog(resolve(out));
      console.log(
        JSON.stringify({
          version: m.version,
          counts: m.counts,
          families: m.sourceFamilies,
          groups: m.protectedScenarioGroups,
          paidSpendUsd: 0,
        }),
      );
    }
  } catch (e) {
    console.error(e.message);
    process.exitCode = 1;
  }
}
