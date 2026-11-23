import {buildNuknukCompactSearchRequest} from './nuknuk-understanding.js';
import type {LunaMeaningOutput} from './product-luna-librarian.js';
import {contentHash} from './canonical.js';
import {schema, type Schema} from './schema.js';

type Turn = {question:string | null; answer:string};
type Prompt = Pick<ReturnType<typeof buildNuknukCompactSearchRequest>, 'instructions' | 'input'>
  & {outputSchema: Record<string,unknown>};

function retainedTimingIds(previous: LunaMeaningOutput, turns: Turn[]): Set<string> {
  // previousMeaning is the original request. With several turns an earlier
  // answer may already have changed the date; do not lock it back to the
  // original merely because a later turn says to retain the current date.
  if (turns.length !== 1) return new Set();
  const clauses = turns[0]!.answer.split(/[.!?;,\n]/u).map(part => part.trim());
  const date = clauses.some(part => /^(?:(?:das|der)\s+)?(?:morgen|heute|datum|tag|termin)\s+bleibt(?:\s+(?:gleich|unverändert))?$|^(?:keep\s+)?(?:the\s+)?(?:same|unchanged)\s+(?:day|date)$/iu.test(part));
  const clock = clauses.some(part => /^(?:die\s+)?(?:uhrzeit|startzeit|endzeit)\s+bleibt(?:\s+(?:gleich|unverändert))?$|^(?:keep\s+)?(?:the\s+)?(?:same|unchanged)\s+(?:time|hour)$/iu.test(part));
  return new Set(previous.facts.filter(f => date && ['time.date','time.date_start','time.date_end','time.weekday'].includes(f.key)
    || clock && ['time.clock','time.clock_start','time.clock_end','time.clock_bounds'].includes(f.key)).map(f => f.id));
}

