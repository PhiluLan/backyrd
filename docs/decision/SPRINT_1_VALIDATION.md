# Sprint 1 Validation

Local Supabase integration validation covers real source tables and the actual N2 ingestion RPC:

- Decision request and candidate exposure.
- Product spot open and navigation action, including exact replay idempotency.
- Favorite add/remove and reservation intent.
- Photo-bound Smart Review with moods and text.
- Outbox-to-N2 commit, immutable deduplication and zero synthetic satisfaction.
- Consent withdrawal removes queued rows and purges existing N2 memory.
- Client denial for raw outbox reads and worker invocation.

The staging trace is:

`Decision → decision_request + candidate_exposed → spot open → spot_opened → save/remove → saved/save_removed → route → navigation_intent → Smart Review with photo → verified_visit`

The trace explicitly does **not** infer visit from open/save/navigation/reservation, and does **not** infer satisfaction from any Sprint-1 source action.
