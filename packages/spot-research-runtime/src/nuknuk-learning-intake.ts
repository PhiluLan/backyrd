/** Read-only learning intake. Integrity is not factual approval or training authorization. */
import { createHash } from 'node:crypto';
import { sha256 } from '../../world-knowledge-core/dist/canonical.js';

export const NUKNUK_LEARNING_INTAKE_VERSION = 'backyrd.nuknuk-learning-intake@1.0';
export type LearningSplit = 'TRAIN' | 'VALIDATION' | 'TEST';
export interface LearningSource {
    id: string; url: string; retrievedAt: string; text: string; hash: string;
}
export interface LearningEvidence {
    sourceId: string; quote: string; offset: number;
}
export interface LearningClaim {
    id: string; expectedStatement: string; scope: 'SPOT' | 'OFFER' | 'AREA';
    subject: string; conditions: string; evidence: LearningEvidence[];
}
export interface LearningContent {
    taskVersion: string; methodVersion: string; catalogHash: string;
    venueGroupId: string; split: LearningSplit;
    sources: LearningSource[];
    prompt: string;
    /** Corrected answer only. Raw model responses are kept outside this learning content. */
    correctedTarget: string;
    claims: LearningClaim[];
    /** Expected abstentions need a checked source scope, never a fabricated negative claim. */
    abstentions: { question: string; checkedSourceIds: string[]; reason: string }[];
}
export interface LearningCandidate {
    id: string; content: LearningContent; contentHash: string;
    reviews: { kind: 'FACTUAL' | 'PRIVACY_AND_SOURCE_USE'; contentHash: string;
        reviewerId: string; reviewedAt: string; verdict: 'ACCEPT' | 'REJECT'; note: string }[];
}
export interface LearningIntake {
    version: typeof NUKNUK_LEARNING_INTAKE_VERSION;
    splitPlan: { venueGroupId: string; split: LearningSplit }[];
    candidates: LearningCandidate[];
}
const object = (v: unknown): v is Record<string, unknown> => v !== null && typeof v === 'object' && !Array.isArray(v);
function exact(v: unknown, keys: string[]): asserts v is Record<string, unknown> {
    if (!object(v) || Object.keys(v).length !== keys.length || keys.some(k => !(k in v))) throw new Error('LEARNING_SHAPE_INVALID');
}
function text(v: unknown, max = 2000): asserts v is string {
    if (typeof v !== 'string' || !v.trim() || v.length > max) throw new Error('LEARNING_TEXT_INVALID');
}
function id(v: unknown): asserts v is string { text(v,160); if (!/^[a-zA-Z0-9_.:@-]+$/.test(v)) throw new Error('LEARNING_ID_INVALID'); }
function digest(v: unknown): asserts v is string { if (typeof v !== 'string' || !/^[a-f0-9]{64}$/.test(v)) throw new Error('LEARNING_HASH_INVALID'); }
function date(v: unknown): asserts v is string {
    text(v,40); if (!/^\d{4}-\d{2}-\d{2}T.*Z$/.test(v) || !Number.isFinite(Date.parse(v))) throw new Error('LEARNING_DATE_INVALID');
}
function array(v: unknown, max: number, min = 0): asserts v is unknown[] { if (!Array.isArray(v) || v.length < min || v.length > max) throw new Error('LEARNING_ARRAY_INVALID'); }
function split(v: unknown): asserts v is LearningSplit { if (!['TRAIN','VALIDATION','TEST'].includes(String(v))) throw new Error('LEARNING_SPLIT_INVALID'); }
export const learningContentHash = (content: LearningContent) => sha256(content);
export const learningSplitPlanHash = (plan: LearningIntake['splitPlan']) => sha256([...plan].sort((a,b)=>a.venueGroupId.localeCompare(b.venueGroupId)));

/** The expected split-plan hash must come from the separately frozen evaluation plan.
 * Review metadata in a file cannot prove reviewer identity. This API NEVER authorizes training. */
