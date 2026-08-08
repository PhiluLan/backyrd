# Backyrd Engineering Handbook

> The durable operating standard for humans and AI agents working on Backyrd. It defines product intent, architectural boundaries, and engineering invariants. For setup and commands, use `README.md`; for domain policies, use `docs/` and `legal/`.

## Product philosophy

Backyrd is an AI-powered experience discovery platform. It helps people find restaurants, cafés, bars, hotels, activities, and other experiences that fit their current mood, context, and personal taste.

Backyrd is not a review or rating platform. It is an experience platform with one mission: **help people create better real-life moments**.

Five principles govern product and engineering decisions:

- **Mood beats stars.** Describe how an experience feels; do not reduce it to a score.
- **Context beats popularity.** Time, company, weather, location, intent, and taste determine what fits. Popularity is only one signal.
- **Experiences beat reviews.** Reviews are lightweight feedback that improves future discovery, not the product itself.
- **Trust beats engagement.** Never trade authenticity, safety, or user control for growth, retention, or vanity metrics.
- **Human-first.** AI assists and explains. Humans remain accountable, and human moderation is final.

Do not build mechanics that encourage spam, addiction, doom scrolling, or performative engagement. Do not copy competitors or add complexity without a clear real-world benefit.

## Repository philosophy

Backyrd is one product expressed through several surfaces. A domain change may affect the mobile app, public and Owner web, Admin, shared contracts, database, and Edge Functions. Inspect all affected surfaces before changing one.

Canonical runtime areas are:

- `mobile/` — primary consumer experience
- `web/` — public discovery and Owner platform
- `admin-dashboard/` — internal operations, quality, and moderation
- `packages/shared/` — contracts shared across package boundaries
- `supabase/` — canonical migrations, policies, RPCs, and Edge Functions

Treat backup directories, installers, audits, generated output, and standalone prototypes as historical evidence, not implementation sources. Do not add new backup files or parallel “final” versions; Git is the history.

Keep ownership explicit:

- Domain rules belong in the backend when every client must obey them.
- Cross-surface data shapes belong in shared contracts when reuse is real, not speculative.
- UI behavior stays with its surface; do not force unrelated clients into premature abstractions.
- Extend an existing component, service, hook, RPC, or utility before creating a competing path.

## Engineering principles

1. **Understand before editing.** Trace the user flow, existing implementation, data model, permissions, and failure modes. Never infer architecture from filenames alone.
2. **Preserve domain invariants.** A locally correct UI is not sufficient if another client, RPC, trigger, or policy can violate the rule.
3. **Prefer small, reversible changes.** Avoid broad rewrites unless the problem requires one and the migration path is explicit.
4. **Maintain compatibility intentionally.** Identify consumers before changing contracts, RPCs, schemas, routes, or stored data.
5. **Optimize for clarity.** Readability, simplicity, maintainability, then measured performance. Cleverness is a liability.
6. **Make failure honest.** Loading, empty, degraded, retry, and error states must reflect reality. Never fabricate successful data or certainty.
7. **Measure before optimizing.** Reduce queries, rendering, payloads, and latency where evidence shows user impact.

Use strict TypeScript. Avoid `any`; validate untrusted data at boundaries and keep types close to their domain. Remove dead paths instead of preserving them “just in case.”

## Decision Engine philosophy

The Decision Engine recommends the best experience for the user's current situation; it does not find the highest-rated or most popular place.

- Treat mood, intent, location, distance, time, opening hours, company, taste, discovery value, social context, authenticity, and data quality as distinct signals.
- Apply hard eligibility constraints before probabilistic ranking or generated copy. AI must not talk an invalid, closed, unsafe, or unavailable option into relevance.
- Keep ranking influence explainable. A recommendation should have a user-understandable reason and a traceable system reason.
- Separate candidate retrieval, ranking, and presentation so each can be evaluated independently.
- Preserve exploration. Personalization must not collapse into a popularity loop or narrow the user into a permanent taste profile.
- Treat saves, opens, visits, moments, and reviews as evidence with different strength—not as interchangeable engagement events.
- Version material ranking or prompt changes and compare their effect on experience quality, coverage, diversity, and trust.

The success metric is a better real-world decision, not more taps or longer sessions.

## Reviews and Review Integrity

Reviews are intentionally lightweight experience signals. They should be attributable, relevant to a real spot experience, and useful for future recommendations.

Integrity systems identify unusual behavior; they do not prove manipulation.

- Store signals and supporting context separately from moderation decisions.
- Assume false positives are possible, especially for new users, travel, shared networks, and sudden legitimate popularity.
- Use proportionate, reversible interventions. Automatic permanent punishment is prohibited.
- Preserve an audit trail for consequential decisions and provide an appeal path.
- Do not expose detection logic in ways that make abuse easier.
- Owners may improve their profiles but must never review their own spots, suppress legitimate criticism, or influence ranking through Owner analytics or payments.

Human review is required when evidence is ambiguous or consequences are material.

## Trust & Safety principles

Trust & Safety is a core product capability, not a support queue. It covers content safety, Owner verification, Review Integrity, human moderation, enforcement, and appeals.

