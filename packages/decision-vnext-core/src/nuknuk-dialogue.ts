import {buildNuknukCompactSearchRequest} from './nuknuk-understanding.js';
import type {LunaMeaningOutput} from './product-luna-librarian.js';
import {contentHash} from './canonical.js';
import {schema, type Schema} from './schema.js';

type Turn = {question:string; answer:string};
type Prompt = Pick<ReturnType<typeof buildNuknukCompactSearchRequest>, 'instructions' | 'input'>
  & {outputSchema: Record<string,unknown>};

export function splitNuknukDialogue(query: string): {original:string; turns:Turn[]} | null {
  // Mobile and web also submit histories with whitespace collapsed.
  const pattern = /\s+Rückfrage:\s*([^?\n]+\?)\s+Antwort:\s*/gu;
  const markers = [...query.matchAll(pattern)];
  if (!markers.length) return null;
  const original = query.slice(0, markers[0]!.index).trim();
  const turns = markers.map((match,index)=>({
    question:match[1]!.trim(),
    answer:query.slice(match.index+match[0].length,markers[index+1]?.index).trim(),
  }));
  return original && turns.every(turn=>turn.answer) ? {original,turns} : null;
}

export function buildNuknukDialogueUpdate(prompt: Prompt, previous: LunaMeaningOutput, turns: Turn[]): Prompt {
  const {properties} = prompt.outputSchema;
  if (!properties || typeof properties !== 'object' || !('meaning' in properties) || !('clarification' in properties)) {
    throw Error('nuknuk_dialogue_schema_invalid');
  }
  const ids = [...previous.facts,...previous.extensions].map(fact=>fact.id);
  return {
    ...prompt,
    instructions:prompt.instructions + `
DIALOGAKTUALISIERUNG. previousMeaning ist der bisherige Suchauftrag. Verarbeite turns der Reihe nach.
Nur die Antworten ändern den Wunsch. Gib in meaning ausschliesslich neue Fakten, Entitäten,
Erweiterungen und Bedingungen aus. Eine Ergänzung wird hinzugefügt. Bei einer ausdrücklichen Änderung
nimm die betroffenen IDs in removeFactIds auf und füge gegebenenfalls neue Fakten hinzu.
Belege jede entfernte ID mit einem wörtlichen Zitat aus einer Antwort in removalEvidence.
Für einen Ersatz innerhalb einer bestehenden Bindung oder Alternative behalte die Fakten-ID bei.
Niemals eine bisherige Angabe entfernen, nur weil sie in der Antwort nicht wiederholt wird.
Behalte die Zuordnung: verwende vorhandene Entitäts-IDs wo passend, und neue eindeutige
IDs für neue Fakten und Entitäten. Gib id und subjectIds ausdrücklich an. Keine singleActivity.
Wenn die Antwort einen alten Wunsch ersetzt, sollen seine früheren Werte nicht zusätzlich gelten.
Bei einer Antwort ohne Suchänderung gib meaning.facts, removeFactIds und removalEvidence als leere Listen zurück.
Keine bereits beantwortete Rückfrage wiederholen. Nur bei neuer konkreter Unklarheit fragen.
`,
    input:JSON.stringify({previousMeaning:previous,turns}),
    outputSchema:{
      ...prompt.outputSchema, properties:{
        meaning:properties.meaning,
        clarification:properties.clarification,
        removeFactIds:{type:'array',items:{type:'string',...(ids.length ? {enum:ids} : {})},maxItems:Math.min(128,ids.length)},
        removalEvidence:{type:'array',maxItems:128,items:{type:'object',additionalProperties:false,
          properties:{id:{type:'string'},quote:{type:'string'}},required:['id','quote']}},
      },
      required:['meaning','removeFactIds','removalEvidence'],
    },
  };
}