export function splitNuknukDialogue(query: string): {original:string; turns:Turn[]} | null {
  // Mobile and web also submit histories with whitespace collapsed.
  const pattern = /\s+(?:Rückfrage:\s*([^?\n]+\?)\s+Antwort:|Ergänzung:)\s*/gu;
  const markers = [...query.matchAll(pattern)];
  if (!markers.length) return null;
  const original = query.slice(0, markers[0]!.index).trim();
  const turns = markers.map((match,index)=>({
    question:match[1]?.trim() ?? null,
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
  const protectedFactIds = retainedTimingIds(previous, turns);
  const editableIds = ids.filter(id => !protectedFactIds.has(id));
  // Source hints describe the first wish. The checked previous meaning now
  // carries those facts; later answers may explicitly replace them.
  const instructions = prompt.instructions.replace(/\nORIGINALGEBUNDENE (?:GELDGRENZE|AKTIVITÄTSABLEHNUNGEN):[\s\S]*$/u, '');
  return {
    ...prompt,
    instructions:instructions + `
DIALOGAKTUALISIERUNG_V3. previousMeaning ist der bisherige Suchauftrag. Nur die Antworten in
turns ändern den Wunsch. Ausgabe: changes und optional additions/clarification, kein meaning.
changes enthält JEDE geänderte bisherige Angabe einmal: {id,quote,fact}.
id ist ihre alte Fakten-ID; quote ist ein wörtliches Zitat aus einer Antwort, das die Änderung
belegt; fact ist ihr neuer vollständiger Fakt mit derselben ID. Bei ausdrücklich ersatzloser
Aufhebung ist fact:null. Mehrere Änderungen brauchen mehrere changes mit je eigenem Beleg.
Unveränderte Fakten NICHT ausgeben: der Host behält sie samt Entitäten und Bindungen.
additions enthält nur wirklich neue Fakten/Entitäten/Bindungen mit neuen eindeutigen IDs.
Die bestehende Angebots-, Personen- oder Gruppenzuordnung beibehalten; id und subjectIds angeben.
Keine frühere Angabe nur deshalb aufheben, weil sie nicht wiederholt wird. Keine singleActivity.
Ohne Suchänderung changes:[] ausgeben. Keine bereits beantwortete Rückfrage wiederholen.
protectedFactIds sind ausdrücklich beibehaltene Zeitangaben: nicht ändern oder neu datieren.
Relative Tage beziehen sich weiterhin auf NORMALIZATION_REFERENCE, niemals auf einen vorherigen Besuchstag.
`,
    input:JSON.stringify({previousMeaning:previous,turns,protectedFactIds:[...protectedFactIds]}),
    outputSchema:{
      ...prompt.outputSchema, properties:{
        changes:{type:'array',maxItems:editableIds.length ? 128 : 0,items:{type:'object',additionalProperties:false,
          properties:{id:{type:'string',...(editableIds.length ? {enum:editableIds} : {})},quote:{type:'string',minLength:1,maxLength:2000},
            fact:{anyOf:[{$ref:'#/$defs/fact'},{$ref:'#/$defs/extension'},{type:'null'}]}},required:['id','quote','fact']}},
        additions:properties.meaning,
        clarification:properties.clarification,
      },
      required:['changes'],
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

/** Normalize an atomic, cited patch into the existing checked merge protocol.
 * A change cannot lose its removal/citation when another field also changes.
 * Legacy recorded patches remain replayable through the same strict checks. */
function normalizeAtomicUpdate(raw: unknown): unknown {
  if (!raw || typeof raw !== 'object' || !('changes' in raw)) return raw;
  if (Object.keys(raw).some(key => !['changes','additions','clarification'].includes(key))
      || !Array.isArray(raw.changes) || raw.changes.length > 128) throw Error('nuknuk_dialogue_changes_invalid');
  const additions = 'additions' in raw ? raw.additions : {};
  if (!additions || typeof additions !== 'object' || Array.isArray(additions)) throw Error('nuknuk_dialogue_additions_invalid');
  const addedFacts = 'facts' in additions ? additions.facts : [];
  const addedExtensions = 'extensions' in additions ? additions.extensions : [];
  if (!Array.isArray(addedFacts) || !Array.isArray(addedExtensions)) throw Error('nuknuk_dialogue_additions_invalid');
  const ids = new Set<string>(), changes: unknown[] = [], extensions: unknown[] = [], evidence: {id:string;quote:string}[] = [];
  for (const row of raw.changes) {
    if (!row || typeof row !== 'object' || Object.keys(row).some(key => !['id','quote','fact'].includes(key))
        || typeof row.id !== 'string' || !row.id || ids.has(row.id) || typeof row.quote !== 'string'
        || !row.quote.trim() || !('fact' in row)) throw Error('nuknuk_dialogue_change_invalid');
    ids.add(row.id); evidence.push({id:row.id,quote:row.quote});
    if (row.fact === null) continue;
    if (!row.fact || typeof row.fact !== 'object' || Array.isArray(row.fact)
        || 'id' in row.fact && row.fact.id !== row.id) throw Error('nuknuk_dialogue_replacement_id_mismatch');
    const fact = {...row.fact,id:row.id};
    if ('description' in row.fact) extensions.push(fact); else changes.push(fact);
  }
  return {meaning:{...additions,facts:[...addedFacts,...changes],extensions:[...addedExtensions,...extensions]},
    removeFactIds:[...ids],removalEvidence:evidence,...('clarification' in raw ? {clarification:raw.clarification} : {})};
}

function referencesRemovedFact(value: unknown, removed: Set<string>): boolean {
  if (Array.isArray(value)) return value.some(item=>referencesRemovedFact(item,removed));
  if (typeof value === 'object' && value !== null) {
    return Object.values(value).some(item=>referencesRemovedFact(item,removed));
  }
  return typeof value === 'string' && removed.has(value);
}

function isBookingPermissionOnly(quote: string): boolean {
  return /^(?:du kannst|ihr könnt|es darf|wir (?:können|dürfen))\s+(?:gerne?\s+)?(?:auch\s+)?(?:etwas\s+)?(?:mit\s+(?:reservation|reservierung|buchung)(?:\s+(?:nehmen|vorschlagen))?|reservieren|buchen)[.!]?$/iu.test(quote.trim());
}

function isTimingFlexibilityOnly(quote: string): boolean {
  const text = quote.trim();
  return /^(?:wann (?:ich|wir) (?:hingehe[n]?|vorbeikomme[n]?|losgehe[n]?),? (?:kann ich|können wir) (?:später|nach dem Programm) (?:entscheiden|festlegen)|(?:die Uhrzeit|den Termin|das Datum) (?:kann ich|können wir) (?:später|nach dem Programm) (?:entscheiden|festlegen))[.!]?$/iu.test(text);
}

export function mergeNuknukDialogueUpdate(previous: LunaMeaningOutput, raw: unknown, turns: Turn[]): unknown {
  const update = updateSchema.parse(normalizeAtomicUpdate(raw));
  const protectedIds = retainedTimingIds(previous, turns);
  const protectedFacts = previous.facts.filter(f => protectedIds.has(f.id));
  if (update.removeFactIds.some(id => protectedIds.has(id)) || update.meaning.facts.some(f =>
      f && typeof f === 'object' && 'key' in f && protectedFacts.some(p => p.key === f.key
        && (!('value' in f) || contentHash(f.value) !== contentHash(p.value))))) {
    throw Error('nuknuk_dialogue_retained_timing_changed');
  }
  const removed = new Set(update.removeFactIds);
  const existing = [...previous.facts,...previous.extensions];
  if ([...removed].some(id=>!existing.some(fact=>fact.id===id))) throw Error('nuknuk_dialogue_unknown_removal');
  for (const fact of previous.facts) {
    if (!removed.has(fact.id)) continue;
    const booking = fact.key === "participation.booking" || fact.key === "participation.entry_mode";
    const citations = update.removalEvidence.filter(entry=>entry.id===fact.id && turns.some(turn=>turn.answer.includes(entry.quote)));
    if (citations.length && citations.every(entry =>
      (!booking && isBookingPermissionOnly(entry.quote))
      || (!fact.key.startsWith("time.") && isTimingFlexibilityOnly(entry.quote)))) {
      removed.delete(fact.id);
    }
  }
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
  const retainedFacts = previous.facts.filter(fact=>!removed.has(fact.id));
  const retainedById = new Map(retainedFacts.map(fact=>[fact.id,fact]));
  const removedFacts = new Map(previous.facts.filter(fact=>removed.has(fact.id)).map(fact=>[fact.id,fact]));
  const echoesCitedRemoval = (row: unknown) => {
    if (!row || typeof row!=='object' || !('id' in row) || typeof row.id!=='string') return false;
    const prior = removedFacts.get(row.id);
    return Boolean(prior && 'key' in row && row.key === prior.key && 'modality' in row
      && row.modality === prior.modality && 'value' in row && 'subjectIds' in row
      && contentHash(row.value) === contentHash(prior.value) && contentHash(row.subjectIds) === contentHash(prior.subjectIds));
  };
  const updateIds = [append.facts,append.entities,append.extensions,append.weatherConditions]
    .flatMap(rows=>(rows??[]).flatMap(row=>
      row && typeof row==='object' && 'id' in row && typeof row.id==='string' ? [row.id] : []));
  const occupied = new Set([...retained.map(row=>row.id), ...removed, ...updateIds]);
  const references = [append.logic,append.bindings,append.uncertainties];
  let nextId = 1;
  const newFacts = withoutEchoes(append.facts).filter(row=>!echoesCitedRemoval(row)).flatMap(row=>{
    if (!row || typeof row!=='object' || !('id' in row) || typeof row.id!=='string' || !('key' in row)) return [row];
    const id = row.id;
    const prior = retainedById.get(id);
    if (!prior || prior.key===row.key || updateIds.filter(value=>value===id).length!==1
      || referencesRemovedFact(references,new Set([id]))) return [row];
    // An unreferenced new fact can have its wire ID repaired without changing an earlier fact.
    const {id: _id, ...value} = row;
    if (retainedFacts.some(({id: _priorId, ...fact})=>contentHash(value)===contentHash(fact))) return [];
    while (occupied.has('dialogueFact'+nextId)) nextId++;
    const newId = 'dialogueFact'+nextId++;
    occupied.add(newId);
    return [{...row,id:newId}];
  });
  if (newFacts.some(row => row && typeof row === 'object' && 'id' in row
      && typeof row.id === 'string' && retainedById.has(row.id))) {
    throw Error('nuknuk_dialogue_replacement_without_removal');
  }
  const newExtensions = withoutEchoes(append.extensions??[]);
  const replacementIds = new Set([...newFacts,...newExtensions].flatMap(fact=>
    fact && typeof fact==='object' && 'id' in fact && typeof fact.id==='string' ? [fact.id] : []));
  const deleted = new Set([...removed].filter(id=>!replacementIds.has(id)));
  let previousLogic = previous.logic;
  if (referencesRemovedFact(previousLogic,deleted)) {
    if (previousLogic?.kind !== 'ALL' || !previousLogic.children.every(child=>child.kind==='FACT'))
      throw Error('nuknuk_dialogue_bound_removal');
    const children = previousLogic.children.filter(child=>child.kind==='FACT' && !deleted.has(child.factId));
    previousLogic = children.length > 1 ? {...previousLogic,children} : children[0] ?? null;
  }
  if (previous.bindings.some(binding=>
    binding.kind !== 'SAME_PLACE' && binding.factIds.some(id=>deleted.has(id)))) {
    throw Error('nuknuk_dialogue_bound_removal');
  }
  const retainedBindings = previous.bindings.flatMap(binding=>{
    if (binding.kind !== 'SAME_PLACE') return [binding];
    const factIds = binding.factIds.filter(id=>!deleted.has(id));
    return factIds.length >= 2 ? [{...binding,factIds}] : [];
  });
  const oldBindingHashes = new Set(previous.bindings.map(binding=>contentHash(binding)));
  const newBindings = (append.bindings??[]).filter(binding=>!oldBindingHashes.has(contentHash(binding)));
  const logic = previousLogic && append.logic
    ? {kind:'ALL',children:[previousLogic,append.logic]} : previousLogic ?? append.logic ?? null;
  return {meaning:{
    facts:[...retainedFacts,...newFacts],
    entities:[...previous.entities,...withoutEchoes(append.entities??[])],
    extensions:[...previous.extensions.filter(f=>!removed.has(f.id)),...newExtensions],
    weatherConditions:[...previous.weatherConditions,...withoutEchoes(append.weatherConditions??[])],
    bindings:[...retainedBindings,...newBindings],
    uncertainties:[...previous.uncertainties.filter(entry=>!entry.relatedIds.some(id=>deleted.has(id))),...(append.uncertainties??[])],
    logic,
  }, ...(update.clarification === undefined ? {} : {clarification:update.clarification})};
}