- Enforce policy consistently across Mobile, Public Web, Owner, and Admin surfaces.
- Keep policy, detection, and enforcement distinct. A model output is a signal, not a policy decision.
- Record the policy basis, relevant evidence, actor, timestamp, and outcome for material actions.
- Minimize access to sensitive moderation data and expose it only through authenticated, authorized paths.
- Default to the least harmful safe intervention when confidence is limited.
- Preserve human override and meaningful appeals. Never design an irreversible AI-only enforcement path.
- Evaluate safety changes for both missed harm and disproportionate impact on legitimate users.

Trust takes priority over launch speed and engagement targets.

## Database philosophy

Supabase PostgreSQL is the authoritative system for shared product state and cross-client invariants.

- Every schema, policy, grant, trigger, index, or SQL-function change must be a versioned migration in `supabase/migrations/`.
- Never edit the production schema manually. Never rewrite a migration that may already have been applied; add a forward migration.
- RLS is mandatory for client-accessible data. Default to least privilege and test positive and negative authorization paths.
- Service-role credentials are server-only. They must never enter mobile code, public environment variables, logs, or browser bundles.
- Prefer transactional RPCs for multi-step invariants. Clients must not coordinate security-sensitive writes.
- Search for an existing RPC or SQL function before adding one. Extend or version deliberately; do not create near-duplicates.
- Keep RPC contracts backward-compatible where practical. When breaking change is necessary, migrate every consumer and retire the old path explicitly.
- Backfills must be bounded, observable, restartable where practical, and safe against repeated execution.
- Add indexes from measured query needs and verify they support the real access pattern.

Production data is not development seed data. Use isolated environments and synthetic or explicitly approved fixtures for testing.

## UI and design philosophy

Backyrd should feel premium, calm, modern, fast, and confident. The design language is dark-first, spacious, typographically strong, rounded, minimal, and anchored by the pink accent.

- Create clear hierarchy and one obvious primary action per state.
- Prefer progressive disclosure over crowded screens and unnecessary dialogs.
- Use motion sparingly and only to clarify state or continuity.
- Design loading, empty, offline, permission-denied, error, and recovery states as first-class experiences.
- Preserve accessibility: readable contrast, scalable text, meaningful labels, adequate targets, and non-color status cues.
- Never use dark patterns, fake urgency, or manipulative notification prompts.
- Reuse established components and tokens before introducing visual variants.

Every screen should feel intentional and should help the user reach a real experience faster.

## AI development workflow

AI is appropriate when it adds contextual judgment, language understanding, or useful explanation. Do not use it where deterministic logic is safer and sufficient.

For every AI-backed feature:

1. Define the user decision it improves, the non-AI fallback, and the unacceptable failure modes.
2. Establish deterministic eligibility, authorization, and safety rules before model invocation.
3. Keep provider keys and privileged calls server-side. Minimize personal data and never send data without a justified product need.
4. Request structured output where possible; validate it, bound it, and treat it as untrusted input.
5. Define timeouts, retries, rate and cost limits, degradation behavior, and observable failure signals.
6. Evaluate representative normal, edge, multilingual, adversarial, and safety-sensitive cases. Safety systems must measure false positives as well as misses.
7. Make material model, prompt, policy, and threshold changes traceable and independently reversible.
8. Communicate uncertainty honestly. Never invent facts, explanations, or confidence.

AI may propose; deterministic controls and accountable humans decide.

## Git and change workflow

1. Start from an up-to-date base and work on a focused branch.
2. Inspect the worktree before editing; preserve unrelated user changes.
3. Keep commits intentional and scoped. Never mix cleanup, feature work, migrations, and unrelated formatting without reason.
4. Run the relevant lint, type, build, and domain checks before review.
5. Use a pull request for `main`. Explain product impact, affected surfaces, data or security implications, migration strategy, and validation performed.
6. Do not merge with failing required checks or unresolved material review feedback.
7. Do not auto-merge, force-push shared branches, rewrite published history, or perform destructive Git operations without explicit authorization.

Git is the source of truth and the backup. Generated artifacts, secrets, local configuration, and manual backup copies do not belong in commits.

## Definition of Done

A change is complete only when:

- it improves or protects a real user experience and fits Backyrd's product philosophy;
- all affected surfaces and contracts behave consistently;
- authorization, privacy, Trust & Safety, and Review Integrity implications were assessed;
- schema changes are migrated and RLS/grants are verified in both allowed and denied cases;
- types and boundary validation are explicit;
- relevant lint, type checks, builds, tests, and manual critical-path checks pass;
- loading, empty, error, degraded, and recovery behavior is intentional;
- telemetry and logs are useful without exposing secrets or unnecessary personal data;
- obsolete paths and accidental duplication are removed;
- durable behavior or operational changes are documented in the correct source of truth.

If a required automated test does not exist, document and perform the manual verification; do not silently lower the standard.

## Non-negotiable engineering rules

- Never weaken or bypass RLS, authorization, moderation, consent, or privacy controls for convenience.
- Never expose service-role credentials, provider secrets, or sensitive moderation data to a client.
- Never allow owners, advertisers, or payments to manipulate recommendation ranking.
- Never treat an integrity or AI signal as proof, or impose permanent punishment without human accountability and appeal.
- Never fabricate certainty, user data, recommendation reasons, or successful system state.
- Never change production schema outside versioned migrations.
- Never create parallel implementations or backup files when a canonical path exists.
- Never optimize for addiction, spam, vanity metrics, or engagement at the expense of trust.

Before implementing anything, ask:

**“Does this improve a real-world experience for the user?”**

If the answer is no—or if the improvement depends on sacrificing trust—rethink the change.
