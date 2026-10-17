#!/usr/bin/env node
import { readFileSync, writeFileSync, mkdirSync } from 'node:fs';
import { resolve, dirname } from 'node:path';
import { execFileSync } from 'node:child_process';
import { performance } from 'node:perf_hooks';
import { QUALITY_CASES, QUALITY_CATALOG_VERSION, QUALITY_REFERENCE, qualityScenario } from '../../packages/decision-vnext-core/test/request-understanding/decision-quality-catalog.mjs';
import { QUALITY_ACTOR, qualityRequest, prepareQualityMeaning, checkUnderstanding, traceQualityCase, captureMatchesCase } from './decision-quality.mjs';
import { createDecisionProductLunaProvider } from '../../packages/decision-vnext-core/dist/product-luna-provider.js';
import { LUNA_LIBRARIAN_CONFIGURATION } from '../../packages/decision-vnext-core/dist/product-luna-librarian.js';
import { contentHash } from '../../packages/decision-vnext-core/dist/canonical.js';

const args = process.argv.slice(2);
const value = key => args[args.indexOf(key) + 1];
const allowed = new Set(['--mode', '--output', '--captures', '--save-captures', '--catalog', '--targets', '--case']);
for (let i = 0; i < args.length; i += 2) if (!allowed.has(args[i]) || !args[i + 1] || args[i + 1].startsWith('--')) throw Error('quality_arguments_invalid');
const mode = args.includes('--mode') ? value('--mode') : 'golden';
if (!['golden', 'live', 'replay'].includes(mode)) throw Error('quality_mode_invalid');
if (!args.includes('--output')) throw Error('quality_output_required');
if (mode === 'replay' && !args.includes('--captures')) throw Error('quality_captures_required');
if (mode === 'live' && !process.env.OPENAI_API_KEY) throw Error('quality_server_key_required');
if (args.includes('--save-captures') && mode !== 'live') throw Error('quality_save_captures_live_only');
if (args.includes('--catalog') !== args.includes('--targets')) throw Error('quality_external_catalog_requires_explicit_targets');
const load = key => JSON.parse(readFileSync(resolve(value(key)), 'utf8'));
const captures = args.includes('--captures') ? load('--captures') : {};
const catalogs = args.includes('--catalog') ? load('--catalog') : null;
const targets = args.includes('--targets') ? load('--targets') : null;
const cases = args.includes('--case') ? QUALITY_CASES.filter(c => c.id === value('--case')) : QUALITY_CASES;
if (!cases.length) throw Error('quality_case_not_found');
const output = resolve(value('--output'));
mkdirSync(dirname(output), {recursive: true});
const report = {contractVersion: 'backyrd.decision-quality-report@1', catalogVersion: QUALITY_CATALOG_VERSION, catalogDefinitionHash: contentHash(QUALITY_CASES.map(c => ({...c, scenario: qualityScenario(c.group, c.query)}))),
  sourceSha: execFileSync('git', ['rev-parse', 'HEAD'], {encoding: 'utf8'}).trim(), worktreeDirty: !!execFileSync('git', ['status', '--porcelain'], {encoding: 'utf8'}).trim(),
  mode, environment: 'LOCAL_CANONICAL_REPLAY', modelConfiguration: LUNA_LIBRARIAN_CONFIGURATION, reference: QUALITY_REFERENCE,
  worldSource: catalogs ? 'SUPPLIED_SNAPSHOT_NOT_FRESHNESS_VERIFIED' : 'SYNTHETIC_FIXTURES', personalization: 'NEUTRAL_SYNTHETIC_ACTOR', modelCalls: 0,
  limitations: ['Not a production HTTP, Auth, on-device or live World freshness test.', 'Understanding checks are partial assertions, not a general accuracy score.', 'No personal profile is used.'], cases: []};
if (mode === 'replay') report.limitations.push('Capture origin and model revision are not independently verified by this replay.');
const provider = mode === 'live' ? createDecisionProductLunaProvider({apiKey: process.env.OPENAI_API_KEY, allowedUserIds: [QUALITY_ACTOR.userId], now: () => new Date(QUALITY_REFERENCE.now)}) : null;
const save = () => writeFileSync(output, JSON.stringify(report, null, 2) + '\n', {mode: 0o600});
const capturedMeanings = {};
save(); // Freeze expectations and metadata before the first model call.
for (const c of cases) {
  const start = performance.now(), scenario = qualityScenario(c.group, c.query);
  let stage = 'UNDERSTANDING';
  try {
    const gold = prepareQualityMeaning(c, scenario.raw);
    let meaning = gold;
    if (mode === 'live') { report.modelCalls++; meaning = await provider(qualityRequest(c, scenario.city), QUALITY_ACTOR, AbortSignal.timeout(30000)); }
    if (mode === 'live' && args.includes('--save-captures')) {
      capturedMeanings[c.id] = {query: c.query, reference: meaning.source.reference, output: meaning.raw};
      const path = resolve(value('--save-captures'));
      mkdirSync(dirname(path), {recursive: true});
      writeFileSync(path, JSON.stringify(capturedMeanings, null, 2) + '\n', {mode: 0o600});
    }
    if (mode === 'replay') {
      const capture = captures[c.id];
      if (!captureMatchesCase(c, capture)) throw Error('quality_capture_binding_invalid');
      meaning = prepareQualityMeaning(c, capture.output, capture.reference);
    }
    const modelMs = mode === 'live' ? Math.round(performance.now() - start) : null;
    const understandingFailures = mode === 'golden' ? [] : checkUnderstanding(gold, meaning);
    stage = 'CANONICAL_CHAIN';
    if (catalogs && (!Array.isArray(catalogs[scenario.city]) || !targets[c.id])) throw Error('quality_snapshot_or_targets_missing');
    const trace = traceQualityCase(c, meaning, catalogs ? {catalog: catalogs[scenario.city], expected: targets[c.id]} : {});
    const row = {id: c.id, query: c.query, understanding: mode === 'golden' ? 'NOT_TESTED' : understandingFailures.length ? 'FAIL' : 'PASS_PARTIAL_ORACLE', understandingFailures, chain: trace.failures.length ? 'FAIL' : 'PASS', modelMs, totalMs: Math.round(performance.now() - start), ...trace};
    report.cases.push(row);
    process.stdout.write(`${c.id}: understanding=${row.understanding} chain=${row.chain}\n`);
  } catch (error) {
    // Never persist a provider body, arbitrary exception text, credentials or a stack.
    report.cases.push({id: c.id, query: c.query, stage, outcome: 'ERROR', code: 'QUALITY_CASE_EXECUTION_FAILED', errorClass: error?.name === 'TimeoutError' ? 'TimeoutError' : 'Error', totalMs: Math.round(performance.now() - start)});
    process.stdout.write(`${c.id}: ERROR at ${stage}\n`);
  }
  save();
}
report.summary = {total: report.cases.length, errors: report.cases.filter(c => c.outcome === 'ERROR').length, understandingFailed: report.cases.filter(c => c.understanding === 'FAIL').length, chainFailed: report.cases.filter(c => c.chain === 'FAIL').length};
report.outcome = Object.entries(report.summary).some(([key, n]) => key !== 'total' && n > 0) ? 'FAIL' : 'PASS';
save();
process.stdout.write(JSON.stringify({outcome: report.outcome, ...report.summary, modelCalls: report.modelCalls, output}) + '\n');
if (report.outcome === 'FAIL') process.exitCode = 1;
