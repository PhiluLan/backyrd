# Backyrd — Canonical Founder/CTO Handover

**Status:** current operating truth for the next Founder/CTO working context

**Verified:** 2026-09-06 (Europe/Zurich)

**Repository baseline:** `3e93c15a32f55ffd1cc9e77aaa8965a7088e32fe`

**Production project:** Supabase `hjgcrrzfjchzqoegcywn`, Vercel Consumer/Admin, EAS Production runtime `1.1.0`

This is a handover, not a historical diary. It records current Product and Production truth, durable decisions, protected semantics, deferred work and the operating rules a new CTO must preserve. Repository and live Production evidence take precedence over older narrative documents. Secrets, tokens and credential values are intentionally excluded.

## 1. Canonical source of truth

### Verified baseline

| Surface | Verified current truth |
| --- | --- |
| Git | `origin/main` and local canonical `main` are `3e93c15a32f55ffd1cc9e77aaa8965a7088e32fe`, merge commit for PR #214, Events home carousel. |
| Required checks | Database, Security, Quality and Supabase Production Deployment succeeded for this SHA. |
| Mobile Production OTA | EAS `production`, runtime `1.1.0`, group `2b0c86bf-868c-4888-b9c4-246eaade9f1b`, iOS update `01a077e4-4931-7aa5-ac43-b655c43b9163`, Android update `01a077e4-4931-7df4-87e5-a66eb8fc4b35`, source commit exactly `3e93c15…`. |
| Consumer Web | Vercel Production deployment succeeded for `3e93c15…`; canonical public domain is `www.backyrd.ch`; `/` and `/events` returned HTTP 200 during the handover check. |
| Founder Admin | Vercel Production deployment succeeded for `3e93c15…`; project/status is Backyrd Intelligence/Admin. |
| Supabase | PostgreSQL 17 Production is healthy. Repository contains 136 migrations; Production/fresh-bootstrap tip is `20260905212627_keep_external_event_sources_disabled_for_manual_pilot`. |
| Edge/migration deployment | The source-aware audit for `3e93c15…` returned `NO_RUNTIME_DEPLOY`, reason `BOUND_RUNTIME_SCOPE_UNCHANGED`, with no migrations and no Edge redeploys. |
| Decision | Production `decision-v13` is v124, `verify_jwt=true`; protected source set remains the certified 41/41 identity. |

The latest merge changed only the Events home presentation. Its source-aware deployment correctly produced no Supabase runtime deployment. Canonical `main` remains the sole Production authority.

### Relevant open pull requests

