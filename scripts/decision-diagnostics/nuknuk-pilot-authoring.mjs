// Offline authoring helpers, never an interpreter of real user prose.
import { contentHash } from '../../packages/decision-vnext-core/dist/canonical.js';
import { NUKNUK_UNDERSTANDING_VERSION, validateNuknukUnderstanding } from '../../packages/decision-vnext-core/dist/nuknuk-understanding.js';
export const reference = Object.freeze({ now: '2026-11-07T12:00:00Z', timezone: 'Europe/Zurich' });
export const F = (key, value, modality = 'REQUIRED', subjectIds = ['a1'], basis = 'EXPLICIT') => ({ key, value: typeof value === 'string' ? { text: value } : value, modality, subjectIds, basis });
export const age = amount => ({ amount, operator: 'EQ', unit: 'YEARS' });
export const money = amount => ({ amount, operator: 'LTE', currency: 'CHF' });
export const day = date => ({ date, operator: 'EQ', timezone: 'Europe/Zurich' });
export const phase = phase => ({ phase, timezone: 'Europe/Zurich' });
export const perPerson = F('budget.scope', { scope: 'PER_PERSON' }, 'CONTEXT', []);
export const family = F('people.relationship', 'adult_accompanied', 'CONTEXT', [], 'INFERRED');

export function makeInterpretation(spec, group) {
  const facts = spec.facts.map((f, i) => ({ id: 'f' + (i + 1), ...f }));
  const ids = [...new Set(facts.flatMap(f => f.subjectIds))];
  const entities = ids.map(id => ({ id, kind: id.startsWith('a') ? 'ACTIVITY' : id.startsWith('g') ? 'GROUP' : 'PERSON',
    label: spec.labels?.[id] ?? (id.startsWith('a') ? 'Besuch' : 'Genannte Person'), members: [] }));
  const target = {
    meaning: { entities, facts,
      logic: spec.logic ?? (spec.choice ? { kind: 'ANY', strength: 'REQUIRED', children: spec.choice.map(index => ({ kind: 'FACT', factId: 'f' + index })) } : null),
      bindings: [...(spec.bindings ?? []), ...(spec.sequence ? [{ kind: 'SEQUENCE', factIds: spec.sequence.map(index => 'f' + index) }] : [])],
      extensions: [], uncertainties: [], weatherConditions: spec.weather ?? [] },
    moment: { goal: { statement: spec.goal, evidence: [{ quote: spec.query }] }, hypotheses: spec.hypotheses ?? [],
      missing: spec.missing ?? [], clarification: spec.question ?? null },
  };
  validateNuknukUnderstanding(target, { query: spec.query, reference });
  const content = { version: NUKNUK_UNDERSTANDING_VERSION, task: 'INTERPRET_REQUEST', query: spec.query, reference, target, context: null,
    provenance: { kind: 'SYNTHETIC', reference: spec.id }, trainingPermission: 'PENDING' };
  return { id: spec.id, scenarioGroup: group.scenarioGroup, split: group.split, content, contentHash: contentHash(content), reviews: [] };
}

export const rain = { id: 'w1', basis: 'EXPLICIT', subjectIds: [], role: 'CONTEXT', state: 'RAIN', detail: null };
export const dateMissing = { dimension: 'DATE', whyItMatters: 'Ohne Besuchsdatum ist die Öffnung am gewünschten Tag nicht geprüft.' };
export const tasteMissing = { dimension: 'RECIPIENT_TASTE', whyItMatters: 'Die Vorlieben der anderen Person wurden nicht genannt und dürfen nicht aus dem eigenen Profil übernommen werden.' };
