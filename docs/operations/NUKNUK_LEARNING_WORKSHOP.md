# NukNuk learning workshop

Task class: DATABASE_PR, with the classifier-selected Admin, Shared, privileged
server and Product gates. This is an internal curation and evidence surface;
it does not replace or activate the consumer Decision route or a model.

## Founder workflow

Open Admin → NukNuk-Lernwerkstatt (`/nuknuk/lernen`). Begin with the 30 synthetic
starter drafts or enter a situation in natural language. For a coverage gap, ask
for five new synthetic situations in a chosen topic/split; these create separate
unapproved families, not presumed independent gold. Human review must still
check novelty, facts and split membership. No held-out examples are sent to this
generator as prompts. The starters contain
24 TRAIN and six DEV families; they are neither approvals nor independent human
gold. Previously observed failure patterns are teaching/development material,
not a fresh acceptance benchmark. There are deliberately no pre-approved TEST
examples or invented quality scores.

Describe what must be understood and what must not be invented. Set the reference
date in Swiss local time, so relative expressions have a reproducible meaning.
The autumn clock overlap selects the first occurrence; nonexistent spring times
are rejected. Use only invented or adequately redacted data. The Feedback action
passes a feedback identifier, never a raw wish, comment, account or device data.
The Admin must formulate the redacted situation themselves.

Prepare an expected interpretation with the independent existing Luna provider.
The consumer NukNuk model does not generate its own approved teaching labels.
Review cards render the executable target itself, including roles, modalities,
membership, bindings and uncertainties. There is no separate AI explanation that
could conceal a bad target. Notes can correct the editorial intention; save and
prepare again before approving. Technical rejection is an honest blocked
preparation, not a successful save of a target.

Use Prüfpakete to prepare at most ten drafts, then review up to ten cards. The
preparation stops at the first failed request; existing drafts remain available.
It can be cancelled. A cancelled browser request is not proof that the server
did not commit, so reload before retrying. Approve only after checking the four
meaning/roles/no-invention/privacy attestations. A short default audit note is
used for approval; Unklar/Verwerfen require the author's explanation. Comments
do not change content approval; edits and replacement translations do. All
mutations use an optimistic row revision, including comments and reviews.

Variants inherit their parent's immutable family and split, but no target or
approval. Exact normalized duplicate wishes cannot appear in another split.
Semantic similarity still requires editorial review: the database cannot prove
two different formulations are independent situations. Counts distinguish base
families, formulations, origin and approval; they are not understanding accuracy.

## Immutable packages and model evidence

Trainingsläufe freezes currently approved TRAIN and DEV versions together. Both
must be present. TEST is excluded. The exact exported bytes have a SHA-256 shown
in Admin. A package is prepared/exported, not "training" merely because a button
was clicked. Export refuses a package whose content approvals were withdrawn.
Already downloaded files cannot be recalled; operators must freshly export/check
the current approval before a new training run. Historical snapshots/events stay
immutable for audit and reproducibility.

TEST is separately bound to a frozen candidate adapter hash. Opening a TEST
consumes its families, preventing their reuse as another fresh acceptance set.
Do not optimize/select models on these results; create genuinely independent
families for the next acceptance check. TEST authoring is not itself a blind
human evaluation, and its visibility must be accounted for when making claims.

The reviewer never has to write JSON or commands. The CTO/operator uses the
following bridge after downloading a package:

```sh
node scripts/decision-diagnostics/nuknuk-learning-workshop.mjs prepare \
  EXPORT.json DATA_DIRECTORY TRUSTED_MANIFEST_SHA_FROM_ADMIN
node scripts/decision-diagnostics/nuknuk-learning-workshop.mjs verify DATA_DIRECTORY
```

The trusted hash is copied from the authenticated Admin, not computed from an
arbitrary input file. The checksum provides integrity, not an independent
signature or human-semantic proof. The bridge revalidates every target with
`validateNuknukCompactSearch`, rebuilds each prompt with
`buildNuknukCompactSearchRequest`, binds runtime source hashes, preserves family
splits and exports only `train.jsonl`/`valid.jsonl`. TEST packages contain no
training JSONL. Rehashed altered targets still fail comparison with the reviewed
source envelope. No public data endpoint, provider credential or cloud allocator
is present in the bridge.

The existing `nuknuk-train.py` accepts this new, explicit dataset version; the
historical export contract is unchanged. It performs actual tokenizer/completion
mask checks before loading weights, refuses truncation and trains no TEST rows.
Locally pinned current Qwen models outside historical cache revision directories
require their exact config hash. For example, after choosing an approved model,
recipe and maintenance window:

```sh
python scripts/decision-diagnostics/nuknuk-train.py \
  --model LOCAL_QWEN_DIRECTORY --model-config-sha256 TRUSTED_CONFIG_HASH \
  --data DATA_DIRECTORY --manifest-sha256 PREPARED_DATASET_HASH \
  --output NEW_ADAPTER_DIRECTORY
```

Default is preflight only. `--execute` explicitly starts the existing bounded
local pilot; `--one-epoch` visits the training rows once. The pilot's fixed recipe
is a technical learning probe, not a claim of an optimized training recipe.
First measure learning on TRAIN, then transfer to DEV with fresh formulations.
Use controlled pilot comparisons to choose the recipe; no full training or paid
Pod is automatically authorized by a curation approval. The unchanged resource
guard prevents overlapping model processes and unsafe memory/disk use.

