# Gate 3 Reference Location Admin contract

## Production architecture

Backyrd has four known Basel reference locations in the versioned canonical registry:

| Key | Name | Type | Coordinates | Resolution source |
| --- | --- | --- | --- | --- |
| `GUNDELI` | Gundeli | Quarter | 47.541400, 7.589400 | canonical Basel registry |
| `KLEINBASEL` | Kleinbasel | Quarter | 47.565200, 7.597700 | canonical Basel registry |
| `BASEL_SBB` | Basel SBB | Landmark | 47.547570, 7.589560 | canonical Basel registry |
| `MARKTPLATZ` | Marktplatz | Landmark | 47.558390, 7.588180 | canonical Basel registry |

These records are source-controlled, not database-persisted Product rows. Production therefore has zero persisted reference-location records. Spot eligibility uses the existing `spots.lat` and `spots.lng` evidence; no per-Spot landmark tags are required.

References outside the registry are resolved server-side at request time by Google Places Text Search (Places API New). Resolution is biased to a 15 km area around Basel, accepts only an exact or unique-prefix result, uses a bounded candidate count and timeout, and is not persisted. Unknown, ambiguous, unavailable, or invalid resolution fails closed. Dynamic resolution supplements the registry and is not replaced by the Admin list.

The Basel-specific aliases `Bahnhof`, `Hauptbahnhof`, and `Basel Bahnhof` map to `BASEL_SBB` in `packages/decision-input-runtime/src/location-reference.mjs`. The natural-language parser marks an implicit Near distance as `ADMIN_CONFIG`; an explicit user distance remains `REQUEST_EXPLICIT` and authoritative.

## Operative contract

Migration `20260901164414_create_decision_location_admin_contract_v1.sql` replaces the former duplicated 800 m literal with one Production server contract:

- city: Basel only;
- contract version: `backyrd-decision-location-config-v1`;
- initial and certified default: 800 m;
- allowed operational range: 100–2,000 m;
- active status required;
- read and mutation RPCs: `service_role` only;
- mutation: authenticated Admin identity revalidated server-side, reason required, atomic and request-idempotent;
- audit: append-only and protected by an immutable update/delete trigger;
- invalid or unavailable runtime configuration: honest empty Decision response, never a fallback radius.

The Admin browser calls only the authenticated Next server route. That route uses the existing Admin authorization contract and invokes the service-only RPC; the browser has no table or mutation-RPC grants. The new `Referenzorte` navigation page exposes the four versioned reference points, source/status data, dynamic resolver facts, Bahnhof disambiguation, current radius and immutable audit history.

## Production evidence

Production project `hjgcrrzfjchzqoegcywn` applied the migration as the only pending migration. A service-only read-back returned `ACTIVE`, Basel, contract v1 and 800 m with one initial audit entry.

Decision Function version 121 was deployed from semantic source commit `f91dd269039bba0138a655d0f4050699ccb5f0f4`:

- EZBR SHA-256: `7f881e938b75fb329d7d201ce89539699958cfe19f0f171977cf21db521e8553`
- JWT verification: enabled
- entrypoint: exactly `import "./live-index.ts";` plus one newline
- entrypoint SHA-256: `4a4af963c4c30821be7b0d2b021f3a232520c104acfd34079a6284daea9e8299`
- downloaded Production sources: 40
- repository byte matches: 40/40

The live Founder location suite passed at the configured 800 m radius: Basel SBB resolved deterministically, Messeplatz and Kunstmuseum Basel resolved dynamically, every returned Spot remained inside the bound with an evidenced distance reason, and an unknown reference returned an honest empty result. No Spot data or Production history was synthesized or destructively changed.

## Semantic boundary

This change operationalizes the Founder-authorized Near bound. It does not alter Mood, Offering/Purpose, Taste, Trust, N4, personalization, or the general ranking architecture. It does not introduce a Geo platform or manual landmark maintenance. The D2 re-certification binds the unchanged core Engine, protected semantic/Admin source set, database and Product evidence, dependent freezes, and the exact running Production identity together.
