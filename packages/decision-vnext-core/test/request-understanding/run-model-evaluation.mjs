// Explicit opt-in live diagnostic. No Supabase connection or production calls.
import { readFileSync } from 'node:fs';
import { execFileSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { createHash } from 'node:crypto';
import { runModelEvaluation, validateRequirementOracle } from './model-evaluation.mjs';
import { validateCorpus } from './evaluate.mjs';
const root = fileURLToPath(new URL('../../../../', import.meta.url));
const sha = bytes => createHash('sha256').update(bytes).digest('hex');
const argv = process.argv.slice(2);
const options = new Map();
try {
  for (let i = 0; i < argv.length; i++) {
    const key = argv[i];
    if (!['--live', '--suite', '--max-calls', '--timeout-ms', '--max-estimated-usd', '--family', '--diagnostics', '--progress'].includes(key) || options.has(key)) throw new Error('invalid_arguments');
    options.set(key, ['--live', '--diagnostics', '--progress'].includes(key) ? true : argv[++i]);
  }
  const suite = options.get('--suite') ?? 'context';
  if (!['context', 'requirements'].includes(suite)) throw new Error('invalid_suite');
  let corpus = validateCorpus(JSON.parse(readFileSync(new URL(suite === 'context' ? './corpus.json' : './model-corpus.json', import.meta.url), 'utf8')));
  let oracle = suite === 'requirements' ? JSON.parse(readFileSync(new URL('./requirement-oracle.json', import.meta.url), 'utf8')) : null;
  if (oracle) validateRequirementOracle(corpus, oracle);
  if (options.has('--family')) {
    const family = corpus.families.find(f => f.id === options.get('--family'));
    if (!family) throw new Error('invalid_family');
    corpus = { ...corpus, families: [family] };
    if (oracle) oracle = { ...oracle, families: { [family.id]: oracle.families[family.id] } };
  }
  const observations = [];
  const onObservation = options.has('--diagnostics') ? (caseId, requirements) => observations.push({ caseId, requirements }) : null;
  const modules = ['product-ai-interpretation', 'product-v1-evaluator', 'product-request-understanding', 'product-request-context', 'product-query-semantics', 'product-intent-lexicon'];
  const binding = {
    sourceCommit: execFileSync('git', ['rev-parse', 'HEAD'], { cwd: root, encoding: 'utf8' }).trim(),
    dirtyWorktree: !!execFileSync('git', ['status', '--porcelain'], { cwd: root, encoding: 'utf8' }).trim(),
    sourceHash: sha(JSON.stringify(modules.map(name => [name, sha(readFileSync(new URL(`../../src/${name}.ts`, import.meta.url)))]))),
    buildHash: sha(JSON.stringify(modules.map(name => [name, sha(readFileSync(new URL(`../../dist/${name}.js`, import.meta.url)))]))),
    harnessHash: sha(JSON.stringify(['model-evaluation.mjs', 'evaluate.mjs', 'run-model-evaluation.mjs'].map(name => [name, sha(readFileSync(new URL(name, import.meta.url)))]))),
    nodeVersion: process.version,
  };
  if (!options.has('--live')) {
    console.log(JSON.stringify({ mode: 'PREFLIGHT_ONLY', providerCalled: false, suite, caseCount: corpus.families.reduce((n, f) => n + f.queries.length, 0), reviewStatus: corpus.reviewStatus, scope: corpus.scope, ...binding }, null, 2));
  } else {
    const report = await runModelEvaluation({ corpus, requirementOracle: oracle, onObservation, onProgress: options.has('--progress') ? progress => console.error(JSON.stringify(progress)) : null, apiKey: process.env.OPENAI_API_KEY,
      model: process.env.BACKYRD_DECISION_AI_INTENT_MODEL, maxCalls: Number(options.get('--max-calls') ?? 8), timeoutMs: Number(options.get('--timeout-ms') ?? 20000), maxEstimatedCostUsd: Number(options.get('--max-estimated-usd') ?? 1) });
    console.log(JSON.stringify({ ...binding, ...report, ...(options.has('--diagnostics') ? { syntheticFailureObservations: observations } : {}) }, null, 2));
    if (report.errors || report.notRun) process.exitCode = 2;
    else if (report.failed) process.exitCode = 1;
  }
} catch {
  console.error('Model evaluation configuration or preflight failed. Check the documented inputs; no secret or raw provider response is printed.');
  process.exitCode = 2;
}