An operator starts the isolated model through that guard on loopback 8089, then:

```sh
node scripts/decision-diagnostics/nuknuk-learning-workshop.mjs capture \
  DATA_DIRECTORY NEW_CAPTURE_DIRECTORY EXPECTED_ADAPTER_SHA 8089 DEV
```

Use TRAIN explicitly for the memorization diagnostic. Both arms of a DEV
comparison must use the identical prepared package, model and prompts. Only a
candidate bound to a TEST package may capture its TEST cases. There is one
attempt per case, 60-second request limits, a 200-case bound per capture and
append-only files. An interrupted capture remains incomplete; it cannot be
compared as a complete roster. The tool refuses port 8088, wrong adapter hashes,
changed model identities and incomplete responses. It does not stop or replace
the live service: use the existing bounded operator maintenance/restoration
procedure when the single-model memory guard requires a pause. Confirm the
original model and gateway before ending a maintenance window.

```sh
node scripts/decision-diagnostics/nuknuk-learning-workshop.mjs compare \
  DATA_DIRECTORY PARENT_CAPTURE CANDIDATE_CAPTURE REPORT.json
node scripts/decision-diagnostics/nuknuk-learning-workshop.mjs training-report \
  DATA_DIRECTORY COMPLETED_ADAPTER_DIRECTORY TRAINING_REPORT.json
```

Import a matching report in Trainingsläufe. Failed/timed-out training receipts
are supported without inventing a completed adapter or successful training. The report binds the package/model,
contains timings, technical failures and actual interpretation cards, and stays
operator-reported evidence. Exact graph matches are conservative development
signals, not human approval; equivalent graphs need review. These are isolated
understanding tests, not live-inventory, ranking or iPhone end-to-end acceptance.
No imported report activates a model or claims a Beta score. Keep source/target
review, technical validity, understanding quality and actual recommendation
quality as separate measurements. Model publication remains a separate release.

## Security and installation

Migration `20261124163610_nuknuk_learning_workshop_v1.sql` adds only the private
workshop schema and two public RPCs. Tables have RLS and no direct grants to
anonymous, authenticated or service roles. Interactive RPCs require the verified
Admin session and use transactional operations; no client chooses target JSON.
Machine proposals use a service-only RPC with a server-verified actor, rechecked
against server-owned Admin membership. All definer functions use empty search
paths and explicit ACLs. Consumer auth, ranking, World facts and moderation are
unchanged. SQL allow/deny tests are in `supabase/tests/nuknuk_learning_workshop_v1.sql`.

Deploy the migration through the exact-Main, manual database release workflow,
then the `nuknuk-learning` Edge Function (JWT verification enabled), then Admin.
Preserve unrelated deferred migrations. Required existing secrets are
`SUPABASE_URL`, `SUPABASE_ANON_KEY`, `SUPABASE_SERVICE_ROLE_KEY` and `OPENAI_API_KEY`.
Set `BACKYRD_ADMIN_ORIGINS` to the actual comma-separated Admin origins. No
wildcard origin or browser provider/service key is permitted. The function checks
the verified user and current Admin status before any model access. Quotas reserve
at most 30 preparations per Admin/hour and 200 globally/day, atomically. Each
operation has a 45-second deadline; provider calls retain the bounded canonical
provider's retries/token cap. Variants use one response capped at 2,000 tokens.
These are model-usage limits, not a quoted monetary budget. Pod allocation,
Auto-Pay, training and deployment are not part of an authoring request.

If the migration/function is not installed, Admin shows an unavailable state,
never a fake locally saved case. Deploying Admin alone is not ready for use.
Rollback disables/removes the new navigation and Admin function; retain the
private authored data and audit instead of destructively dropping them.

## Verification ownership

The existing Admin gate owns the reviewer contract tests, real build/type check,
and canonical export/trainer bridge tests. No parallel gate was added. Database
clean boot/ACL remains the sole authoritative Supabase migration gate. The local
PostgreSQL 16 focused bootstrap is only a supplemental reproducer, not a substitute
for canonical Supabase 17 clean boot. Resource-guard regression tests need access
to their own process groups. Browser acceptance uses synthetic, intercepted
services and must never be described as a production-auth or live-model test.

## Prepared publication scope

The source-aware release planner binds this workshop's exact migration and
`nuknuk-learning` function source set. It reuses the existing isolated migration
workspace and archive restore verification. Its scope keeps `executionAuthorized`
false; only a later manually confirmed exact-Main workflow may execute it. The
four deferred Booking migrations, Auth configuration, consumer Decision bundles
and research worker remain outside the publication scope. The previous release
receipts are retained. The referenced backup must still pass the workflow's
24-hour freshness check at publication; refresh the backup and its bound run ID
before certification when necessary. Never substitute a fabricated backup or
restore claim. After publication, record the migration's actual applied receipt
as `supabase.nuknukLearningRelease` before reusing the planner for later work.

Local acceptance covers the Admin production build and synthetic browser journeys;
canonical CI supplied the passing Supabase 17 execution snapshot used by
`delivery/database-releases/nuknuk-learning-workshop-v1.json`. Generating that
fingerprint evidence does not constitute a production migration or a trained model.