const deferred: Schema<unknown> = {parse: value=>value};
const updateSchema = schema.object({
  meaning:schema.object({
    facts:schema.array(deferred,{max:256}),
    entities:schema.optional(schema.array(deferred,{max:128})),
    extensions:schema.optional(schema.array(deferred,{max:128})),
    weatherConditions:schema.optional(schema.array(deferred,{max:128})),
    bindings:schema.optional(schema.array(deferred,{max:128})),
    uncertainties:schema.optional(schema.array(deferred,{max:128})),
    logic:schema.optional(deferred),
  }),
  removeFactIds:schema.array(schema.string({min:1,max:128}),{max:128}),
  removalEvidence:schema.array(schema.object({id:schema.string({min:1,max:128}),quote:schema.string({min:1,max:2000})}),{max:128}),
  clarification:schema.optional(deferred),
});

function referencesRemovedFact(value: unknown, removed: Set<string>): boolean {
  if (Array.isArray(value)) return value.some(item=>referencesRemovedFact(item,removed));
  if (typeof value === 'object' && value !== null) {
    return Object.values(value).some(item=>referencesRemovedFact(item,removed));
  }
  return typeof value === 'string' && removed.has(value);
}

export function mergeNuknukDialogueUpdate(previous: LunaMeaningOutput, raw: unknown, turns: Turn[]): unknown {
  const update = updateSchema.parse(raw);
  const removed = new Set(update.removeFactIds);
  const existing = [...previous.facts,...previous.extensions];
  if ([...removed].some(id=>!existing.some(fact=>fact.id===id))) throw Error('nuknuk_dialogue_unknown_removal');
  if ([...removed].some(id=>!update.removalEvidence.some(entry=>entry.id===id
      && entry.quote.trim().length>0 && turns.some(turn=>turn.answer.includes(entry.quote))))) {
    throw Error('nuknuk_dialogue_removal_without_answer');
  }
  const append = update.meaning;
  // Some adapters echo the previous facts with a different modality.
  // Keep the original modality unless the answer authorizes a replacement.
  const retained = [...previous.entities,...previous.weatherConditions,...existing.filter(row=>!removed.has(row.id))];
  const withoutEchoes = (rows: readonly unknown[]) => rows.filter(row=>
    !retained.some(prior=>row && typeof row==='object' && 'id' in row && row.id===prior.id
      && (contentHash(row)===contentHash(prior) ||
        'key' in row && 'key' in prior && row.key===prior.key && 'value' in row
        && 'subjectIds' in row && contentHash(row.value)===contentHash(prior.value)
        && contentHash(row.subjectIds)===contentHash(prior.subjectIds))));
  const replacementIds = new Set([...append.facts,...(append.extensions??[])].flatMap(fact=>
    fact && typeof fact==='object' && 'id' in fact && typeof fact.id==='string' ? [fact.id] : []));
  const deleted = new Set([...removed].filter(id=>!replacementIds.has(id)));
  if (referencesRemovedFact(previous.logic,deleted) || previous.bindings.some(binding=>binding.factIds.some(id=>deleted.has(id)))) {
    throw Error('nuknuk_dialogue_bound_removal');
  }
  const logic = previous.logic && append.logic
    ? {kind:'ALL',children:[previous.logic,append.logic]} : previous.logic ?? append.logic ?? null;
  return {meaning:{
    facts:[...previous.facts.filter(f=>!removed.has(f.id)),...withoutEchoes(append.facts)],
    entities:[...previous.entities,...withoutEchoes(append.entities??[])],
    extensions:[...previous.extensions.filter(f=>!removed.has(f.id)),...withoutEchoes(append.extensions??[])],
    weatherConditions:[...previous.weatherConditions,...withoutEchoes(append.weatherConditions??[])],
    bindings:[...previous.bindings,...(append.bindings??[])],
    uncertainties:[...previous.uncertainties.filter(entry=>!entry.relatedIds.some(id=>deleted.has(id))),...(append.uncertainties??[])],
    logic,
  }, ...(update.clarification === undefined ? {} : {clarification:update.clarification})};
}