There is no current feature PR that must be merged to obtain the Product described here. GitHub still has a backlog of old stacked and historical PRs (#106, #105, #104, #102, #101, #100, #99, #97, #91, #90, #89, #88, #87, #86, #85, #84, #83, #72, #71, #70, #69, #68, #67, #66, #65, #64, #62, #61, #58, #57, #56, #55, #54, #48, #28 and #1). Their base branches are mostly old feature branches, not current `main`. Their canonical work was either integrated through later closure merges, superseded, stopped, or retained as historical evidence. They must not be merged blindly. Closing or labelling this backlog is P2 repository hygiene, not a Product prerequisite.

### Documentation conflicts found

1. `docs/operations/PRODUCTION_PRODUCT_LINEAGE.json` was last audited before the final Events deployments. Its database section is current, but its Mobile, Web and Admin deployed-surface fields still describe earlier candidate/deployed commits. Live EAS, Vercel and GitHub checks prove all three current surfaces from `3e93c15…`. The manifest is stale evidence metadata, not current Production truth.
2. The Events V1 handover on its handover branch records the then-current `81721a2…`/EAS group `c3a981…`. Current `main` additionally contains Admin navigation, Admin form reliability and the Home carousel, and EAS now runs group `2b0c86…` from `3e93c15…`.
3. The root README statement that the repository has no automated CI suite is stale. The current repository has Required Database, Security, Quality and source-aware Production workflows.
4. `docs/mood/MOOD_ENGINE_V1_SECURITY_CTO_HANDOFF.md` records a pre-Production blocked moment. Later migrations, certified runtime identity and current Production supersede that state; the canonical Mood V1 Product contract is deployed.

## 2. Backyrd in one page

Backyrd is a Basel-first experience discovery Product. It helps a person choose a real restaurant, café, bar, hotel, activity or event that fits the current moment: intent, mood, place, time, company, budget, availability and, where evidence is sufficient, personal taste.

The central journey is:

> discover → understand a Spot or Event → make a trustworthy decision → interact → leave lightweight experience evidence → participate socially → find it again later

Backyrd differs from Google Maps and conventional rating portals in its decision model. It is not a directory sorted by popularity and it does not reduce experience quality to star averages. Mood describes how a place feels; context decides whether it fits now; reviews are lightweight attributable evidence; Decision applies hard eligibility before bounded ranking and provides evidence-honest reasons. The success metric is a better real-world moment, not more taps or longer sessions.

- **Discovery:** Home, Basel Spot lists, search, categories, map, Event discovery and social moments.
- **Spots:** canonical places with location, category, hours, offering/purpose, media and quality evidence. Missing facts remain missing rather than fabricated.
- **Moods:** community descriptions of a Spot, normalized through governed concepts while preserving raw language.
- **Decision:** natural-language recommendations using hard constraints, evidence and bounded personalization.
- **Reviews:** lightweight post-visit text, optional Mood expressions and media, subject to same-day and integrity contracts.
- **Moments and Social:** moments, follows, reactions, comments, profiles, achievements, messages and notifications.
- **Events:** deterministic Basel calendar with occurrences, venue matching and manually governed publication.
- **Admin/Operations:** Founder-facing Spot quality, Moods, Reference Locations, Events and Production health controls.

Basel is the launch corpus and operational proving ground. Expansion must preserve the same evidence, integrity and operational contracts; city count is not itself success.

## 3. Founder/CTO operating model

- **Philipp is Founder and physical Product decision-maker.** He sets Product, trust, business and launch intent and performs reality checks on real devices and real Production.
- **The CTO is the technical partner.** The CTO owns architecture, technical strategy, scope discipline, Production truth, release gates, evidence quality and technical acceptance.
- **Senior developers implement bounded workstreams.** They trace all affected surfaces and may not silently redefine protected semantics.
- **Founder decisions are real inputs.** When a change reaches protected Product, Trust, Decision, Mood, privacy or legal semantics, implementation stops until the required decision is explicit.

Operating principles:

- Optimize for the real user goal before technical perfection.
- Use the smallest architecture that reliably enforces the contract.
- A small task gets a small prompt and a bounded diff.
- Deterministic logic wins where it is safer and sufficient; do not invent a new Engine.
- A Founder physical reality check can invalidate a laboratory PASS.
- Fix proven P0/P1 defects. Record P2 debt; do not turn it into an automatic mega-project.
- Fail closed at Security, authorization, integrity, cost and Production-lineage boundaries.
- Never bypass red Required Checks, guards, freezes or review policy.
- Never deploy a feature branch to Production. Canonical `main` is Deployment Authority.
- Production truth must be attributable to exact source, migration, configuration and evidence identities.

## 4. Current architecture

Backyrd is a multi-surface monorepo:

| Area | Current role |
| --- | --- |
| `mobile/` | Primary consumer app, Expo/React Native with Expo Router, iOS Product reference and Android code/runtime delivery. |
| `web/` | Next.js Consumer discovery and Owner-facing web functions. |
| `admin-dashboard/` | Next.js Backyrd Intelligence/Admin for Founder operations, quality, moderation and configuration. |
| `packages/shared/` | Reused contracts and event presentation. |
| `packages/canonical-semantics/` | Canonical domain vocabulary and semantics. |
| `packages/decision-input/`, `packages/decision-orchestrator/` | Server-authoritative Decision input and deterministic orchestration. |
| `packages/user-intelligence/`, `packages/n6-shadow/` | Bounded user evidence and inactive/controlled shadow research paths. |
| `packages/city-bootstrap/`, `packages/spot-research/` | Operational corpus/research tools, not autonomous Product authority. |
| `supabase/` | Authoritative Postgres migrations, RLS, RPCs, Auth/Storage contracts, Edge Functions and deployment metadata. |

Runtime architecture:

- **Data/Auth:** Supabase PostgreSQL, Auth, Storage and Realtime. PostgreSQL is authoritative for shared Product state and cross-client invariants.
- **Edge Functions:** Deno functions for Decision, safety, research queues, provider mediation, account/data actions, push and email.
- **Web/Admin:** Vercel Production from canonical `main`.
- **Mobile:** signed EAS builds plus runtime-compatible OTA updates on the EAS `production` channel.
- **Providers:** OpenAI for embeddings and bounded AI/safety/research calls; Google Places/Geocoding/Photos for bounded place resolution; native maps/Mapbox assets for map presentation; Expo for builds, OTA and Push; Resend for transactional claim emails.
- **Backup:** Supabase provider backups plus encrypted off-provider AWS S3 exports.
- **CI/CD:** GitHub Required Checks and dependency-aware, fail-closed Supabase Production deployment from canonical `main` only.

Historical copies, installers, generated output and alternate function directories are evidence, not canonical runtime. Extend an existing canonical service/RPC/function rather than creating a parallel path.

## 5. Database and Production truth

### Consolidation and migrations

Database Consolidation established one forward-only migration lineage that can bootstrap cleanly from zero data and match Production. Every schema, policy, grant, trigger, RPC and index change belongs in `supabase/migrations/`. The current tip is:

`20260905212627_keep_external_event_sources_disabled_for_manual_pilot`

Historical migrations may already have run in Production and may define evidence identities. Rewriting one would create a repository that can no longer explain Production, invalidate clean bootstrap and make rollback/recovery ambiguous. Corrections therefore use a new reviewed forward migration. Failed migrations stop; they are never “rolled back” by editing history.

### Current fingerprints and controls

- Current full application schema, including Events V1: `1335d79ea194ba39e89ea56891f27b62c6134c4343446f7f83197e78126379dd`.
- Current full public ACL fingerprint, including Events V1: `ce26543378b1e9c67cf89e29a0af2e4a434f5ca6aaf0afe679cebcac961e562e`.
- The older global canonical files `application-schema.sha256` (`9d3286…`) and `public-acl.sha256` (`3b7cad…`) are historical reconstructed baselines used by earlier contracts; they must not be casually overwritten to mimic the Events-extended schema.
- Production and clean bootstrap matched the Events/full fingerprints; all seven Events tables have RLS and storage policy scope was verified.
- Client-accessible state is RLS-protected. Service-role credentials remain server-only.
- `SECURITY DEFINER` functions require explicit actor authorization, controlled `search_path`, least grants and positive/negative tests.

### Production deployment contract

The Supabase workflow resolves each function’s complete direct/transitive source set and configuration, including `verify_jwt`. A changed function or shared dependency deploys the affected runtime; a pending forward migration applies in order; evidence/docs-only merges produce no runtime deployment. Unknown dependency state blocks or conservatively deploys; a simple path filter is never trusted to skip relevant runtime.

The latest audit at current Main was `NO_RUNTIME_DEPLOY`, with plan hash `daa9f217f153c9ad47544039f5728c3488cf9fb08011126a19019458a749f25b`. This is the expected result for PR #214.

### Backup and recovery

- Supabase Pro daily database backups: seven-day retention, RPO up to 24 hours. PITR is not enabled.
- Separate AWS account, private S3 bucket, all public access blocked, KMS encryption/key rotation, versioning and 30-day current/noncurrent retention.
- Daily Storage export and weekly logical database export from canonical-main GitHub OIDC; no long-lived client credential.
- Export failure opens an operational issue owned by Philipp.
- Quarterly isolated restore drill; current-quarter proof exists. A destructive Production restore or cutover always needs separate Founder authorization.
- Database backups do not include Storage bytes, provider configuration, function code or secrets; repository, AWS exports and provider recovery controls are complementary.

## 6. Spots and the Basel corpus

Read-only Production measurement on 2026-09-06:

| Population | Count |
| --- | ---: |
| All Spot rows | 447 |
| Product-origin Spots (`REAL`/`IMPORT`/`LEGACY`) | 442 |
| Active Product Spots | 419 |
| Active Basel Product Spots | **396** |
| Approved Basel Product Spots | **396** |
| Archived Spots | 28 |
| Fixture/test rows | 5 |

The five fixture/test rows are excluded from the active Consumer Product. The older Gate-2 corpus snapshot of 130 total/99 launch-ready Spots was correct for its date but is no longer the live count after later import/city-bootstrap work.

The Spot Engine/city-bootstrap work established a usable Basel launch corpus, canonical identity/provenance, bounded research, duplicate handling, quality queues and human correction. It did **not** prove that every active Spot has complete hours, pricing, offering, rights-cleared media or all qualitative evidence. Corpus breadth and evidence completeness are separate.

Founder controls are deliberately human-authoritative:

- Admin/Owner edits create attributable source evidence and accepted facts.
- Quality & Spots operates on the active Product population only. Archived, fixture, test and tombstone rows must not pollute the queue.
- Archive is the normal retirement state. Historical reviews, moments, Decision/audit evidence and provenance may remain under their contracts; an archived Spot is excluded from Search/Map/Decision and rejects new Consumer mutations.
- Normal Product deletion is not a hard-delete strategy.

Known Spot debt is evidence completeness, especially hours, price/offering depth and rights-cleared media coverage. Do not solve this by fabricating facts or launching “Spot Intelligence V2” without measured Product need.

## 7. Mood Engine V1 — Product-frozen contract

Mood describes **the Spot experience, not the person**.

1. A review may contain zero to two free-form Mood expressions. Raw text is preserved.
2. Governed concepts and aliases normalize exact supported language. Resolution states are `RESOLVED`, `UNRESOLVED` and `INVALID`.
3. The resolver does not coerce an unknown phrase to a nearest concept. Unresolved is honest Product evidence, not a vote.
4. Canonical V1 has 22 concepts, 63 aliases and six organizational clusters. Clusters are not votes.
5. Community aggregation is based on unique user × Spot contribution. Multiple legitimate visits can add evidence, but one person cannot inflate the unique-contributor count for a concept.
6. One published `REAL` review per user × Spot × Europe/Zurich day is enforced transactionally. Historical reviews across visits remain legitimate.
7. Hidden, removed or deleted reviews do not contribute; restore/rebuild restores the deterministic derived state.
8. Below three unique contributors the Product shows **Erste Eindrücke** without false precision. At threshold it becomes established and may show bounded Mood strength.
9. Admin governs concepts, aliases, merge/retire actions, audit and rebuild. AI may propose; it does not publish canonical concepts autonomously.
10. Established Community Mood may affect Decision only as a small non-negative soft signal, capped at `0.06`, and only after eligibility. Missing Mood is neutral.

Explicit boundaries:

- Mood → personal Taste: **NO**
- Mood → User Card: **NO**
- Mood → N4: **NO**
- Mood → Gold/readiness: **NO**
- Mood → Offering/Purpose: **NO**

This semantic contract is Product-frozen. Change requires explicit Founder authorization and complete D2/D3 re-certification where Decision identity is affected.

## 8. Decision Engine

### Current Production state

- Function: `decision-v13`
- Production version: **v124**
- JWT verification: `true`
- Certified Production source set: **41/41 byte-identical** to the certified canonical source identity
- Production bundle SHA-256: `a920d38405534f8fdd02e13934988b97fcd4dec12e9c93d8f8dd8bed8d4dac13`
- Core Engine SHA-256: `cad2c4ea94817d2facbd54db92f55f3286acecf4d1e8a71dda414431b76cf000`
- Decision Lab: **318/318 PASS, zero skip**
- D2, D2.1, D2.2 and D3.1: **PASS**, bound through the current re-certification chain
- Gate-3 realistic scenarios: before 39/67 (58.2%), after 67/67 (100%); logic-caused obviously wrong recommendations reduced from 19 to 0

### Protected Product semantics

- **Hard eligibility precedes ranking.** Closed, explicitly negated, out-of-bound, unsafe or otherwise invalid candidates cannot be talked into relevance.
- **Cold start:** deterministic current-intent and Product evidence work without a personal profile. Personalization is used only when User Evidence is sufficient and current intent remains authoritative.
- **Negations:** only clearly parsed negations create hard exclusion. German inflections/compounds are supported; ambiguous language does not become speculative exclusion.
- **Offering/Purpose:** canonical authored evidence, not category guesswork, supports purpose and offering claims.
- **Open now/time:** actual `spot_hours` and explicit temporal requirements bind eligibility. Missing hours remain `UNKNOWN`; no invented opening fact.
- **Location:** city, explicit quarter, landmark and bounded near-distance are understood where deterministic geo evidence exists.
- **Landmarks:** static canonical Basel references complement, but do not replace, server-side dynamic Google place resolution. Founder does not maintain a tag per Spot.
- **Bahnhof disambiguation:** Bahnhof/Hauptbahnhof/Basel Bahnhof resolve to Basel SBB in the Basel context.
- **Near radius:** default **800 m**, server-authorized and Admin-configurable within 100–2,000 m, audited and fail closed. Current Production configuration is active at 800 m.
- **Price:** inexpensive, maximum budget, medium, premium, minimum and range intents are distinct. Unknown price is not a verified match.
- **Exact match:** return two, one or zero when that is the verified count. Do not fill three slots with generic candidates.
- **Reason honesty:** a reason may claim only a constraint that was understood, applied and supported by sufficient evidence. `UNKNOWN` never becomes prose claiming a match.
- **Continuation:** server-authoritative continuation preserves the accepted 3/3/1 behavior and prevents repeated candidates while keeping learning/persistence intact.
- **Diversity:** bounded diversity is preserved after eligibility; popularity is not allowed to collapse every result set.
- **Mood query:** canonical Mood language and established Community Mood operate only within the bounded Mood V1 contract.

The governing rule is:

> **QUALITY > RESULT COUNT**

If there is no sufficiently evidenced match, Backyrd says so and invites a meaningful relaxation. It does not invent certainty or return generic places as exact matches.

## 9. Auth, identity and account lifecycle

Gate 4 certified the supported lifecycle across Mobile and Consumer Web:

- Email signup/login with non-enumerating errors and bounded duplicate submission.
- Verification mail, valid/used/expired link handling and bounded Mobile/Web return paths.
- Password recovery through canonical callback/deep-link handling; invalid or expired links fail honestly.
- Sign in with Apple for first and returning login, including Hide My Email, without duplicate Backyrd identities for one Apple provider identity.
- Session persistence across app restart, refresh, navigation and token refresh; no valid-session “ghost guest”.
- Mobile and Web resolve the same Auth user to one canonical profile.
- Profile creation races are repaired/idempotent; normal users are not trapped authenticated-without-profile.
- Onboarding completion persists and is not forcibly repeated on another client.
- Logout removes the local session and protects private routes; login after logout works.
- Multi-session behavior follows the current Supabase/Product contract; a local logout does not pretend to revoke every device unless the underlying operation does so.
- Account deletion has a **14-day pending/cancellation contract**, followed by the authorized worker. Profile, content/social relations and owned Storage are handled under the existing Data Rights policy; audit/retention behavior is not re-invented ad hoc.
- Authenticated never implies Admin, Owner or service authority. RLS, RPC and server-route boundaries enforce actor/target scope.

Public-launch communication polish remains separate from lifecycle correctness: branded transactional mail, verification/recovery/deletion wording and UX, deliverability/spam monitoring, DE/EN variants, and clear support/contact details.

## 10. Social and user content

Current supported Product areas are Reviews, Moments, Favorites, Follows, Likes/Reactions, Comments, Messages, Notifications, Achievements and user Media. Gates 5 and 6 certified the core journeys and database aftermath.

Durable integrity rules:

- Actor identity comes from the authenticated server/database context, not a forgeable client field.
- A Favorite is unique per user × Spot; Follow is unique per actor × target and self-follow is forbidden; a Reaction is unique per actor × target.
- Add/remove/unfollow/unlike operations converge under retry and duplicate tap.
- Review creation preserves the Europe/Zurich same-day contract and legitimate historical reviews.
- Comment, Moment and Message mutations use stable request/idempotency identifiers where retry could duplicate a record.
- Cross-user edit/delete/read is allowed only where the explicit Product/RLS contract says so; normal users cannot mutate another actor’s content.
- Like, comment, follower/following, review, Moment, Favorite and achievement state derives from canonical relations. Transactional RPCs keep counters consistent.
- Moderated/hidden content disappears from intended Consumer paths and from derived state without destroying legitimate history.
- Archived Spots accept no new Consumer mutations and do not enter Search/Map/Decision, while allowed historical content remains attributable.
- Account lifecycle cleanup includes owned Storage; service/audit retention remains under the existing Data Rights contract.
- Gate 5 repaired a cross-user Achievement exposure, Web privacy/data-rights access and stale map selection. Gate 6 then verified zero unauthorized cross-user mutations, duplicate active relations, unexplained active orphans, unexplained count drift and active Consumer fixture leakage.

Media has bounded MIME/size/upload ownership policies. Bounded orphan cleanup remains P2; do not replace the pipeline without a measured need.

## 11. Events V1

The full `EVENTS_V1_HANDOVER.md` from the Events handover branch was read and compared to current `main` and Production. Current `main` supersedes that handover with Admin navigation, hardened Event form behavior and the Home carousel.

### Product contract

Events V1 is a deterministic Basel calendar, not an Event Intelligence Engine:

> source/manual input → staging → validate/normalize → venue match → conservative deduplication → Event + Occurrences → publish

- **Manual Admin:** Founder can create, edit, save draft, publish and cancel; search/filter, preview, recurrence, occurrence exceptions and rights-bound image upload are supported.
- **Event vs Occurrence:** the Event stores canonical identity/content; materialized occurrences store dated instances. Recurrence is a structured contract, not an opaque RRULE string.
- **Recurrence:** once/daily/weekly/monthly, interval/weekdays and until/count, interpreted in Europe/Zurich.
- **Horizon:** occurrences materialize for 12 months; explicit exceptions survive regeneration.
- **Venue:** an Event may match an existing approved Spot or use a free `UNMATCHED` venue. Creating an Event never silently creates a Spot.
- **Venue editor reliability:** structured errors, accessible accent-tolerant Spot autocomplete and explicit free-venue behavior are deployed.
- **Images:** only supported MIME/size and `rights_verified` media, with source/credit. No unverified external image ingestion.
- **Mobile/Web:** Events list/detail, dates, venue, external link and upcoming occurrences exist on offered surfaces.
- **Home carousel:** chronological, horizontal/manual, no autoplay and no ranking; empty and one-card cases are intentional.
- **Open Court Volta Pong:** published, matched to its Spot and recurring every second Monday. `Craft Beer Night vol. 7` is also currently published.

Read-only Production count on 2026-09-06: 4 manual Events, 2 published, 2 QA drafts, 29 scheduled occurrences. The QA drafts are not Consumer-visible; cleanup is P2 hygiene.

### External sources

All five configured Event source rows, including manual, currently have ingestion disabled. There is no active external adapter in canonical runtime.

- **Eventfrog:** API/contract path considered; executable adapter and Production credential are not verified.
- **PROZ/ProgOnline:** contract/partnership pending; no adapter.
- **BaselLive:** partnership path only.
- **Basel OGD:** supplemental option; no adapter.
- **Scraping:** explicitly prohibited.

External sources may enter only through a lawful, attributable adapter with conservative deduplication and image-rights controls. Events V1 remains deterministic; do not create an Event Intelligence Engine.

Known Events debt: explicit ACL hardening review before broad external ingestion, Mobile/Web Weekend definition parity (Mobile Sat/Sun; Web Fri/Sat/Sun), source partnerships/adapters, verification of a daily recurrence-reconcile schedule if the pilot needs it, and cleanup of replaced Event image objects.

## 12. Design system

The canonical Phase-1 Mobile design merge is `612209ba40ff42075e209a6731e6419a21f4e7d4`; current Production includes it plus Events work through `3e93c15…`.

Core tokens and rules:

- Dark background: `#050505`
- Light foreground: `#ECECEA`
- Pink accent: `#FF4F91`
- Blue: `#A9C2FF`
- Open green: `#9AE67A`
- `DM Serif Display` only for defined emotional/hero text
- `Libre Franklin` for UI, body and general Product text
- Floating glass navigation, dark-first spacing, strong hierarchy and restrained motion

The deployed design covers Home/Discover, Spot Detail, Profile and the current Event integration. The primary Mobile navigation exposes Discover, Für jetzt, the central Mood action, Orte and Momente; Profile is reached through the Product flow rather than being another crowded primary tab. Loading, empty, offline, permission and error states must remain honest. New work extends tokens/components rather than creating a competing design system.

## 13. Admin and Founder operations

The current Admin/Backyrd Intelligence surface includes:

- **Spots** and human Spot editing
- **Quality & Spots**, restricted to active Product population
- **Moods**, concepts/aliases/governance/rebuild
- **Referenzorte**, static known references plus dynamic-resolution information and the authorized 800 m near-radius control
- **Events**, now directly reachable in Founder navigation with reliable form/venue behavior
- **Betriebsstatus / Operations**, with database pressure, locks, cron/queue failures, Storage and provider-boundary state
- Review/proposal/moderation and Owner-related operational paths where present

Reference Locations currently consist of four source-controlled known Basel references: Gundeli, Kleinbasel, Basel SBB and Marktplatz. They are not a mandatory tag table for every Spot. Dynamic server-side Google resolution remains active. The Admin list complements dynamic resolution and may change only the bounded, audited standard near radius.

The Operations view is server-authorized and does not background-poll. Launch thresholds include database connections at or above 80%, any waiting lock, failed cron in 24 hours, queue failures or repeated provider boundary blocks. First response is to stop the affected writer, preserve evidence and use the recovery runbook.

## 14. Security program

Current durable controls:

- Admin routes validate the user session server-side and require the canonical Admin check.
- Service-role keys and provider secrets are server/CI only; they must never enter Mobile, public browser bundles, logs or Git.
- RLS is mandatory on client-accessible tables, with positive and negative authorization tests.
- RPCs derive the actor from Auth context and enforce target ownership/membership/capability.
- `SECURITY DEFINER` functions use fixed search paths, explicit grants and reviewable authority.
- Cross-user/IDOR paths default deny; authenticated is not privileged.
- The historical Apple credential incident was handled by rotation and physical lifecycle re-test. Do not rotate again without evidence. Current Apple provider-console credential state was not independently re-read during this documentation-only handover.
- A production OpenAI credential is not supported in Mobile. Release validation rejects `EXPO_PUBLIC_OPENAI_KEY`; older helper references are explicitly noncanonical and must never be populated with a Production key.
- Secret prevention includes repository scanning and SQL/config guards. Required Security checks are green at current Main.
- Supabase Production deployment is canonical-main-only, dependency-aware and auditable; evidence-only merges do not create artificial function versions.
- Three unused legacy functions (`cluster-mood`, `semantic-bridge-decision`, `enrich-spot-description`) are intentional fail-closed `410 Gone` tombstones, not Product fallbacks.

**Gate 8 — Final Security Certification remains intentionally PAUSED.** Current launch controls are not permission to claim the final public-launch security certificate. Before Gate 8, close the scoped Events ACL review, re-check provider/account controls and run the defined final certification against the then-frozen candidate.

## 15. Go-live gates

| Gate | Goal | Final status | Key results | Deferred, without reopening PASS |
| --- | --- | --- | --- | --- |
| 1 — Repository/Production truth | A clone of canonical Main represents the current Product and database lineage | **PASS** | Shipped Mobile/Web/backend branches were integrated normally; database consolidated; forward-only lineage and source-aware deployment established | Keep lineage metadata current; legacy PR cleanup |
| 2 — Basel corpus | A real launch corpus with canonical Spots and honest evidence | **PASS** | Basel corpus, identity/provenance, fixture isolation and admin quality contract accepted | Evidence completeness: hours, price/offering and rights-cleared media |
| 3 — Decision acceptance | Natural Basel queries produce relevant, explainable and honest recommendations | **PASS** | 67/67 product scenarios; explicit negation/location/price/time/fewer-results semantics; Founder SBB/landmark reality check closed | Cold-start latency is performance P2, not a semantic defect |
| 4 — Auth/account lifecycle | New and returning users can create, verify, keep, recover and delete a healthy account | **PASS** | Email/Apple, sessions, cross-surface profile, recovery, logout and 14-day deletion certified | Public-launch transactional mail/communication polish |
| 5 — Core journeys | A real user can traverse Mobile/Web Product journeys without a broken core flow | **PASS** | Home/Spots/map/social state; physical iOS deep-link and Push cold-start bridge/startup coordination; fail-closed malformed routing | Android-specific physical breadth remains to be rechecked for the final candidate |
| 6 — Data/social integrity | Multiple users leave consistent, owned, idempotent Product state | **PASS** | Cross-user/RLS fixes, request idempotency, transactional counts, archived-Spot and account-storage behavior; P0/P1 zero | Bounded media/orphan cleanup P2 |
| 7 — Reliability/capacity/cost | Basel test launch is stable, fast enough, bounded in cost and recoverable | **PASS** | 10/25 concurrent and burst PASS; provider counters; Founder Operations; AWS backup; rollback contract | PITR, Decision cold start, scale remeasurement and continuing restore drills |

Paused next gates:

- **Gate 8 — Final Security Certification — PAUSED**
- **Gate 9 — Legal / Privacy / Communication / Public Launch — PAUSED**
- **Gate 10 — Frozen Launch Candidate + Founder Final Acceptance — PAUSED**

Gates 1–7 are accepted facts. Reopen one only when new evidence contradicts its invariant, as happened appropriately with earlier Founder reality checks.

## 16. Reliability, performance and cost

### Launch model and measured capacity

The accepted conservative model is 50 registered test users, 10 normally simultaneous users, 25 users in a short burst, with sessions spanning Home, Search, Map, Decision, Spot, Review and Social.

| Path | p50 | p95 | Acceptance |
| --- | ---: | ---: | --- |
| Home catalogue | 84 ms | 148 ms | PASS |
| Spot search | 47 ms | 59 ms | PASS |
| Spot detail | 48 ms | 55 ms | PASS |
| Map corpus | 73 ms | 87 ms | PASS |
| Consumer Web Home | 49 ms | 755 ms | PASS |
| 10 concurrent mixed reads | 135 ms | 249 ms | zero failures |
| 25 concurrent mixed reads | 227 ms | 298 ms | zero failures |
| Decision warm | 1,739 ms | 2,650 ms | PASS |
| Decision 10 concurrent | 1,927 ms | 2,406 ms | zero failures |
| Decision 25 concurrent | 3,388 ms | 3,753 ms | zero failures |

Decision cold execution measured 6,393 ms and is accepted P2 degradation. Review creation measured 1,671 ms; Favorite, Follow, Like, Comment and Message mutation p95s were 81/56/112/72/108 ms respectively.

A current read-only health snapshot at 2026-09-06 18:19Z showed approximately 590 MB database size, 11/60 connections, one active connection, zero ungranted locks, 120 Storage objects/119 MB, four active cron schedules, zero failed cron jobs in 24 hours and zero actionable embedding/Safety queue failures.

### Cost and provider boundaries

Accepted monthly ranges, excluding tax and paid staff seats:

| Population | Estimated monthly total |
| --- | ---: |
| Base at approximately zero users | **$25–64** |
| 50 active users | **$25–90** |
| 500 active users | **$40–230** |
| 5,000 active users | **$350–1,450** |

Assumptions: 6–12 sessions/user/month, 1–3 Decisions/session, 10–30 Spot/media views/session, low Review/Safety/email volume, N6 sample rate zero, provider free allowances consumed first and server caps unchanged.

| Block | Fixed/variable | Model assumption |
| --- | --- | --- |
| Supabase | Fixed $25 base; variable only beyond included Pro quotas | Pro/Micro, current DB/Auth/Storage/Edge usage inside launch allowance |
| Vercel | $0–20 early, potentially variable/plan cost with growth | Consumer/Admin traffic and bandwidth; no artificial polling |
| AWS backup | Small fixed/usage base inside total fixed corridor | ~0.12 GB current Storage, daily Storage + weekly DB, 30-day encrypted/versioned retention |
| OpenAI | Variable, <$1–$3 at 50; $1–15 at 500; $10–100 at 5,000 | Embeddings plus bounded safety/research; N6 normal traffic off |
| Google Maps/Places | Variable and largest uncertainty: $0–15 / $10–120 / $100–800 | Place/photo/geocode field-mask usage after free caps, bounded per actor/global |
| Expo/Push | Free/low at test scale; production plan assumption included at 5,000 | 1,000 update MAU free; push path bounded; OTA MAU may drive plan |
| Storage/bandwidth | Included early, then variable | Current ~119 MB plus user/event media under upload caps |
| Other | $0–5 / $0–20 / $20–80 | Resend and small operational/provider usage |

Incremental ranges from the accepted corridor are approximately $0–65 for 0→50 users, $0–205 for 50→500 and $120–1,410 for 500→5,000. Because plan thresholds and free allowances create steps, these ranges are not additive forecasts. The defensible long-run marginal estimate is roughly **$0.07–$0.28 per active user/month** at the larger band, dominated by Google usage. Re-measure actual request mix before deliberately raising quotas near 5,000 users.

Every variable-cost path is server-bounded. Missing/ambiguous counter state returns 503; exhaustion returns 429. OpenAI/Google/provider timeouts and 429/5xx degrade the affected feature without client retry storms. The Product keeps working where the failed provider is not required.

### Operations and rollback

- Founder can inspect DB pressure, queues, provider blocks, Storage and recovery status without a terminal at `/founder/operations`.
- Alerts and first response are defined in the runbook; account-level Google quota/budget controls must still be periodically verified by the provider Owner.
- Web/Edge/Mobile rollback is a normal revert/fix PR through canonical `main`, or promotion of a prior verified Vercel/EAS artifact whose source identity is known.
- A migration is never rolled backward in place. Stop after transactional failure and ship a forward correction.

## 17. Deployment and release rules

Every future developer follows this sequence:

1. Start from updated `origin/main` in a focused branch or isolated worktree.
2. Preserve unrelated work and inspect all affected Product surfaces/contracts.
3. Implement the smallest bounded change, with forward migration if schema/policy changes.
4. Run relevant types, lint, build, domain, negative authorization and Product tests.
5. Open a PR and explain Product impact, data/security impact, migration and validation.
6. Wait for every Required Check and material review finding to pass.
7. Merge normally. No force push, Admin override, bypass or side-branch Production.
8. Let canonical-main workflows compute source sets and deploy only changed runtime/migrations.
9. Prove Production identity after deployment. Evidence-only merges must not change runtime versions.

Implemented guards include migration immutability/clean bootstrap, schema and ACL fingerprints, secret/config checks, RLS/security checks, Mobile Production-release validation, Production Product lineage, Decision source-set/Engine/evidence/freeze/Production identity binding, source-aware Edge/migration planning and negative drift regressions. Never “fix” a failing freeze by replacing a hash without the full authorized re-certification contract.

## 18. Current deferred work and technical debt

| Priority | Item | Source/Gate | Severity | Blocks test users? | Blocks public launch? | Owner/scope |
| ---: | --- | --- | --- | --- | --- | --- |
| 1 | Final Security Certification | Gate 8 | P1 before public launch | No for controlled test cohort | **Yes** | CTO/Security; frozen candidate, including Events ACL |
| 2 | Transactional mail and account communication polish: branding, verification/recovery/deletion UX, deliverability/spam, DE/EN, support/contact | Gate 4 / Gate 9 | P2 now, P1 public | No | **Yes** | Founder + Product/Auth/Legal |
| 3 | Events ACL hardening review before broad source/partner expansion | Events / Gate 8 | P1 before expansion | No for current manual pilot | **Yes** for expanded/public Events | CTO/Database/Security |
| 4 | Legal/privacy/communication public-launch acceptance | Gate 9 | P1 before public launch | No for controlled test cohort | **Yes** | Founder/Legal/CTO |
| 5 | Freeze final launch candidate and physical Founder acceptance | Gate 10 | P1 before launch | No | **Yes** | Founder/CTO |
| 6 | Android final-candidate signed-build and physical breadth revalidation; current Production OTA source is proven | Gate 5 / Mobile | P2 now | No for iOS-reference cohort | Yes if Android is advertised at public launch | Mobile owner |
| 7 | Media/Storage bounded orphan cleanup, including replaced Event images | Gate 6 / Events | P2 | No | No, while bounded/monitored | Storage/Product maintenance |
| 8 | PITR upgrade if RPO below 24h becomes required | Gate 7 | P2 | No | Product/business decision | Founder/CTO/Ops |
| 9 | Decision cold-start latency (~6.4 s) | Gate 7 | P2 | No; honest degradation exists | No, but monitor UX | Decision/Ops, no semantic change |
| 10 | Capacity/request-mix remeasurement and deliberate provider quota review before ~5,000 active users | Gate 7 | P2 | No | No at present scale | CTO/Ops/Finance |
| 11 | Continue quarterly isolated AWS restore drills and Owner verification of account-level provider alerts/quotas | Gate 7 | P2 operational | No | Operational prerequisite over time | Philipp + CTO/Ops |
| 12 | Events Weekend parity: Mobile Sat/Sun vs Web Fri/Sat/Sun | Events V1 | P2 Product decision | No | Polish decision | Founder/Product |
| 13 | External Event sources: Eventfrog, PROZ, BaselLive, Basel OGD; contracts/adapters not active | Events V1 | P2 expansion | No | No for manual V1 | Founder partnerships + bounded adapter work |
| 14 | Verify/enable daily Event recurrence reconciliation only if operational pilot requires it | Events V1 | P2 | No with current authored data | No | Events/Ops |
| 15 | Remove two non-public QA Event drafts after evidence retention decision | Events V1 | P2 hygiene | No | No | Founder/Admin |
| 16 | Close/label obsolete stacked open PRs; do not merge them | Repository lineage | P2 hygiene | No | No | CTO/repository maintenance |
| 17 | Bring `PRODUCTION_PRODUCT_LINEAGE.json` deployed-surface metadata up to current Production through a dedicated evidence-only PR | Lineage docs | P2 evidence hygiene | No; truth independently proven | No, but improves audit clarity | CTO/Release |

There are **0 open P0s**. No known open P1 blocks the controlled Basel test-user phase. The first five rows become blocking at their stated public-launch or expansion boundary.

## 19. Current Product phase

Go-live Gates are intentionally paused after Gate 7. The current phase is **bounded Product/UX polish for the real Basel experience, without feature or architecture explosion**. Events V1 is the current example: a small deterministic addition that increases real utility while preserving Decision, Mood, Auth, integrity and deployment contracts.

Small additions are allowed when they clearly improve real-world value, reuse canonical architecture, and remain testable and operable. Gate 8–10 resume only when Founder/CTO intentionally freeze the public-launch candidate.

## 20. Do not reopen without evidence

- Mood describes Spots and does not enter personal Taste, User Card, N4, Gold or Offering.
- Decision returns fewer verified results rather than filling a quota.
- Unknown evidence is not a match and may not be claimed in reasons.
- Explicit unambiguous negations and resolvable near/time/price constraints remain hard eligibility.
- Founder does not maintain manual landmark tags for every Spot; dynamic server-side resolution remains part of Location.
- Do not create Spot Intelligence/Engine V2 without new measured need.
- Events V1 is a deterministic aggregator, not an Event Intelligence Engine.
- Do not scrape Event sources or use images without verified rights.
- Archived Spots preserve allowed history and reject new Consumer activity; do not casually hard-delete them.
- Canonical `main` is the only Production source. No side-branch OTA, Web, Edge or schema deployment.
- Evidence-only changes must not create runtime deployments or artificial Production versions.
- Applied migrations are immutable; corrections are forward-only.
- Never relax RLS, Admin/service boundaries, Decision freezes, source-set binding or required negative tests for convenience.
- Gate 1–7 are PASS. Do not rerun or redesign them without contradictory evidence or a material new launch candidate.
- Founder physical evidence has authority to invalidate a lab-only Product claim; preserve that escalation path.

## 21. Known unverified items

The following nine items are deliberately **NOT VERIFIED** in this documentation-only handover; they are not guessed as PASS:

1. Full final Gate-8 Security Certification against a future frozen public-launch candidate.
2. Gate-9 Legal/Privacy/Communication/Public-Launch acceptance.
3. Gate-10 frozen candidate and final Founder physical acceptance.
4. Current Apple provider-console credential assignment/state was not independently re-read; the rotation and physical Auth lifecycle evidence remain the accepted closure.
5. Android signed-store-build parity and full physical journey matrix for the future final candidate; current Android OTA source identity is proven.
6. Ongoing account-level Google quota/budget alert configuration and all provider Owner-console notification destinations.
7. Daily Event recurrence reconciliation scheduler activation; enable only if the operational pilot requires it.
8. Executable/legal/credential readiness for Eventfrog, PROZ, BaselLive and Basel OGD adapters; all are disabled.
9. Cleanup completeness for bounded orphaned/replaced media objects; no unexplained active Product loss is known.

## 22. Next steps

### RIGHT NOW

- Continue bounded Basel Product/UX polish from current canonical Main.
- Decide the next small user-value task; do not reopen Decision, Mood or platform architecture by default.
- As evidence hygiene, update the stale deployed-surface entries in the Production Lineage manifest in a separate evidence-only PR, proving `NO_RUNTIME_DEPLOY`.
- Keep the manual Events pilot stable; clean the two private QA drafts when their evidence value is no longer needed.

### BEFORE TEST USERS

Nothing known at P0/P1 blocks the already authorized controlled Basel test cohort. Confirm cohort scope, support owner and operational watch window; use the Founder Operations view and existing runbooks. If Android users join, install and physically smoke-test the exact signed/current candidate first.

### BEFORE PUBLIC LAUNCH

- Resume and pass Gate 8 final security certification, including scoped Events ACL review.
- Complete Gate 9 legal, privacy, transactional communication, deliverability, localization and support readiness.
- Resolve whether Android is launch scope and physically certify it if yes.
- Freeze one canonical launch candidate and pass Gate 10 Founder acceptance.
- Verify provider quota/alert destinations and current restore evidence at the freeze date.

### LATER

- PITR if the business requires RPO below 24 hours.
- Decision cold-start optimization without semantic drift.
- Re-measure capacity and cost before approximately 5,000 active users.
- External Events partnerships/adapters, Weekend parity decision and recurrence automation.
- Bounded media/orphan cleanup and legacy PR hygiene.

## 23. Final status

CANONICAL MAIN — `3e93c15a32f55ffd1cc9e77aaa8965a7088e32fe`

PRODUCTION DATABASE — HEALTHY; PostgreSQL 17; 136 migrations; tip `20260905212627_keep_external_event_sources_disabled_for_manual_pilot`

MOBILE PRODUCTION — EAS Production runtime `1.1.0`; group `2b0c86bf-868c-4888-b9c4-246eaade9f1b`; iOS/Android OTA source `3e93c15…`

WEB PRODUCTION — Vercel SUCCESS from `3e93c15…`

ADMIN PRODUCTION — Vercel SUCCESS from `3e93c15…`

DECISION PRODUCTION — v124

DECISION LAB — 318/318 PASS, 0 skip

MOOD ENGINE V1 — PRODUCTION; PRODUCT-FROZEN

EVENTS V1 — PRODUCTION; MANUAL DETERMINISTIC PILOT; EXTERNAL INGESTION DISABLED

ACTIVE BASEL PRODUCT SPOTS — 396

GO-LIVE GATES 1–7 — PASS

GATE 8 — PAUSED

GATE 9 — PAUSED

GATE 10 — PAUSED

P0 OPEN — 0

P1 OPEN — 0 for controlled test users; public-launch prerequisites remain in paused Gates 8–10

CURRENT PHASE — Bounded Product/UX polish for the Basel test experience; no feature or architecture explosion.

NEXT CTO ACTION — Preserve current Main/Production invariants, select the next small evidence-backed Product-polish task, and resume Gate 8 only when Founder/CTO intentionally freeze the public-launch candidate.
