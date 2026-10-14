# Scoped spot authoring release

Admin and Owner share linked offering and area cards, scoped prices and schedules,
category-specific detail questions, draft reuse of existing claims and a shared
product vocabulary. Human review precedes submission. Missing knowledge remains
unknown. Existing claims, moderation, consent, RLS and append-only history remain
authoritative.

The release includes the prerequisite World registry versions 2.2, 2.3 and 2.4.
The existing Decision resolver bridge accepts these alongside historical 2.1
projections. The experimental Luna/Bibliothekar runtime, model/prompt changes,
conversation schema and Mobile updates are outside this release.

Production publication requires the repository's clean database bootstrap,
authorization tests, Admin/Web builds, risk gate and source-bound release artifact.
Migration activation is separate from UI build success. No synthetic data is
written to production for verification.

The Founder explicitly approved publication ("Freigegeben", 2026-10-14) of
the actor-scoped discovery-preparation counters cleanup older than two days in
the 2.3 and 2.4 migrations. The authority record and release classifier bind
this approval to their exact paths and SHA-256 contents. Modified migrations,
other deletions and new migration paths are not covered by this approval.

The Founder separately approved exactly the three 2.2–2.4 migrations with
the remaining untested recovery risk on 2026-10-14. Backup workflow run
38529360391 successfully exported, encrypted and verified the Production
snapshot. This is backup evidence, not a restore drill or a guaranteed rollback.
The additive release scope pins all three immutable migration hashes.

Mobile authoring keeps the current spot fixed on its edit route, uses a named
section selector, and starts with offers before areas and optional shared facts.
Owners and Admins can create and explicitly link an area inside an offer.
Technical usage hints and public-source preparation are collapsed by default.
Unknown answers do not show empty condition forms; existing conditional values
remain editable. Review and save remain explicit and use the unchanged RPCs.
Mobile regression coverage includes 320/390 px input geometry, prices, schedules,
conditional properties, direct area creation and save/reload. The actual Admin
edit wrapper was also exercised locally with synthetic, intercepted responses.

The authenticated Production UI was inspected at 390 px on Consum Weinbar
without modifying Spot data. Its previous nested search control measured
240 px wide. The obsolete edit-page link to a missing source section is removed;
source preparation remains available inside the authoring editor.
