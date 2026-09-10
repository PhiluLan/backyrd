# Canonical Spot Identity Recommendation

Use `public.spots.id` UUID as World Knowledge `spotId`. It already binds spot DTOs and review, favorite, moment, event, analytics and ownership relations. A slug is a mutable presentation locator and must not identify claims. `owner_id` is a relationship, never identity.

External provider IDs should use a separate namespaced reference such as `{ namespace: "google_places", value: "…" }`, with uniqueness and lifecycle scoped by namespace. Do not copy provider IDs into the claim primary key.

Before persistent claims, define an append-only identity ledger:

- duplicate candidates do not share claims automatically;
- merge records point retired ID to surviving ID, preserve both histories and require an auditable transfer policy;
- archived/deleted spots remain tombstoned so old claims and snapshots validate;
- split/reversal requires a new adjudication record, never history rewriting;
- aliases are directional and time-bound.

Open risks: archived fixture/tombstone behavior, historical duplicates by Google ID/name-address, missing provider namespace, and no canonical spot-merge ledger. These block silent claim relocation, not the read-only adapter.
