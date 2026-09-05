# Go-live Gate 7 — reliability, performance, capacity and cost

Audit date: 2026-09-04/05 (Europe/Zurich)  
Canonical baseline: `7e1096615e0d6a5db14f9f2973e187fd5d3d76e4`  
Production project: Supabase `hjgcrrzfjchzqoegcywn`, Vercel Consumer/Admin, EAS Production runtime `1.1.0`  
Status: remediation candidate; final Production verification is required after canonical-main deployment.

## Actual Production baseline

Backyrd's runtime dependencies are Supabase PostgreSQL/Auth/Storage/Realtime/Edge Functions, Vercel for Consumer Web and Admin, Expo/EAS for signed Mobile builds, OTA and Push, OpenAI for Decision/search embeddings, Safety moderation and bounded internal research, Google Places/Geocoding/Photos plus native Maps, Resend for claim emails, and Mapbox assets used by Mobile. GitHub Actions is the sole canonical-main Supabase deploy authority. No other provider was found on an active Consumer path.

The Production Supabase project is `ACTIVE_HEALTHY`, PostgreSQL 17.6.1.005 in `eu-central-2`, Pro plan, Micro compute (1 GB / 2 ARM cores), and 60 direct database connections. The measured database footprint was 556 MB, table data 67 MB, indexes 39 MB and WAL 128 MB; table and index hit ratios were 1.00. Of 34 observed connections, only the management query and Realtime sender were active; the remaining platform connections were idle `ClientRead` pools. Ungranted locks were zero.

Storage contained 118 objects / about 118.5 MB. Every active upload bucket has an explicit size and MIME contract (2–20 MB depending on the Product surface). Gate-6 orphan findings remain bounded cleanup debt rather than unexplained active Product loss.

Four one-minute cron schedules run the embedding, live intelligence, Safety text and Safety image queues. The schedule creates 5,760 bounded invocations/day. A sampled `net._http_response` window contained 1,440 successful responses and seven historical 401s; those invocations are included in the operational view rather than treated as user traffic.

## Conservative launch model and measurements

The acceptance model is 50 registered test users, 10 normally simultaneous users, 25 users during a short launch burst, and sessions containing Home, Search, Map, Decision, Spot, Review and Social actions. The test did not generate provider-heavy abuse traffic and isolated mutation identities were removed.

| Path | Sample | p50 | p95 | Maximum | Result |
| --- | ---: | ---: | ---: | ---: | --- |
| Home catalogue | 20 | 84 ms | 148 ms | 190 ms | PASS |
| Spot search | 20 | 47 ms | 59 ms | 85 ms | PASS |
| Spot detail | 20 | 48 ms | 55 ms | 62 ms | PASS |
| Map corpus | 20 | 73 ms | 87 ms | 109 ms | PASS |
| Consumer Web Home | 15 | 49 ms | 755 ms | 755 ms | PASS |
| 10 concurrent mixed reads | 10 | 135 ms | 249 ms | 249 ms | PASS, zero failures |
| 25 concurrent mixed reads | 25 | 227 ms | 298 ms | 303 ms | PASS, zero failures |
| Decision cold | 1 | — | — | 6,393 ms | PASS with cold-start degradation |
| Decision warm | 5 | 1,739 ms | 2,650 ms | 2,650 ms | PASS |
| Decision 10 concurrent | 10 | 1,927 ms | 2,406 ms | 2,406 ms | PASS, zero failures |
| Decision 25 concurrent | 25 | 3,388 ms | 3,753 ms | 3,778 ms | PASS, zero failures |
| Profile read | 20 | 37 ms | 71 ms | 72 ms | PASS |
| Favorite | 10 | 54 ms | 81 ms | — | PASS |
| Follow | 10 | 37 ms | 56 ms | — | PASS |
| Like | 10 | 50 ms | 112 ms | — | PASS |
| Comment | 5 | 64 ms | 72 ms | — | PASS |
| Message | 5 | 45 ms | 108 ms | — | PASS |
| Review create | 1 | — | — | 1,671 ms | PASS |

The 500/1,000/5,000-Spot client map harness remained below 1.5 ms for city clustering. Production query forensics found no current launch-path full scan, long transaction, lock contention or connection pressure requiring an index or query rewrite.

## Proven P0/P1 remediation

