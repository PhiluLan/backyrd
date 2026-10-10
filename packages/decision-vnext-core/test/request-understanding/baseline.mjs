// Run from any directory after npm run decision-vnext:build.
// Diagnostic baseline only: does not call an AI provider, RPC or Production.
import { createHash } from 'node:crypto';
import { execFileSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { resolveDecisionProductContext, PRODUCT_DECISION_VERSIONS } from '../../dist/index.js';
import { evaluateUnderstandingCorpus } from './evaluate.mjs';

const root = fileURLToPath(new URL('../../../../', import.meta.url));
const corpusBytes = readFileSync(new URL('./corpus.json', import.meta.url));
const corpus = JSON.parse(corpusBytes.toString('utf8'));
const sha = value => createHash('sha256').update(value).digest('hex');
const resolverModules = ['product-v1-evaluator', 'product-request-context', 'product-request-understanding', 'product-intent-lexicon', 'product-query-semantics'];
const source = JSON.stringify(resolverModules.map(name => [name, sha(readFileSync(new URL(`../../src/${name}.ts`, import.meta.url)))]));
const compiled = JSON.stringify(resolverModules.map(name => [name, sha(readFileSync(new URL(`../../dist/${name}.js`, import.meta.url)))]));
const report = await evaluateUnderstandingCorpus(corpus, (text, reference) => resolveDecisionProductContext({
  contractVersion: PRODUCT_DECISION_VERSIONS.request,
  requestId: 'understanding-baseline', idempotencyKey: 'understanding-baseline', naturalLanguage: text,
  explicit: { targetCity: reference.profileCity }, alternativeRequested: false,
  previouslyPresentedCandidateIds: [], rejectedCandidateIds: [],
}, { authorizedCity: reference.profileCity, serverTime: reference.serverTime }));
console.log(JSON.stringify({
  contractVersion: 'backyrd.request-understanding-baseline@1.0',
  implementation: 'CURRENT_PRODUCT_CONTEXT_RESOLVER_ONLY',
  providerCalled: false, productionRead: false, productionWritten: false,
  launchVerdict: 'NOT_EVALUATED', modelComprehension: 'NOT_EVALUATED',
  sourceCommit: execFileSync('git', ['rev-parse', 'HEAD'], { cwd: root, encoding: 'utf8' }).trim(),
  dirtyWorktree: execFileSync('git', ['status', '--porcelain'], { cwd: root, encoding: 'utf8' }).trim().length > 0,
  corpusHash: sha(corpusBytes), resolverSourceHash: sha(source), resolverBuildHash: sha(compiled),
  nodeVersion: process.version, ...report,
}, null, 2));
