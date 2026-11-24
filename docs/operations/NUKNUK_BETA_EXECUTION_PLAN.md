# NukNuk Beta: bounded execution plan, 24 November 2026

Status: **Third controlled attempt completed; all three owned Pods deleted. Candidate not Beta-qualified.**
The reviewed Beta exporter and single-Pod controller are implemented. A complete third-attempt
candidate is secured; no model activation occurred. Before another allocation, require a new
explicit attempt authorization and fresh account/quote admission including prior
costs. The original frozen bundle and receipts remain historical evidence.

## Exact inputs and recipe

Use immutable curriculum review 6, manifest SHA-256
`58caa68751ff2a779eaaebee519e14db3bf022cdd912302b629856fd65c464ee`,
with its 800 TRAIN / 200 DEV / 200 TEST rows and separate 64-row transfer bank.
Astra accepted controlled preparation. The founder reviewed ten German meaning
summaries on November 24, generally accepting them with a wording reservation.
This completes the agreed risk-based human sample; it is not full multilingual
human gold. A blanket human approval of every row is not required by this plan.
Targeted review expands if candidate evaluation finds language-specific errors.

Continue the HF parent `9d9eef4a46c8441082002635dc74917a3cf5f29be9c0cbed372d44f7e320a311`
corresponding to the retained MLX parent
`ade9ce9b2b73f56188af73e42870ba953a5f04f08dfc0ad78032a24811ad3740`.
Base: `Qwen/Qwen3.6-35B-A3B`, revision
`995ad96eacd98c81ed38be0c5b274b04031597b0`.
One epoch, 800 rows, microbatch 1, accumulation 4, 200 optimizer updates,
rank 16 / alpha 32, learning rate 6e-6, seed 42. Recovery checkpoints every
50 updates; no input-label loss, truncation or automatic retry. Validate exact
parent conversion/parity and trainer semantics before allocation.

`nuknuk-beta-training-plan.mjs` is the machine-readable source. Its pure quote
validator and throughput check cannot start any resource.

## Hardware and inclusive cost envelope

One NVIDIA H100 PCIe, 80 GB VRAM, 200 GB temporary container disk; no persistent
volume or network volume, no second Pod, exactly one allocation attempt. Do not
reissue a creation request if its response is lost: locate the one run identity
or fail closed. Do not restart old Pods or allocate a replacement automatically.

