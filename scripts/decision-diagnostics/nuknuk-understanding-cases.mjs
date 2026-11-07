// Assistant-authored development candidates, NOT human-approved gold or holdout.
// Keep paraphrases/counterexamples for one scenario in the same split group.
import { contentHash } from '../../packages/decision-vnext-core/dist/canonical.js';
import { NUKNUK_UNDERSTANDING_VERSION } from '../../packages/decision-vnext-core/dist/nuknuk-understanding.js';
import { NUKNUK_UNDERSTANDING_DATASET_VERSION } from '../../packages/decision-vnext-core/dist/nuknuk-understanding-learning.js';

const entity = (id, kind, label) => ({ id, kind, label, members: [] });
const fact = (id, key, text, modality = 'REQUIRED', subjectIds = [], basis = 'EXPLICIT') => ({ id, key, value: { text }, modality, basis, subjectIds });
const meaning = (entities, facts) => ({ entities, facts, logic: null, bindings: [], extensions: [], uncertainties: [], weatherConditions: [] });
const moment = (query, statement, quote, missing = [], clarification = null) => ({
  goal: { statement, evidence: [{ quote }] }, hypotheses: [], missing, clarification,
});
const make = (id, scenarioGroup, query, target, reviewFocus) => {
  const content = { version: NUKNUK_UNDERSTANDING_VERSION, task: 'INTERPRET_REQUEST', query, reference: { now: '2026-11-07T12:00:00Z', timezone: 'Europe/Zurich' }, target, context: null,
    provenance: { kind: ['birthday-dinner', 'playground-child', 'family-animals'].includes(id) ? 'DEIDENTIFIED_COMMISSIONED_EXAMPLE' : 'SYNTHETIC', reference: id }, trainingPermission: 'PENDING' };
  return { id, scenarioGroup, split: 'TRAIN', content, contentHash: contentHash(content), reviews: [], reviewFocus };
};

const birthday = 'Geburtstag von meiner Frau, etwas besonderes mit Abendessen';
const casual = 'Hochzeitstag, gemütlich essen und ausdrücklich kein Luxus';
const child = 'Spielplatz mit meiner 4-jährigen Tochter';
const animals = 'Familienausflug irgendwas mit Tieren';
const quiet = 'Ich will allein Kaffee trinken und brauche unbedingt Ruhe';
const open = 'Etwas Besonderes für meinen Freund';