The candidate adds one atomic service-only counter contract with per-actor and global minute/day limits. Counter state is operational metadata only: no payload, token, IP address or Product content is stored. Missing or ambiguous counter state returns 503; an exhausted limit returns 429. Limits bind Decision, Google Photo, authenticated Mobile Geocoding, Safety evaluation, embedding work, claim/approval email, test Push, and the dormant authenticated Decision Copy/Semantic Search endpoints. Provider calls have bounded timeouts.

Mobile address lookup and reverse geocoding no longer send Google REST requests directly from a client key. The existing output contract is preserved behind an authenticated server endpoint, address typing is debounced, stale responses cannot overwrite a newer query, and both actor/global costs are bounded. Native map rendering remains unchanged.

Four previously service-role-backed Admin routes (invite, list users, delete user, toggle user) now require a validated session and `admin_is_admin_v1` on the server. The invitation path also has actor/global email limits. Provider errors and privileged credentials are not returned to the browser.

Decision ranking, hard eligibility, Mood, Taste, Trust, N4/N5/N6, reasons and Offering/Purpose are unchanged. The changed Decision bytes are operational boundary/timeout code and require the complete D2/D3 re-certification and a new, directly verified Production identity after deployment.

## Failure and degradation behavior

- Database or counter ambiguity fails closed before a variable-cost provider call. Mutation idempotency and retry contracts remain those certified by Gate 6.
- OpenAI or Google timeout/429/5xx returns a bounded unavailable/limited state; it does not start a retry loop. Google landmark failure remains an honest unresolved Location result. Other discovery surfaces continue to work.
- Google photo failure preserves the established Product image/placeholder path; it does not fabricate a photo.
- Safety provider failure marks the evaluation failed and blocks successful publication rather than leaving a permanent `evaluating` state.
- Push provider failure affects delivery, not stored Product state. Device-not-registered handling remains bounded and idempotent.
- Mobile geocoding failure affects only the existing “create a Spot from location” preparation path. Home, list, map and Spot reads remain available.

## Provider-cost inventory and circuit breakers

| Trigger | Provider | Boundary after remediation | Worst bounded Product amplification |
| --- | --- | --- | --- |
| Initial Decision | OpenAI embedding; optional Google landmark | 100/user/day, 2,000 global/day | one embedding and at most one landmark resolution per accepted request |
| Spot photo resolution | Google Places/Photo | 200/user/day, 3,000 global/day | one bound Place plus media lookup per accepted call |
| Mobile address/reverse lookup | Google Places/Geocoding | 20/user/min, 100/user/day, 2,000 global/day | one server request and one provider request; typed search debounced |
| Safety evaluation | OpenAI Moderation plus bounded text classifier | 100/actor/day, 1,000 global/day | one moderation and, only when required, one bounded classifier call |
| Spot embeddings | OpenAI embedding | at most 10 non-empty batches/min, 100/day, max 25 rows/batch | 2,500 embeddings/day; idle cron consumes no boundary |
| Claim code / approval | Resend | 10/user/day claim; 200 global/day; approval separately bounded | one email per accepted request |
| Test Push | Expo | 20/user/day, 1,000 global/day | one message per active registered device |
| N6 shadow | OpenAI | existing $5/day, 20 calls/day, 10/user/day, concurrency 1; sample rate 0 | disabled for normal Product traffic |
| Spot research / city bootstrap | OpenAI and external sources | existing kill switches, queue concurrency and run budgets | Admin-only, disabled unless explicitly enabled |

OpenAI `text-embedding-3-small` is $0.02 per million input tokens and Moderation is free. Google Places is SKU/field-mask based; the relevant public list shows no-cost caps followed by per-1,000 request prices. Resend currently includes 3,000 emails/month (100/day) free; Pro is $20/month for 50,000. Expo includes 1,000 update MAU free or Starter at $19/month for 3,000 MAU. Supabase Pro is $25/month and includes the Micro compute credit, 100,000 MAU, 8 GB database, 100 GB Storage, 250 GB egress, two million Edge invocations and 500 Realtime connections. Vercel usage notifications exist on all plans; Pro supports spend actions.