Runpod's public reference on November 24 lists H100 PCIe at USD 2.89/hour.
[Official prices](https://www.runpod.io/pricing). This is a reference, not a
reserved rate or evidence of available capacity. Container storage is listed
at USD 0.10/GB/month; 200 GB is approximately USD 0.02778/hour using 720 hours
per month. Compute/storage are billed by the second; ingress/egress has no
listed fee. [Official billing rules](https://docs.runpod.io/pods/pricing).

Before creating a resource, require a quote captured within five minutes,
compute at most USD 2.89/hour, all-in accrual at most USD 3.50/hour after storage,
fees and verified applicable tax. Unknown fees/tax are rejection conditions,
not zero. Require sufficient prepaid credit, auto-recharge and postpaid off,
no other running Pods and no other billable resources. Check actual account
state; the old cleanup report is not current billing evidence.

- Total ceiling: USD 10, including previous attempts and fixed charges.
- Maximum billable resource lifetime: 9,000 seconds (2.5 hours), from creation,
  including provisioning, image/model download and shutdown.
- At the maximum all-in rate: USD 8.75 operating envelope plus USD 1 closing
  reserve = USD 9.75, leaving USD 0.25 unused margin when prior/fixed cost is zero.
- A reference example with 10% tax gives USD 9.03 including reserve. This is a
  calculation example, **not** a tax-rate claim or live quote.
- Any prior/fixed charge must also fit; otherwise reject or reduce scope before
  starting. Never raise the ceiling to finish an epoch.

This is a conservative admission rule, not a guarantee that provider/API/network
failures cannot cause charges. Reserve is for closure delays. Stopping a process
is not stopping billing, and stopping a Pod is not deleting persistent storage.
Require deletion confirmation and a final inventory; no paid residue may be
silently left running. Existing stop-only tooling is not a deletion receipt.

## Timeline and early abort

| Phase | Maximum minutes |
|---|---:|
| Provision, download, load and parity | 25 |
| First ten actual optimizer updates, measured probe | 5 |
| Remaining 190 updates | 80 |
| Bounded parent/candidate DEV smoke | 15 |
| Export and independently verify checkpoints/results | 15 |
| Delete Pod and confirm inventory | 5 |
| Unallocated slack | 5 |
| **Total billing lifetime** | **150** |

The probe is part of the 200 updates, not an extra epoch or separate allocation.
Use the maximum observed time from updates 2–10, token-length scaling and a
1.5 safety factor. Update 1 includes one-time initialization: charge its actual
time once in elapsed time and the absolute billing deadline, rather than
projecting initialization for every remaining update. Retain and validate all
ten measurements. A recurring slowdown or insufficient elapsed-time budget
still aborts. `remainingTrainingFits` requires ten measured updates and returns ABORT
if the conservative remainder exceeds its 80-minute/remaining-time allowance.
An incomplete checkpoint is evidence of an aborted attempt, never a trained
candidate or success. Do not extend the deadline or retry allocation.

Historical local evidence: the previous 113-row/two-epoch run reported 57 updates
in 425 seconds. That is a different corpus/configuration; it does not establish
current throughput or memory on this selected GPU. The measured probe decides.

## Shutdown controls and data retention

Before training, arm the existing watchdog with explicit `beta-10`, inclusive
`--hourly-usd 3.5`, `--max-compute-hourly-usd 2.89`, `--ceiling-usd 10`,
`--reserve-usd 1`, pinned Pod ID, actual billing start and absolute deadline.
It rejects missing/mismatched bounds, unexpected running Pods, status failures
and increases of the observed compute rate; its Beta deadline cannot exceed
billing-start + 9,000 seconds. It only stops the owned allowlisted Pod.

An independent job timeout stops GPU work by 140 minutes. Begin deletion by
145 minutes and confirm by 150. Export to the Mac incrementally and verify SHA
and adapter/tensor completeness before planned removal. If budget protection
requires removal before artifacts are complete, the budget wins and the attempt
is incomplete. Never put the account-wide provider key in the training container.
The allocation/deletion controller must be validated and armed before allocating;
the stop watchdog alone is insufficient. The controller must confirm deletion after every attempted run.

## Evaluation and activation

GPU time covers only bounded DEV smoke and recovery/export. It does **not**
claim to include full multilingual semantic evaluation. Freeze the selected
candidate on DEV and delete the GPU resource. Then run matched parent/candidate
native MLX evaluation for the grouped tests, transfer bank, 152 historical cases,
actual-output-fed conversations, routing and boundary/consent checks. GPU TEACHER
loss or fixture self-scores cannot substitute for this evaluation.

Native Mac evaluation needs an isolated serving session or a separately agreed
maintenance window; do not silently pause the live model or load two models past
the memory guard. Its duration is not yet measured for this full suite. Do not
promise Beta completion within the GPU's 150-minute billing window.

Use the reviewed quality thresholds (190/200, per-locale/family rates, zero
material critical failures, no regressions), exact output-bound manual review
for REVIEW_REQUIRED, and real phone/downstream checks before activation. No OTA,
merge, rollout or model replacement is authorized by this planning artifact.

## SPA correction and source binding

The old canonical-taxonomy Spa test is now fixed locally. A verified authorized
Spa venue can prove positive venue identity. It cannot prove an area-scoped
facility or absence of a Spa; verified embedded facility evidence still works.
The full Decision core suite passes 789/789, including the new regression.

Review 6 stays immutable. Its training rows/prompts are unchanged; the current
matcher and its additional test have changed since that export. Before trainer
admission, bind the corrected runtime commit/source hashes separately and retain
the reviewed data/prompt hashes. Do not claim all old source hashes still match.
The plan's pending trainer admission and account quote are explicit remaining
engineering inputs, not a request to review 800 cases again.

## Explicit Beta execution admission

The Beta exporter requires a separate, source-bound receipt containing the
review-6 manifest, actual founder training instruction, Astra preparation review
and agreed risk-based founder sample. This does not turn preparation review into
model-quality approval. The bundle omits TEST and TRANSFER payloads.

`nuknuk-beta-run.py` owns exactly one allocation attempt and refuses an existing
operation. It revalidates a five-minute quote, prepaid balance and idle account;
an independent local guard is armed before creation. An own-Pod native guard and
the canonical financial watcher must be ready before model work. The provider
credential remains local. A100 80 GB is an admitted lower-price equivalent when
H100 capacity is absent; the same deadline and spending ceiling apply.

Training uses the existing Product trainer with an explicit Beta profile, native
prefix/mask parity, one epoch and 200 optimizer updates. The Axolotl callback
records actual timings and aborts a slow ten-update probe. An incomplete epoch
cannot produce a complete candidate receipt. Parent/candidate DEV smoke is not
full candidate acceptance. Results must be checksummed locally before deletion;
the controller deletes only its own Pod and confirms absence even on failure.
No live service is paused or replaced by this workflow.

## First controlled attempt and probe correction

On November 24 the founder explicitly authorized Runpod transfer and one run.
A100 80 GB at USD 2.19/hour was allocated with 200 GB temporary disk and no
persistent volumes. All 1,000 native tokenization/mask checks passed. The parent
completed the 15-request DEV smoke (all French; 3 semantic passes). This small
selection is not multilingual or full Beta acceptance.

The first optimizer update took 127.604 seconds; updates 2–10 took 9.746–11.853
seconds. Probe version 1 incorrectly projected the initialization outlier across
190 remaining updates and aborted at update 10. The incomplete checkpoint and
36 checksummed result files were secured locally; the owned Pod was deleted and
account inventory showed zero running spend and no network volumes. The initial
balance difference was USD 0.8464; billing may settle later. No retry or activation
was performed. Probe version 2 separates the one-time update from steady work
without resetting elapsed time, provider deadline, cost guards or full-epoch
requirements. Tests replay this exact observation and still reject recurring
slowdown and exhausted time budgets. Version 2 has not run on a GPU.

A proposed second attempt may use a shorter 7,200-second billing lifetime.
Quote admission includes prior consumption and reserve; the controller binds
the provider/local/financial deadline to that shorter value and caps remote
work at deadline minus 600 seconds. The maximum remains 9,000 seconds. This is
preparation only: no second allocation is authorized by the first run receipt.

## Second attempt: status transport interruption

A second explicitly authorized, two-hour attempt used the corrected probe bundle
`16b51acb532e54b7dae8b67cfa2006fc501062e8a5108095b7df3b5f02e5a5c6`.
All native checks and the 15 reference generations completed; the same parent
scored 3/15. One SSH status read timed out after 20 seconds during initial trainer
validation; the controller secured 28 files, deleted the Pod and verified zero
running spend. No optimizer update was confirmed in the last secured receipt.
The transport timeout is proven; its underlying network/host cause is unknown.
Aggregate initial account debit for both attempts was USD 1.5170, subject to
settlement. No third attempt or activation was performed.

Status polling now permits at most three attempts for the same idempotent read
on the same owned Pod. A transport timeout/SSH exit 255 can retry only while the
independent financial watcher is alive, provider status is explicitly running
and the assigned rate remains within the cap. Absolute deadline and heartbeat
protection stay active. Remote command errors and invalid results fail without
retry; allocation, uploads and training launch are never retried by this change.
Exhaustion retains normal artifact recovery and deletion. This correction is
covered by local fault-injection tests; it has not run on a paid GPU.

## Per-attempt aggregate ceiling

A quote may lower `maximumAggregateUsd` below the original USD 10 envelope. The
validator binds that explicit ceiling into the independent financial watcher,
including already spent attempts and closing reserve. An account top-up must
never raise this authorized ceiling. The third authorized attempt retains the
USD 5.98 aggregate envelope and 5,400-second billing limit despite extra credit.

## Third attempt: complete training, insufficient DEV quality

The founder explicitly authorized a third attempt and reported manually funding
the account. Funding did not raise the authorized ceiling: the financial watcher
was pinned to USD 5.98 aggregate, including USD 1.60 prior-attempt allowance and
USD 1 closing reserve. Resource lifetime was capped at 5,400 seconds.

The source-bound bundle and A100 80 GB run completed in approximately 62.5 minutes.
All 1,000 native prefix/mask checks passed; 800 TRAIN rows, one complete epoch and
200 optimizer updates are proven by the trainer state and completion receipt.
Probe version 2 admitted the measured remainder while charging initialization
once. The final adapter has all 80 expected finite tensors and is checksummed
locally. There were no observed status retries in this run. The owned Pod was
deleted; account inventory confirms zero active spend and no network volumes.
Seventy-two exported result files passed local integrity verification.

The same 15 French DEV requests scored 3/15 for the retained parent and 5/15 for
the candidate, with two improvements and no previously passing case lost. This
is a small French smoke sample, not full multilingual accuracy. Ten cases still
fail, including person/recipient roles, subgroup membership and accessibility,
and clarification of ambiguous group budgets. The candidate is held and not
Beta-qualified. TEST and TRANSFER remain unconsumed; no activation or live model
interruption occurred. Review DEV failure causes before further training.

Initial account debit for this attempt was USD 2.1932; aggregate debit for all
three attempts was USD 3.7102, subject to provider settlement. The local operation
contains source/input admissions, the fixed candidate receipt, exact outputs,
semantic comparisons and provider cleanup evidence. No account key or model
artifact is committed to Git.

## German follow-up: retained live model, not the GPU candidate

At the founder's request, 20 natural German requests were frozen before inference,
run against the already loaded MLX round-3 model, repeated after local software
changes, and supplemented with five fresh wording probes (45 local calls total).
The 200-update GPU candidate was not activated or loaded. No second model,
maintenance window, cloud allocation, production read/write or phone test occurred.

`nuknuk-german-diagnostics.mjs` binds model/adapter, prompts, questions and source
hashes. `nuknuk-german-chain.mjs` replays actual model responses through the canonical
Product handler and Bibliothekar using 19 synthetic test spots and neutral,
no-consent in-memory ports. This checks the Product chain, not the deployed
Supabase/real-inventory/network/iPhone journey. Expected meaning obligations are
assistant-authored development evidence, not independent human gold or holdout.

Confirmed local corrections:

- An exact `time.clock_start EQ` without end/duration now checks arrival instead
  of inventing a stay through midnight. Explicit end/duration requirements remain
  intact. The 19:00 dinner reproducer now selects the open test restaurant, and an
  explicitly requested 19:00–21:00 visit still rejects a venue closing at 20:00.
- One positive mandatory budget for a known group without a quantity basis now
  produces the per-person/group-total clarification. No scope or tariff is
  synthesized; zero, one-person, preferred and explicitly scoped budgets retain
  their prior behavior. Both original and fresh German probes show the question.
- The compact prompt no longer inherits the contradictory V6 default that turns
  every complete visitor count into required capacity. Actual explicitly demanded
  capacity is preserved. **This prompt edit remains experimental and on hold**:
  repeated German outputs still mis-scope groups, and an ID collision and lost
  recipient role appeared. Removing a prompt contradiction is not evidence of
  stable model improvement and does not authorize rollout.

The baseline generated 20/20 responses with one handoff-validation failure; the
repeat generated 20/20 with two such failures; fresh wording generated 5/5 with
none. These are structural counts, not semantic accuracy. Median model-call
latencies were approximately 8.0s, 8.5s and 9.1s respectively. Current results do
not establish Beta readiness. The local checks passed: 791 Decision-core tests,
105 understanding/diagnostic tests, strict typecheck, repository/secret invariants
and the single-route boundary. No deployment, mobile release certification or
production schema change was performed.

Remaining confirmed model fields: participant and recipient roles; group/subgroup
membership; fact/entity ID uniqueness; dropped mandatory visit-time information;
and unsupported duplicate extensions for already represented people/ages.
Separate backend limitations were reproduced with valid controlled plans:
`PRICE_PURPOSE_UNSTRUCTURED` for swimming admission budgets and
`MULTI_VISIT_SEQUENCE_NOT_SUPPORTED` for museum-then-coffee. Unknown travel time,
weather and absent facilities remain unknown rather than being fabricated.
These are not all problems that additional model training alone can resolve.

Detailed input/output-bound assistant review is retained locally as
`nuknuk-german-diagnostics-20261124/german-review.json`. The next candidate-quality
step is a separately isolated German evaluation of the trained adapter; do not
infer its German quality from this live-parent diagnostic or its French smoke.
