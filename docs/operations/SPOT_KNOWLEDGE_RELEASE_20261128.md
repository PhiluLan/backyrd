# Spot Knowledge publication — 2026-11-28

Exact live source: `95782d7a379996f52dc3ee5e78009bd89a9bd55c`.

This is a publication receipt and observed search result, not a claim that all catalog queries are covered.

## Publication evidence

- [Implementation PR 809](https://github.com/PhiluLan/backyrd/pull/809) and [bounded release registration PR 810](https://github.com/PhiluLan/backyrd/pull/810) passed CI before merge.
- [Backend certification 46146456201](https://github.com/PhiluLan/backyrd/actions/runs/46146456201): PRODUCT artifact, manifest `fd03a546df22ab138dd72059efc3c0b82ed5bd06ee7b17e1f82e23411673a5e7`.
- [Manual production deployment 46147124402](https://github.com/PhiluLan/backyrd/actions/runs/46147124402): PASS; independently recomputed audit hash `560da6afa22fedcd44464414cc47b71b189eef6149b2f38eda28b5598fd64476`.
- Only `20261127214029_spot_knowledge_searchable_offer_details.sql` applied. Four Booking migrations remained deferred; no Auth deployment. Fresh backup 46134833366 and existing verified restore artifact were checked by the workflow.
- Independent live SQL confirmed the migration ledger, v7 dispatch to `experience_profile_valid_v4`, and denied direct EXECUTE for anon, authenticated and service_role on the private validators.
- Independent function metadata comparison: `decision-v13` 291 → 292 and `decision-admin-diagnostic` 87 → 88; JWT checks remain enabled. Other function versions remained unchanged.
- Main Vercel deployments reported success for Admin and Web. Canonical Admin and Owner URLs returned HTTP 200. This is not authenticated browser acceptance.
- iOS 1.1.0: [certification 46146481943](https://github.com/PhiluLan/backyrd/actions/runs/46146481943), manifest `2e3657509e4ebc6d2ad27fd2b129042517d44fad2077a9a4ca602372ac0782d6`, production group `5d394aa1-b755-4d8a-97fa-d2b0d86bc36c`.
- iOS 1.1.1: [certification 46146502764](https://github.com/PhiluLan/backyrd/actions/runs/46146502764), manifest `254f43c800e6988829fe4679ea5a37c49863219ac765a8cb42b8c1011303942e`, production group `c4115fc9-be4c-400a-826f-c04870585d3e`.
- Both OTAs published with `--skip-bundler` from the separately certified IOS_OTA exports. Production manifest identity/configuration and downloaded Hermes bytes match the artifacts. Asset downloads require the normal server-provided multipart `extensions.assetRequestHeaders`; an initial unauthenticated CDN check returned 403, then the normal asset protocol returned 200. No credentials are retained in this receipt.
- No physical iPhone installation/UI acceptance, Android publication, model change or Spot-data mutation is claimed.

## Exact requested search

> Ich suche einen Ort für einen kindergeburtstags Feier in basel

Checked at `2026-11-28T13:04:49.279Z`; model plus local canonical evaluation took **10,155 ms**. Fresh read-only canonical catalog: **438 approved Spots** in the existing Basler regional cohort and **26 event occurrences**. Published-source evaluator was rebuilt locally. NukNuk was called live with the current personal r15 options. Evaluation used neutral personalization with diagnostic-only synthetic bindings; no authenticated Edge request, actor context RPC, UI, commit or learning write was performed. Mac locked / local browser unavailable.

Observed model output:

- `experience.activity = children_party`, REQUIRED, activity subject `a1`.
- `experience.occasion = children_party`, CONTEXT.
- `location.destination = Basel`, REQUIRED.

**Observed result: zero ranked candidates and zero presented candidates.** Search has 449 unresolved candidates and 15 excluded candidates across Spots and events. Product response says `AVAILABLE` with `primaryCandidateId = null` and `candidates = []`; this status is not evidence of a successful recommendation.

## Concrete remaining gaps

1. **Understanding/contract vocabulary:** `children_party` is not a registered matching concept. The published concepts include `children_birthday` and `birthday_party`. The exact birthday specificity and accepted handoff vocabulary were not delivered cleanly. Do not call the model fully correct or silently alias a generic children party to a birthday.
2. **Stored offer evidence:** Hoppolino is approved, verified and in Basel. Its named offer is “Kindergeburtstag mit dekoriertem Tisch”, but its structured activity remains “private Feier”. The matcher reports `PROPERTY_VALUE_NOT_PROVEN`, not a confirmed birthday activity. The new editor can record the specific activity; publication intentionally did not infer/backfill it from existing prose.
3. **Other candidates:** MUKS Museum Kultur & Spiel Riehen has a birthday workshop but no structured activity for that offer; it also fails the request's explicit Basel municipality. JUMP Factory Basel is actually in Münchenstein and also fails that municipality condition. Neither is an actual suggestion from this run. ELYS Boulderloft lacks confirmed matching activity and complete participant-age coverage.

Next remediation should separately address canonical model vocabulary, reviewed existing-offer enrichment, and the intended city-versus-region experience. Preserve the original failed run as evidence; do not relabel handpicked venues or a corrected-meaning control as its results.

Raw diagnostic catalog, model output, result and immutable deployment artifacts were kept outside Git under `/private/tmp/backyrd-spot-knowledge-publication-20261128`. They are temporary evidence, not a durable backup. Durable hashes and CI artifacts are linked above; no private user profile or credentials are included here.