export const understandingDevelopmentCases = [
  make('birthday-dinner', 'birthday-recipient-dinner', birthday, {
    meaning: meaning([entity('p1', 'PERSON', 'meine Frau'), entity('a1', 'ACTIVITY', 'Abendessen')], [
      fact('f1', 'experience.occasion', 'Geburtstag', 'CONTEXT'), fact('f2', 'people.relationship', 'meine Frau', 'CONTEXT', ['p1']),
      fact('f3', 'food.meal', 'dinner', 'REQUIRED', ['a1']), fact('f4', 'experience.purpose', 'etwas besonderes', 'CONTEXT', ['a1']),
    ]),
    moment: moment(birthday, 'Ein besonderes Abendessen zum Geburtstag der Frau auswählen.', 'etwas besonderes mit Abendessen', [
      { dimension: 'RECIPIENT_TASTE', whyItMatters: 'Besonders kann vertrauten Genuss oder etwas Neues bedeuten; ihre Vorlieben wurden nicht genannt.' },
      { dimension: 'DATE', whyItMatters: 'Ohne Besuchsdatum lässt sich die Öffnung für den Anlass nicht prüfen.' },
      { dimension: 'BUDGET', whyItMatters: 'Es wurde kein Preisrahmen genannt; besonders bedeutet nicht automatisch teuer.' },
    ], { question: 'Soll es eher vertrauter Genuss oder eine kulinarische Überraschung werden?', dimension: 'RECIPIENT_TASTE', options: ['Vertrauter Genuss', 'Kulinarische Überraschung'] }),
  }, 'Dinner und Anlass erhalten. Keine Romantik, Sterne, Frankenobergrenze, Feierbuchung, freien Tische oder Datum erfinden. Kontext bewahrt den besonderen Zweck; die jetzige Engine kann ihn noch nicht ausreichend ranken.'),
  make('anniversary-casual', 'anniversary-casual', casual, {
    meaning: meaning([entity('a1', 'ACTIVITY', 'essen')], [
      fact('f1', 'experience.occasion', 'Hochzeitstag', 'CONTEXT'), fact('f2', 'food.meal', 'meal', 'REQUIRED', ['a1']),
      fact('f3', 'atmosphere.character', 'cozy', 'PREFERRED', ['a1']), fact('f4', 'experience.character', 'Luxus', 'EXCLUDED', ['a1']),
    ]), moment: moment(casual, 'Den Hochzeitstag bei einem gemütlichen Essen ohne Luxus verbringen.', casual),
  }, 'Anlass nicht mit Luxus gleichsetzen; ausdrücklichen Ausschluss erhalten. Unbekannte Bedeutung darf nicht als erfüllt behauptet werden.'),
  make('playground-child', 'playground-parent-child', child, {
    meaning: meaning([entity('p1', 'PERSON', 'meine Tochter'), entity('p2', 'PERSON', 'ich'), entity('a1', 'ACTIVITY', 'Spielplatz')], [
      fact('f1', 'experience.activity', 'playground', 'REQUIRED', ['a1']), fact('f2', 'people.relationship', 'meine Tochter', 'CONTEXT', ['p1']),
      { id: 'f3', key: 'people.age', value: { amount: 4, unit: 'YEARS', operator: 'EQ' }, modality: 'CONTEXT', basis: 'EXPLICIT', subjectIds: ['p1'] },
      fact('f4', 'people.role', 'self', 'CONTEXT', ['p2'], 'INFERRED'), fact('f5', 'people.relationship', 'adult_accompanied', 'CONTEXT', ['p1', 'p2'], 'INFERRED'),
    ]), moment: moment(child, 'Mit der vierjährigen Tochter einen Spielplatz besuchen.', child),
  }, 'Konkreter Spielplatz statt zusätzlicher Kinderprogramm-Pflicht; Begleitung berücksichtigt. Kein Wetter, Datum oder Kinderalter erfinden.'),
  make('family-animals', 'family-animal-experience', animals, {
    meaning: meaning([entity('a1', 'ACTIVITY', 'Tiere erleben')], [
      fact('f1', 'experience.activity', 'animals', 'REQUIRED', ['a1']), fact('f2', 'experience.purpose', 'Familienausflug', 'CONTEXT'),
      fact('f3', 'people.relationship', 'adult_accompanied', 'CONTEXT', [], 'INFERRED'),
    ]), moment: moment(animals, 'Als Familie einen Ausflug mit Tieren unternehmen.', animals),
  }, 'Tiererlebnis von Haustier-Mitnahme trennen; keine bestimmte Aktivität, Alterszahl oder Zoo-Kategorie erfinden.'),
  make('quiet-coffee-alone', 'quiet-necessary-alone', quiet, {
    meaning: meaning([entity('a1', 'ACTIVITY', 'Kaffee trinken')], [
      fact('f1', 'food.drink', 'coffee', 'REQUIRED', ['a1']), fact('f2', 'atmosphere.noise', 'quiet', 'REQUIRED', ['a1']),
      fact('f3', 'people.relationship', 'alone', 'CONTEXT'),
    ]), moment: moment(quiet, 'Allein Kaffee trinken und dabei notwendige Ruhe finden.', 'brauche unbedingt Ruhe'),
  }, 'Funktional benötigte Ruhe bleibt Pflicht. Alleinsein nicht als Privatmiete oder menschenleeren Betrieb auslegen.'),
  make('open-special-recipient', 'open-special-recipient', open, {
    meaning: meaning([entity('p1', 'PERSON', 'mein Freund')], [
      fact('f1', 'people.relationship', 'mein Freund', 'CONTEXT', ['p1']), fact('f2', 'experience.purpose', 'Etwas Besonderes', 'CONTEXT'),
    ]), moment: moment(open, 'Für den Freund ein besonderes Erlebnis finden.', open,
      [{ dimension: 'EXPERIENCE_DIRECTION', whyItMatters: 'Es wurden weder eine Tätigkeit noch seine Vorlieben genannt.' }],
      { question: 'Welche Richtung würde ihm Freude machen?', dimension: 'EXPERIENCE_DIRECTION', options: ['Gemeinsam geniessen', 'Etwas erleben', 'Entspannen'] }),
  }, 'Kein Abendessen, romantische Partnerschaft, Geburtstag oder Sportinteresse erfinden. Eine hilfreiche Frage statt einer erfundenen konkreten Suchpflicht.'),
];

export function draftUnderstandingDataset() {
  return structuredClone({ version: NUKNUK_UNDERSTANDING_DATASET_VERSION,
    splitPlan: [...new Set(understandingDevelopmentCases.map(c => c.scenarioGroup))].map(scenarioGroup => ({ scenarioGroup, split: 'TRAIN' })),
    cases: understandingDevelopmentCases.map(({ reviewFocus: _, ...row }) => row) });
}