export function auditLearningIntake(raw: unknown, expectedSplitPlanHash: string) {
    digest(expectedSplitPlanHash);
    exact(raw,['version','splitPlan','candidates']);
    if (raw.version !== NUKNUK_LEARNING_INTAKE_VERSION) throw new Error('LEARNING_VERSION_INVALID');
    array(raw.splitPlan,10000,1); array(raw.candidates,1000);
    const plan = new Map<string,LearningSplit>();
    for (const entry of raw.splitPlan) {
        exact(entry,['venueGroupId','split']); id(entry.venueGroupId); split(entry.split);
        if (plan.has(entry.venueGroupId)) throw new Error('LEARNING_DUPLICATE_GROUP');
        plan.set(entry.venueGroupId,entry.split);
    }
    if (learningSplitPlanHash(raw.splitPlan as LearningIntake['splitPlan']) !== expectedSplitPlanHash) throw new Error('LEARNING_SPLIT_PLAN_CHANGED');
    const ids = new Set<string>(), contents = new Set<string>();
    const sourceSplits = new Map<string,LearningSplit>();
    const promptSplits = new Map<string,LearningSplit>();
    const cases: {id:string; split:LearningSplit; blockers:string[]}[] = [];
    for (const candidate of raw.candidates) {
        exact(candidate,['id','content','contentHash','reviews']); id(candidate.id); digest(candidate.contentHash);
        if (ids.has(candidate.id)) throw new Error('LEARNING_DUPLICATE_ID'); ids.add(candidate.id);
        exact(candidate.content,['taskVersion','methodVersion','catalogHash','venueGroupId','split','sources','prompt','correctedTarget','claims','abstentions']);
        const c = candidate.content;
        id(c.taskVersion); id(c.methodVersion); digest(c.catalogHash); id(c.venueGroupId); split(c.split);
        if (plan.get(c.venueGroupId) !== c.split) throw new Error('LEARNING_GROUP_SPLIT_MISMATCH');
        text(c.prompt,100000); text(c.correctedTarget,100000);
        if (sha256(c) !== candidate.contentHash) throw new Error('LEARNING_CONTENT_CHANGED');
        if (contents.has(candidate.contentHash)) throw new Error('LEARNING_DUPLICATE_CONTENT'); contents.add(candidate.contentHash);
        const promptHash = sha256(c.prompt);
        if (promptSplits.has(promptHash) && promptSplits.get(promptHash) !== c.split) throw new Error('LEARNING_PROMPT_LEAKAGE');
        promptSplits.set(promptHash,c.split);
        array(c.sources,30,1); array(c.claims,100); array(c.abstentions,100);
        if (!c.claims.length && !c.abstentions.length) throw new Error('LEARNING_EMPTY_REFERENCE');
        const sources = new Map<string,{text:string;retrievedAt:string}>();
        for (const source of c.sources) {
            exact(source,['id','url','retrievedAt','text','hash']); id(source.id); text(source.url,2000); date(source.retrievedAt); text(source.text,1000000); digest(source.hash);
            const url = new URL(source.url);
            if (url.protocol !== 'https:' || url.username || url.password || url.search || url.hash) throw new Error('LEARNING_SOURCE_URL_INVALID');
            if (sources.has(source.id)) throw new Error('LEARNING_DUPLICATE_SOURCE');
            if (createHash('sha256').update(source.text).digest('hex') !== source.hash) throw new Error('LEARNING_SOURCE_CHANGED');
            if (sourceSplits.has(source.hash) && sourceSplits.get(source.hash) !== c.split) throw new Error('LEARNING_SOURCE_LEAKAGE');
            sourceSplits.set(source.hash,c.split); sources.set(source.id,{text:source.text,retrievedAt:source.retrievedAt});
        }
        const claimIds = new Set<string>();
        for (const claim of c.claims) {
            exact(claim,['id','expectedStatement','scope','subject','conditions','evidence']); id(claim.id); text(claim.expectedStatement); text(claim.subject,240);
            if (!['SPOT','OFFER','AREA'].includes(String(claim.scope)) || typeof claim.conditions !== 'string' || claim.conditions.length > 2000) throw new Error('LEARNING_CLAIM_INVALID');
            if (claimIds.has(claim.id)) throw new Error('LEARNING_DUPLICATE_CLAIM'); claimIds.add(claim.id);
            array(claim.evidence,20,1);
            for (const evidence of claim.evidence) {
                exact(evidence,['sourceId','quote','offset']); id(evidence.sourceId); text(evidence.quote,20000);
                const source = sources.get(evidence.sourceId);
                if (!source || !Number.isInteger(evidence.offset) || (evidence.offset as number) < 0 || source.text.slice(evidence.offset as number,(evidence.offset as number)+evidence.quote.length) !== evidence.quote) throw new Error('LEARNING_EVIDENCE_INVALID');
            }
        }
        for (const abstention of c.abstentions) {
            exact(abstention,['question','checkedSourceIds','reason']); text(abstention.question); text(abstention.reason); array(abstention.checkedSourceIds,30,1);
            if (new Set(abstention.checkedSourceIds).size !== abstention.checkedSourceIds.length || abstention.checkedSourceIds.some(k=>typeof k!=='string'||!sources.has(k))) throw new Error('LEARNING_ABSTENTION_SCOPE_INVALID');
        }
        array(candidate.reviews,2);
        const kinds = new Set<string>(); const blockers:string[]=[];
        for (const review of candidate.reviews) {
            exact(review,['kind','contentHash','reviewerId','reviewedAt','verdict','note']); id(review.reviewerId); date(review.reviewedAt); text(review.note); digest(review.contentHash);
            if (!['FACTUAL','PRIVACY_AND_SOURCE_USE'].includes(String(review.kind)) || kinds.has(String(review.kind)) || !['ACCEPT','REJECT'].includes(String(review.verdict))) throw new Error('LEARNING_REVIEW_INVALID');
            if (review.contentHash !== candidate.contentHash) throw new Error('LEARNING_STALE_REVIEW');
            if ([...sources.values()].some(s=>Date.parse(s.retrievedAt)>Date.parse(review.reviewedAt as string))) throw new Error('LEARNING_REVIEW_PRECEDES_SOURCE');
            kinds.add(String(review.kind)); if (review.verdict==='REJECT') blockers.push('REVIEW_REJECTED');
        }
        for (const kind of ['FACTUAL','PRIVACY_AND_SOURCE_USE']) if (!kinds.has(kind)) blockers.push(kind+'_REVIEW_MISSING');
        if (c.split!=='TRAIN') blockers.push('NON_TRAINING_SPLIT');
        // Deliberately no exporter: task-output validation and authenticated human
        // approval are not yet connected. Metadata must not impersonate either.
        blockers.push('TASK_TARGET_VALIDATION_NOT_CONNECTED','AUTHENTICATED_REVIEW_NOT_CONNECTED');
        cases.push({id:candidate.id,split:c.split,blockers});
    }
    return {version:NUKNUK_LEARNING_INTAKE_VERSION,structuralIntegrityValid:true,readyForTraining:false,trainingExportEnabled:false,
        splitPlanHash:expectedSplitPlanHash,counts:{candidates:cases.length,train:cases.filter(c=>c.split==='TRAIN').length,validation:cases.filter(c=>c.split==='VALIDATION').length,test:cases.filter(c=>c.split==='TEST').length},cases,
        limitations:['LITERAL_EVIDENCE_IS_NOT_SEMANTIC_TRUTH','FILE_REVIEW_METADATA_IS_NOT_AUTHENTICATION','VENUE_GROUP_IDENTITIES_REQUIRE_REVIEW','NO_GENERAL_PRIVACY_OR_SOURCE_RIGHTS_GUARANTEE']};
}