Official references: [Supabase pricing](https://supabase.com/pricing), [Supabase backups](https://supabase.com/docs/guides/platform/backups), [OpenAI embedding model pricing](https://developers.openai.com/api/docs/models/text-embedding-3-small), [Google Maps cost controls](https://developers.google.com/maps/billing-and-pricing/manage-costs), [Vercel usage management](https://vercel.com/docs/pricing/manage-and-optimize-usage), [Expo pricing](https://expo.dev/pricing), [Resend pricing](https://resend.com/pricing?volume=50000).

## Monthly launch-cost model

USD ranges exclude tax and paid staff seats. They are capacity bands, not invoice forecasts. Assumptions: 6–12 sessions/user/month; 1–3 Decisions/session; 10–30 Spot/media views/session; low Review/Safety/email volume; N6 sampling remains off; Google/Resend free allowances are consumed first; ordinary client calls remain below the new server caps.

| Population | Fixed infrastructure | DB/Auth/Storage | AI | Maps/Places | Web | Push/mobile delivery | Email/other | Total |
| --- | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: |
| 50 | $25–64 | included–$5 | <$1–$3 | $0–15 | $0–20 | $0–19 | $0–5 | **$25–90/month** |
| 500 | $25–64 | included–$15 | $1–15 | $10–120 | $0–30 | $0–19 | $0–20 | **$40–230/month** |
| 5,000 | $224–263 (includes Expo Production assumption) | $0–75 | $10–100 | $100–800 | $20–100 | included–$50 | $20–80 | **$350–1,450/month** |

At 5,000 users the bounds deliberately prefer degraded geocoding/photo availability over an uncontrolled bill. Capacity should be remeasured and quotas deliberately raised before that population, not automatically.

## Founder operations, alerting and recovery

The Admin dashboard adds **Betriebsstatus** with current DB connections/limit, active connections, waiting locks, cron failures, queue failures, Storage volume and each global provider counter/blocked count. It is Admin-authorized server-side and does not poll in the background. Thresholds are DB connections ≥80%, any ungranted lock, any failed cron in 24 hours, queue failure, or repeated provider blocks. First response: stop the affected writer, preserve deployment/system evidence, then follow the recovery runbook.

Platform notifications already cover Vercel deployment/error/usage anomalies, Expo build-credit usage at 80/100%, and Resend quota usage. Google supports hard API quotas plus email/SMS/chat/webhook budget alerts; those account-level settings must be verified by an Owner in the provider console. Supabase platform incidents are available through its status feed. No new high-volume telemetry product is introduced.

Database recovery is proven to the Pro daily-backup RPO (up to 24 hours, seven-day retention); PITR is not enabled. Database backups do not contain Storage bytes. Founder/CTO approved a separate-account private AWS S3 contract on 2026-09-05: KMS encryption, public access blocked, daily Storage export, weekly logical database export, 30-day lifecycle, failure issue owned by Philipp and quarterly isolated restore drill. The repository now binds that infrastructure and OIDC-only scheduled workflow. Final PASS still requires the first successful encrypted export from the configured AWS account; configuration is never inferred or bypassed.

Rollback is source-controlled: revert/fix through normal PR and canonical main for Web/Edge/Mobile OTA; promote a previously verified Vercel deployment or EAS update when the matching canonical source identity is known; never roll a migration backward in place—stop after transactional failure and ship a reviewed forward migration. A destructive Production restore or project cutover remains separately Founder-authorized.

## Outstanding blockers before PASS

Three historical deployed Edge Functions are not canonical Product runtime and have no current repository caller: `cluster-mood`, `semantic-bridge-decision`, and `enrich-spot-description`. The read-back of their actual deployed sources proved `verify_jwt=false`; all can spend OpenAI cost, while `cluster-mood` and `enrich-spot-description` use service-role access and the latter accepts a website URL before writing a Spot description. Founder/CTO authorized their retirement on 2026-09-05. The candidate replaces each deployed slug through the normal source-aware canonical-main path with a dependency-free `410 Gone` tombstone. No replacement functionality or new Product path is introduced.

The remaining external activation condition is the dedicated AWS account. No AWS Actions identity existed at audit time. Gate 7 cannot report `BACKUP/RECOVERY — PASS` until the approved stack outputs are configured as GitHub variables and one daily plus one weekly export is verified in the private bucket. The prior full isolated restore drill is current for the initial quarter; the workflow creates the next quarterly evidence task automatically.

Final evidence will be appended after: AWS activation/export proof, full automated suites, D2/D3 re-certification, normal PR/Required Checks, canonical-main source-aware deployment, Production identity verification, post-deploy bounded load probe, and Founder Admin view verification.
