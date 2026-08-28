# Go-Live Gate 1 — Founder Decisions

Date: 2026-08-28  
Purpose: the minimum decisions required to remove the three remaining Gate-1 P1 blockers. No option below authorizes unrelated corpus, ranking, Admin, or feature work.

## Decision 1 — Canonical Basler Papiermühle identity

Two approved Product Spots claim the same Google Place identity.

| Candidate | Current evidence |
|---|---|
| `01c40cfb-d002-4ad0-9c34-b8f4a598e232` | newer, concise canonical name, Gold, 14 impressions, one analytics event, six hours rows, five accepted facts, no user content |
| `a054f361-3a6d-404d-8e12-373f810fc6fc` | older, long museum name, no Gold, three impressions, six hours rows, 17 accepted facts, no user content |

### Recommended authorization

Choose `01c40cfb-d002-4ad0-9c34-b8f4a598e232` as the active canonical Spot.

Implementation boundary after authorization:

1. take a fresh pre-mutation database and Storage backup;
2. lock and re-check both identities, statuses, origins, and dependent counts;
3. compare the two hours and accepted-fact sets by source and current scope;
4. move only non-conflicting, still-valid current truth needed by the canonical Spot; do not duplicate facts or manufacture provenance;
5. archive the older Spot and retain its raw Decision/analytics history on the historical identity;
6. ensure only the active canonical Spot participates in Product, Decision, learning, and normal Admin metrics;
7. rerun the full Production sanity suite, canonical counts, provenance checks, and restore-sensitive hashes.

Alternative: choose the older UUID as canonical. This requires an explicit reason because it would discard or migrate the current Gold relationship and newer Product identity. Automatic merging is not authorized.

Founder response needed:

`PAPIERMUEHLE — USE 01c40cfb / USE a054f361 / DEFER`

## Decision 2 — Three broken authoritative headers

The current approved Product records point to missing authoritative header objects:

- Crescenda — `9afaa613-a268-4e20-a5f3-624c647c0b6f`
- LORA — `92741865-1bfe-4f79-a99b-9304b946d167`
- VITO Gundeli — `4d832365-5900-40d3-8652-b385f324f328`

### Preferred authorization

Provide or approve the correct replacement file for each Spot. Upload under new immutable object keys, verify MIME/bytes/access, switch references transactionally, and retain audit evidence. Do not overwrite unrelated objects.

### Safe fallback authorization

Clear only the three broken authoritative references so the established UI fallback is honest. This removes broken Product truth but leaves the Spots without an approved canonical header until Gate 2 content work.

Founder response needed:

`HEADERS — REPLACE (attach/provide 3 files) / CLEAR TO FALLBACK / DEFER`

## Decision 3 — Durable backup strategy

Current state: Free plan, no accessible retained provider backup, one successful manual database snapshot/restore, and one successful complete 118-object Storage export/restore. The drill artifacts are temporary and do not constitute an ongoing strategy.

Supabase's current documentation states:

- Pro projects receive daily database backups with seven-day retention;
- PITR is a paid add-on and replaces daily backups when enabled;
- database backups include Storage metadata but not Storage object bytes;
- Storage must therefore have a separate file backup/recovery path.

Official references:

- <https://supabase.com/docs/guides/platform/backups>
- <https://supabase.com/docs/guides/storage/management/download-objects>
- <https://supabase.com/docs/guides/platform/clone-project>

### Recommended minimum launch authorization

1. upgrade Production to Pro for provider-managed daily database backups with seven-day retention;
2. approve a named, access-controlled off-provider destination for nightly encrypted Storage exports and a weekly encrypted logical database export;
3. retain at least seven daily media exports and four weekly combined database/media recovery sets, subject to the final privacy/retention policy;
4. configure failure alerting and a named operational owner;
5. perform and record a quarterly isolated database-plus-media restore drill;
6. separately inventory Auth/provider settings, Edge configuration, and secrets under the documented recovery runbook.

If the acceptable database RPO is less than 24 hours, authorize PITR and its required compute/add-on cost instead of relying on daily provider backups. Storage export frequency still remains a separate decision.

Founder response needed:

`BACKUP — PRO DAILY + NIGHTLY STORAGE / PITR + NIGHTLY STORAGE / DEFER`

Also specify the off-provider destination/account owner. Credentials must never be placed in Git or chat.

## Gate behavior after authorization

Each approved change will be implemented as a bounded, reviewable, forward-only operation with preconditions, pre-mutation backup, exact affected-row/object counts, rollback/recovery notes, and post-mutation Production sanity evidence. Gate 1 remains FAIL until all three P1s are resolved and independently revalidated.
