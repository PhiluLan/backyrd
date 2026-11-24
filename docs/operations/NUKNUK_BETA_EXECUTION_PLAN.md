# NukNuk Beta: bounded execution plan, 24 November 2026

Status: **First controlled attempt aborted at 10/200 updates; owned Pod deleted.**
The reviewed Beta exporter and single-Pod controller are implemented. No complete
candidate or model activation resulted. Before another allocation, require a new
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
